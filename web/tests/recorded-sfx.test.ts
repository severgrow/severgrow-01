// THE RECORDED SOUNDS, NARROWED (owner, 2026-11-05): "narrow down all to nice click and taps ... It's
// okay if the sounds are a bit repetitive ... only short pleasant taps and rings and drops, never play
// 2 at once, add some effect on turn glass"; "don't rotate - group - and certain type of buttons
// should always make a similar sound"; velcro, zip and long takes out; synth stabs out for now; keep
// the coins at the end of a game. OWNER CHANGED THE RULE: this replaces the earlier tests that pinned
// rotating takes, pitch wobble, the 4-copy cap and the stacked stabs.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { PALETTE, RecordedFx, SAME_INSTANT, SFX_SETS, clearSharedTakes, onsetOf, semitones } from '../src/ui/recorded.js';
import type { PaletteName } from '../src/ui/recorded.js';
import { SOUND_REMOVED, Sound } from '../src/ui/sound.js';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const FOLDER = root('../public/audio/sfx/');

type Played = { file: string; at: number; offset: number; rate: number; peak: number; warm: boolean; stoppedAt: number | null };
const played: Played[] = [];

class Param {
  value = 0;
  peak = 0;
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; this.peak = Math.max(this.peak, v); }
  setTargetAtTime(v: number) { this.value = v; }
  cancelScheduledValues() { /* fake */ }
  exponentialRampToValueAtTime(v: number) { this.value = v; }
}
let warmNode: object | null = null;
class Node_ {
  to: unknown = null;
  connect<T>(d: T) { this.to = d; return d; }
}
class Buf {
  data: Float32Array;
  constructor(public file: string, len = 4410) { this.data = new Float32Array(len).fill(0.3); }
  get duration() { return this.data.length / 44100; }
  get sampleRate() { return 44100; }
  getChannelData() { return this.data; }
}
class Gain extends Node_ { gain = new Param(); }
class Source extends Node_ {
  buffer: Buf | null = null;
  playbackRate = new Param();
  rec: Played | null = null;
  gainNode: Gain | null = null;
  override connect<T>(d: T) { this.gainNode = d as unknown as Gain; return d; }
  start(at: number, offset = 0) {
    const g = this.gainNode!;
    this.rec = { file: this.buffer!.file, at, offset, rate: this.playbackRate.value, peak: g.gain.peak, warm: g.to === warmNode, stoppedAt: null };
    played.push(this.rec);
  }
  stop(t: number) { if (this.rec && (this.rec.stoppedAt === null || t < this.rec.stoppedAt)) this.rec.stoppedAt = t; }
}
class Ctx {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  destination = new Node_();
  createGain() { return new Gain(); }
  createBufferSource() { return new Source(); }
  createBiquadFilter() { const n = new Node_() as Node_ & { type: string; frequency: Param; Q: Param }; n.frequency = new Param(); n.Q = new Param(); warmNode = n; return n; }
  createConvolver() { return new Node_(); }
  createDynamicsCompressor() { return Object.assign(new Node_(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createBuffer(_c: number, len: number) { return new Buf('ir', len); }
  async decodeAudioData(bytes: ArrayBuffer) { return new Buf(new TextDecoder().decode(bytes)); }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

const engine = async () => {
  clearSharedTakes();
  warmNode = null;
  const fx = new RecordedFx(async (url) => new TextEncoder().encode(url.slice(url.lastIndexOf('/') + 1)).buffer as ArrayBuffer, () => 'x/');
  const ctx = new Ctx();
  const s = new Sound(false, fx);
  (globalThis as unknown as { window: unknown }).window = { AudioContext: class { constructor() { return ctx; } } };
  s.unlock();
  delete (globalThis as unknown as { window?: unknown }).window;
  for (let i = 0; i < 500 && fx.ready < fx.files.length; i++) await new Promise((r) => setTimeout(r, 0));
  played.length = 0;
  return { s, fx, ctx };
};
const last = () => played.at(-1)?.file;

beforeEach(() => { played.length = 0; });

describe('the palette: short, fixed takes only', () => {
  it('every palette take is in the repo and is one of the owner\'s takes', () => {
    const owner = new Set(Object.values(SFX_SETS).flat());
    for (const [name, v] of Object.entries(PALETTE)) {
      expect(existsSync(FOLDER + v.file), name).toBe(true);
      expect(owner.has(v.file), name).toBe(true);
    }
  });

  it('no velcro, no zip, no gritty, no shaky, no long metal, no slides, no stabs', () => {
    for (const [name, v] of Object.entries(PALETTE)) {
      expect(v.file, name).not.toMatch(/^(velcro|zip|gritty|shaky|metal_big|metal_error|close_slide|chalk|stab_)/);
    }
  });

  it('only the palette\'s files are fetched (about 25), the first-tap keys first', async () => {
    const { fx } = await engine();
    expect(fx.files.length).toBeLessThanOrEqual(30);
    expect(fx.files[0]).toBe(PALETTE.key.file);
    expect(fx.ready).toBe(fx.files.length);
  });

  it('a take starts where its sound starts, not on the MP3\'s silent lead-in', () => {
    const b = new Buf('x');
    b.data.fill(0, 0, 1000);
    expect(onsetOf(b as unknown as AudioBuffer)).toBeCloseTo((1000 - 8) / 44100, 5);
  });
});

describe('one kind of button, one sound (no rotation, no wobble)', () => {
  it('the same key plays the very same take at the very same pitch, every time', async () => {
    const { s, ctx } = await engine();
    for (let i = 0; i < 12; i++) { s.press(); ctx.currentTime += 1; }
    expect(new Set(played.map((p) => p.file))).toEqual(new Set([PALETTE.key.file]));
    expect(new Set(played.map((p) => p.rate))).toEqual(new Set([1]));
  });

  it('PLAY, Back and every other key are the same click; the lift is silent', async () => {
    const { s, ctx } = await engine();
    s.primary(); ctx.currentTime += 1; s.back(); ctx.currentTime += 1; s.press(); ctx.currentTime += 1; s.click();
    expect(played.map((p) => p.file)).toEqual([PALETTE.key.file, PALETTE.key.file, PALETTE.key.file]);
  });

  const CASES: [string, (s: Sound) => void, PaletteName][] = [
    ['a card picked', (s) => s.cardSelect(), 'card'],
    ['a hex picked', (s) => s.hexSelect(), 'hex'],
    ['draw from the deck', (s) => s.draw(false), 'draw'],
    ['take the Throw pile', (s) => s.draw(true), 'drawPile'],
    ['throw a card', (s) => s.throw(), 'throw'],
    ['your tile lands', (s) => s.place(3, 9, 0, true), 'land'],
    ['their tile lands', (s) => s.place(3, 9, 0, false), 'landTheirs'],
    ['a Bloom locks in', (s) => s.bloom(), 'bloom'],
    ['your cut', (s) => s.cutBig(), 'cut'],
    ['they cut yours', (s) => s.cutMe(), 'cutMe'],
    ['a Bomb', (s) => s.fruit(), 'bomb'],
    ['a Blast', (s) => s.megaBomb(), 'blast'],
    ['Strengthen', (s) => s.strengthen(), 'strengthen'],
    ['an illegal move', (s) => s.illegal(), 'illegal'],
    ['a switch on', (s) => s.toggle(true), 'toggleOn'],
    ['the deal', (s) => s.shuffle(), 'deal'],
    ['the win: the coins', (s) => s.win(), 'coins'],
    ['the Surround finish: the coins', (s) => s.sigh(), 'coins'],
    ['the loss', (s) => s.lose(), 'lose'],
  ];
  for (const [what, fn, name] of CASES) {
    it(`${what}: ${PALETTE[name].file}`, async () => {
      const { s, ctx } = await engine();
      fn(s);
      ctx.currentTime += 2;
      fn(s);
      expect(played.map((p) => p.file)).toEqual([PALETTE[name].file, PALETTE[name].file]);
    });
  }

  it('every cut size is the same take; a bigger cut is only a little louder', async () => {
    const { s, ctx } = await engine();
    const peaks: number[] = [];
    for (const cut of [() => s.cutSmall(), () => s.cutMedium(), () => s.cutBig(), () => s.cutHuge()]) {
      ctx.currentTime += 1;
      cut();
      expect(last()).toBe(PALETTE.cut.file);
      peaks.push(played.at(-1)!.peak);
    }
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeGreaterThan(peaks[i - 1]!);
  });

  it('a Bloom\'s cards: the same take, two semitones higher each (a count, not variety)', async () => {
    const { s, ctx } = await engine();
    for (let i = 0; i < 3; i++) { ctx.currentTime += 0.3; s.bloomTile(i, 3, true); }
    expect(played.map((p) => p.file)).toEqual(Array(3).fill(PALETTE.bloomCard.file));
    expect(played[1]!.rate).toBeCloseTo(semitones(2), 5);
    expect(played[2]!.rate).toBeCloseTo(semitones(4), 5);
  });

  it('Seeds count: the coins first, then one glass tick per step, a semitone higher each', async () => {
    const { s, ctx } = await engine();
    for (let step = 0; step < 4; step++) { ctx.currentTime += 0.2; s.seedTick(step, step === 3); }
    expect(played[0]!.file).toBe(PALETTE.coins.file);
    expect(played.slice(1).map((p) => p.file)).toEqual(Array(3).fill(PALETTE.seedTick.file));
  });

  it('the noisy extras are silent: the generic tick, the lift, cascades, rustle, sparks, thud, chime', async () => {
    const { s } = await engine();
    s.tick(); s.click(); s.cascadePop(2); s.rustle(); s.sparks(); s.thud(); s.chime(); s.rumble(); s.grind(); s.sad(); s.turn();
    expect(played).toHaveLength(0);
  });
});

describe('never two at once', () => {
  it('a new sound cuts the one still ringing', async () => {
    const { s, ctx } = await engine();
    s.win(); // the coins, ~0.47 s
    ctx.currentTime += 0.1;
    s.press();
    expect(played).toHaveLength(2);
    expect(played[0]!.stoppedAt).not.toBeNull();
    expect(played[0]!.stoppedAt!).toBeLessThan(0.1 + 0.02);
  });

  it('two in the same instant: the more important one keeps it (a Bloom card over its tile)', async () => {
    const { s, ctx } = await engine();
    ctx.currentTime = 5;
    s.bloomTile(0, 3, true);
    s.place(3, 9, 0, true);
    expect(played.map((p) => p.file)).toEqual([PALETTE.bloomCard.file]);
    // ...and a key in the same instant does not cut a cut
    ctx.currentTime = 9;
    s.cutBig();
    s.press();
    expect(played.at(-1)!.file).toBe(PALETTE.cut.file);
    // after the instant, the next sound does cut it
    ctx.currentTime += SAME_INSTANT + 0.01;
    s.press();
    expect(played.at(-1)!.file).toBe(PALETTE.key.file);
  });
});

describe('the turn ring', () => {
  it('only YOUR turn rings; theirs is silent', async () => {
    const { s, ctx } = await engine();
    s.turnFor(false);
    expect(played).toHaveLength(0);
    ctx.currentTime += 1;
    s.turnFor(true);
    expect(last()).toBe(PALETTE.turn.file);
  });

  it('warm and soft: through the low-pass room, a touch lower, quieter', async () => {
    const { s, ctx } = await engine();
    s.turnFor(true);
    const ring = played.at(-1)!;
    ctx.currentTime += 3;
    expect(ring.warm).toBe(true);
    expect(ring.rate).toBeLessThan(1);
    expect(ring.peak).toBeLessThan(0.5);
    // no other sound goes through the room
    s.press();
    expect(played.at(-1)!.warm).toBe(false);
  });
});

describe('the page', () => {
  it('sound is on: the page builds every engine with the recordings', () => {
    expect(SOUND_REMOVED).toBe(false);
    for (const file of ['../src/main.ts', '../src/online/live/mount.ts']) {
      expect(readFileSync(root(file), 'utf8'), file).toMatch(/new Sound\(SOUND_REMOVED, (new RecordedFx\(\)|recorded)\)/);
    }
  });

  it('every key is the same click, the planet\'s and every sheet\'s included (not cards or tiles)', () => {
    const main = readFileSync(root('../src/main.ts'), 'utf8');
    expect(main).toContain(`const anyKey = (el: Element): boolean => !!el.closest(BUTTON_SELECTOR)`);
    expect(main).toMatch(/if \(anyKey\(el\)\) sound\.press\(\);/);
  });

  it('muted: nothing plays', async () => {
    const { s } = await engine();
    s.enabled = false;
    s.press(); s.place(); s.win(); s.turnFor(true);
    expect(played).toHaveLength(0);
  });

  const html = readFileSync(root('../index.html'), 'utf8');
  const hiddenBlock = (marker: string) => {
    const before = html.slice(0, html.indexOf(marker));
    const opened = Math.max(before.lastIndexOf('<div id="music-removed" hidden'), before.lastIndexOf('<div id="music-volume-removed" hidden'));
    const closed = Math.max(before.lastIndexOf('</div><!-- /music-removed -->'), before.lastIndexOf('</div><!-- /music-volume-removed -->'));
    return opened > closed;
  };
  it('Settings shows the sound switch, the effects volume and Test sound; music stays hidden', () => {
    for (const m of ['data-setting="sound"', 'data-volume="sfxVolume"', 'id="test-sound"']) expect(hiddenBlock(m), m).toBe(false);
    for (const m of ['data-setting="music"', 'data-volume="musicVolume"']) expect(hiddenBlock(m), m).toBe(true);
  });
});
