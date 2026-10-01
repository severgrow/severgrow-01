import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, parseStats, recordResult, statsLine } from '../src/logic/stats.js';
import type { GameResult } from '../../src/engine/index.js';

const res = (winner: 0 | 1 | null, scores: [number, number]): GameResult => ({ winner, reason: 'deck_exhaustion', scores });

describe('your record (saved in this browser)', () => {
  it('counts wins, losses, draws, best score and streaks', () => {
    let s = EMPTY_STATS;
    s = recordResult(s, res(0, [20, 12]), 0);
    s = recordResult(s, res(0, [24, 10]), 0);
    s = recordResult(s, res(1, [9, 15]), 0);
    s = recordResult(s, res(null, [7, 7]), 0);
    expect(s).toEqual({ played: 4, wins: 2, losses: 1, draws: 1, best: 24, streak: 0, bestStreak: 2 });
    expect(recordResult(EMPTY_STATS, res(0, [5, 1]), 0).streak).toBe(1);
  });

  it('never changes the stats it is given', () => {
    const s = { ...EMPTY_STATS };
    recordResult(s, res(0, [1, 0]), 0);
    expect(s).toEqual(EMPTY_STATS);
  });

  it('repairs broken saves', () => {
    expect(parseStats(null)).toEqual(EMPTY_STATS);
    expect(parseStats('{bad')).toEqual(EMPTY_STATS);
    expect(parseStats(JSON.stringify({ played: 3, wins: 'x' }))).toEqual({ ...EMPTY_STATS, played: 3 });
  });

  it('reads as one short line', () => {
    expect(statsLine(EMPTY_STATS)).toBe('');
    expect(statsLine({ played: 5, wins: 3, losses: 2, draws: 0, best: 21, streak: 2, bestStreak: 2 })).toBe('3 wins, 2 losses · best score 21 · 2 wins in a row');
    expect(statsLine({ played: 1, wins: 0, losses: 1, draws: 0, best: 4, streak: 0, bestStreak: 0 })).toBe('0 wins, 1 loss · best score 4');
  });
});
