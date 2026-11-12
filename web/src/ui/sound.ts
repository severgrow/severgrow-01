// All sounds are made in code with the Web Audio API (no sound files). Nothing plays until the
// player's first tap (browsers require that, and it is kinder). The palette is analog, clicky and
// fidgety: short mechanical clicks, wood ticks, muted plastic snaps and small low thuds, layered
// tick < click < thud under the visuals.
//
// The voices are PRE-RENDERED once (ui/sound-bank.ts): on unlock the first tiny click is baked
// synchronously (< 5 ms), the rest of the bank is filled in idle slices, and playback is exactly one
// AudioBufferSourceNode + one GainNode per voice. There is no createBuffer, oscillator or filter
// while playing, so a five-tile Bloom costs a few buffer sources instead of ten buffers and ten
// live voices. Volume, the limiter, the sfx bus and the deterministic variation are unchanged.
import { pitchJitter } from '../logic/feedback.js';
import { LIMITER, busGains } from '../logic/audio.js';
import type { Mix } from '../logic/audio.js';
import type { Effects } from '../logic/settings.js';
import { BANK_BASE, PRIME_KEY, SoundBank, cueSpec, sampleKey } from './sound-bank.js';
import type { PaletteName, PlayOpts, RecordedFx } from './recorded.js';
import type { BankStats, SampleDesc, Wave } from './sound-bank.js';

export type SoundCueLog = { cue: string; layer: string; variant: number; rate: number; gain: number; voices: number; at: number };

/** The most voices that can sound at once. Stacked cues drop rather than pile up. */
export const VOICE_CAP = 8;
/** Repeated selection ticks inside this window collapse into one. */
export const TICK_COALESCE_MS = 30;
/** The short fade on every voice, so a trimmed sample never clicks. */
const FADE = 0.005;

/** Decoration only: dropped on Effects Low (and by Reduce motion, see below). */
const LOW_DROPS: ReadonlySet<string> = new Set(['rustle', 'sparks', 'chime']);
/** Motion flourishes: their whole point is to accompany movement, so Reduce motion drops them.
 *  Functional cues (tick/click/thud, draw/throw, a landing, a cut, a turn, a win) never drop. */
const MOTION_ONLY: ReadonlySet<string> = new Set(['rustle', 'sparks', 'chime']);

/** The three interaction layers, quietest first. Weight only ever moves within the top layer. */
const LAYER_GAIN: Readonly<Record<string, number>> = Object.freeze({ tick: 0.55, click: 1, body: 1, thud: 1.45 });

/**
 * Owner, 2026-10-27: "for now, remove the sound completely from the game". Owner, 2026-11-05: sound
 * returns with the owner's own recordings ("let's do some sound work - 10/10 tactile responsive fun
 * and excellent"), ON by default (asked), on /test first.
 */
export const SOUND_REMOVED = false;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The effects bus: every voice goes through it. The music bus stays wired but silent. */
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private bank: SoundBank | null = null;
  private mix: Mix = { sound: true, music: false, sfxVolume: 80, musicVolume: 60 };
  /**
   * SOUND IS REMOVED FOR NOW (owner, 2026-10-27). Every play path and `unlock` reads this one gate,
   * so forcing it off is the whole switch: nothing plays and no AudioContext is ever built.
   */
  private wanted = true;
  /**
   * The page passes SOUND_REMOVED and the recorded takes (ui/recorded.ts). With takes, every cue
   * plays the owner's recording for its moment; the synthesized bank only covers the first instants
   * while the takes decode. A bare engine (its own tests) plays the synthesized bank as it always has.
   */
  constructor(private readonly removed = false, private readonly rec: RecordedFx | null = null) {}
  get enabled(): boolean {
    return !this.removed && this.wanted;
  }
  set enabled(on: boolean) {
    this.wanted = on;
  }
  /** Effects level: Low may drop the faint flourishes (sparks, rustle, chime). */
  effects: Effects = 'normal';
  /** Reduce motion keeps functional cues and drops the motion flourishes. */
  reducedMotion = false;
  musicOn = false;
  base = BANK_BASE;
  wave: Wave = 'square';
  /** End times of scheduled voices, pruned on the next play (no timers, no frames). */
  private active: number[] = [];
  /** When the last tick played, or `null` before the first one. A numeric sentinel would collide
   *  with a real timestamp: `ctx.currentTime` is ~0 on the very first tap, so a `0` start made
   *  `now - 0 < 30ms` true and swallowed the FIRST tick. `null` cannot collide, and coalescing
   *  still applies from the second tick on. */
  private lastTickAt: number | null = null;
  private belowBase = 1;
  private visibilityBound = false;
  private hidden = false;
  /** deterministic counters: every voice wobbles a little, every repeated cue cycles its variants */
  private voices = 0;
  private counters: Record<string, number> = {};
  private lastVariant: Record<string, number> = {};
  private cueLog: SoundCueLog[] = [];
  private fillScheduled = false;

  /** Call from a user gesture: creates the audio context, bakes the first click, fills the bank. */
  unlock() {
    if (!this.enabled) return; // Sound off: do not even build a context (or a bank) in the background
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.hidden) void Promise.resolve(this.ctx.resume()).catch(() => undefined);
      this.fillSoon();
      return;
    }
    const win = typeof window === 'undefined' ? null : window;
    const AC = win?.AudioContext ?? (win as unknown as { webkitAudioContext?: typeof AudioContext } | null)?.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    // The recordings are level-matched by hand (quiet / medium / loud); the synth bank was not.
    this.master.gain.value = this.rec ? 0.9 : 0.38;
    // the limiter on the master: stacked effects never clip
    const lim = this.ctx.createDynamicsCompressor();
    lim.threshold.value = LIMITER.threshold;
    lim.knee.value = LIMITER.knee;
    lim.ratio.value = LIMITER.ratio;
    lim.attack.value = LIMITER.attack;
    lim.release.value = LIMITER.release;
    this.master.connect(lim).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus.connect(this.master);
    this.setMix(this.mix);
    this.rec?.attach(this.ctx, this.sfx);
    // ONE buffer now (the click the first tap needs); the rest in idle slices.
    this.bank = new SoundBank(this.ctx);
    this.bank.prime();
    this.fillSoon();
    this.observeVisibility();
  }

  /** The bus volumes from the settings (sliders and toggles), smoothly. */
  setMix(m: Mix) {
    this.mix = m;
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.musicBus) return;
    const g = busGains({ ...m, sound: true });
    for (const [bus, v] of [
      [this.sfx, g.sfx],
      [this.musicBus, busGains({ ...m, music: true }).music],
    ] as const) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  /** Effects Low may drop the faint flourishes (sparks, rustle, chime); everything else always plays. */
  setEffects(e: Effects) {
    this.effects = e;
  }

  /** Reduce motion: keep the functional cues, drop the ones that only dress movement. */
  setReduceMotion(on: boolean) {
    this.reducedMotion = on;
  }

  /** Hidden tabs are silent and their AudioContext is suspended until the tab returns. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) {
      if (ctx.state === 'running') void Promise.resolve(ctx.suspend()).catch(() => undefined);
    } else if (ctx.state === 'suspended') {
      void Promise.resolve(ctx.resume()).catch(() => undefined);
    }
  }

  tune(base: number, wave: Wave) {
    this.base = base;
    // The bank is baked at BANK_BASE; a theme retunes playback (wave is baked per voice).
    this.belowBase = base / BANK_BASE;
    this.wave = wave;
  }

  /** The music toggle stays, but there is no bed: nothing plays. */
  setMusic(on: boolean) {
    this.musicOn = on;
  }

  /** The final-turns shade used to warm the bed; there is no bed now. */
  setCalm(_on: boolean) {
    /* no ambient bed to warm */
  }

  /** The bed used to duck under a cut; there is no bed now. */
  duck(_ms: number) {
    /* no ambient bed to duck */
  }

  /** Restart the variation counters so a replay sounds exactly like the first play. */
  reset() {
    this.rec?.reset();
    this.voices = 0;
    this.counters = {};
    this.lastVariant = {};
    this.lastTickAt = null;
    this.cueLog = [];
  }

  /** Read-only diagnostics for the browser suite (never drives the game). */
  bankStats(): BankStats | null {
    return this.bank?.stats() ?? null;
  }

  /** Test-only: play a named cue through the real gate. It never mutates the game. */
  cue(name: string): void {
    const fn = (this as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function') (fn as () => void).call(this);
  }

  /** The last cues played, newest last. Read-only, capped, and only filled when a voice plays. */
  log(): readonly SoundCueLog[] {
    return this.cueLog;
  }

  /** Build the bank now (tests and the product's idle filler both use this). */
  fillBank(): number {
    this.fillScheduled = false; // a pending idle slice is harmless; fill() is idempotent per key
    return this.bank?.fill(Infinity) ?? 0;
  }

  /** Picks one of `count` stored variants and a ±5% pitch, never the same variant twice in a row. */
  private pick(cue: string, count: number, spread = 0.05): { idx: number; detune: number } {
    const n = (this.counters[cue] = (this.counters[cue] ?? 0) + 1);
    const j = pitchJitter(n, spread);
    const t = (j - (1 - spread)) / (2 * spread); // 0..1
    let idx = Math.min(count - 1, Math.max(0, Math.floor(t * count)));
    if (idx === this.lastVariant[cue]) idx = (idx + 1) % count;
    this.lastVariant[cue] = idx;
    return { idx, detune: pitchJitter(n * 31 + 7, 0.05) };
  }

  private allowed(cue: string): boolean {
    if (!this.enabled || this.hidden) return false;
    if (this.effects === 'low' && LOW_DROPS.has(cue)) return false;
    if (this.reducedMotion && MOTION_ONLY.has(cue)) return false;
    return true;
  }

  /**
   * One cue: pick a variant, then schedule one buffer source + gain per voice at ctx.currentTime.
   * Nothing is allocated per voice except those two nodes; the buffer always comes from the bank.
   */
  private play(cue: string, opts: { delay?: number; rate?: number; gain?: number; variant?: number } = {}): void {
    const ctx = this.ctx;
    const sfx = this.sfx;
    const bank = this.bank;
    const spec = cueSpec(cue);
    if (!ctx || !sfx || !bank || !spec || !this.allowed(cue)) return;

    const now = ctx.currentTime;
    this.active = this.active.filter((end) => end > now);
    if (this.active.length >= VOICE_CAP) return;
    if (cue === 'tick') {
      // Only coalesce once a tick exists: the very first one is the player's first gesture and
      // always plays (ctx.currentTime is ~0 there, so any numeric sentinel would eat it).
      const prev = this.lastTickAt;
      if (prev !== null && (now - prev) * 1000 < TICK_COALESCE_MS) return;
      this.lastTickAt = now;
    }

    const pick = opts.variant === undefined ? this.pick(cue, spec.variants.length, cue === 'tick' ? 0.03 : 0.05) : { idx: opts.variant, detune: pitchJitter(this.voices++, 0.05) };
    const variant = spec.variants[pick.idx % spec.variants.length]!;
    const rate = Math.max(0.25, Math.min(4, this.belowBase * pick.detune * (opts.rate ?? 1)));
    const layerGain = LAYER_GAIN[spec.layer] ?? 1;
    const gainScale = opts.gain ?? 1;
    const delay = opts.delay ?? 0;
    let played = 0;

    for (const event of variant) {
      if (this.active.length >= VOICE_CAP) break;
      const buffer = bank.get(this.eventKey(event.desc));
      if (!buffer) continue;
      const outDur = buffer.duration / rate;
      const t0 = now + delay + event.at;
      const peak = Math.min(0.9, event.desc.amp * layerGain * gainScale);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + FADE);
      g.gain.setValueAtTime(peak, t0 + Math.max(FADE + 0.001, outDur - FADE));
      g.gain.linearRampToValueAtTime(0.0001, t0 + outDur);
      src.connect(g).connect(sfx);
      src.start(t0);
      src.stop(t0 + outDur + 0.01);
      this.active.push(t0 + outDur);
      played += 1;
    }

    // The first tap can land while only the prime buffers exist: use the click rather than stay
    // silent. This only happens in the first tens of ms after unlock, never during normal play.
    if (played === 0 && this.active.length < VOICE_CAP) {
      const prime = bank.get(PRIME_KEY);
      if (prime) {
        const src = ctx.createBufferSource();
        src.buffer = prime;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        const peak = Math.min(0.9, 0.08 * layerGain * gainScale);
        g.gain.setValueAtTime(0.0001, now + delay);
        g.gain.linearRampToValueAtTime(peak, now + delay + FADE);
        g.gain.linearRampToValueAtTime(0.0001, now + delay + prime.duration / rate);
        src.connect(g).connect(sfx);
        src.start(now + delay);
        src.stop(now + delay + prime.duration / rate + 0.01);
        this.active.push(now + delay + prime.duration / rate);
        played = 1;
      }
    }

    if (played === 0) return;
    this.cueLog.push({ cue, layer: spec.layer, variant: pick.idx, rate, gain: gainScale, voices: played, at: now });
    if (this.cueLog.length > 200) this.cueLog.splice(0, this.cueLog.length - 200);
  }

  /** The manifest key for an event's voice (shared by the bank and playback). */
  private eventKey(desc: SampleDesc): string {
    return sampleKey(desc);
  }

  private fillSoon(): void {
    if (!this.bank || this.bank.ready || this.fillScheduled) return;
    this.fillScheduled = true;
    const step = () => {
      this.fillScheduled = false;
      if (!this.bank || this.bank.ready) return;
      this.bank.fill(8);
      this.fillSoon();
    };
    const idle = typeof window === 'undefined' ? undefined : (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (idle) idle(step, { timeout: 120 });
    else setTimeout(step, 0);
  }

  private observeVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => this.setHidden(!!document.hidden), { passive: true });
    this.hidden = !!document.hidden;
  }

  /**
   * THE RECORDED PATH. `cue` is the engine's own cue name (it carries the Effects / Reduce motion
   * rules); `name` is one voice of the owner's fixed palette (ui/recorded.ts). With the recordings,
   * every cue below plays its palette voice or stays SILENT: the synthesized bank is only the bare
   * engine's (its own tests). A take not decoded yet is a quiet moment, never a synthesized stand-in.
   */
  private ev(cue: string, name: PaletteName, opts: PlayOpts = {}): void {
    const rec = this.rec;
    if (!rec || !this.allowed(cue)) return;
    const ctx = this.ctx;
    if (!ctx || !rec.play(name, opts)) return;
    this.cueLog.push({ cue, layer: 'recorded', variant: 0, rate: 1, gain: opts.gain ?? 1, voices: 1, at: ctx.currentTime });
    if (this.cueLog.length > 200) this.cueLog.splice(0, this.cueLog.length - 200);
  }

  // ------------------------------- cues -------------------------------
  // Each cue: with the recordings, ONE palette voice or silence; without them, the synthesized bank.

  /** A key goes down: every key in the game is the same click (owner: "same sound" for a group). */
  press() {
    if (this.rec) return this.ev('press', 'key');
    this.play('press');
  }

  /** A key's lift: silent with the recordings (one click per key, never two). */
  click() {
    if (this.rec) return;
    this.play('press');
  }

  /** PLAY / Find match: the same key click as every key. */
  primary() {
    if (this.rec) return this.ev('press', 'key');
    this.play('press');
  }

  /** Back / cancel: the same key click as every key. */
  back() {
    if (this.rec) return this.ev('press', 'key');
    this.play('press');
  }

  /** A sheet or panel closes. */
  close() {
    if (this.rec) return this.ev('press', 'close');
    this.play('press');
  }

  /** A switch turned on or off. */
  toggle(on: boolean) {
    if (this.rec) return this.ev('press', on ? 'toggleOn' : 'toggleOff');
    this.play('press');
  }

  /** A card in your hand picked or lifted. */
  cardSelect() {
    if (this.rec) return this.ev('tick', 'card');
    this.play('press');
  }

  /** A hex picked. */
  hexSelect() {
    if (this.rec) return this.ev('tick', 'hex');
    this.play('press');
  }

  /** The deal: match start, rematch, restart. */
  shuffle() {
    this.ev('draw', 'deal');
  }

  /** The last seconds of a live turn, once a second. */
  timerTick() {
    if (this.rec) return this.ev('tick', 'timer');
    this.tick();
  }

  /** An opponent was found / a duel starts. */
  matchFound() {
    if (this.rec) return this.ev('chime', 'matchFound');
    this.chime(0);
    this.bloom();
  }

  /** Something arrived while you waited (a challenge, an opponent's move). */
  notify() {
    if (this.rec) return this.ev('chime', 'notify');
    this.chime(0);
    this.chime(0.16);
  }

  /** Disconnected, or a move failed to send. */
  onlineError() {
    if (this.rec) return this.ev('snap', 'illegal');
    this.snap();
  }

  /** Soft selection tick: silent with the recordings (cards and hexes play their own pick). */
  tick() {
    if (this.rec) return;
    this.play('tick');
  }

  /** draw: from the deck, or the Throw pile. */
  draw(fromDiscard = false) {
    if (this.rec) return this.ev('draw', fromDiscard ? 'drawPile' : 'draw');
    this.play('draw');
  }

  /** throw: the card lands on the pile. */
  throw() {
    if (this.rec) return this.ev('throw', 'throw');
    this.play('throw');
  }

  /** A tile lands: yours or theirs; a higher rank a little louder (the same take). */
  place(strength = 1, maxRank = 9, delay = 0, mine = true) {
    const { rate, gain, k } = rankWeight(strength, maxRank);
    if (this.rec) return this.ev('place', mine ? 'land' : 'landTheirs', { delay, gain: 1 + 0.15 * k });
    this.play('place', { delay, rate, gain });
    this.play('thud', { delay: delay + 0.02, rate: rate * 0.95, gain: 0.28 + 0.12 * (gain - 1) });
  }

  /** A top-rank land. */
  placeTop(strength = 1, maxRank = 9, delay = 0, mine = true) {
    const { rate, gain, k } = rankWeight(strength, maxRank);
    if (this.rec) return this.ev('placeTop', mine ? 'land' : 'landTheirs', { delay, gain: 1.1 + 0.15 * k });
    this.play('placeTop', { delay, rate, gain });
    this.play('thud', { delay: delay + 0.02, rate: rate * 0.95, gain: 0.34 + 0.12 * (gain - 1) });
  }

  /** Several tiles painted at once: one landing each, 80 ms apart (each cuts the last). */
  grow(pitches: readonly number[] = [], stepMs = 0) {
    const n = Math.max(1, pitches.length);
    if (this.rec) {
      for (let i = 0; i < n; i++) this.ev('place', 'land', { delay: (i * (stepMs || 80)) / 1000 });
      return;
    }
    for (let i = 0; i < n; i++) {
      const pitch = pitches[i] ?? 1.6;
      this.play('place', { delay: (i * stepMs) / 1000, rate: pitch / 2, gain: 0.8 });
    }
  }

  /** strengthen: your tile made stronger in place. */
  strengthen() {
    if (this.rec) return this.ev('strengthen', 'strengthen');
    this.play('strengthen');
  }

  /** bloom: the Bloom locks in (the path that lands every tile at once). */
  bloom(_total = 0, _mine = true, _stepMs = 0) {
    if (this.rec) return this.ev('bloom', 'bloom');
    const { idx } = this.pick('bloom', 2);
    for (let i = 0; i < 3; i++) this.play('bloom', { delay: i * 0.04, rate: 1 + i * 0.06, variant: idx });
  }

  /** One card of a Bloom as its tile lands: the same take, two semitones higher each card. */
  bloomTile(index = 0, _total = 0, _mine = true) {
    if (this.rec) return this.ev('bloom', 'bloomCard', { semis: 2 * Math.max(0, Math.min(6, index)) });
    const { idx } = this.pick('bloom', 2);
    const i = ((index % 3) + 3) % 3;
    this.play('bloom', { rate: 1 + i * 0.06, variant: idx });
  }

  /** seedTick: Seeds counted up: the coins first, then one glass tick per step, a semitone higher each. */
  seedTick(step = 0, last = false) {
    if (this.rec) {
      if (step <= 0) return this.ev('tick', 'coins');
      return this.ev('tick', 'seedTick', { semis: Math.min(12, step), gain: last ? 1.15 : 1 });
    }
    const rate = (1.15 * (1 + Math.min(Math.max(step, 0), 6) * 0.07)) / 2.4;
    this.play('tick', { rate, gain: last ? 1.25 : 0.8 });
  }

  /** cascadePop: the chain of a cut. Silent with the recordings (the cut has its one sound). */
  cascadePop(step = 0) {
    if (this.rec) return;
    this.play('place', { rate: 1.35 * 2 ** ((Math.max(0, step) * 2) / 12), gain: 0.5 });
  }

  /** The Bomb. */
  fruit(_mine = true) {
    if (this.rec) return this.ev('fruit', 'bomb');
    this.play('fruit');
  }

  /** The Blast. */
  megaBomb(_mine = true) {
    if (this.rec) return this.ev('megaBomb', 'blast');
    this.play('megaBomb');
  }

  /** undo: a move taken back. */
  undo(_pitches?: readonly number[]) {
    void _pitches;
    if (this.rec) return this.ev('undo', 'undo');
    this.play('undo');
  }

  /** turn (the old tone hook): silent with the recordings; see `turnFor`. */
  turn(_notes?: readonly number[], _gain?: number, _ms?: number) {
    void _notes;
    void _gain;
    void _ms;
    if (this.rec) return;
    this.play('turn');
  }

  /** Whose turn starts: YOUR turn rings the warm glass; theirs is silent. */
  turnFor(mine: boolean) {
    if (this.rec) { if (mine) this.ev('turn', 'turn'); return; }
    this.play('turn');
  }

  /** You end your turn: silent (the throw already sounded). */
  turnEnd() {
    /* the throw is the sound */
  }

  /** snap / illegal: a dull short knock. */
  snap(pitch = 1) {
    if (this.rec) return this.ev('snap', 'illegal');
    this.play('snap', { rate: Math.min(1.5, Math.max(0.8, pitch)) });
  }

  illegal() {
    this.snap();
  }

  /** Your cut: one heavy wood drop; a bigger cut is the same take, a little louder. */
  cutSmall() {
    if (this.rec) return this.ev('cutSmall', 'cut', { gain: 0.85 });
    this.play('cutSmall');
  }

  cutMedium() {
    if (this.rec) return this.ev('cutMedium', 'cut', { gain: 0.95 });
    this.play('cutMedium');
  }

  cutBig() {
    if (this.rec) return this.ev('cutBig', 'cut', { gain: 1.05 });
    this.play('cutBig');
  }

  cutHuge() {
    if (this.rec) return this.ev('cutHuge', 'cut', { gain: 1.15 });
    this.play('cutHuge');
  }

  /** They cut your tiles: a short dull metal knock. */
  cutMe() {
    if (this.rec) return this.ev('cutMe', 'cutMe');
    this.play('cutMe');
  }

  /** rustle / sparks / thud / rumble / grind / sad / chime: silent with the recordings (too much going on). */
  rustle() {
    if (this.rec) return;
    this.play('rustle');
  }

  sparks() {
    if (this.rec) return;
    this.play('sparks');
  }

  thud(weight = 1) {
    if (this.rec) return;
    const w = Math.min(1, Math.max(0, weight));
    this.play('thud', { rate: 1 - 0.28 * w, gain: 0.75 + 0.45 * w });
  }

  rumble() {
    if (this.rec) return;
    this.play('rumble');
  }

  grind() {
    if (this.rec) return;
    this.play('grind');
  }

  /** sigh: the Surround (KO) finish: the coins. */
  sigh() {
    if (this.rec) return this.ev('sigh', 'coins');
    this.play('sigh');
  }

  sad() {
    if (this.rec) return;
    this.play('sad');
  }

  chime(delay = 0) {
    if (this.rec) return;
    this.play('chime', { delay });
  }

  /** Win: the coins (the owner: keep the coins at the end of a game). */
  win() {
    if (this.rec) return this.ev('win', 'coins');
    this.play('win');
  }

  fanfare(won: boolean) {
    if (won) this.win();
    else this.lose();
  }

  /** Loss: a short dull metal knock, lower. */
  lose() {
    if (this.rec) return this.ev('lose', 'lose');
    this.play('lose');
  }

  /** The last turns begin: one soft glass tap. */
  finalTurns() {
    if (this.rec) return this.ev('finalTurns', 'finalTurns');
    this.play('finalTurns');
  }
}

/** A higher rank lands lower and a little heavier (the same shape place() always had). */
const rankWeight = (strength: number, maxRank: number): { k: number; rate: number; gain: number } => {
  const k = maxRank > 1 ? Math.max(0, Math.min(1, (strength - 1) / (maxRank - 1))) : 0;
  return { k, rate: 1 - 0.35 * k, gain: 1 + 0.55 * k };
};

export const vibrate = (on: boolean, pattern: number | number[]) => {
  if (on && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not supported: fine */
    }
  }
};
