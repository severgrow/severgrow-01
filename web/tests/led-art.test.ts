// THE SIGN'S PICTURES (owner, 2026-11-11): an explosion after some Blasts (in colour), a snake biting a
// 6 on a cut of 6 or more about once in two games, and the sign's own name 点 now and then after the
// opponent's big move or win. The sign also OPENS UP: more opponent lines a game as games are played.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_MIN_DWELL_MS, DisplayMachine, type DisplayFrame } from '../src/player/display-machine.js';
import { ART_COLS, ART_FRAMES, ArtDeck, KANJI_FROM_GAMES, artDuration } from '../src/player/led-art.js';
import { ART_MARK, ledLayout, ledMotifFrames, ledMotifOnce } from '../src/player/led-cells.js';
import { RIVAL_GAME_CAP, rivalCapFor } from '../src/player/led-flavour.js';
import { displayEventForPlay } from '../src/player/display-readout.js';
import { newGame } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

const tones = (frame: string) => new Set(ledLayout(frame).dots.map((d) => d.tone));

describe('the pictures', () => {
  it('are whole-window dot pictures that play once', () => {
    for (const [art, frames] of Object.entries(ART_FRAMES)) {
      expect(ledMotifFrames(art as 'blast')).toBe(frames);
      expect(ledMotifOnce(art as 'blast')).toBe(true);
      for (const f of frames) {
        expect(f.startsWith(ART_MARK)).toBe(true);
        const rows = f.slice(1).split('/');
        expect(rows).toHaveLength(7);
        for (const row of rows) expect(row).toHaveLength(ART_COLS);
      }
      // Short: a beat, never a show.
      expect(artDuration(art as 'blast')).toBeLessThan(3200);
    }
    expect(ledMotifOnce('stars')).toBe(false);
  });
  it('the explosion is in colour: white flash, amber fire, red ring, then dark', () => {
    const all = new Set(ART_FRAMES.blast.flatMap((f) => [...tones(f)]));
    for (const t of ['ivory', 'amber', 'red']) expect(all.has(t as 'red')).toBe(true);
    expect(ledLayout(ART_FRAMES.blast.at(-1)!).dots).toHaveLength(0);
  });
  it('the snake is green and bites a piece out of an amber 6', () => {
    const f = ART_FRAMES.snake;
    expect(tones(f[3]!).has('green')).toBe(true);
    const lit = (frame: string) => ledLayout(frame).dots.filter((d) => d.tone === 'amber').length;
    expect(lit(f.at(-1)!)).toBeLessThan(lit(f[0]!)); // the 6 lost its bite
  });
  it('点 is written stroke by stroke and ends lit, in its red seal', () => {
    const f = ART_FRAMES.kanji;
    const count = (frame: string) => ledLayout(frame).dots.length;
    expect(count(f[0]!)).toBeLessThan(count(f[8]!));
    expect(tones(f.at(-1)!).has('red')).toBe(true);
    expect(tones(f.at(-1)!).has('amber')).toBe(true);
  });
  it('dots sit on the glass grid (2.3 px across, 3.1 px down)', () => {
    const dots = ledLayout(ART_MARK + 'a.a/.a.').dots;
    expect(dots.map((d) => [+(d.x).toFixed(2), +(d.y).toFixed(2)])).toEqual([[1.1, 3.15], [5.7, 3.15], [3.4, 6.25]]);
  });
});

describe('how rarely', () => {
  it('explosion: about half the Blasts, two a game at most', () => {
    const deck = new ArtDeck();
    let shown = 0;
    for (let i = 0; i < 200; i++) if (deck.take('blast', `b:${i}`)) shown++;
    expect(shown).toBe(2);
    let total = 0;
    for (let g = 0; g < 200; g++) { deck.reset(); if (deck.take('blast', `g:${g}`)) total++; }
    expect(total).toBeGreaterThan(70); expect(total).toBeLessThan(150);
  });
  it('snake: about one game in two that has a big cut, once a game', () => {
    const deck = new ArtDeck();
    let games = 0;
    for (let g = 0; g < 400; g++) {
      deck.reset();
      let n = 0;
      for (let c = 0; c < 4; c++) if (deck.take('snake', `s:${g}:${c}`)) n++;
      expect(n).toBeLessThanOrEqual(1);
      games += n;
    }
    expect(games).toBeGreaterThan(150); expect(games).toBeLessThan(250);
  });
  it('点: never for a new player, then once in a while, once a game', () => {
    const deck = new ArtDeck();
    deck.setGames(KANJI_FROM_GAMES - 1);
    for (let i = 0; i < 100; i++) expect(deck.take('kanji', `k:${i}`)).toBe(false);
    deck.setGames(KANJI_FROM_GAMES);
    let n = 0;
    for (let i = 0; i < 100; i++) if (deck.take('kanji', `k:${i}`)) n++;
    expect(n).toBe(1);
  });
});

describe('the sign opens up', () => {
  it('more opponent lines a game as games are played, capped', () => {
    expect(rivalCapFor(0)).toBe(1);
    expect(rivalCapFor(3)).toBe(2);
    expect(rivalCapFor(10)).toBe(RIVAL_GAME_CAP);
    expect(rivalCapFor(10_000)).toBe(RIVAL_GAME_CAP);
    for (let g = 1; g < 50; g++) expect(rivalCapFor(g)).toBeGreaterThanOrEqual(rivalCapFor(g - 1));
  });
});

describe('which moments may earn a picture', () => {
  const over = (s: State, winner: 0 | 1): State => ({ ...s, phase: 'GAME_OVER', result: { winner } as State['result'] });
  it('the opponent winning may earn the 点 — offline free play only', () => {
    const s = newGame(3);
    expect(displayEventForPlay(s, over(s, 1), [], 0, 'rival', true)?.anim).toEqual(['kanji']);
    expect(displayEventForPlay(s, over(s, 0), [], 0, 'rival', true)?.anim).toBeUndefined();
    expect(displayEventForPlay(s, over(s, 1), [], 0, 'rival', false)?.anim).toBeUndefined();
    expect(displayEventForPlay(s, over(s, 1), [], 0, 'neutral', true)?.anim).toBeUndefined();
  });
  it('a Blast may earn the explosion; a cut of 6 the snake', () => {
    const s = newGame(3);
    const blast = [{ k: 'megaBomb', player: 1, destroyed: ['a', 'b', 'c'] }] as never;
    expect(displayEventForPlay(s, s, blast, 0, 'neutral', true)?.anim).toEqual(['blast']);
    expect(displayEventForPlay(s, s, blast, 0, 'rival', true)?.anim).toEqual(['blast', 'kanji']);
    const cut = (player: 0 | 1, n: number) => [{ k: 'sever', player, keys: Array.from({ length: n }, (_, i) => `t${i}`) }] as never;
    expect(displayEventForPlay(s, s, cut(1, 6), 0, 'neutral', true)?.anim).toEqual(['snake']);
    expect(displayEventForPlay(s, s, cut(0, 6), 0, 'rival', true)?.anim).toEqual(['kanji', 'snake']);
    expect(displayEventForPlay(s, s, cut(1, 5), 0, 'rival', true)?.anim).toBeUndefined();
  });
});

describe('the machine plays a picture after the fact', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  // A key the explosion's own gate lets through.
  const blastKey = () => { for (let i = 0; i < 500; i++) if (new ArtDeck().take('blast', `m:${i}`)) return `m:${i}`; throw new Error('none'); };

  it('the fact first, then the explosion, then back to the score', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine((frame) => frames.push(frame));
    sign.reset('GROW OR SKIP', 0, 0);
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    sign.event({ message: '-5', mode: 'red', priority: 96, duration: 1150, key: blastKey(), anim: ['blast'] });
    expect(frames.at(-1)).toMatchObject({ text: '-5' });
    vi.advanceTimersByTime(1150);
    expect(frames.at(-1)).toMatchObject({ motif: 'blast' });
    vi.advanceTimersByTime(artDuration('blast') + 3000);
    expect(frames.some((f) => f.motif === 'blast')).toBe(true);
    expect(frames.at(-1)?.motif).toBeUndefined();
  });
  it('never with reduced motion', () => {
    const frames: DisplayFrame[] = [];
    vi.stubGlobal('document', { documentElement: { classList: { contains: (c: string) => c === 'reduce-motion' } } });
    const sign = new DisplayMachine((frame) => frames.push(frame));
    sign.reset('GROW OR SKIP', 0, 0);
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    sign.event({ message: '-5', mode: 'red', priority: 96, duration: 1150, key: blastKey(), anim: ['blast'] });
    vi.advanceTimersByTime(6000);
    expect(frames.some((f) => f.motif === 'blast')).toBe(false);
  });
});
