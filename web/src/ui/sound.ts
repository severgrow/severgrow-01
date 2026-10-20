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
import type { BankStats, Wave } from './sound-bank.js';

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

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The effects bus: every voice goes through it. The music bus stays wired but silent. */
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private bank: SoundBank | null = null;
  private mix: Mix = { sound: true, music: false, sfxVolume: 80, musicVolume: 60 };
  enabled = true;
  /** Effects level: Low may drop the faint flourishes (sparks, rustle, chime). */
  effects: Effects = 'normal';
  /** Reduce motion keeps functional cues and drops the motion flourishes. */
  reducedMotion = false;
  musicOn = false;
  base = BANK_BASE;
  wave: Wave = 'square';
  /** End times of scheduled voices, pruned on the next play (no timers, no frames). */
  private active: number[] = [];
  private lastTickAt = -Infinity;
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
    this.master.gain.value = 0.38;
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
    this.voices = 0;
    this.counters = {};
    this.lastVariant = {};
    this.lastTickAt = -Infinity;
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
      if ((now - this.lastTickAt) * 1000 < TICK_COALESCE_MS) return;
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
      const buffer = bank.get(sampleKey(event.desc));
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

  // ------------------------------- cues -------------------------------

  /** press / click: a dry 40–70ms click; two variations. */
  press() {
    this.play('press');
  }

  click() {
    this.play('press');
  }

  /** Soft selection tick (quieter than a click): a hex, a card, a seat. */
  tick() {
    this.play('tick');
  }

  /** draw: a soft double-tick, like a card leaving a shoe; three envelopes. */
  draw() {
    this.play('draw');
  }

  /** throw: a light flick, then a small tap as it lands in the pile; three envelopes. */
  throw() {
    this.play('throw');
  }

  /** grow / place: a woody tick that lands; higher rank is slightly lower and heavier; three envelopes.
   *  The settle layer adds a soft thud underneath, never over, the tick. */
  place(strength = 1, maxRank = 9, delay = 0) {
    const { rate, gain } = rankWeight(strength, maxRank);
    this.play('place', { delay, rate, gain });
    this.play('thud', { delay: delay + 0.02, rate: rate * 0.95, gain: 0.28 + 0.12 * (gain - 1) });
  }

  /** A top-rank land: the place tick plus one extra soft knock. */
  placeTop(strength = 1, maxRank = 9, delay = 0) {
    const { rate, gain } = rankWeight(strength, maxRank);
    this.play('placeTop', { delay, rate, gain });
    this.play('thud', { delay: delay + 0.02, rate: rate * 0.95, gain: 0.34 + 0.12 * (gain - 1) });
  }

  /** The paint flourish: one soft wood tick per pitch (kept for painted hexes). */
  grow(pitches: readonly number[] = [], stepMs = 0) {
    const n = Math.max(1, pitches.length);
    for (let i = 0; i < n; i++) {
      const pitch = pitches[i] ?? 1.6;
      this.play('place', { delay: (i * stepMs) / 1000, rate: pitch / 2, gain: 0.8 });
    }
  }

  /** strengthen: the place tick an octave up, shorter, twice. */
  strengthen() {
    this.play('strengthen');
  }

  /** bloom: three tiny ticks, 40ms apart, rising a little. Not a fanfare. */
  bloom() {
    const { idx } = this.pick('bloom', 2);
    for (let i = 0; i < 3; i++) this.play('bloom', { delay: i * 0.04, rate: 1 + i * 0.06, variant: idx });
  }

  /** One bloom tick for a sequential tile reveal (index steps the pitch). */
  bloomTile(index = 0) {
    const { idx } = this.pick('bloom', 2);
    const i = ((index % 3) + 3) % 3;
    this.play('bloom', { rate: 1 + i * 0.06, variant: idx });
  }

  /** seedTick: one very small wood tick per counted Seed, stepping up as the number settles. The
   *  last one is a touch firmer and rounder, so the count has a landing. Never a fanfare: at its
   *  loudest it is quieter than a place. */
  seedTick(step = 0, last = false) {
    const rate = (1.15 * (1 + Math.min(Math.max(step, 0), 6) * 0.07)) / 2.4;
    this.play('tick', { rate, gain: last ? 1.25 : 0.8 });
  }

  /** fruit: a short hollow pop. */
  fruit() {
    this.play('fruit');
  }

  /** mega bomb: one low muted thud plus a dry noise puff. No explosion. */
  megaBomb() {
    this.play('megaBomb');
  }

  /** undo: the place tick reversed: a small falling pair. */
  undo(_pitches?: readonly number[]) {
    void _pitches;
    this.play('undo');
  }

  /** turn: a single quiet click, different from press, so the handoff is heard. */
  turn(_notes?: readonly number[], _gain?: number, _ms?: number) {
    void _notes;
    void _gain;
    void _ms;
    this.play('turn');
  }

  /** snap / illegal: a dull short buzz, quieter than a place. */
  snap(pitch = 1) {
    this.play('snap', { rate: Math.min(1.5, Math.max(0.8, pitch)) });
  }

  illegal() {
    this.snap();
  }

  /** cutSmall: one crisp snip. */
  cutSmall() {
    this.play('cutSmall');
  }

  /** cutMedium (the Severe band, 3-4 tiles): a snip, a soft tick, and a quieter thud than Big's. */
  cutMedium() {
    this.play('cutMedium');
  }

  /** cutBig: two snips and a low settle. This should feel rewarding. */
  cutBig() {
    this.play('cutBig');
  }

  /** cutHuge: three snips stepping down, then one heavier knock. */
  cutHuge() {
    this.play('cutHuge');
  }

  /** cutMe: the same family, duller and lower, so losing tiles feels different from cutting. */
  cutMe() {
    this.play('cutMe');
  }

  /** rustle: a barely-there noise tick for small flourishes. Easy to miss. */
  rustle() {
    this.play('rustle');
  }

  /** sparks: a tile replaced, barely there. */
  sparks() {
    this.play('sparks');
  }

  /** A low, soft thud for big moments. Weight (0..1) lowers the pitch and raises the gain a
   *  little, exactly like a heavier rank on `place`; the master limiter still owns the ceiling. */
  thud(weight = 1) {
    const w = Math.min(1, Math.max(0, weight));
    this.play('thud', { rate: 1 - 0.28 * w, gain: 0.75 + 0.45 * w });
  }

  /** rumble: the volcano, short and dry. */
  rumble() {
    this.play('rumble');
  }

  /** grind: my tree grinds and withers, dry and low. */
  grind() {
    this.play('grind');
  }

  /** sigh: the Strangle finish, smothered, short and dry. */
  sigh() {
    this.play('sigh');
  }

  /** sad: loss colour, short and dry (no sad melody). */
  sad() {
    this.play('sad');
  }

  /** chime / fanfare / win: three quiet rising ticks and a soft final knock. Celebratory, not musical. */
  chime(delay = 0) {
    this.play('chime', { delay });
  }

  win() {
    this.play('win');
  }

  fanfare(won: boolean) {
    if (won) this.win();
    else this.lose();
  }

  /** lose: two falling ticks. No sad melody. */
  lose() {
    this.play('lose');
  }

  /** finalTurns: one low double-tick. */
  finalTurns() {
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
