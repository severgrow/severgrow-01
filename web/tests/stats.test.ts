import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, parseStats, recordResult, statsLine, versionLine } from '../src/logic/stats.js';
import type { GameResult } from '../../src/engine/index.js';

const res = (winner: 0 | 1 | null, scores: [number, number]): GameResult => ({ winner, reason: 'deck_exhaustion', scores });
const W = (o: Partial<Record<number, number>> = {}) => Array.from({ length: 9 }, (_, i) => o[i + 1] ?? 0);

describe('your record (saved in this browser)', () => {
  it('counts wins, losses, draws, best score and streaks', () => {
    let s = EMPTY_STATS;
    s = recordResult(s, res(0, [20, 12]), 0, 7);
    s = recordResult(s, res(0, [24, 10]), 0, 3);
    s = recordResult(s, res(1, [9, 15]), 0, 7);
    s = recordResult(s, res(null, [7, 7]), 0, 7);
    expect(s).toEqual({ played: 4, wins: 2, losses: 1, draws: 1, best: 24, streak: 0, bestStreak: 2, winsByLevel: W({ 3: 1, 7: 1 }), byVersion: { sprout: { played: 4, wins: 2 }, seed: { played: 0, wins: 0 } } });
    expect(recordResult(EMPTY_STATS, res(0, [5, 1]), 0, 7).streak).toBe(1);
  });

  it('never changes the stats it is given', () => {
    const s = { ...EMPTY_STATS };
    recordResult(s, res(0, [1, 0]), 0, 7);
    expect(s).toEqual(EMPTY_STATS);
  });

  it('repairs broken saves', () => {
    expect(parseStats(null)).toEqual(EMPTY_STATS);
    expect(parseStats('{bad')).toEqual(EMPTY_STATS);
    expect(parseStats(JSON.stringify({ played: 3, wins: 'x' }))).toEqual({ ...EMPTY_STATS, played: 3 });
    expect(parseStats(JSON.stringify({ winsByLevel: [1, 2, 'x'] })).winsByLevel).toEqual(W({ 1: 1, 2: 2 }));
  });

  it('reads as one short line', () => {
    expect(statsLine(EMPTY_STATS)).toBe('');
    expect(statsLine({ played: 5, wins: 3, losses: 2, draws: 0, best: 21, streak: 2, bestStreak: 2, winsByLevel: W() })).toBe('3 wins, 2 losses · best score 21 · 2 wins in a row');
    expect(statsLine({ played: 1, wins: 0, losses: 1, draws: 0, best: 4, streak: 0, bestStreak: 0, winsByLevel: W() })).toBe('0 wins, 1 loss · best score 4');
  });
});

describe('UX pass: wins per version (Seed A/B test)', () => {
  const win = { winner: 0 as const, reason: 'deck_exhaustion' as const, scores: [12, 8] as [number, number] };
  const loss = { winner: 1 as const, reason: 'deck_exhaustion' as const, scores: [5, 9] as [number, number] };
  it('counts games and wins for each version; old saves start at zero', () => {
    let s = parseStats(JSON.stringify({ played: 4, wins: 2 }));
    expect(s.byVersion).toEqual({ sprout: { played: 0, wins: 0 }, seed: { played: 0, wins: 0 } });
    s = recordResult(s, win, 0, 3, 'seed');
    s = recordResult(s, loss, 0, 3, 'seed');
    s = recordResult(s, win, 0, 3);
    expect(s.byVersion).toEqual({ sprout: { played: 1, wins: 1 }, seed: { played: 2, wins: 1 } });
    expect(parseStats(JSON.stringify(s)).byVersion).toEqual(s.byVersion);
  });
  it('one quiet line for the menu, only for versions played', () => {
    let s = parseStats(null);
    expect(versionLine(s)).toBe('');
    s = recordResult(s, win, 0, 3, 'seed');
    expect(versionLine(s)).toBe('Seed version: won 1 of 1');
    s = recordResult(s, loss, 0, 3, 'sprout');
    expect(versionLine(s)).toBe('Sprout version: won 0 of 1 · Seed version: won 1 of 1');
  });
  it('ignores bad saved numbers', () => {
    const s = parseStats(JSON.stringify({ byVersion: { seed: { played: -2, wins: 'x' } } }));
    expect(s.byVersion?.seed).toEqual({ played: 0, wins: 0 });
  });
});
