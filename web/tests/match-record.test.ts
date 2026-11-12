// THE PROFILE'S TWO RECORDS (owner, 2026-11-01): the same three numbers twice — games, win rate,
// longest streak — offline above, online below. One builder serves both, so these tests are about
// the RULES that builder encodes:
//   * games and wins are counted, a draw neither wins nor extends a run;
//   * the streak is the BEST run EVER, not the run in progress;
//   * only FINISHED matches count (a match in play is not a result);
//   * a record we could not read is an em dash, while a record of zero games is a real 0 games.
import { describe, expect, it } from 'vitest';
import { PROFILE } from '../../src/strings.js';
import { accountRecord, offlineRecord, onlineRecord, recordRows } from '../src/logic/match-record.js';
import type { MatchListEntry } from '../../server/src/protocol.js';
import { EMPTY_STATS } from '../src/logic/stats.js';
import type { Stats } from '../src/logic/stats.js';

const entry = (over: Partial<MatchListEntry> = {}): MatchListEntry => ({
  matchId: 'm1',
  status: 'finished',
  mySeat: 0,
  turnPlayer: null,
  turnDeadlineAt: null,
  opponentName: 'Fern',
  lastActivityAt: 1_000,
  unseenTurn: false,
  revision: 9,
  graceUsed: [0, 0],
  gracePeriods: 1,
  result: { winner: 0, reason: 'turn_limit', scores: [10, 5] },
  ...over,
});

const stats = (over: Partial<Stats> = {}): Stats => ({ ...EMPTY_STATS, ...over });

describe('the offline record', () => {
  it('is the same three numbers the device already keeps', () => {
    expect(offlineRecord(stats({ played: 24, wins: 14, bestStreak: 7 }))).toEqual({ games: 24, wins: 14, longestStreak: 7 });
  });

  it('takes the account aggregate straight through (sums, and the max of the bests)', () => {
    expect(accountRecord({ games: 41, wins: 22, longestStreak: 9 })).toEqual({ games: 41, wins: 22, longestStreak: 9 });
  });
});

describe('the online record', () => {
  it('counts finished matches only: a match still in play is not a result', () => {
    const list = [
      entry({ matchId: 'a', lastActivityAt: 1 }),
      entry({ matchId: 'b', lastActivityAt: 2, status: 'active', result: null }),
      entry({ matchId: 'c', lastActivityAt: 3, status: 'waiting', result: null }),
    ];
    expect(onlineRecord(list)).toEqual({ games: 1, wins: 1, longestStreak: 1 });
  });

  it('wins the matches this seat won, in either seat', () => {
    const list = [
      entry({ matchId: 'a', mySeat: 0, result: { winner: 0, reason: 'turn_limit', scores: [1, 0] } }),
      entry({ matchId: 'b', mySeat: 1, lastActivityAt: 2, result: { winner: 1, reason: 'turn_limit', scores: [0, 1] } }),
    ];
    expect(onlineRecord(list)).toEqual({ games: 2, wins: 2, longestStreak: 2 });
  });

  it('reports the LONGEST run ever, not the run in progress', () => {
    // W W L W W W L W  -> best run 3, current run 1
    const winners = [0, 0, 1, 0, 0, 0, 1, 0] as const;
    const list = winners.map((w, i) =>
      entry({ matchId: `m${i}`, lastActivityAt: 100 + i, result: { winner: w, reason: 'turn_limit', scores: [0, 0] } }),
    );
    expect(onlineRecord(list)).toEqual({ games: 8, wins: 6, longestStreak: 3 });
  });

  it('a draw breaks the run without scoring a win', () => {
    const list = [
      entry({ matchId: 'a', lastActivityAt: 1, result: { winner: 0, reason: 'turn_limit', scores: [1, 1] } }),
      entry({ matchId: 'b', lastActivityAt: 2, result: { winner: null, reason: 'strangle', scores: [1, 1] } }),
      entry({ matchId: 'c', lastActivityAt: 3, result: { winner: 0, reason: 'turn_limit', scores: [1, 1] } }),
    ];
    expect(onlineRecord(list)).toEqual({ games: 3, wins: 2, longestStreak: 1 });
  });

  it('orders by activity, with the match id as a deterministic tie-break', () => {
    // Same instant: the id decides, so the same games always give the same streak.
    const list = [
      entry({ matchId: 'b', lastActivityAt: 5, result: { winner: 1, reason: 'turn_limit', scores: [0, 0] } }),
      entry({ matchId: 'a', lastActivityAt: 5, result: { winner: 0, reason: 'turn_limit', scores: [0, 0] } }),
    ];
    expect(onlineRecord(list).longestStreak).toBe(1);
    expect(onlineRecord([...list].reverse())).toEqual(onlineRecord(list));
  });

  it('an empty history is a record of nothing, not an error', () => {
    expect(onlineRecord([])).toEqual({ games: 0, wins: 0, longestStreak: 0 });
  });
});

describe('the three tiles', () => {
  it('labels them from the one strings module', () => {
    expect(recordRows({ games: 4, wins: 2, longestStreak: 2 }).map((r) => r.label)).toEqual([
      PROFILE.games,
      PROFILE.winRate,
      PROFILE.longestStreak,
    ]);
  });

  it('rounds the rate and shows a real 0 for a real zero', () => {
    expect(recordRows({ games: 4, wins: 3, longestStreak: 2 }).map((r) => r.value)).toEqual(['4', '75%', '2']);
    expect(recordRows({ games: 3, wins: 1, longestStreak: 0 }).map((r) => r.value)).toEqual(['3', '33%', '0']);
  });

  it('a record of NO games has nothing to rate, and says so', () => {
    const rows = recordRows({ games: 0, wins: 0, longestStreak: 0 });
    expect(rows[0]!.value).toBe('0'); // zero games is a fact
    expect(rows[1]!.value).toBe(PROFILE.unknown);
    expect(rows[2]!.value).toBe(PROFILE.unknown);
  });

  it('a record that could not be read is an em dash everywhere, never an invented 0', () => {
    expect(recordRows(null).map((r) => r.value)).toEqual([PROFILE.unknown, PROFILE.unknown, PROFILE.unknown]);
  });

  it('always returns exactly three tiles, so the two rows cannot differ in shape', () => {
    expect(recordRows(null)).toHaveLength(3);
    expect(recordRows({ games: 1, wins: 1, longestStreak: 1 })).toHaveLength(3);
  });
});
