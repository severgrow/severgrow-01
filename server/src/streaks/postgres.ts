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
import { PRACTICE_TIERS, applyGame, emptyPracticeStreaks, emptyStreak, isPracticeTier } from './rules.js';
import type { BlitzResultRow, PracticeGame, StreakStore } from './store.js';
import { FOLD_SETTLE_MS, blitzResult } from './store.js';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

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
  onlineBlitz: (playerId, now) => foldOnlineBlitz(pool, playerId, now),
});
