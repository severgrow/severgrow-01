// PRACTICE STREAKS + BEST ONLINE BLITZ STREAK (owner, 2026-11-18). The owner-approved table:
//   Win +1 · Loss 0 · Draw unchanged · Resign 0 · Abandon (a new game over an unfinished one) 0 ·
//   Online Blitz forfeit or timeout 0 · Best = the highest current ever reached · every finished game
//   counts exactly once. Closing the app during an offline game changes nothing (the page keeps the
//   game; tested in web/tests/practice-streaks.test.ts).
import { describe, expect, it } from 'vitest';
import { PRACTICE_TIERS, STREAK_TIERS, applyGame, applyGames, emptyStreak, isPracticeTier, isStreakResult, isStreakTier } from '../src/streaks/rules.js';

describe('the streak rules', () => {
  it('a win adds one, a loss resets to 0, a draw changes nothing; best is the highest ever', () => {
    let s = emptyStreak();
    s = applyGame(s, 'win'); s = applyGame(s, 'win'); s = applyGame(s, 'win');
    expect(s).toEqual({ current: 3, best: 3 });
    s = applyGame(s, 'draw');
    expect(s).toEqual({ current: 3, best: 3 });
    s = applyGame(s, 'loss');
    expect(s).toEqual({ current: 0, best: 3 });
    s = applyGame(s, 'win');
    expect(s).toEqual({ current: 1, best: 3 });
  });
  it('resign, abandon, forfeit and timeout are losses', () => {
    for (const result of ['resign', 'abandon', 'forfeit', 'timeout'] as const) {
      expect(applyGame({ current: 4, best: 6 }, result)).toEqual({ current: 0, best: 6 });
    }
  });
  it('best never goes down, even from a damaged starting value', () => {
    expect(applyGame({ current: 9, best: 2 }, 'win')).toEqual({ current: 10, best: 10 });
    expect(applyGame({ current: -3, best: -1 }, 'loss')).toEqual({ current: 0, best: 0 });
  });
  it('a list of games is applied in order', () => {
    expect(applyGames(emptyStreak(), ['win', 'win', 'loss', 'win'])).toEqual({ current: 1, best: 2 });
  });
  it('the four practice keys, and nothing else, are streak tiers', () => {
    expect(PRACTICE_TIERS).toEqual(['easy', 'medium', 'hard', 'blitz']);
    expect(isPracticeTier('hard')).toBe(true);
    expect(isPracticeTier('campaign')).toBe(false);
    expect(isStreakResult('draw')).toBe(true);
    expect(isStreakResult('maybe')).toBe(false);
  });
  it('only HARD and BLITZ carry a streak; EASY and MEDIUM are accepted but not counted (2026-11-20)', () => {
    expect(STREAK_TIERS).toEqual(['hard', 'blitz']);
    expect(isStreakTier('hard')).toBe(true);
    expect(isStreakTier('blitz')).toBe(true);
    expect(isStreakTier('easy')).toBe(false);
    expect(isStreakTier('medium')).toBe(false);
    // Still valid Practice reports, so an older page is never rejected.
    expect(isPracticeTier('easy')).toBe(true);
    expect(isPracticeTier('medium')).toBe(true);
  });
});
