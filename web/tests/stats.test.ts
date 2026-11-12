import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, countsTowardRecord, parseStats, recordResult, statsLine } from '../src/logic/stats.js';
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
    expect(s).toEqual({ played: 4, wins: 2, losses: 1, draws: 1, best: 24, streak: 0, bestStreak: 2, winsByLevel: W({ 3: 1, 7: 1 }) });
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


describe('which finished games join the offline record', () => {
  // Owner, 2026-11-01: "make the campaign games also count in offline wins in profile". The lessons
  // ARE campaign chapter 1, so a campaign match counts even while the guide is on screen.
  const base = { watching: false, tutorial: false, campaign: false, replay: false };

  it('counts a practice match', () => {
    expect(countsTowardRecord(base)).toBe(true);
  });

  it('counts a CAMPAIGN level, guide or no guide', () => {
    expect(countsTowardRecord({ ...base, campaign: true })).toBe(true);
    expect(countsTowardRecord({ ...base, campaign: true, tutorial: true })).toBe(true);
  });

  it('does not count a guided step that is not a campaign level', () => {
    expect(countsTowardRecord({ ...base, tutorial: true })).toBe(false);
  });

  it('does not count the lab watching a board play itself', () => {
    expect(countsTowardRecord({ ...base, watching: true })).toBe(false);
    expect(countsTowardRecord({ ...base, watching: true, campaign: true })).toBe(false);
  });

  it('does not count a REPLAY of a level already passed, on either line', () => {
    expect(countsTowardRecord({ ...base, replay: true })).toBe(false);
    expect(countsTowardRecord({ ...base, replay: true, campaign: true })).toBe(false);
    expect(countsTowardRecord({ ...base, replay: true, tutorial: true, campaign: true })).toBe(false);
  });

  it('is wired into the finish handler, not restated there', () => {
    const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
    expect(main).toContain('countsTowardRecord({');
    // The old inline guard is gone: the rule lives in one place.
    expect(main).not.toMatch(/if \(p\.before\.phase !== 'GAME_OVER' && !watching && !coach\.tutorial\) \{/);
    // A campaign match stops the guide's early return: the record is written below it.
    expect(main).toMatch(/stats = recordResult\(stats, p\.after\.result, HUMAN, ladderLevel\(gameLevel\)\)/);
  });
});
