// The sound palette (ui/sound.ts + ui/sound-bank.ts) is verified without a browser: a fake Web
// Audio context records every voice that is scheduled, so we can check mute, the short durations,
// the fades, and the deterministic variation, without playing anything. The bank is built once,
// then every cue must play from buffers only.
import { beforeEach, describe, expect, it } from 'vitest';
import { Sound } from '../src/ui/sound.js';

type Played = { start: number; end: number; rate: number; length: number; hash: number };

class FakeParam {
  value = 0;
  events: { op: string; value: number; time: number }[] = [];
  setValueAtTime(v: number, t: number) {
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

const played: Played[] = [];
const envelopes: FakeParam[] = [];
let bufferCount = 0;

class FakeBuffer {
  readonly data: Float32Array;
  constructor(readonly channels: number, readonly length: number, readonly sampleRate: number) {
    this.data = new Float32Array(length);
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData() {
    return this.data;
  }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer = new FakeBuffer(1, 1, 22050);
  playbackRate = new FakeParam();
  start(t: number) {
    let hash = 0;
    for (let i = 0; i < this.buffer.data.length; i += 17) hash = (hash * 31 + Math.round(this.buffer.data[i]! * 1000)) | 0;
    const end = t + this.buffer.duration / (this.playbackRate.value || 1);
    played.push({ start: t, end, rate: this.playbackRate.value, length: this.buffer.length, hash });
  }
  stop(_t: number) {
    /* the fake keeps the scheduled end from start() */
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
  constructor() {
    super();
    envelopes.push(this.gain);
  }
}

let lastCtx: FakeCtx | null = null;

class FakeCtx {
  currentTime = 0;
  sampleRate = 22050;
  state: AudioContextState = 'running';
  destination = {};
  suspendCalls = 0;
  resumeCalls = 0;
  constructor() {
    lastCtx = this;
  }
  createGain() {
    return new FakeGain();
  }
  createBuffer(channels: number, length: number, rate: number) {
    bufferCount += 1;
    return new FakeBuffer(channels, length, rate);
  }
  createBufferSource() {
    return new FakeSource();
  }
  createDynamicsCompressor() {
    const p = () => new FakeParam();
    return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect: (d: unknown) => d };
  }
  suspend() {
    this.suspendCalls += 1;
    this.state = 'suspended';
    return Promise.resolve();
  }
  resume() {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

type Listener = () => void;
const visibility: Listener[] = [];
const fakeDocument = {
  hidden: false,
  addEventListener(type: string, fn: Listener) {
    if (type === 'visibilitychange') visibility.push(fn);
  },
};

function makeSound(): Sound {
  played.length = 0;
  envelopes.length = 0;
  bufferCount = 0;
  visibility.length = 0;
  fakeDocument.hidden = false;
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  const s = new Sound();
  s.unlock();
  s.fillBank();
  played.length = 0;
  bufferCount = 0;
  return s;
}

function run(fn: () => void): Played[] {
  played.length = 0;
  fn();
  return [...played];
}

const signature = (v: Played[]) => v.map((x) => `${x.length}:${x.hash}:${x.rate.toFixed(3)}`).join(',');

/** Every cue the game can play. */
const CUES: readonly [string, (s: Sound) => void][] = [
  ['press', (s) => s.press()],
  ['click', (s) => s.click()],
  ['tick', (s) => s.tick()],
  ['draw', (s) => s.draw()],
  ['throw', (s) => s.throw()],
  ['place', (s) => s.place(3, 9)],
  ['placeTop', (s) => s.placeTop(9, 9)],
  ['grow', (s) => s.grow([1.2], 0)],
  ['strengthen', (s) => s.strengthen()],
  ['bloom', (s) => s.bloom()],
  ['bloomTile', (s) => s.bloomTile(1)],
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
  // Listed LAST on purpose: the deterministic jitter counter walks the list in order, so a new cue
  // inserted earlier would change every cue after it and make this inventory lie about the others.
  ['seedTick', (s) => s.seedTick(2, true)],
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
      lastCtx!.currentTime += 0.5;
      const v = run(() => fn(s));
      expect(v.length, name).toBeGreaterThan(0);
      const end = Math.max(...v.map((x) => x.end)) - Math.min(...v.map((x) => x.start));
      expect(end, `${name} lasts ${Math.round(end * 1000)}ms`).toBeLessThanOrEqual(0.5);
    }
  });

  it('fades every voice in over about 5ms (no raw onset, no click)', () => {
    run(() => {
      for (const [, fn] of CUES) fn(s);
    });
    const fades: number[] = [];
    for (const p of envelopes) {
      for (let i = 1; i < p.events.length; i++) {
        const a = p.events[i - 1]!;
        const b = p.events[i]!;
        if (a.op === 'set' && b.op === 'lin' && b.value > 0.001) fades.push(b.time - a.time);
      }
    }
    expect(fades.length).toBeGreaterThan(0);
    expect(Math.max(...fades)).toBeLessThanOrEqual(0.0051);
  });

  it('does not allocate a buffer while playing', () => {
    run(() => {
      for (const [, fn] of CUES) fn(s);
    });
    expect(bufferCount).toBe(0);
  });

  it('gives each moment a distinct sound', () => {
    const seen = new Map<string, string>();
    for (const [name, fn] of CUES) {
      lastCtx!.currentTime += 0.5; // let the previous cue's voices end (the cap is per moment)
      const sig = signature(run(() => fn(s)));
      const prior = seen.get(sig);
      expect(prior, `${name} sounds like ${prior}`).toBeUndefined();
      seen.set(sig, name);
    }
  });

  it('never repeats a press variation twice in a row', () => {
    const variants: number[] = [];
    const sigs: string[] = [];
    for (let i = 0; i < 10; i++) {
      lastCtx!.currentTime += 0.1;
      const v = run(() => s.press());
      expect(v.length).toBeGreaterThan(0);
      variants.push(s.log().at(-1)!.variant);
      sigs.push(signature(v));
    }
    expect(new Set(variants).size).toBe(2); // both envelope variants are used
    for (let i = 1; i < variants.length; i++) expect(variants[i], `press ${i}`).not.toBe(variants[i - 1]);
    for (let i = 1; i < sigs.length; i++) expect(sigs[i], `press ${i}`).not.toBe(sigs[i - 1]);
  });

  it('drops the faint flourishes on Effects Low but keeps the important cues', () => {
    s.setEffects('low');
    expect(run(() => s.sparks())).toHaveLength(0);
    expect(run(() => s.rustle())).toHaveLength(0);
    expect(run(() => s.chime())).toHaveLength(0);
    for (const name of ['tick', 'click', 'thud', 'cutBig', 'place', 'throw', 'draw', 'win', 'lose']) {
      lastCtx!.currentTime += 0.5;
      const fn = CUES.find(([n]) => n === name)![1];
      expect(run(() => fn(s)).length, name).toBeGreaterThan(0);
    }
  });

  it('keeps functional cues and drops motion flourishes under Reduce motion', () => {
    s.setReduceMotion(true);
    expect(run(() => s.rustle())).toHaveLength(0);
    expect(run(() => s.sparks())).toHaveLength(0);
    expect(run(() => s.chime())).toHaveLength(0);
    for (const name of ['tick', 'click', 'thud', 'place', 'draw', 'cutMedium', 'win', 'lose']) {
      lastCtx!.currentTime += 0.5;
      const fn = CUES.find(([n]) => n === name)![1];
      expect(run(() => fn(s)).length, name).toBeGreaterThan(0);
    }
  });

  it('always plays the FIRST tick, even at ctx.currentTime 0', () => {
    const ctx = lastCtx!;
    ctx.currentTime = 0; // the state on the player's very first tap
    expect(run(() => s.tick()).length).toBeGreaterThan(0);
    // ...and only then does the 30ms window start counting.
    ctx.currentTime = 0.02;
    expect(run(() => s.tick())).toHaveLength(0);
    ctx.currentTime = 0.031;
    expect(run(() => s.tick()).length).toBeGreaterThan(0);
  });

  it('coalesces repeated selection ticks inside 30ms', () => {
    const ctx = lastCtx!;
    ctx.currentTime = 1;
    run(() => s.tick());
    ctx.currentTime = 1.02;
    expect(run(() => s.tick())).toHaveLength(0);
    ctx.currentTime = 1.04;
    expect(run(() => s.tick()).length).toBeGreaterThan(0);
  });

  it('caps live voices near eight', () => {
    const ctx = lastCtx!;
    ctx.currentTime = 2;
    run(() => {
      for (let i = 0; i < 20; i++) s.thud();
    });
    expect(played.length).toBeLessThanOrEqual(8);
  });

  it('suspends the context while hidden and resumes on return', () => {
    const ctx = lastCtx!;
    fakeDocument.hidden = true;
    for (const fn of visibility) fn();
    expect(ctx.suspendCalls).toBe(1);
    expect(run(() => s.click())).toHaveLength(0);
    fakeDocument.hidden = false;
    for (const fn of visibility) fn();
    expect(ctx.resumeCalls).toBe(1);
    expect(run(() => s.click()).length).toBeGreaterThan(0);
  });
});
