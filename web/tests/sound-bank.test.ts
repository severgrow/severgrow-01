// The pre-rendered sound bank: its shape (cue count, variants, durations, footprint), that it is
// built once and never allocated from during play, the three gating rules, and suspension while the
// document is hidden. A fake Web Audio context stands in for the browser, exactly like sound.test.ts.
import { describe, expect, it } from 'vitest';
import {
  BANK_RATE,
  MAX_BUFFER_MS,
  PRIME_KEY,
  PRIME_KEYS,
  SOUND_MANIFEST,
  SoundBank,
  bankFootprint,
  bankSamples,
  renderSample,
} from '../src/ui/sound-bank.js';
import { Sound } from '../src/ui/sound.js';

class FakeParam {
  value = 0;
  setValueAtTime(v: number, _t: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number, _t: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number, _t: number) {
    this.value = v;
  }
  cancelScheduledValues(_t: number) {
    /* no-op */
  }
  setTargetAtTime(v: number, _t: number, _c: number) {
    this.value = v;
  }
}

const starts: { t: number; dur: number }[] = [];
let createBufferCalls = 0;
let createSourceCalls = 0;

class FakeNode {
  connect(dest: unknown) {
    return dest;
  }
}

class FakeBuffer {
  readonly data: Float32Array;
  constructor(readonly length: number, readonly sampleRate: number) {
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
  buffer: FakeBuffer = new FakeBuffer(1, BANK_RATE);
  playbackRate = new FakeParam();
  start(t: number) {
    createSourceCalls += 1;
    starts.push({ t, dur: this.buffer.duration / (this.playbackRate.value || 1) });
  }
  stop(_t: number) {
    /* scheduled by start */
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeCtx {
  currentTime = 0;
  sampleRate = BANK_RATE;
  state: AudioContextState = 'running';
  destination = {};
  suspendCalls = 0;
  resumeCalls = 0;
  createGain() {
    return new FakeGain();
  }
  createBuffer(_channels: number, length: number, rate: number) {
    createBufferCalls += 1;
    return new FakeBuffer(length, rate);
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

let ctx: FakeCtx | null = null;

const fresh = (): Sound => {
  starts.length = 0;
  createBufferCalls = 0;
  createSourceCalls = 0;
  visibility.length = 0;
  fakeDocument.hidden = false;
  const C = class extends FakeCtx {
    constructor() {
      super();
      ctx = this;
    }
  };
  (globalThis as unknown as { window: unknown }).window = { AudioContext: C };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  const s = new Sound();
  s.unlock();
  s.fillBank();
  starts.length = 0;
  createBufferCalls = 0;
  createSourceCalls = 0;
  return s;
};

const ALL_CUES = [
  'press', 'click', 'tick', 'draw', 'throw', 'place', 'placeTop', 'grow', 'strengthen', 'bloom',
  'bloomTile', 'fruit', 'megaBomb', 'undo', 'turn', 'snap', 'illegal', 'cutSmall', 'cutMedium',
  'cutBig', 'cutHuge', 'cutMe', 'rustle', 'sparks', 'thud', 'rumble', 'grind', 'sigh', 'sad',
  'chime', 'win', 'fanfare', 'lose', 'finalTurns', 'seedTick',
] as const;

const playAll = (s: Sound) => {
  s.press(); s.click(); s.tick(); s.draw(); s.throw(); s.place(3, 9); s.placeTop(9, 9);
  s.grow([1.2], 0); s.strengthen(); s.bloom(); s.bloomTile(1); s.fruit(); s.megaBomb(); s.undo([1]);
  s.turn(); s.snap(); s.illegal(); s.cutSmall(); s.cutMedium(); s.cutBig(); s.cutHuge(); s.cutMe();
  s.rustle(); s.sparks(); s.thud(); s.rumble(); s.grind(); s.sigh(); s.sad(); s.chime(); s.win();
  s.fanfare(true); s.lose(); s.finalTurns(); s.seedTick(2, true);
};

describe('sound bank', () => {
  it('has at most 30 cues, 2-3 variants each, and no buffer over 120ms', () => {
    const f = bankFootprint();
    expect(SOUND_MANIFEST.length).toBeLessThanOrEqual(30);
    expect(f.cues).toBe(SOUND_MANIFEST.length);
    expect(f.minVariants).toBeGreaterThanOrEqual(2);
    expect(f.maxVariants).toBeLessThanOrEqual(3);
    for (const cue of SOUND_MANIFEST) {
      expect(cue.variants.length, cue.id).toBeGreaterThanOrEqual(2);
      expect(cue.variants.length, cue.id).toBeLessThanOrEqual(3);
      for (const variant of cue.variants) {
        expect(variant.length, cue.id).toBeGreaterThan(0);
        expect(variant.length, `${cue.id} voices`).toBeLessThanOrEqual(8); // the voice cap
        for (const event of variant) expect(event.desc.ms, `${cue.id} buffer`).toBeLessThanOrEqual(MAX_BUFFER_MS);
      }
    }
    expect(f.maxMs).toBeLessThanOrEqual(MAX_BUFFER_MS);
    expect(new Set(SOUND_MANIFEST.map((c) => c.id)).size).toBe(SOUND_MANIFEST.length);
  });

  it('fits well under 1.5 MB and keeps cue names stable', () => {
    const f = bankFootprint();
    expect(f.bytes).toBeLessThan(1.5 * 1024 * 1024);
    expect(bankSamples().some((s) => s.key === PRIME_KEY)).toBe(true);
    const ids = new Set(SOUND_MANIFEST.map((c) => c.id));
    for (const alias of ['press', 'tick', 'draw', 'throw', 'place', 'cutMedium', 'thud', 'win', 'lose']) {
      expect(ids.has(alias), alias).toBe(true);
    }
  });

  it('renders deterministically (no Math.random) and varies its variants', () => {
    const sample = bankSamples()[0]!;
    const a = renderSample(sample.desc);
    const b = renderSample(sample.desc);
    expect(a.length).toBe(b.length);
    expect([...a]).toEqual([...b]);
    const variants = new Set(SOUND_MANIFEST.filter((c) => c.variants.length > 1).map((c) => c.variants.map((v) => JSON.stringify(v)).join('|')));
    expect(variants.size).toBeGreaterThan(0);
  });

  it('builds exactly one buffer per unique voice, and only during unlock/fill', () => {
    const f = bankFootprint();
    const C = class extends FakeCtx {
      constructor() {
        super();
        ctx = this;
      }
    };
    (globalThis as unknown as { window: unknown }).window = { AudioContext: C };
    (globalThis as unknown as { document: unknown }).document = fakeDocument;
    createBufferCalls = 0;
    const bank = new SoundBank(new C() as unknown as AudioContext);
    expect(bank.prime()).toBe(true);
    // The click is built first and unconditionally; the rest only while the small budget holds.
    expect(createBufferCalls).toBeGreaterThanOrEqual(1);
    expect(createBufferCalls).toBeLessThanOrEqual(PRIME_KEYS.length);
    expect(bank.stats().primed).toBe(createBufferCalls);
    // The strict "< 5 ms" promise is measured in a real browser (web/e2e/sound-bank.ts); here the
    // fake context's timing is at the mercy of whatever else the test run is doing.
    expect(bank.stats().primeMs).toBeGreaterThanOrEqual(0);
    bank.fill(Infinity);
    expect(createBufferCalls).toBe(f.samples);
    const stats = bank.stats();
    expect(stats.ready).toBe(true);
    expect(stats.built).toBe(f.samples);
    expect(stats.bytes).toBe(f.bytes);
    expect(stats.bytes).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('allocates zero buffers while playing every cue', () => {
    const s = fresh();
    playAll(s);
    expect(createBufferCalls).toBe(0);
    expect(createSourceCalls).toBeGreaterThan(0);
  });

  it('plays nothing before a gesture (no context, no bank)', () => {
    createSourceCalls = 0;
    createBufferCalls = 0;
    (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
    const s = new Sound();
    playAll(s);
    expect(createSourceCalls).toBe(0);
    expect(createBufferCalls).toBe(0);
  });

  it('gates everything through settings.sound', () => {
    const s = fresh();
    s.enabled = false;
    playAll(s);
    expect(createSourceCalls).toBe(0);
  });

  it('Low effects drops decorative cues but keeps tick/click/thud', () => {
    const s = fresh();
    s.setEffects('low');
    s.rustle(); s.sparks(); s.chime();
    expect(createSourceCalls).toBe(0);
    s.tick(); s.click(); s.thud();
    expect(createSourceCalls).toBeGreaterThan(0);
  });

  it('Reduce motion keeps functional cues and drops motion flourishes', () => {
    const s = fresh();
    s.setReduceMotion(true);
    s.rustle(); s.sparks(); s.chime();
    expect(createSourceCalls).toBe(0);
    for (const cue of ['tick', 'click', 'thud', 'place', 'draw', 'throw', 'cutMedium']) expect(ALL_CUES.includes(cue as never), cue).toBe(true);
    s.tick(); s.click(); s.thud(); s.place(1, 9); s.draw(); s.throw(); s.cutMedium();
    expect(createSourceCalls).toBeGreaterThan(0);
  });

  it('suspends on hidden and resumes on return', () => {
    const s = fresh();
    const c = ctx!;
    fakeDocument.hidden = true;
    for (const fn of visibility) fn();
    expect(c.suspendCalls).toBe(1);
    starts.length = 0;
    s.click();
    expect(starts).toHaveLength(0);
    fakeDocument.hidden = false;
    for (const fn of visibility) fn();
    expect(c.resumeCalls).toBe(1);
    s.click();
    expect(starts.length).toBeGreaterThan(0);
  });

  it('keeps a slow tick higher than a click, and a click higher than a thud in level', () => {
    const tick = SOUND_MANIFEST.find((c) => c.id === 'tick')!;
    const click = SOUND_MANIFEST.find((c) => c.id === 'press')!;
    const thud = SOUND_MANIFEST.find((c) => c.id === 'thud')!;
    const peak = (ids: typeof tick) => Math.max(...ids.variants.flat().map((e) => e.desc.amp));
    expect(peak(tick)).toBeLessThan(peak(click));
    expect(peak(click)).toBeLessThan(peak(thud));
  });
});
