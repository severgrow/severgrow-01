// GUEST → EXISTING ACCOUNT: KEEP THE BEST OF BOTH (owner decision, 2026-11-18, accounts pass).
// The pure rules the merge transaction applies; the transaction itself is checked on real Postgres
// in account-merge-postgres.integration.test.ts.
import { describe, expect, it } from 'vitest';
import { betterBest, mergeBlitzStreak, mergePracticeStreak, unionCampaignProgress } from '../src/accounts/merge-rules.js';

describe('campaign progress from both', () => {
  it('every cleared level from either, and the better result per level', () => {
    const account = { completed: ['c1-01', 'c1-02', 'c1-03'], best: { 'c1-02': { won: true, score: 20, turns: 14 }, 'c1-03': { won: false, score: 9, turns: 30 } } };
    const guest = { completed: ['c1-01', 'c1-04'], best: { 'c1-02': { won: true, score: 25, turns: 18 }, 'c1-03': { won: true, score: 5, turns: 40 }, 'c1-04': { won: true, score: 11, turns: 12 } } };
    const merged = unionCampaignProgress(account, guest);
    expect(merged.completed).toEqual(['c1-01', 'c1-02', 'c1-03', 'c1-04']);
    expect(merged.best['c1-02']).toEqual({ won: true, score: 25, turns: 18 }); // higher score
    expect(merged.best['c1-03']).toEqual({ won: true, score: 5, turns: 40 }); // a win beats a loss
    expect(merged.best['c1-04']).toEqual({ won: true, score: 11, turns: 12 }); // only the guest had it
  });

  it('is the same in either order, and merging twice changes nothing', () => {
    const a = { completed: ['c1-01'], best: { 'c1-01': { won: true, score: 7, turns: 9 } } };
    const b = { completed: ['c2-11'], best: { 'c1-01': { won: true, score: 7, turns: 8 } } };
    expect(unionCampaignProgress(a, b)).toEqual(unionCampaignProgress(b, a));
    const once = unionCampaignProgress(a, b);
    expect(unionCampaignProgress(once, b)).toEqual(once);
  });

  it('on an equal score the shorter win is better', () => {
    expect(betterBest({ won: true, score: 10, turns: 20 }, { won: true, score: 10, turns: 15 })).toEqual({ won: true, score: 10, turns: 15 });
  });
});

describe('streaks from both', () => {
  it('practice: the higher best, and the account\'s current streak', () => {
    expect(mergePracticeStreak({ current: 2, best: 4 }, { current: 6, best: 9 })).toEqual({ current: 2, best: 9 });
    expect(mergePracticeStreak({ current: 3, best: 8 }, { current: 1, best: 2 })).toEqual({ current: 3, best: 8 });
  });

  it('practice: a key only the guest played takes the guest\'s numbers', () => {
    expect(mergePracticeStreak(null, { current: 2, best: 5 })).toEqual({ current: 2, best: 5 });
  });

  it('online Blitz: the higher best; the account keeps its own current streak', () => {
    expect(mergeBlitzStreak({ current: 1, best: 3 }, { current: 4, best: 7 })).toEqual({ current: 1, best: 7 });
    expect(mergeBlitzStreak(null, { current: 4, best: 7 })).toEqual({ current: 0, best: 7 });
  });
});
