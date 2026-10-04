import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/engine/index.js';
import { gameHighlights } from '../src/logic/highlights.js';
import { playGame } from './ui-helpers.js';

const c = (q: number, r: number) => ({ q, r });

describe('game-over highlights', () => {
  it('biggest cut, biggest single move and most tiles at once, from the game history', () => {
    const history: Event[] = [
      { t: 'Bloom', player: 0, cards: [1, 2, 3], hexes: [c(0, 0), c(1, 0), c(2, 0)] },
      { t: 'Overgrow', player: 0, coord: c(2, 0), oldOwner: 1, oldStrength: 2, newStrength: 3 },
      { t: 'Sever', player: 1, coords: [c(3, 0), c(4, 0), c(5, 0), c(6, 0)] },
      { t: 'Discard', player: 0, card: 9 },
      { t: 'Sprout', player: 1, card: 5, coord: c(0, 1) },
      { t: 'Sever', player: 0, coords: [c(1, 1), c(2, 1)] },
      { t: 'Bloom', player: 1, cards: [6, 7, 8, 10], hexes: [c(0, 2), c(1, 2), c(2, 2), c(3, 2)] },
    ];
    const h = gameHighlights(history, 0);
    expect(h.map((x) => x.title)).toEqual(['Biggest cut', 'Biggest single move', 'Most tiles at once']);
    expect(h[0]).toMatchObject({ by: 0, value: 4, text: 'You cut off 4 opponent tiles' });
    expect(h[1]).toMatchObject({ by: 0, value: 7, text: 'You changed 7 tiles in one move' });
    expect(h[2]).toMatchObject({ by: 1, value: 4, text: 'Your opponent grew 4 tiles at once' });
  });

  it('a game with no cuts says so', () => {
    const h = gameHighlights([{ t: 'Sprout', player: 0, card: 1, coord: c(0, 0) }], 0);
    expect(h[0]).toMatchObject({ value: 0, text: 'No cuts this game' });
    expect(h[2]).toMatchObject({ by: 0, value: 1, text: 'You grew 1 tile at once' });
  });

  it('real games: the biggest cut matches the largest Sever event', () => {
    for (const seed of [1, 2, 3]) {
      const s = playGame(seed);
      const sev = (s.history ?? []).filter((e) => e.t === 'Sever').map((e) => (e as { coords: unknown[] }).coords.length);
      expect(gameHighlights(s.history ?? [], 0)[0]!.value).toBe(Math.max(0, ...sev));
    }
  });
});
