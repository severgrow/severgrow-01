// THE DAILY PUZZLE IS HIDDEN WHILE IT IS TESTED (owner, 2026-10-27: "hide the DAILY puzzles for
// everyone but my account RYK — also allow me to check next 10 on my account").
import { describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_PLAYER_IDS } from '../../server/src/config.js';
import { DAILY_TESTER_IDS, PREVIEW_AHEAD, dailyTesterIn, previewRange } from '../src/daily/access.js';

const ryk = DEFAULT_ADMIN_PLAYER_IDS[0]!;
const identity = (playerId: string, kind = 'account') => JSON.stringify({ token: 't', playerId, displayName: 'RYK', kind });

describe('who sees the Daily Puzzle', () => {
  it('the tester is the owner\'s own account (the same id the server knows as its founding admin)', () => {
    expect(DAILY_TESTER_IDS).toContain(ryk);
  });

  it('only that account, by its player id — not by a name anyone could choose', () => {
    expect(dailyTesterIn(identity(ryk))).toBe(true);
    expect(dailyTesterIn(identity(ryk.toUpperCase()))).toBe(true);
    expect(dailyTesterIn(identity('00000000-0000-4000-8000-000000000001'))).toBe(false);
    expect(dailyTesterIn(JSON.stringify({ token: 't', playerId: 'someone', displayName: 'RYK', kind: 'account' }))).toBe(false);
  });

  it('nobody without an identity, or with a broken one', () => {
    expect(dailyTesterIn(null)).toBe(false);
    expect(dailyTesterIn('{nope')).toBe(false);
    expect(dailyTesterIn(JSON.stringify({ playerId: 5 }))).toBe(false);
  });

  it('the tester can open today\'s puzzle and the next ten, never past the last shipped one', () => {
    expect(PREVIEW_AHEAD).toBe(10);
    expect(previewRange(1, 30)).toEqual({ first: 1, last: 11 });
    expect(previewRange(25, 30)).toEqual({ first: 1, last: 30 });
    expect(previewRange(null, 30)).toEqual({ first: 1, last: 11 });
  });
});
