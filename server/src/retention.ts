// RETENTION FOR REPLAYS (owner decision, 2026-10-25): "keep each player's last 10 finished duels
// AND their moves … the housekeeping sweeper is free to delete old matches, so this must be made
// durable."
//
// The rule, in one sentence: a finished match is deletable only when it is older than the age floor
// AND it is not among the newest `KEEP` finished duels of ANY of its players.
//
// Why both halves:
//   * the KEEP floor is the promise the replay list makes ("your last 10"), so it can never be
//     emptied by housekeeping, however old those 10 get;
//   * the age floor is what stops housekeeping from deleting a match the day after it was played —
//     the two of them together are why a 15-duel player keeps exactly the 10 newest, and why a
//     player with fewer than 10 loses nothing at all.
//
// The decision is pure and lives here, not in a store, so the memory adapter and Postgres can never
// disagree about it (and the suite can prove the rule without a database).
import type { Player } from '../../src/engine/index.js';

/** How many finished duels each player keeps, with their moves. The owner's number. */
export const FINISHED_REPLAYS_KEEP = 10;

/**
 * A finished match is never pruned until it is this old. 30 days: long enough that nobody loses a
 * replay they could still be talking about, and short enough that the database does not hold every
 * duel forever.
 */
export const FINISHED_REPLAYS_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** One finished match as the retention rule sees it: when it ended and who was in it. */
export type RetentionRow = {
  id: string;
  /** Epoch ms. A finished match always has one; a null row is left alone (defensive). */
  finishedAt: number | null;
  /** The ids of every participant, in any order. */
  players: readonly string[];
};

/**
 * The ids of the finished matches housekeeping may delete now. Deterministic: ties on `finishedAt`
 * are broken by id, so two runs can never disagree about which one is the tenth.
 */
export const prunableMatches = (rows: readonly RetentionRow[], now: number): string[] => {
  const floor = now - FINISHED_REPLAYS_MIN_AGE_MS;
  const candidates = rows.filter((row) => row.finishedAt !== null && row.finishedAt < floor);
  if (candidates.length === 0) return [];

  // The newest KEEP finished matches per player, over ALL of that player's finished matches — not
  // only the old ones: a fresh duel still occupies one of the ten.
  const byPlayer = new Map<string, RetentionRow[]>();
  for (const row of rows) {
    if (row.finishedAt === null) continue;
    for (const player of row.players) {
      const list = byPlayer.get(player);
      if (list) list.push(row);
      else byPlayer.set(player, [row]);
    }
  }
  const protectedIds = new Set<string>();
  for (const list of byPlayer.values()) {
    list.sort((a, b) => (b.finishedAt! - a.finishedAt!) || a.id.localeCompare(b.id));
    for (const row of list.slice(0, FINISHED_REPLAYS_KEEP)) protectedIds.add(row.id);
  }

  return candidates
    .filter((row) => !protectedIds.has(row.id))
    .sort((a, b) => (a.finishedAt! - b.finishedAt!) || a.id.localeCompare(b.id))
    .map((row) => row.id);
};

/** The seat list a replay payload reports, kept here so the shape stays next to the rule. */
export type ReplaySeatName = { seat: Player; playerId: string; displayName: string | null; tag: string | null };
