// The streak store on REAL Postgres (migration 0028). Runs only with REQUIRE_DATABASE=1 and a
// DATABASE_URL pointing at a throwaway database (never production), like the other *.integration
// suites: REQUIRE_DATABASE=1 DATABASE_URL=postgres://postgres@127.0.0.1:55432/futalive PGSSL=disable
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import type { PgPool } from '../src/storage/postgres.js';
import { postgresStreakStore, foldOnlineBlitz } from '../src/streaks/postgres.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;

describe.skipIf(!enabled)('streaks on real Postgres', () => {
  let pool: PgPool;
  beforeAll(() => { pool = poolFromUrl(url!); });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });

  const newPlayer = async (): Promise<string> => {
    const id = randomUUID();
    await pool.query(`insert into players (id, kind, created_at, is_test) values ($1, 'guest', 1, true)`, [id]);
    return id;
  };
  /** A finished live (Blitz) match between `me` (seat 0) and a rival, ending as given for `me`. */
  const blitzMatch = async (me: string, rival: string, finishedAt: number, outcome: 'win' | 'loss' | 'draw' | 'timeout' | 'forfeit', live = true) => {
    const id = randomUUID();
    const winner = outcome === 'win' ? 0 : outcome === 'draw' ? null : 1;
    const reason = outcome === 'timeout' ? 'timeout' : outcome === 'forfeit' ? 'resigned' : 'score';
    await pool.query(
      `insert into matches (id, invite_code, rules_version, seed, config, starting_player, status, state, created_at, updated_at, finished_at, result, live_since)
       values ($1, $2, 'r', 1, '{}', 0, 'finished', '{}', 1, $3, $3, $4, $5)`,
      [id, id.slice(0, 12), finishedAt, JSON.stringify({ winner, reason, scores: [0, 0] }), live ? 1 : null],
    );
    await pool.query(`insert into match_participants (match_id, player_id, seat, joined_at) values ($1, $2, 0, 1), ($1, $3, 1, 1)`, [id, me, rival]);
    return id;
  };

  it('a game counts once, even sent twice at the same moment from two tabs', async () => {
    const store = postgresStreakStore(pool);
    const p = await newPlayer();
    const game = { id: 'tab-race-1', tier: 'hard' as const, result: 'win' as const };
    await Promise.all([store.recordPractice(p, [game], 1), store.recordPractice(p, [game], 1)]);
    expect((await store.practice(p)).hard).toEqual({ current: 1, best: 1 });
  });

  it('two devices in turn: a loss on one resets, best is kept, a replayed old game changes nothing', async () => {
    const store = postgresStreakStore(pool);
    const p = await newPlayer();
    await store.recordPractice(p, [{ id: 'A1', tier: 'easy', result: 'win' }, { id: 'A2', tier: 'easy', result: 'win' }], 1);
    await store.recordPractice(p, [{ id: 'B1', tier: 'easy', result: 'abandon' }], 2);
    await store.recordPractice(p, [{ id: 'A2', tier: 'easy', result: 'win' }], 3);
    expect((await store.practice(p)).easy).toEqual({ current: 0, best: 2 });
  });

  it('the online Blitz streak folds server results only: wins, a draw, a timeout, a forfeit; non-live games never count', async () => {
    const store = postgresStreakStore(pool);
    const me = await newPlayer(); const rival = await newPlayer();
    await blitzMatch(me, rival, 10, 'win'); await blitzMatch(me, rival, 20, 'win'); await blitzMatch(me, rival, 30, 'draw');
    await blitzMatch(me, rival, 40, 'win'); await blitzMatch(me, rival, 45, 'loss', false); // not Blitz: ignored
    expect(await store.onlineBlitz(me, 50 + 60_000)).toEqual({ current: 3, best: 3 });
    await blitzMatch(me, rival, 60, 'timeout');
    expect(await store.onlineBlitz(me, 61 + 60_000)).toEqual({ current: 0, best: 3 });
    await blitzMatch(me, rival, 70, 'win'); await blitzMatch(me, rival, 80, 'forfeit');
    expect(await store.onlineBlitz(me, 81 + 60_000)).toEqual({ current: 0, best: 3 });
    // The rival sees the mirror image from their own seat.
    expect((await store.onlineBlitz(rival, 82 + 60_000)).best).toBe(1); // the rival won at 60 and at 80, never twice in a row
  });

  it('a folded match deleted by retention is never forgotten, and a fold twice counts nothing twice', async () => {
    const me = await newPlayer(); const rival = await newPlayer();
    const a = await blitzMatch(me, rival, 100, 'win'); const b = await blitzMatch(me, rival, 110, 'win');
    expect(await foldOnlineBlitz(pool, me, 120 + 60_000)).toEqual({ current: 2, best: 2 });
    await pool.query(`delete from matches where id = any($1::uuid[])`, [[a, b]]);
    expect(await foldOnlineBlitz(pool, me, 130 + 60_000)).toEqual({ current: 2, best: 2 });
    await blitzMatch(me, rival, 140, 'win');
    expect(await foldOnlineBlitz(pool, me, 150 + 60_000)).toEqual({ current: 3, best: 3 });
  });
});

describe.skipIf(!enabled)('a match that commits late is never skipped (debug pass, 2026-11-18)', () => {
  let pool: PgPool;
  beforeAll(() => { pool = poolFromUrl(url!); });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });
  it('a fold between a newer and an older finish counts both, in finish order', async () => {
    const id = () => randomUUID();
    const me = id(); const rival = id();
    for (const p of [me, rival]) await pool.query(`insert into players (id, kind, created_at, is_test) values ($1, 'guest', 1, true)`, [p]);
    const finish = async (at: number, won: boolean) => {
      const m = id();
      await pool.query(`insert into matches (id, invite_code, rules_version, seed, config, starting_player, status, state, created_at, updated_at, finished_at, result, live_since)
        values ($1, $2, 'r', 1, '{}', 0, 'finished', '{}', 1, $3, $3, $4, 1)`, [m, m.slice(0, 12), at, JSON.stringify({ winner: won ? 0 : 1, reason: 'score', scores: [0, 0] })]);
      await pool.query(`insert into match_participants (match_id, player_id, seat, joined_at) values ($1, $2, 0, 1), ($1, $3, 1, 1)`, [m, me, rival]);
    };
    const T = 10_000_000;
    await finish(T + 5_000, true);           // a newer win commits first...
    await foldOnlineBlitz(pool, me, T + 6_000);    // ...a profile read folds right then...
    await finish(T + 1_000, true);           // ...and an older win, stamped earlier, commits after it
    const after = await foldOnlineBlitz(pool, me, T + 120_000);
    expect(after).toEqual({ current: 2, best: 2 });
  });
});
