// Where the account's streaks live (owner, 2026-11-18). Memory for tests and the local server,
// Postgres for the Edge function (./postgres.ts). Both follow the same contract, pinned by
// server/tests/streaks.test.ts.
import type { Player } from '../../../src/engine/index.js';
import type { OnlineEndReason } from '../protocol.js';
import type { PracticeStreaks, PracticeTier, Streak, StreakResult } from './rules.js';
import { applyGame, emptyPracticeStreaks, emptyStreak, isCompletedResult, isStreakTier } from './rules.js';

/** One finished practice game, as the page reports it. `id` is the game's own id: it counts once. */
export type PracticeGame = { id: string; tier: PracticeTier; result: StreakResult };

/** One finished online Blitz (live) match, from the server's own result, from this player's seat. */
export type BlitzResultRow = { matchId: string; finishedAt: number; seat: Player; winner: Player | null; reason: OnlineEndReason };

/**
 * THE PUBLIC OFFLINE ROW (owner, 2026-11-20: "OFFLINE and we have GAMES HARD STREAK and BLITZ
 * streak"): completed Practice games, and the two longest win runs the account already keeps.
 *
 * `games` counts fully completed games (win, loss or draw) across every tier — the same number the
 * Practice teaser reveals, deduplicated by game id, so a retry never counts twice. `hardStreak` and
 * `blitzStreak` are the BEST runs on the HARD and BLITZ Practice keys, which is exactly what
 * `practice_streaks.best_streak` holds: a run is extended by a win and reset by anything else
 * (./rules.ts). No new tracking, no new writes — this is a read of rows that already exist.
 *
 * Counts only. Never a win rate, never a device, never a game id or a timestamp.
 */
export type ProfileStreaks = { games: number; hardStreak: number; blitzStreak: number };

export type StreakStore = {
  /**
   * Apply the games not recorded before (by id), in order. Returns the four practice streaks after.
   * An EASY/MEDIUM game is stored once by id and NOT applied to a streak (owner, 2026-11-20).
   */
  recordPractice(playerId: string, games: readonly PracticeGame[], now: number): Promise<PracticeStreaks>;
  practice(playerId: string): Promise<PracticeStreaks>;
  /**
   * How many Practice games this account has FULLY completed (win, loss or draw) — the record behind
   * the Practice keys' reveal after three (owner, 2026-11-20). Abandons, resignations, forfeits and
   * timeouts are recorded but do not count. Identity-scoped and deduplicated by game id by the same
   * store that records them, so retries cannot count twice.
   */
  completedPractice(playerId: string): Promise<number>;
  /**
   * The online Blitz streak, after folding in every finished live match since the last fold. Folded
   * results are kept, so a match the retention rule later deletes is never forgotten.
   */
  onlineBlitz(playerId: string, now: number): Promise<Streak>;
  /**
   * The public profile's OFFLINE row (`ProfileStreaks`). One read of rows the account already holds;
   * a database without migration 0028 answers `null` so the sheet keeps its em dashes.
   */
  profileStreaks(playerId: string): Promise<ProfileStreaks | null>;
};

/** A finished live match, from this player's seat, as a streak result. Server results only. */
export const blitzResult = (row: Pick<BlitzResultRow, 'seat' | 'winner' | 'reason'>): StreakResult =>
  row.winner === null ? 'draw'
    : row.winner === row.seat ? 'win'
      : row.reason === 'timeout' ? 'timeout'
        : row.reason === 'resigned' ? 'forfeit'
          : 'loss';

/**
 * A finished match is folded only once it is this old (debug pass, 2026-11-18). A match's finish
 * time is stamped when its finishing request starts, but the row commits when that request ends,
 * seconds later on a slow server; a fold that ran in between moved its checkpoint past the older,
 * not-yet-committed match, which was then skipped for ever (reproduced on real Postgres). Thirty
 * seconds is three times the database stall limit (storage/stall-guard.ts), so every write that can
 * still commit has. The profile's Blitz record therefore lags a finished match by up to 30 s.
 */
export const FOLD_SETTLE_MS = 30_000;

/** The fold's order: finish time, then id, so two matches finishing in the same millisecond still have one order. */
export const afterCheckpoint = (row: BlitzResultRow, at: number, id: string): boolean =>
  row.finishedAt > at || (row.finishedAt === at && row.matchId > id);

export const memoryStreakStore = (deps: {
  /** Every finished live match this player sat in (the memory storage's own view). */
  blitzResults: (playerId: string) => readonly BlitzResultRow[] | Promise<readonly BlitzResultRow[]>;
}): StreakStore => {
  const practice = new Map<string, PracticeStreaks>();
  const seen = new Map<string, Set<string>>();
  /** Game ids that were fully completed (not an abandon/resign/forfeit/timeout), for the reveal. */
  const completed = new Map<string, Set<string>>();
  const blitz = new Map<string, { streak: Streak; at: number; id: string }>();
  const copy = (p: PracticeStreaks): PracticeStreaks => JSON.parse(JSON.stringify(p)) as PracticeStreaks;
  return {
    async recordPractice(playerId, games) {
      const state = practice.get(playerId) ?? emptyPracticeStreaks();
      const ids = seen.get(playerId) ?? new Set<string>();
      const done = completed.get(playerId) ?? new Set<string>();
      for (const game of games) {
        if (ids.has(game.id)) continue;
        ids.add(game.id);
        if (isCompletedResult(game.result)) done.add(game.id);
        // Only HARD and BLITZ carry a streak (owner, 2026-11-20). An EASY/MEDIUM game is still
        // accepted and recorded (the id above, the completed count above), never applied.
        if (isStreakTier(game.tier)) state[game.tier] = applyGame(state[game.tier], game.result);
      }
      practice.set(playerId, state);
      seen.set(playerId, ids);
      completed.set(playerId, done);
      return copy(state);
    },
    async practice(playerId) { return copy(practice.get(playerId) ?? emptyPracticeStreaks()); },
    async completedPractice(playerId) { return completed.get(playerId)?.size ?? 0; },
    async profileStreaks(playerId) {
      const state = practice.get(playerId) ?? emptyPracticeStreaks();
      return {
        games: completed.get(playerId)?.size ?? 0,
        hardStreak: state.hard.best,
        blitzStreak: state.blitz.best,
      };
    },
    async onlineBlitz(playerId, now) {
      const held = blitz.get(playerId) ?? { streak: emptyStreak(), at: -1, id: '' };
      const rows = [...await deps.blitzResults(playerId)]
        .filter((row) => row.finishedAt <= now - FOLD_SETTLE_MS && afterCheckpoint(row, held.at, held.id))
        .sort((a, b) => a.finishedAt - b.finishedAt || a.matchId.localeCompare(b.matchId));
      let { streak, at, id } = held;
      for (const row of rows) { streak = applyGame(streak, blitzResult(row)); at = row.finishedAt; id = row.matchId; }
      blitz.set(playerId, { streak, at, id });
      return { ...streak };
    },
  };
};

/** The memory storage's finished live (Blitz) matches for one player, from that player's seat. */
export const memoryBlitzResults = (storage: {
  matchesOfPlayer(playerId: string): Promise<readonly { id: string; status: string; liveManaged?: boolean; finishedAt: number | null; result: { winner: Player | null; reason: OnlineEndReason } | null }[]>;
  participantsOf(matchId: string): Promise<readonly { playerId: string; seat: Player }[]>;
}) => async (playerId: string): Promise<BlitzResultRow[]> => {
  const out: BlitzResultRow[] = [];
  for (const match of await storage.matchesOfPlayer(playerId)) {
    if (match.status !== 'finished' || !match.liveManaged || !match.result || match.finishedAt === null) continue;
    const seat = (await storage.participantsOf(match.id)).find((p) => p.playerId === playerId)?.seat;
    if (seat === undefined) continue;
    out.push({ matchId: match.id, finishedAt: match.finishedAt, seat, winner: match.result.winner, reason: match.result.reason });
  }
  return out;
};
