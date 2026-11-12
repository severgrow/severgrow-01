// THE PROFILE'S TWO RECORDS (owner, 2026-11-01): the same three numbers twice — games, win rate,
// longest streak — once for the offline games and once for the online ones. Keeping ONE builder for
// both is what stops the two halves drifting apart in wording, rounding or the em dash rule.
//
// The offline half comes from this device's own counters (logic/stats.ts) plus, once signed in, the
// account's other devices (server `GET /v1/players/me/offline`). The online half comes from the
// match list the lobby already holds (`GET /v1/players/me/matches`), which the server returns
// UNBOUNDED — so "any match ever" is a fact here, not an estimate over the last page.
//
// Pure: no DOM, no clock, no I/O. `recordRows` is the only place a number becomes a string.
import type { MatchListEntry } from '../../../server/src/protocol.js';
import type { Stats } from './stats.js';
import { PROFILE } from '../../../src/strings.js';

/** One label/value pair of the record grid. */
export type PlayRow = Readonly<{ label: string; value: string }>;

/** The three numbers a record is reduced to. `longestStreak` is the best run EVER, not the current one. */
export type Record3 = { games: number; wins: number; longestStreak: number };

/** This device's offline record, in the profile's shape. */
export const offlineRecord = (s: Stats): Record3 => ({ games: s.played, wins: s.wins, longestStreak: s.bestStreak });

/** The account's offline record as the server aggregated it (sums across devices, max of the bests). */
export const accountRecord = (offline: { games: number; wins: number; longestStreak: number }): Record3 => ({
  games: offline.games,
  wins: offline.wins,
  longestStreak: offline.longestStreak,
});

const finished = (entry: MatchListEntry): boolean => entry.status === 'finished' && entry.result !== null;

/**
 * The online record: every finished match in the list, oldest first, counting the ones this seat won.
 * A draw breaks a run without scoring one. The order is `lastActivityAt`, with the match id as the
 * tie-break, so two lists that describe the same games always produce the same streak.
 */
export const onlineRecord = (entries: readonly MatchListEntry[]): Record3 => {
  const played = entries
    .filter(finished)
    .sort((a, b) => a.lastActivityAt - b.lastActivityAt || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0));
  let wins = 0;
  let run = 0;
  let longestStreak = 0;
  for (const entry of played) {
    if (entry.result!.winner === entry.mySeat) {
      wins++;
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }
  return { games: played.length, wins, longestStreak };
};

const count = (n: number): string => (Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : PROFILE.unknown);

/**
 * The three tiles. A record that is `null` is a record we could not read, and every value is then the
 * em dash — never an invented 0. A record of ZERO games is a different, known fact: the games tile
 * says 0, while the rate and the streak have nothing to show and say so.
 */
export const recordRows = (record: Record3 | null): readonly PlayRow[] => {
  if (!record) {
    return [
      { label: PROFILE.games, value: PROFILE.unknown },
      { label: PROFILE.winRate, value: PROFILE.unknown },
      { label: PROFILE.longestStreak, value: PROFILE.unknown },
    ];
  }
  const known = record.games > 0;
  return [
    { label: PROFILE.games, value: count(record.games) },
    { label: PROFILE.winRate, value: known ? `${Math.round((record.wins / record.games) * 100)}%` : PROFILE.unknown },
    { label: PROFILE.longestStreak, value: known ? count(record.longestStreak) : PROFILE.unknown },
  ];
};
