// The sound palette (ui/sound.ts) is verified without a browser: a fake Web Audio context records
// every voice that is scheduled, so we can check mute, the short durations, the attacks, and the
// deterministic variation, without playing anything.
import { beforeEach, describe, expect, it } from 'vitest';
import { Sound } from '../src/ui/sound.js';

type Voice = { kind: 'osc' | 'noise'; start: number; end: number; freq: number; type: string; dur: number };

class FakeParam {
  value = 0;
  initial: number | null = null;
  events: { op: string; value: number; time: number }[] = [];
  constructor(readonly label: string) {}
  setValueAtTime(v: number, t: number) {
    if (this.initial === null) this.initial = v;
    this.value = v;
    this.events.push({ op: 'set', value: v, time: t });
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push({ op: 'exp', value: v, time: t });
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push({ op: 'lin', value: v, time: t });
  }
  cancelScheduledValues(_t: number) {
    /* no-op for the check */
  }
  setTargetAtTime(v: number, _t: number, _c: number) {
    this.value = v;
  }
}

class FakeNode {
  connect(dest: unknown) {
    return dest;
  }
}

const voices: Voice[] = [];
const envelopes: FakeParam[] = [];

class FakeOsc extends FakeNode {
  type = '';
  frequency = new FakeParam('osc');
  private at = 0;
  private freq0 = 0;
  start(t: number) {
    this.at = t;
    this.freq0 = this.frequency.initial ?? this.frequency.value;
  }
  stop(t: number) {
    voices.push({ kind: 'osc', start: this.at, end: t, freq: this.freq0, type: this.type, dur: t - this.at });
  }
}

class FakeSource extends FakeNode {
  buffer: { duration: number } = { duration: 0 };
  start(t: number) {
    voices.push({ kind: 'noise', start: t, end: t + this.buffer.duration, freq: 0, type: 'noise', dur: this.buffer.duration });
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam('gain');
  constructor() {
    super();
    envelopes.push(this.gain);
  }
}

class FakeFilter extends FakeNode {
  type = '';
  frequency = new FakeParam('filter');
  Q = new FakeParam('filterQ');
}

class FakeCtx {
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  createGain() {
    return new FakeGain();
  }
  createOscillator() {
    return new FakeOsc();
  }
  createBuffer(_channels: number, len: number, rate: number) {
    const data = new Float32Array(len);
    return { getChannelData: () => data, duration: len / rate };
  }
  createBufferSource() {
    return new FakeSource();
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createDynamicsCompressor() {
    return { threshold: new FakeParam('lim'), knee: new FakeParam('lim'), ratio: new FakeParam('lim'), attack: new FakeParam('lim'), release: new FakeParam('lim'), connect: (d: unknown) => d };
  }
}

function makeSound(): Sound {
  voices.length = 0;
  envelopes.length = 0;
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
  const s = new Sound();
  s.unlock();
  voices.length = 0; // nothing sounds while unlocking
  return s;
}

function run(fn: () => void): Voice[] {
  voices.length = 0;
  fn();
  return [...voices];
}

const signature = (v: Voice[]) => v.map((x) => (x.kind === 'osc' ? `o:${x.type}:${x.freq.toFixed(1)}` : `n:${x.dur.toFixed(3)}`)).join(',');

/** Every cue the game can play. */
const CUES: readonly [string, (s: Sound) => void][] = [
  ['press', (s) => s.press()],
  ['click', (s) => s.click()],
  ['draw', (s) => s.draw()],
  ['throw', (s) => s.throw()],
  ['place', (s) => s.place(3, 9)],
  ['placeTop', (s) => s.placeTop(9, 9)],
  ['grow', (s) => s.grow([1.2], 0)],
  ['strengthen', (s) => s.strengthen()],
  ['bloom', (s) => s.bloom()],
  ['fruit', (s) => s.fruit()],
  ['megaBomb', (s) => s.megaBomb()],
  ['undo', (s) => s.undo([1])],
  ['turn', (s) => s.turn()],
  ['snap', (s) => s.snap()],
  ['illegal', (s) => s.illegal()],
  ['cutSmall', (s) => s.cutSmall()],
  ['cutMedium', (s) => s.cutMedium()],
  ['cutBig', (s) => s.cutBig()],
  ['cutHuge', (s) => s.cutHuge()],
  ['cutMe', (s) => s.cutMe()],
  ['rustle', (s) => s.rustle()],
  ['sparks', (s) => s.sparks()],
  ['rumble', (s) => s.rumble()],
  ['grind', (s) => s.grind()],
  ['sigh', (s) => s.sigh()],
  ['thud', (s) => s.thud()],
  ['sad', (s) => s.sad()],
  ['chime', (s) => s.chime()],
  ['win', (s) => s.win()],
  ['fanfare', (s) => s.fanfare(true)],
  ['lose', (s) => s.lose()],
  ['finalTurns', (s) => s.finalTurns()],
];

describe('sound palette', () => {
  let s: Sound;
  beforeEach(() => {
    s = makeSound();
  });

  it('is silent while muted', () => {
    s.enabled = false;
    const v = run(() => {
      for (const [, fn] of CUES) fn(s);
    });
    expect(v).toHaveLength(0);
  });

  it('plays something for every cue and nothing rings past 500ms', () => {
    for (const [name, fn] of CUES) {
      const v = run(() => fn(s));
      expect(v.length, name).toBeGreaterThan(0);
      const end = Math.max(...v.map((x) => x.end));
      expect(end, `${name} lasts ${Math.round(end * 1000)}ms`).toBeLessThanOrEqual(0.5);
    }
  });

  it('keeps every attack under 8ms', () => {
    run(() => {
      for (const [, fn] of CUES) fn(s);
    });
    const attacks: number[] = [];
    for (const p of envelopes) {
      for (let i = 1; i < p.events.length; i++) {
        const a = p.events[i - 1]!;
        const b = p.events[i]!;
        if (a.op === 'set' && b.op === 'exp' && b.value > 0.0002) attacks.push(b.time - a.time);
      }
    }
    expect(attacks.length).toBeGreaterThan(0);
    expect(Math.max(...attacks)).toBeLessThanOrEqual(0.008);
  });

  it('gives each moment a distinct sound', () => {
    const seen = new Map<string, string>();
    for (const [name, fn] of CUES) {
      const sig = signature(run(() => fn(s)));
      const prior = seen.get(sig);
      expect(prior, `${name} sounds like ${prior}`).toBeUndefined();
      seen.set(sig, name);
    }
  });

  it('never repeats a press variation twice in a row', () => {
    const buckets: number[] = [];
    const sigs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const v = run(() => s.press());
      const osc = v.find((x) => x.kind === 'osc')!;
      buckets.push(osc.freq >= 950 ? 1 : 0);
      sigs.push(signature(v));
    }
    expect(new Set(buckets).size).toBe(2); // both envelopes are used
    for (let i = 1; i < buckets.length; i++) expect(buckets[i], `press ${i}`).not.toBe(buckets[i - 1]);
    for (let i = 1; i < sigs.length; i++) expect(sigs[i]).not.toBe(sigs[i - 1]);
  });

  it('drops the faint flourishes on Effects Low but keeps the important cues', () => {
    s.setEffects('low');
    expect(run(() => s.sparks())).toHaveLength(0);
    expect(run(() => s.rustle())).toHaveLength(0);
    for (const name of ['cutBig', 'place', 'throw', 'draw', 'win', 'lose']) {
      const fn = CUES.find(([n]) => n === name)![1];
      expect(run(() => fn(s)).length, name).toBeGreaterThan(0);
    }
  });
});
