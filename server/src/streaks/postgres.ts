// The account's streaks on Postgres (migration 0028). Same contract as memoryStreakStore
// (./store.ts), pinned by server/tests/streaks.test.ts and the real-Postgres suite.
//
// Every write is ONE transaction on a reserved connection: the games are inserted with
// `on conflict do nothing` (so a game id counts once however often it arrives), the streak rows are
// read `for update`, and only the games that were really new are applied, in the order they came.
// The SQL here stays sequential on purpose: the Edge pool is two connections per isolate.
import type { PgPool } from '../storage/postgres.js';
import type { Player } from '../../../src/engine/index.js';
import type { OnlineEndReason } from '../protocol.js';
import type { PracticeStreaks, Streak } from './rules.js';
import { PRACTICE_TIERS, STREAK_TIERS, applyGame, emptyPracticeStreaks, emptyStreak, isPracticeTier, isStreakTier } from './rules.js';
import type { BlitzResultRow, PracticeGame, ProfileStreaks, StreakStore } from './store.js';
import { FOLD_SETTLE_MS, blitzResult } from './store.js';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/** Postgres "undefined table": the server code arrived before migration 0028. */
const missingTable = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === '42P01';

/** Fully completed games (win/loss/draw), from the game-id rows the same transaction deduplicates. */
const readCompleted = async (q: { query: PgPool['query'] }, playerId: string): Promise<number> => {
  const { rows } = await q.query(
    `select count(*)::int as n from practice_streak_games where player_id = $1 and result in ('win','loss','draw')`,
    [playerId],
  );
  return num(rows[0]?.n);
};

const readPractice = async (q: { query: PgPool['query'] }, playerId: string, lock: boolean): Promise<PracticeStreaks> => {
  const { rows } = await q.query(
    `select tier, current_streak, best_streak from practice_streaks where player_id = $1${lock ? ' for update' : ''}`,
    [playerId],
  );
  const out = emptyPracticeStreaks();
  for (const row of rows) {
    if (isPracticeTier(row.tier)) out[row.tier] = { current: num(row.current_streak), best: num(row.best_streak) };
  }
  return out;
};

/**
 * THE PUBLIC OFFLINE ROW, in ONE statement (owner, 2026-11-20). The two streaks are the account's
 * BEST runs on the HARD and BLITZ Practice keys — `practice_streaks.best_streak` is exactly "the
 * longest run of wins" as the shared rule keeps it (a win extends it, a loss resets it, a draw leaves
 * it alone, ./rules.ts), so no pass over the per-game rows is needed. The games count is the same
 * deduplicated completed-game count the Practice reveal uses (game ids in `practice_streak_games`).
 *
 * THE TIERS ARE NOT A SECOND OPINION. HARD and BLITZ are read through `profileTierSql`, which only
 * builds a sub-select for a tier `STREAK_TIERS` still writes. If the streaks rule ever stops counting
 * one, the server refuses to start instead of serving a number that can never move again — the one
 * failure mode a profile merge could hide for ever.
 *
 * The three scalar sub-selects all hit a primary-key prefix (`player_id, …`), so this is one cheap
 * round trip whatever the player's history. A database without migration 0028 answers null.
 */
const PROFILE_TIERS = Object.freeze(['hard', 'blitz'] as const);

const profileTierSql = (tier: (typeof PROFILE_TIERS)[number]): string => {
  if (!isStreakTier(tier)) {
    throw new Error(`the profile reads streak tier "${tier}" but STREAK_TIERS is [${STREAK_TIERS.join(', ')}]`);
  }
  return `coalesce((select max(best_streak) from practice_streaks where player_id = $1 and tier = '${tier}'), 0)::int as ${tier}_streak`;
};

/** Built once, at module load: a disagreement with STREAK_TIERS fails the server at boot, not a read. */
const PROFILE_TIER_SQL = PROFILE_TIERS.map(profileTierSql).join(',\n         ');

const readProfileStreaks = async (q: { query: PgPool['query'] }, playerId: string): Promise<ProfileStreaks | null> => {
  try {
    const { rows } = await q.query(
      `select
         ${PROFILE_TIER_SQL},
         (select count(*) from practice_streak_games where player_id = $1 and result in ('win','loss','draw'))::int as games`,
      [playerId],
    );
    const row = rows[0];
    if (!row) return { games: 0, hardStreak: 0, blitzStreak: 0 };
    return { games: num(row.games), hardStreak: num(row.hard_streak), blitzStreak: num(row.blitz_streak) };
  } catch (error) {
    if (missingTable(error)) return null;
    throw error;
  }
};

/** Fold every finished live match after the checkpoint into the player's online Blitz streak. */
export const foldOnlineBlitz = async (pool: PgPool, playerId: string, now: number): Promise<Streak> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into online_blitz_streaks (player_id, updated_at) values ($1, $2) on conflict (player_id) do nothing`,
      [playerId, now],
    );
    const held = (await client.query(
      `select current_streak, best_streak, folded_until, folded_match_id from online_blitz_streaks where player_id = $1 for update`,
      [playerId],
    )).rows[0];
    let streak: Streak = held ? { current: num(held.current_streak), best: num(held.best_streak) } : emptyStreak();
    let at = held ? num(held.folded_until) : -1;
    let id = held ? String(held.folded_match_id ?? '') : '';
    const { rows } = await client.query(
      `select m.id::text as match_id, m.finished_at, (m.result->>'winner') as winner, (m.result->>'reason') as reason, mp.seat
         from matches m
         join match_participants mp on mp.match_id = m.id and mp.player_id = $1
        where m.status = 'finished' and m.result is not null and m.live_since is not null
          and m.finished_at is not null and m.finished_at <= $4
          and (m.finished_at > $2 or (m.finished_at = $2 and m.id::text > $3))
        order by m.finished_at, m.id::text
        limit 500`,
      [playerId, at, id, now - FOLD_SETTLE_MS],
    );
    for (const row of rows) {
      const result: BlitzResultRow = {
        matchId: String(row.match_id), finishedAt: num(row.finished_at), seat: (num(row.seat) === 1 ? 1 : 0) as Player,
        winner: row.winner === null || row.winner === undefined ? null : ((num(row.winner) === 1 ? 1 : 0) as Player),
        reason: String(row.reason ?? '') as OnlineEndReason,
      };
      streak = applyGame(streak, blitzResult(result));
      at = result.finishedAt;
      id = result.matchId;
    }
    if (rows.length > 0) {
      await client.query(
        `update online_blitz_streaks set current_streak = $2, best_streak = $3, folded_until = $4, folded_match_id = $5, updated_at = $6
          where player_id = $1`,
        [playerId, streak.current, streak.best, at, id, now],
      );
    }
    await client.query('commit');
    return streak;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release?.();
  }
};

export const postgresStreakStore = (pool: PgPool): StreakStore => ({
  async recordPractice(playerId, games, now) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      // The rows exist before they are locked, so two first games at once still serialise.
      for (const tier of PRACTICE_TIERS) {
        await client.query(
          `insert into practice_streaks (player_id, tier, updated_at) values ($1, $2, $3) on conflict (player_id, tier) do nothing`,
          [playerId, tier, now],
        );
      }
      const state = await readPractice(client, playerId, true);
      const touched = new Set<string>();
      for (const game of games as readonly PracticeGame[]) {
        const inserted = await client.query(
          `insert into practice_streak_games (player_id, game_id, tier, result, recorded_at) values ($1, $2, $3, $4, $5)
           on conflict (player_id, game_id) do nothing returning game_id`,
          [playerId, game.id, game.tier, game.result, now],
        );
        if (inserted.rows.length === 0) continue;
        // HARD and BLITZ only (owner, 2026-11-20): an EASY/MEDIUM report is recorded above, so its
        // id can never count twice, and then ignored by the streak arithmetic.
        if (!isStreakTier(game.tier)) continue;
        state[game.tier] = applyGame(state[game.tier], game.result);
        touched.add(game.tier);
      }
      for (const tier of touched) {
        const s = state[tier as keyof PracticeStreaks];
        await client.query(
          `update practice_streaks set current_streak = $3, best_streak = greatest(best_streak, $4), updated_at = $5 where player_id = $1 and tier = $2`,
          [playerId, tier, s.current, s.best, now],
        );
      }
      await client.query('commit');
      return state;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  },
  practice: (playerId) => readPractice(pool, playerId, false),
  completedPractice: (playerId) => readCompleted(pool, playerId),
  profileStreaks: (playerId) => readProfileStreaks(pool, playerId),
  onlineBlitz: (playerId, now) => foldOnlineBlitz(pool, playerId, now),
});
