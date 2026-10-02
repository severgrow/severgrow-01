// All sounds are made in code with the Web Audio API (no sound files). Nothing plays
// until the player's first tap (browsers require that, and it is kinder). Volume is kept
// modest, and each note wobbles a tiny bit in pitch so repeats don't sound robotic.
type Wave = OscillatorType;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: { stop: () => void } | null = null;
  enabled = true;
  musicOn = false;
  base = 330;
  wave: Wave = 'triangle';

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
    this.master.connect(this.ctx.destination);
    if (this.musicOn) this.setMusic(true);
  }

  tune(base: number, wave: Wave) {
    this.base = base;
    this.wave = wave;
    if (this.drone) {
      this.setMusic(false);
      this.setMusic(true);
    }
  }

  private tone(freq: number, dur: number, opts: { wave?: Wave; gain?: number; delay?: number; slideTo?: number; attack?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.wave ?? this.wave;
    const wobble = 1 + (Math.random() - 0.5) * 0.03; // about ±1.5%: decoration only, never game logic
    osc.frequency.setValueAtTime(freq * wobble, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo * wobble, t0 + dur);
    const peak = opts.gain ?? 0.18;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, gain: number, delay = 0, lowpass = 2000) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const len = Math.floor(ctx.sampleRate * dur);
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
    src.connect(f).connect(g).connect(this.master);
    src.start(ctx.currentTime + delay);
  }

  /** Soft click for taps and tiles. */
  click() {
    this.tone(this.base * 2.4, 0.06, { wave: 'sine', gain: 0.08 });
  }
  /** One short rising note per tile: a long line plays a little scale (`pitches` from the juice ladder). */
  grow(pitches: readonly number[], stepMs: number) {
    pitches.forEach((m, i) => this.tone(this.base * m, 0.16, { gain: 0.09, delay: (i * stepMs) / 1000 }));
  }
  /** Bright chime for a gold hex. */
  /** The turn banner's two soft tones (multiples of the base pitch). */
  turn(notes: readonly number[], gain: number, ms: number) {
    notes.forEach((m, i) => this.tone(this.base * m, ms / 1000, { wave: 'sine', gain, delay: (i * ms) / 2000, attack: 0.03 }));
  }

  chime(delay = 0) {
    this.tone(this.base * 4, 0.5, { wave: 'sine', gain: 0.09, delay });
    this.tone(this.base * 6, 0.4, { wave: 'sine', gain: 0.05, delay: delay + 0.03 });
  }
  /** A sharp snap: a cut (`pitch` > 1 for the second effect in a chain). */
  snap(pitch = 1) {
    this.noise(0.07, 0.4, 0, 6500 * pitch);
    this.tone(this.base * 1.5 * pitch, 0.08, { wave: 'triangle', gain: 0.1, slideTo: this.base * pitch });
  }
  /** A low, soft thud for big moments. */
  thud() {
    this.tone(this.base / 3, 0.38, { wave: 'sine', gain: 0.3, slideTo: this.base / 6, delay: 0.01 });
  }
  /** Soft, sad falling tone: losing tiles. */
  sad() {
    this.tone(this.base * 0.9, 0.7, { gain: 0.09, slideTo: this.base * 0.6, attack: 0.05 });
  }
  /** Sparks: a tile replaced. */
  sparks() {
    this.noise(0.12, 0.12, 0, 9000);
  }
  /** A fuller flourish for a win (a rising arpeggio and a soft chord); a calm, soft tone for a loss. */
  fanfare(won: boolean) {
    if (!won) {
      this.tone(this.base * 0.75, 1.1, { wave: 'sine', gain: 0.07, attack: 0.12 });
      return;
    }
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(this.base * m, 0.22, { gain: 0.12, delay: i * 0.12 }));
    for (const m of [2, 2.5, 3]) this.tone(this.base * m, 1.1, { wave: 'sine', gain: 0.045, delay: 0.5, attack: 0.04 });
  }
  /** The quiet ambient hum. */
  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on) {
      this.drone?.stop();
      this.drone = null;
      return;
    }
    const ctx = this.ctx;
    if (!ctx || !this.master || this.drone) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 3);
    const oscs = [0.5, 0.75, 0.502].map((m) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = this.base * m;
      o.connect(g);
      o.start();
      return o;
    });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 0.015;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    g.connect(this.master);
    this.drone = {
      stop: () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.6);
        for (const o of [...oscs, lfo]) o.stop(t + 0.7);
      },
    };
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
