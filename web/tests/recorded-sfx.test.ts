// THE RECORDED SOUNDS (owner, 2026-11-05: "let's do some sound work - 10/10 tactile responsive fun
// and excellent"). The owner's 174 takes and map (web/public/audio/sfx/, ui/sfx-map.json) played by
// ui/recorded.ts through the engine's existing cues (ui/sound.ts). Verified without a browser: a fake
// Web Audio context records every voice.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { OPPONENT_PACKS, PLAYER_PACKS, RecordedFx, SET_CAP, SFX_EVENTS, SFX_SETS, STAB_PACKS, STAB_VOLUME, bloomNote, clearSharedTakes, onsetOf, semitones } from '../src/ui/recorded.js';
import { SOUND_REMOVED, Sound } from '../src/ui/sound.js';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const FOLDER = root('../public/audio/sfx/');

type Voice = { file: string; at: number; offset: number; rate: number; peak: number };
const voices: Voice[] = [];

class Param {
  value = 0;
  peak = 0;
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; this.peak = Math.max(this.peak, v); }
  setTargetAtTime(v: number) { this.value = v; }
  cancelScheduledValues() { /* fake */ }
  exponentialRampToValueAtTime(v: number) { this.value = v; }
}
class Node_ { connect<T>(d: T) { return d; } }
class Buf {
  data: Float32Array;
  constructor(public file: string, len = 4410, lead = 0) {
    this.data = new Float32Array(len);
    for (let i = lead; i < len; i++) this.data[i] = 0.3;
  }
  get duration() { return this.data.length / 44100; }
  get sampleRate() { return 44100; }
  getChannelData() { return this.data; }
}
class Gain extends Node_ { gain = new Param(); }
let lastGain: Gain | null = null;
class Source extends Node_ {
  buffer: Buf | null = null;
  playbackRate = new Param();
  start(at: number, offset = 0) { voices.push({ file: this.buffer!.file, at, offset, rate: this.playbackRate.value, peak: lastGain?.gain.peak ?? 0 }); }
  stop() { /* fake */ }
}
class Ctx {
  currentTime = 0;
  state = 'running';
  destination = new Node_();
  createGain() { lastGain = new Gain(); return lastGain; }
  createBufferSource() { return new Source(); }
  createDynamicsCompressor() { return { ...new Node_(), connect: <T>(d: T) => d, threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }; }
  createBuffer(_c: number, len: number) { return new Buf('synth', len); }
  async decodeAudioData(bytes: ArrayBuffer) { return new Buf(new TextDecoder().decode(bytes)); }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

/** A recorded engine whose "files" decode to buffers named after themselves. */
const loaded = async () => {
  clearSharedTakes();
  const fx = new RecordedFx(async (url) => new TextEncoder().encode(url.slice(url.lastIndexOf('/') + 1)).buffer as ArrayBuffer, () => 'x/');
  const ctx = new Ctx();
  fx.attach(ctx as unknown as AudioContext, new Node_() as unknown as AudioNode);
  for (let i = 0; i < 2000 && fx.ready < fx.files.length; i++) await new Promise((r) => setTimeout(r, 0));
  return { fx, ctx };
};
const setOf = (file: string) => file.replace(/_\d+\.mp3$/, '');

beforeEach(() => { voices.length = 0; });

describe('the owner\'s takes are all there, and all used', () => {
  it('every take the map names is in the repo, and every take in the repo is in the map', () => {
    const named = new Set(Object.values(SFX_SETS).flat());
    const files = readdirSync(FOLDER).filter((f) => f.endsWith('.mp3'));
    expect(files.length).toBe(174);
    for (const f of named) expect(existsSync(FOLDER + f), f).toBe(true);
    for (const f of files) expect(named.has(f), f).toBe(true);
  });

  it('every moment in the map plays sets that exist, at a volume between 0 and 1', () => {
    for (const [name, e] of Object.entries(SFX_EVENTS)) {
      for (const s of e.sounds) expect(SFX_SETS[s], `${name} -> ${s}`).toBeDefined();
      expect(e.volume).toBeGreaterThan(0);
      expect(e.volume).toBeLessThanOrEqual(1);
    }
  });

  it('the quiet key takes load first, so the next tap already has its click', async () => {
    const { fx } = await loaded();
    expect(fx.files.slice(0, 4).map(setOf)).toEqual(['ui_press', 'ui_press', 'ui_press', 'ui_press']);
    expect(fx.ready).toBe(174 + 96);
    // the stabs load last: a key never waits behind a synth stab
    expect(fx.files.slice(-96).every((f) => f.startsWith('stab_'))).toBe(true);
  });
});

describe('how a moment plays', () => {
  it('never the same take twice in a row', async () => {
    const { fx } = await loaded();
    for (const set of ['ui_key', 'tile_land', 'wood_drop', 'ui_press']) {
      let prev = '';
      for (let i = 0; i < 60; i++) {
        const take = fx.pick(set)!;
        expect(take, set).not.toBe(prev);
        prev = take;
      }
    }
  });

  it('at most four copies of one set sound at once', async () => {
    const { fx } = await loaded();
    let played = 0;
    for (let i = 0; i < 10; i++) if (fx.play('card.select')) played++;
    expect(played).toBe(SET_CAP);
  });

  it('a take starts where its sound starts, not on the MP3\'s silent lead-in', () => {
    const b = new Buf('x', 4410, 1000) as unknown as AudioBuffer;
    expect(onsetOf(b)).toBeCloseTo((1000 - 8) / 44100, 5);
    expect(onsetOf(new Buf('y') as unknown as AudioBuffer)).toBe(0);
  });

  it('a counter step rises a semitone each (rate = 2^(n/12))', () => {
    expect(semitones(12)).toBeCloseTo(2, 6);
    expect(semitones(1)).toBeCloseTo(1.0595, 3);
  });

  it('a fixed take plays that very file (ui.close is the owner\'s favourite, 04)', async () => {
    const { fx } = await loaded();
    fx.play('ui.close', { take: 4 });
    expect(voices.at(-1)!.file).toBe('ui_tape_close_04.mp3');
  });
});

describe('the game\'s moments play the owner\'s sounds', () => {
  const engine = async () => {
    const { fx, ctx } = await loaded();
    const s = new Sound(false, fx);
    (globalThis as unknown as { window: unknown }).window = { AudioContext: class { constructor() { return ctx; } } };
    s.unlock();
    delete (globalThis as unknown as { window?: unknown }).window;
    // the engine attaches its own context: decode again into it
    for (let i = 0; i < 2000 && fx.ready < fx.files.length; i++) await new Promise((r) => setTimeout(r, 0));
    voices.length = 0;
    return { s, ctx };
  };
  const last = () => setOf(voices.at(-1)!.file);

  it('sound is back: the page builds every engine with the recordings', () => {
    expect(SOUND_REMOVED).toBe(false);
    for (const file of ['../src/main.ts', '../src/online/live/mount.ts']) {
      expect(readFileSync(root(file), 'utf8'), file).toMatch(/new Sound\(SOUND_REMOVED, (new RecordedFx\(\)|recorded)\)/);
    }
  });

  const CASES: [string, (s: Sound) => void, string][] = [
    ['key down', (s) => s.press(), 'ui_press'],
    ['key up', (s) => s.click(), 'ui_release'],
    ['PLAY', (s) => s.primary(), 'ui_clack'],
    ['Back', (s) => s.back(), 'ui_dull_click'],
    ['a card picked', (s) => s.cardSelect(), 'ui_key'],
    ['a hex picked', (s) => s.hexSelect(), 'rock_click'],
    ['draw from the deck', (s) => s.draw(false), 'card_flick'],
    ['take the Throw pile', (s) => s.draw(true), 'card_fan_cards'],
    ['throw a card', (s) => s.throw(), 'wood_drop'],
    ['your tile lands', (s) => s.place(3, 9, 0, true), 'tile_land'],
    ['their tile lands (the bot\'s low set)', (s) => s.place(3, 9, 0, false), 'tile_land_opp_low'],
    ['a Bloom card stacks', (s) => s.bloomTile(1), 'wood_stack'],
    ['a Bloom locks in', (s) => s.bloom(), 'wood_block_drop'],
    ['you cut their tiles', (s) => s.cutSmall(), 'velcro'],
    ['they cut yours', (s) => s.cutMe(), 'metal_big'],
    ['a Bomb', (s) => s.fruit(), 'wood_drop_heavy'],
    ['Strengthen', (s) => s.strengthen(), 'wood_click'],
    ['your turn', (s) => s.turnFor(true), 'glass_ring'],
    ['their turn', (s) => s.turnFor(false), 'glass_tap_soft'],
    ['an illegal move', (s) => s.illegal(), 'metal_dull'],
    ['a switch on', (s) => s.toggle(true), 'ui_flick'],
    ['a switch off', (s) => s.toggle(false), 'ui_flick_back'],
    ['the deal', (s) => s.shuffle(), 'card_shuffle'],
    ['the loss', (s) => s.lose(), 'metal_big'],
  ];
  for (const [what, fn, set] of CASES) {
    it(`${what}: ${set}`, async () => {
      const { s } = await engine();
      fn(s);
      expect(last()).toBe(set);
    });
  }

  it('the win is the glass ring and the coins together', async () => {
    const { s } = await engine();
    s.win();
    expect(voices.map((v) => setOf(v.file))).toEqual(['glass_ring', 'coins']);
  });

  it('the loss is the owner\'s long dramatic take, 02', async () => {
    const { s } = await engine();
    s.lose();
    expect(voices.at(-1)!.file).toBe('metal_big_02.mp3');
  });

  it('Seeds count up: coins, then a glass tick per step, a semitone higher each', async () => {
    const { s } = await engine();
    for (let step = 0; step < 4; step++) s.seedTick(step, step === 3);
    expect(setOf(voices[0]!.file)).toBe('coins');
    const ticks = voices.filter((v) => setOf(v.file) === 'glass_tap');
    expect(ticks).toHaveLength(4);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.rate).toBeGreaterThan(ticks[i - 1]!.rate * 1.04);
  });

  it('a Bloom\'s cards climb two semitones each', async () => {
    const { s } = await engine();
    for (let i = 0; i < 3; i++) s.bloomTile(i);
    const r = voices.map((v) => v.rate);
    expect(r[1]! / r[0]!).toBeGreaterThan(1.08);
    expect(r[2]! / r[1]!).toBeGreaterThan(1.08);
  });

  it('a finger on a card or hex does not double its action\'s sound (the generic tick is silent)', async () => {
    const { s } = await engine();
    s.tick();
    expect(voices).toHaveLength(0);
  });

  it('muted: nothing plays', async () => {
    const { s } = await engine();
    s.enabled = false;
    s.press(); s.place(); s.win();
    expect(voices).toHaveLength(0);
  });
});

describe('Settings', () => {
  const html = readFileSync(root('../index.html'), 'utf8');
  const hiddenBlock = (marker: string) => {
    const before = html.slice(0, html.indexOf(marker));
    const opened = Math.max(before.lastIndexOf('<div id="music-removed" hidden'), before.lastIndexOf('<div id="music-volume-removed" hidden'));
    const closed = Math.max(before.lastIndexOf('</div><!-- /music-removed -->'), before.lastIndexOf('</div><!-- /music-volume-removed -->'));
    return opened > closed;
  };
  it('shows the sound switch, the effects volume and Test sound; music stays hidden (no music yet)', () => {
    for (const m of ['data-setting="sound"', 'data-volume="sfxVolume"', 'id="test-sound"']) {
      expect(html, m).toContain(m);
      expect(hiddenBlock(m), m).toBe(false);
    }
    for (const m of ['data-setting="music"', 'data-volume="musicVolume"']) expect(hiddenBlock(m), m).toBe(true);
    expect(html).not.toContain('id="sound-removed"');
  });
});

describe('the stabs (owner, 2026-11-05: stacked on top of Cut, Bloom, Bomb and Blast)', () => {
  const STABS = root('../public/audio/stabs/');
  const packOf = (file: string) => file.split('_')[1]!;
  const engine = async () => {
    const { fx, ctx } = await loaded();
    const s = new Sound(false, fx);
    (globalThis as unknown as { window: unknown }).window = { AudioContext: class { constructor() { return ctx; } } };
    s.unlock();
    delete (globalThis as unknown as { window?: unknown }).window;
    for (let i = 0; i < 2000 && fx.ready < fx.files.length; i++) await new Promise((r) => setTimeout(r, 0));
    voices.length = 0;
    return { s, fx, ctx };
  };
  const stabs = () => voices.filter((v) => v.file.startsWith('stab_'));

  it('all 96 stab files are in the repo and in the map: 8 packs of 5 grow, 5 run, a bomb and a blast', () => {
    const files = readdirSync(STABS).filter((f) => f.endsWith('.mp3'));
    expect(files.length).toBe(96);
    expect(Object.keys(STAB_PACKS).length).toBe(8);
    for (const p of Object.values(STAB_PACKS)) {
      expect(p.grow).toHaveLength(5);
      expect(p.run).toHaveLength(5);
      for (const f of [...p.grow, ...p.run, p.bomb, p.blast]) expect(existsSync(STABS + f), f).toBe(true);
    }
    expect(PLAYER_PACKS).toEqual(['p2', 'p4', 'p8', 'p5', 'p7']);
    expect(OPPONENT_PACKS).toEqual(['p1', 'p3', 'p6', 'p5', 'p7']);
  });

  it('your cut rings one of YOUR packs on top of the cut sound; theirs rings one of THEIRS', async () => {
    const { s } = await engine();
    for (const cut of [(x: Sound) => x.cutSmall(), (x: Sound) => x.cutMedium(), (x: Sound) => x.cutBig(), (x: Sound) => x.cutHuge()]) {
      voices.length = 0;
      cut(s);
      const st = stabs();
      expect(st).toHaveLength(1);
      expect(PLAYER_PACKS).toContain(packOf(st[0]!.file));
      expect(st[0]!.file).toMatch(/_grow_[1-5]\.mp3$/);
      expect(voices.some((v) => setOf(v.file) === 'velcro')).toBe(true);
    }
    voices.length = 0;
    s.cutMe();
    expect(OPPONENT_PACKS).toContain(packOf(stabs()[0]!.file));
    expect(voices.some((v) => setOf(v.file) === 'metal_big')).toBe(true);
  });

  it('a side never takes the pack it used last, nor the one the other side is ringing', async () => {
    const { fx } = await loaded();
    let last = '';
    for (let i = 0; i < 40; i++) {
      const p = fx.pickPack(true);
      expect(p).not.toBe(last);
      expect(PLAYER_PACKS).toContain(p);
      last = p;
    }
    // the opponent rings a shared pack: the player cannot take it while it rings
    const { fx: fx2 } = await loaded();
    let theirs = '';
    for (let i = 0; i < 20 && !['p5', 'p7'].includes(theirs); i++) { voices.length = 0; fx2.stabHit('bomb', false); theirs = packOf(voices.at(-1)!.file); }
    expect(['p5', 'p7']).toContain(theirs);
    for (let i = 0; i < 20; i++) expect(fx2.pickPack(true)).not.toBe(theirs);
  });

  it('a Bloom is one pack: run notes 1,2,3,4 then 1,2..., and the LAST note is the grow file (full tail)', async () => {
    expect([0, 1, 2, 3, 4, 5].map(bloomNote)).toEqual([1, 2, 3, 4, 1, 2]);
    const { s } = await engine();
    for (let i = 0; i < 6; i++) s.bloomTile(i, 6, true);
    const st = stabs();
    expect(st).toHaveLength(6);
    expect(new Set(st.map((v) => packOf(v.file))).size).toBe(1);
    expect(st.map((v) => v.file.replace(/^stab_p\d_/, ''))).toEqual(['run_1.mp3', 'run_2.mp3', 'run_3.mp3', 'run_4.mp3', 'run_1.mp3', 'grow_2.mp3']);
    // the recorded Bloom sound still plays under the notes (this fake clock never advances, so the
    // 4-copy cap holds six simultaneous wood_stack takes to four; in play they are 211 ms apart)
    expect(voices.filter((v) => setOf(v.file) === 'wood_stack')).toHaveLength(SET_CAP);
  });

  it('a small Bloom of three: run 1, run 2, then grow 3', async () => {
    const { s } = await engine();
    for (let i = 0; i < 3; i++) s.bloomTile(i, 3, false);
    expect(stabs().map((v) => v.file.replace(/^stab_p\d_/, ''))).toEqual(['run_1.mp3', 'run_2.mp3', 'grow_3.mp3']);
    expect(OPPONENT_PACKS).toContain(packOf(stabs()[0]!.file));
  });

  it('the Bomb and the Blast ring their pack\'s stab on top of their recorded sound', async () => {
    const { s } = await engine();
    s.fruit(true);
    expect(stabs().at(-1)!.file).toMatch(/^stab_p\d_bomb\.mp3$/);
    expect(voices.some((v) => setOf(v.file) === 'wood_drop_heavy')).toBe(true);
    voices.length = 0;
    s.megaBomb(false);
    expect(stabs().at(-1)!.file).toMatch(/^stab_p\d_blast\.mp3$/);
    expect(OPPONENT_PACKS).toContain(packOf(stabs().at(-1)!.file));
    expect(voices.some((v) => setOf(v.file) === 'metal_big')).toBe(true);
  });

  it('stabs sit a bit under the recordings (the owner\'s 0.6)', async () => {
    expect(STAB_VOLUME).toBe(0.6);
    const { s } = await engine();
    s.fruit(true);
    expect(stabs()[0]!.peak).toBeCloseTo(0.6, 5);
  });

  it('muted or Effects-dropped: no stab', async () => {
    const { s } = await engine();
    s.enabled = false;
    s.cutBig(); s.fruit(); s.megaBomb(); s.bloomTile(0, 3);
    expect(stabs()).toHaveLength(0);
  });
});
