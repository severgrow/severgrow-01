// The OFFLINE game record, reduced to the few numbers the Profile screen shows (migration 0022).
//
// WHY THIS MODULE IS PURE. A device plays offline and later posts its running totals. The server
// must decide two things without a database: whether the snapshot is well formed, and how several
// devices' snapshots combine. Keeping that here means the rules are tested directly, and both
// storage backends behave the same way.
//
// The two rules that matter:
//   * counters are CUMULATIVE, so an upsert only ever raises them (`mergeOfflineCounters` mirrors
//     the SQL `greatest`), and a stale request cannot erase progress;
//   * `bestStreak` is a per-device MAXIMUM. A run on one device is not continued on another, so
//     the account's longest streak is the largest device best, never their sum.
import { ApiError } from './errors.js';
import type { OfflineCounters, OfflineSummary } from './protocol.js';

/** Counters are bounded so a corrupted localStorage value cannot overflow the integer column. */
export const OFFLINE_COUNTER_MAX = 1_000_000_000;

/** A device id names one browser/profile; it is opaque, so only the charset and width are pinned. */
export const OFFLINE_DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const counter = (value: unknown, name: keyof OfflineCounters): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > OFFLINE_COUNTER_MAX) {
    throw new ApiError('INVALID_REQUEST', `${name} must be a whole number between 0 and ${OFFLINE_COUNTER_MAX}.`);
  }
  return value;
};

/**
 * Read one POST body into the counters a device may store. Every number is validated, and the
 * results must add up: a row where wins+losses+draws exceeds the games played is not a record of
 * anything that happened.
 */
export const parseOfflineCounters = (body: Record<string, unknown>): OfflineCounters => {
  const deviceId = body.deviceId;
  if (typeof deviceId !== 'string' || !OFFLINE_DEVICE_ID_PATTERN.test(deviceId)) {
    throw new ApiError('INVALID_REQUEST', 'deviceId must be 8 to 64 letters, digits, "-" or "_".');
  }
  const played = counter(body.played, 'played');
  const wins = counter(body.wins, 'wins');
  const losses = counter(body.losses, 'losses');
  const draws = counter(body.draws, 'draws');
  const bestStreak = counter(body.bestStreak, 'bestStreak');
  if (wins + losses + draws > played) {
    throw new ApiError('INVALID_REQUEST', 'wins, losses and draws cannot add up to more than played.');
  }
  return { deviceId, played, wins, losses, draws, bestStreak };
};

/** The record of a player who has never played offline (or never posted it): all zeroes. */
export const emptyOfflineSummary = (): OfflineSummary => ({ games: 0, wins: 0, draws: 0, longestStreak: 0 });

/**
 * Combine device rows into the account's numbers. Games, wins and draws add up; the longest streak
 * is the MAX, because a streak ends when a device stops playing and another device's run is a new
 * one. An empty list is the empty summary, not -Infinity from an empty `Math.max`.
 */
export const aggregateOfflineStats = (rows: readonly OfflineCounters[]): OfflineSummary => {
  let games = 0;
  let wins = 0;
  let draws = 0;
  let longestStreak = 0;
  for (const row of rows) {
    games += row.played;
    wins += row.wins;
    draws += row.draws;
    longestStreak = Math.max(longestStreak, row.bestStreak);
  }
  return { games, wins, draws, longestStreak };
};

/**
 * The monotonic upsert in one place: every counter becomes the greater of what was stored and
 * what the device just sent. The SQL adapter expresses the same rule with `greatest`.
 */
export const mergeOfflineCounters = (stored: OfflineCounters, incoming: OfflineCounters): OfflineCounters => ({
  deviceId: incoming.deviceId,
  played: Math.max(stored.played, incoming.played),
  wins: Math.max(stored.wins, incoming.wins),
  losses: Math.max(stored.losses, incoming.losses),
  draws: Math.max(stored.draws, incoming.draws),
  bestStreak: Math.max(stored.bestStreak, incoming.bestStreak),
});
