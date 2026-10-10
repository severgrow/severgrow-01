// All sounds are made in code with the Web Audio API (no sound files). Nothing plays until the
// player's first tap (browsers require that, and it is kinder). The palette is analog, clicky and
// fidgety: short mechanical clicks, wood ticks, muted plastic snaps and small low thuds, all made
// from a filtered noise transient plus a low-gain square/triangle body with a fast lowpass. No
// music, no drone, no ambient bed, no long reverb. Volume is modest, and every repeated moment
// picks a slightly different envelope/pitch through the deterministic `pitchJitter`, so a long
// session never feels like a loop and a replay plays the same.
import { pitchJitter } from '../logic/feedback.js';
import { LIMITER, busGains } from '../logic/audio.js';
import type { Mix } from '../logic/audio.js';
import type { Effects } from '../logic/settings.js';

type Wave = OscillatorType;
type ToneOpts = {
  wave?: Wave;
  gain?: number;
  delay?: number;
  slideTo?: number;
  attack?: number;
  /** a fast lowpass on the voice (Hz); 0 disables it */
  lowpass?: number;
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The effects bus: every tone and noise goes through it. The music bus stays wired but silent. */
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private mix: Mix = { sound: true, music: false, sfxVolume: 80, musicVolume: 60 };
  enabled = true;
  /** Effects level: Low may drop the faint flourishes (sparks, rustle). */
  effects: Effects = 'normal';
  musicOn = false;
  base = 330;
  wave: Wave = 'square';
  /** deterministic counters: every voice wobbles a little, every repeated cue cycles its envelopes */
  private voices = 0;
  private counters: Record<string, number> = {};
  private lastVariant: Record<string, number> = {};

  /** Call from a user gesture: creates the audio context. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  }

  /** The bus volumes from the settings (sliders and toggles), smoothly. */
  setMix(m: Mix) {
    this.mix = m;
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.musicBus) return;
    const g = busGains({ ...m, sound: true });
    for (const [bus, v] of [[this.sfx, g.sfx], [this.musicBus, busGains({ ...m, music: true }).music]] as const) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  /** Effects Low may drop the faint flourishes (sparks, rustle); everything else always plays. */
  setEffects(e: Effects) {
    this.effects = e;
  }

  tune(base: number, wave: Wave) {
    this.base = base;
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
  }

  /** A repeatable ±spread pitch wobble for one voice (decoration only, never game logic). */
  private jitter(spread = 0.03): number {
    return pitchJitter(this.voices++, spread);
  }

  /** Picks one of `count` stored envelopes and a ±5% pitch, never the same envelope twice in a row. */
  private pick(cue: string, count: number, spread = 0.05): { idx: number; detune: number } {
    const n = (this.counters[cue] = (this.counters[cue] ?? 0) + 1);
    const j = pitchJitter(n, spread);
    const t = (j - (1 - spread)) / (2 * spread); // 0..1
    let idx = Math.min(count - 1, Math.max(0, Math.floor(t * count)));
    if (idx === this.lastVariant[cue]) idx = (idx + 1) % count;
    this.lastVariant[cue] = idx;
    return { idx, detune: pitchJitter(n * 31 + 7, 0.05) };
  }

  private tone(freq: number, dur: number, opts: ToneOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.wave ?? this.wave;
    const wobble = this.jitter(0.03); // about ±3%
    osc.frequency.setValueAtTime(freq * wobble, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo * wobble), t0 + dur);
    const peak = opts.gain ?? 0.18;
    const attack = Math.min(0.008, opts.attack ?? 0.005);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = opts.lowpass ?? 2600;
    if (lp > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      f.Q.value = 0.6;
      osc.connect(f).connect(g).connect(this.sfx ?? this.master);
    } else {
      osc.connect(g).connect(this.sfx ?? this.master);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, gain: number, delay = 0, lowpass = 2000) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / len) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.sfx ?? this.master);
    src.start(ctx.currentTime + delay);
  }

  /** A short wood tick: a filtered noise transient plus a quick muted body that lands. */
  private woodTick(freq: number, delay = 0, gain = 0.06, dur = 0.06, variant = 0) {
    const lp = variant === 1 ? 3400 : variant === 2 ? 2200 : 2800;
    const wave: Wave = variant === 2 ? 'square' : 'triangle';
    const body = variant === 1 ? freq * 1.02 : variant === 2 ? freq * 0.97 : freq;
    this.noise(variant === 2 ? 0.014 : 0.012, gain * 1.3, delay, lp);
    this.tone(body, variant === 1 ? dur * 0.9 : dur, { wave, gain: variant === 2 ? gain * 0.85 : gain, delay, slideTo: body * 0.7, attack: 0.003, lowpass: lp - 400 });
  }

  /** A low, muted settle for the bigger cuts. */
  private settle(freq: number, gain: number, delay = 0.12) {
    this.tone(freq, 0.16, { wave: 'sine', gain, delay, slideTo: freq * 0.65, attack: 0.004, lowpass: 700 });
    this.noise(0.02, gain * 0.4, delay, 900);
  }

  /** A crisp snip: the noise transient carries the cut, the body only colours it. Each call
   *  colours the transient a little differently (never the rhythm), so a snip never loops. */
  private snip(pitch: number, delay = 0, gain = 0.11) {
    this.noise(0.028, gain, delay, 6500 * this.jitter(0.12));
    this.tone(this.base * pitch, 0.04, { wave: 'triangle', gain: 0.035, delay, attack: 0.002, lowpass: 3400 });
  }

  // ------------------------------- cues -------------------------------

  /** press / click: a dry 40–70ms click; two variations. */
  press() {
    const { idx, detune } = this.pick('press', 2);
    const b = this.base * detune;
    if (idx === 0) {
      this.noise(0.014, 0.1, 0, 3400);
      this.tone(b * 3.1, 0.05, { wave: 'square', gain: 0.05, slideTo: b * 2.1, attack: 0.002, lowpass: 2600 });
    } else {
      this.noise(0.017, 0.09, 0, 2600);
      this.tone(b * 2.6, 0.06, { wave: 'triangle', gain: 0.055, slideTo: b * 1.9, attack: 0.002, lowpass: 2200 });
    }
  }

  click() {
    this.press();
  }

  /** draw: a soft double-tick, like a card leaving a shoe; three envelopes. */
  draw() {
    const { idx, detune } = this.pick('draw', 3);
    const b = this.base * detune;
    const gap = idx === 0 ? 0.036 : idx === 1 ? 0.05 : 0.028;
    const hi = idx === 2 ? 3.4 : 3.2;
    this.noise(0.016, 0.06, 0, 4200);
    this.tone(b * hi, 0.03, { wave: 'square', gain: 0.03, delay: 0.004, attack: 0.002, lowpass: 3200 });
    this.noise(0.014, 0.05, gap, 3600);
    this.tone(b * 2.9, 0.03, { wave: 'square', gain: 0.026, delay: gap + 0.004, attack: 0.002, lowpass: 3000 });
  }

  /** throw: a light flick, then a small tap as it lands in the pile; three envelopes. */
  throw() {
    const { idx, detune } = this.pick('throw', 3);
    const b = this.base * detune;
    this.noise(0.028, idx === 2 ? 0.05 : 0.06, 0, idx === 1 ? 4600 : 5600);
    this.tone(b * (idx === 2 ? 1.9 : 2.1), 0.05, { wave: 'triangle', gain: 0.028, slideTo: b * 3.1, attack: 0.002, lowpass: 2600 });
    this.woodTick(b * (idx === 1 ? 2.1 : 1.9), 0.11, 0.055, 0.06, idx);
  }

  /** grow / place: a woody tick that lands; higher rank is slightly lower and heavier; three envelopes. */
  place(strength = 1, maxRank = 9, delay = 0) {
    const { idx, detune } = this.pick('place', 3);
    const k = maxRank > 1 ? Math.max(0, Math.min(1, (strength - 1) / (maxRank - 1))) : 0;
    const freq = this.base * 2 * detune * (1 - 0.35 * k);
    this.woodTick(freq, delay, 0.055 + 0.03 * k, 0.055 + 0.02 * k, idx);
  }

  /** A top-rank land: the place tick plus one extra soft knock. */
  placeTop(strength = 1, maxRank = 9, delay = 0) {
    this.place(strength, maxRank, delay);
    this.woodTick(this.base * 1.4, delay + 0.05, 0.05, 0.06);
  }

  /** The paint flourish: one soft wood tick per pitch (kept for painted hexes). */
  grow(pitches: readonly number[] = [], stepMs = 0) {
    const n = Math.max(1, pitches.length);
    for (let i = 0; i < n; i++) this.woodTick(this.base * (pitches[i] ?? 1.6), (i * stepMs) / 1000, 0.045, 0.05);
  }

  /** strengthen: the place tick an octave up, shorter, twice. */
  strengthen() {
    const { detune } = this.pick('strengthen', 2);
    const b = this.base * detune;
    this.noise(0.012, 0.07, 0, 3200);
    this.tone(b * 4, 0.045, { wave: 'triangle', gain: 0.055, slideTo: b * 3, attack: 0.003, lowpass: 3000 });
    this.noise(0.012, 0.06, 0.055, 3200);
    this.tone(b * 4.6, 0.045, { wave: 'triangle', gain: 0.05, delay: 0.055, slideTo: b * 3.4, attack: 0.003, lowpass: 3000 });
  }

  /** bloom: three tiny ticks, 40ms apart, rising a little. Not a fanfare. */
  bloom() {
    const { detune } = this.pick('bloom', 2);
    const b = this.base * detune;
    for (let i = 0; i < 3; i++) {
      const d = i * 0.04;
      this.noise(0.011, 0.045, d, 4200);
      this.tone(b * 2.4 * (1 + i * 0.14), 0.03, { wave: 'square', gain: 0.028, delay: d, attack: 0.002, lowpass: 3200 });
    }
  }

  /** fruit: a short hollow pop. */
  fruit() {
    const { detune } = this.pick('fruit', 2);
    const b = this.base * detune;
    this.tone(b * 1.9, 0.12, { wave: 'triangle', gain: 0.09, slideTo: b * 1.05, attack: 0.003, lowpass: 1600 });
    this.noise(0.02, 0.05, 0, 2000);
  }

  /** mega bomb: one low muted thud plus a dry noise puff. No explosion. */
  megaBomb() {
    const { detune } = this.pick('megaBomb', 2);
    const b = this.base * detune;
    this.tone(b * 0.5, 0.22, { wave: 'sine', gain: 0.2, slideTo: b * 0.32, attack: 0.004, lowpass: 500 });
    this.noise(0.06, 0.09, 0, 700);
    this.noise(0.03, 0.06, 0.02, 1200);
  }

  /** undo: the place tick reversed: a small falling pair. */
  undo(_pitches?: readonly number[]) {
    void _pitches;
    const { detune } = this.pick('undo', 2);
    const b = this.base * detune;
    this.woodTick(b * 2.1, 0, 0.05, 0.055);
    this.woodTick(b * 1.5, 0.06, 0.045, 0.06);
  }

  /** turn: a single quiet click, different from press, so the handoff is heard. */
  turn(_notes?: readonly number[], _gain?: number, _ms?: number) {
    void _notes;
    void _gain;
    void _ms;
    const { detune } = this.pick('turn', 2, 0.03);
    const b = this.base * detune;
    this.noise(0.012, 0.045, 0, 2800);
    this.tone(b * 2.1, 0.045, { wave: 'triangle', gain: 0.03, slideTo: b * 1.6, attack: 0.002, lowpass: 2000 });
  }

  /** snap / illegal: a dull short buzz, quieter than a place. */
  snap(pitch = 1) {
    const { detune } = this.pick('snap', 2, 0.04);
    const p = Math.min(1.5, Math.max(0.8, pitch));
    const b = this.base * detune * p;
    this.tone(b * 1.05, 0.09, { wave: 'square', gain: 0.04, slideTo: b * 0.8, attack: 0.003, lowpass: 1100 });
    this.noise(0.02, 0.045, 0, 1200);
  }

  illegal() {
    this.snap();
  }

  /** cutSmall: one crisp snip. */
  cutSmall() {
    this.snip(2.1, 0, 0.11);
  }

  /** cutMedium: a snip plus a soft secondary tick. */
  cutMedium() {
    const { detune } = this.pick('cutMedium', 2, 0.03);
    this.snip(2.1 * detune, 0, 0.11);
    this.snip(1.7 * detune, 0.05, 0.05);
  }

  /** cutBig: two snips and a low settle. This should feel rewarding. */
  cutBig() {
    const { detune } = this.pick('cutBig', 2, 0.03);
    this.snip(2.2 * detune, 0, 0.12);
    this.snip(1.9 * detune, 0.06, 0.09);
    this.settle(this.base * 0.85, 0.13, 0.12);
  }

  /** cutHuge: three snips stepping down, then one heavier knock. */
  cutHuge() {
    const { detune } = this.pick('cutHuge', 2, 0.03);
    this.snip(2.3 * detune, 0, 0.12);
    this.snip(2.0 * detune, 0.05, 0.1);
    this.snip(1.7 * detune, 0.1, 0.085);
    this.woodTick(this.base * 0.9, 0.17, 0.12, 0.08);
    this.tone(this.base * 0.55, 0.16, { wave: 'sine', gain: 0.12, delay: 0.17, slideTo: this.base * 0.4, attack: 0.004, lowpass: 600 });
  }

  /** cutMe: the same family, duller and lower, so losing tiles feels different from cutting. */
  cutMe() {
    const { detune } = this.pick('cutMe', 2, 0.03);
    const b = this.base * detune;
    this.noise(0.03, 0.07, 0, 2600);
    this.tone(b * 1.5, 0.05, { wave: 'triangle', gain: 0.03, slideTo: b * 1.1, attack: 0.003, lowpass: 1400 });
    this.noise(0.026, 0.055, 0.07, 2200);
    this.tone(b * 1.2, 0.05, { wave: 'triangle', gain: 0.028, delay: 0.07, slideTo: b * 0.9, attack: 0.003, lowpass: 1200 });
    this.tone(b * 0.6, 0.14, { wave: 'sine', gain: 0.09, delay: 0.11, slideTo: b * 0.42, attack: 0.004, lowpass: 600 });
  }

  /** rustle: a barely-there noise tick for small flourishes. Easy to miss. */
  rustle() {
    if (this.effects === 'low') return;
    this.noise(0.04, 0.045, 0, 2600);
  }

  /** sparks: a tile replaced, barely there. */
  sparks() {
    if (this.effects === 'low') return;
    this.noise(0.025, 0.05, 0, 5200);
  }

  /** A low, soft thud for big moments. */
  thud() {
    this.tone(this.base * 0.55, 0.16, { wave: 'sine', gain: 0.16, slideTo: this.base * 0.36, attack: 0.004, lowpass: 500 });
    this.noise(0.03, 0.06, 0, 600);
  }

  /** rumble: the volcano, short and dry. */
  rumble() {
    const { detune } = this.pick('rumble', 2, 0.04);
    const b = this.base * detune;
    this.tone(b * 0.45, 0.22, { wave: 'sine', gain: 0.12, slideTo: b * 0.34, attack: 0.004, lowpass: 450 });
    this.noise(0.03, 0.05, 0.08, 900);
    this.noise(0.02, 0.04, 0.15, 1200);
  }

  /** grind: my tree grinds and withers, dry and low. */
  grind() {
    this.noise(0.18, 0.07, 0, 700);
    this.tone(this.base * 0.5, 0.16, { wave: 'sawtooth', gain: 0.028, slideTo: this.base * 0.34, attack: 0.004, lowpass: 900 });
  }

  /** sigh: the Strangle finish, smothered, short and dry. */
  sigh() {
    this.noise(0.2, 0.055, 0, 900);
    this.tone(this.base * 0.6, 0.18, { wave: 'sine', gain: 0.05, slideTo: this.base * 0.42, attack: 0.005, lowpass: 700 });
  }

  /** sad: loss colour, short and dry (no sad melody). */
  sad() {
    this.tone(this.base * 0.8, 0.16, { wave: 'triangle', gain: 0.06, slideTo: this.base * 0.58, attack: 0.004, lowpass: 800 });
    this.noise(0.02, 0.04, 0, 1000);
  }

  /** chime / fanfare / win: three quiet rising ticks and a soft final knock. Celebratory, not musical. */
  chime(delay = 0) {
    const { detune } = this.pick('chime', 2, 0.04);
    const b = this.base * detune;
    [2, 2.4, 2.9].forEach((m, i) => {
      const d = delay + i * 0.06;
      this.noise(0.01, 0.04, d, 4000);
      this.tone(b * m, 0.035, { wave: 'square', gain: 0.03, delay: d, attack: 0.002, lowpass: 3600 });
    });
    this.woodTick(b * 1.5, delay + 0.19, 0.05, 0.06);
  }

  win() {
    const { detune } = this.pick('win', 2, 0.04);
    const b = this.base * detune;
    [1.8, 2.2, 2.7].forEach((m, i) => {
      const d = i * 0.09;
      this.noise(0.012, 0.05, d, 4200);
      this.tone(b * m, 0.05, { wave: 'triangle', gain: 0.045, delay: d, attack: 0.002, lowpass: 3200 });
    });
    this.tone(b * 0.7, 0.14, { wave: 'sine', gain: 0.1, delay: 0.28, slideTo: b * 0.5, attack: 0.004, lowpass: 600 });
  }

  fanfare(won: boolean) {
    if (won) this.win();
    else this.lose();
  }

  /** lose: two falling ticks. No sad melody. */
  lose() {
    const { detune } = this.pick('lose', 2, 0.04);
    const b = this.base * detune;
    this.tone(b * 1.3, 0.09, { wave: 'triangle', gain: 0.06, slideTo: b * 1.05, attack: 0.003, lowpass: 1600 });
    this.tone(b, 0.12, { wave: 'triangle', gain: 0.055, delay: 0.09, slideTo: b * 0.78, attack: 0.003, lowpass: 1300 });
  }

  /** finalTurns: one low double-tick. */
  finalTurns() {
    const { detune } = this.pick('finalTurns', 2, 0.03);
    const b = this.base * detune;
    this.woodTick(b * 1.1, 0, 0.06, 0.07);
    this.woodTick(b * 0.95, 0.08, 0.055, 0.07);
  }
}

export const vibrate = (on: boolean, pattern: number | number[]) => {
  if (on && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not supported: fine */
    }
  }
};
