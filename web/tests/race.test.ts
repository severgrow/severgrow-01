// UI overhaul item 14: the race bar and the score breakdown.
import { describe, expect, it } from 'vitest';
import { score } from '../../src/engine/index.js';
import type { Player } from '../../src/engine/index.js';
import { breakdownOf, raceShare, raceWords } from '../src/logic/race.js';
import { playGame } from './ui-helpers.js';

describe('the race bar', () => {
  it('level scores (and 0-0) sit in the middle', () => {
    expect(raceShare(0, 0)).toBe(0.5);
    expect(raceShare(7, 7)).toBe(0.5);
  });
  it('a lead moves the bar my way; theirs moves it back; it never fills one colour', () => {
    expect(raceShare(10, 5)).toBeGreaterThan(0.5);
    expect(raceShare(5, 10)).toBeLessThan(0.5);
    expect(raceShare(12, 4)).toBeGreaterThan(raceShare(8, 4));
    expect(raceShare(50, 0)).toBeLessThan(1);
    expect(raceShare(0, 50)).toBeGreaterThan(0);
    expect(raceShare(-3, 2)).toBeGreaterThanOrEqual(0);
  });
  it('says who leads in plain words, never "bot"', () => {
    expect(raceWords(5, 5, 'Opponent')).toBe('Level at 5');
    expect(raceWords(9, 5, 'Opponent')).toBe('You lead by 4');
    expect(raceWords(5, 9, 'Opponent')).toBe('Opponent leads by 4');
  });
});

describe('the score breakdown', () => {
  it('always adds up to the real score, for both players, all through real games', () => {
    let n = 0;
    for (const seed of [3, 8]) {
      playGame(seed, ({ after }) => {
        for (const p of [0, 1] as Player[]) {
          const b = breakdownOf(after, p);
          expect(b.total).toBe(score(after, p));
          expect(b.lines.at(-1)).toBe(`Total: ${b.total}`);
          n++;
        }
      });
    }
    expect(n).toBeGreaterThan(50);
  });
});
