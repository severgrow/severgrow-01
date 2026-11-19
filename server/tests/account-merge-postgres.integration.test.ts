// GUEST → EXISTING ACCOUNT: KEEP THE BEST OF BOTH, on REAL Postgres (migration 0029).
// Owner decision 2026-11-18: highest campaign level and every cleared level / best result from both;
// all achievements from both; the guest's Seeds ADDED; the guest's tiles move; practice streaks: the
// higher best of each and the account's current streak. Nothing is lost, nothing counts twice.
// REQUIRE_DATABASE=1 DATABASE_URL=postgres://postgres@127.0.0.1:55432/futalive PGSSL=disable
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import type { PgPool } from '../src/storage/postgres.js';
import { mergeGuestIntoAccount } from '../src/accounts/merge.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;

describe.skipIf(!enabled)('guest merged into an existing account (real Postgres)', () => {
  let pool: PgPool;
  beforeAll(() => { pool = poolFromUrl(url!); });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });

  const q = (text: string, values: unknown[] = []) => pool.query(text, values);
  const player = async (kind: 'guest' | 'account') => {
    const id = randomUUID();
    await q(`insert into players (id, kind, display_name, created_at, is_test) values ($1, $2, 'P', 1, true)`, [id, kind]);
    return id;
  };
  const wallet = (id: string, balance: number, earned = balance, spent = 0) =>
    q(`insert into seed_wallets (player_id, balance, lifetime_earned, lifetime_spent) values ($1,$2,$3,$4)`, [id, balance, earned, spent]);
  const tile = (id: string, cell: string, key: string | null = null) =>
    q(`insert into world_claims (cell_id, owner_id, claimed_at, purchase_request_key, source) values ($1,$2,1,$3,'purchase')`, [cell, id, key]);
  const receipt = (id: string, key: string, mode = 'campaign', awarded = 20) =>
    q(`insert into seed_reward_receipts (player_id, source_key, mode, utc_day, awarded, economy_version, created_at) values ($1,$2,$3,'2026-11-18',$4,1,1)`, [id, key, mode, awarded]);
  const clear = (id: string, level: string, n: number, turns = 20) =>
    q(`insert into campaign_clears (player_id, level_key, level_number, turns, throw_draws, blooms, grows, finished_at) values ($1,$2,$3,$4,0,1,1,1)`, [id, level, n, turns]);
  const progress = (id: string, completed: string[], best: Record<string, unknown>) =>
    q(`insert into account_campaign_progress (player_id, completed, best, updated_at) values ($1,$2::jsonb,$3::jsonb,1)`, [id, JSON.stringify(completed), JSON.stringify(best)]);
  const streak = (id: string, tier: string, current: number, best: number) =>
    q(`insert into practice_streaks (player_id, tier, current_streak, best_streak, updated_at) values ($1,$2,$3,$4,1)`, [id, tier, current, best]);
  const token = (id: string) => q(`insert into player_tokens (player_id, token_hash, created_at) values ($1,$2,1)`, [id, randomUUID()]);
  const cell = () => `m${randomUUID().slice(0, 8)}`;

  it('keeps the best of both and loses nothing', async () => {
    const guest = await player('guest');
    const account = await player('account');
    await wallet(guest, 120, 150, 30);
    await wallet(account, 500);
    const [t1, t2, t3] = [cell(), cell(), cell()];
    await tile(guest, t1, 'buy-1');
    await tile(guest, t2, 'same-key');
    await tile(account, t3, 'same-key'); // the same request key on both: must not block the move
    await receipt(guest, 'campaign:c1-04');
    await receipt(guest, 'campaign:c1-02'); // both cleared 2: the account's receipt stays, no double count
    await receipt(account, 'campaign:c1-02');
    await receipt(guest, 'achievement:first-clearing', 'campaign', 75);
    await clear(guest, 'c1-04', 4);
    await clear(guest, 'c1-02', 2, 10);
    await clear(account, 'c1-02', 2, 30);
    await progress(account, ['c1-01', 'c1-02'], { 'c1-02': { won: true, score: 10, turns: 30 } });
    await progress(guest, ['c1-01', 'c1-02', 'c1-03', 'c1-04'], { 'c1-02': { won: true, score: 14, turns: 10 } });
    await streak(account, 'hard', 2, 4);
    await streak(guest, 'hard', 6, 9);
    await streak(guest, 'easy', 3, 3);
    await token(guest);

    const summary = await mergeGuestIntoAccount(pool, { guestId: guest, accountId: account, now: 1000 });
    expect(summary).toEqual({ seeds: 120, tiles: 2, levels: 2 });

    const w = (await q(`select player_id, balance from seed_wallets where player_id = any($1)`, [[guest, account]])).rows;
    expect(Object.fromEntries(w.map((r) => [r.player_id, Number(r.balance)]))).toEqual({ [guest]: 0, [account]: 620 });
    const ledger = (await q(`select player_id, delta, balance_after from seed_ledger where player_id = any($1) order by delta`, [[guest, account]])).rows;
    expect(ledger.map((r) => [r.player_id, Number(r.delta), Number(r.balance_after)])).toEqual([[guest, -120, 0], [account, 120, 620]]);

    const owners = (await q(`select cell_id, owner_id from world_claims where cell_id = any($1) order by cell_id`, [[t1, t2, t3]])).rows;
    expect(owners.every((r) => r.owner_id === account)).toBe(true);

    const receipts = (await q(`select player_id, source_key from seed_reward_receipts where player_id = any($1) order by source_key, player_id`, [[guest, account]])).rows;
    const accountKeys = receipts.filter((r) => r.player_id === account).map((r) => r.source_key).sort();
    expect(accountKeys).toEqual(['achievement:first-clearing', 'campaign:c1-02', 'campaign:c1-04']);

    const clears = (await q(`select level_key, turns from campaign_clears where player_id = $1 order by level_key`, [account])).rows;
    expect(clears.map((r) => [r.level_key, Number(r.turns)])).toEqual([['c1-02', 10], ['c1-04', 20]]); // the better clear of 2

    const prog = (await q(`select completed, best from account_campaign_progress where player_id = $1`, [account])).rows[0] as { completed: string[]; best: Record<string, unknown> };
    expect(prog.completed).toEqual(['c1-01', 'c1-02', 'c1-03', 'c1-04']);
    expect(prog.best['c1-02']).toEqual({ won: true, score: 14, turns: 10 });

    const streaks = (await q(`select tier, current_streak, best_streak from practice_streaks where player_id = $1 order by tier`, [account])).rows;
    expect(streaks.map((r) => [r.tier, Number(r.current_streak), Number(r.best_streak)])).toEqual([['easy', 3, 3], ['hard', 2, 9]]);

    const live = (await q(`select count(*)::int as n from player_tokens where player_id = $1 and revoked_at is null`, [guest])).rows[0];
    expect(live!.n, 'the retired guest cannot be used again').toBe(0);
  });

  it('happens once: a retry or a second device merges nothing more', async () => {
    const guest = await player('guest');
    const account = await player('account');
    await wallet(guest, 40);
    expect(await mergeGuestIntoAccount(pool, { guestId: guest, accountId: account, now: 1 })).toEqual({ seeds: 40, tiles: 0, levels: 0 });
    const [again, race] = await Promise.all([
      mergeGuestIntoAccount(pool, { guestId: guest, accountId: account, now: 2 }),
      mergeGuestIntoAccount(pool, { guestId: guest, accountId: account, now: 3 }),
    ]);
    expect([again, race]).toEqual([null, null]);
    const bal = (await q(`select balance from seed_wallets where player_id = $1`, [account])).rows[0];
    expect(Number(bal!.balance)).toBe(40);
  });

  it('never merges an account into another account, or a player into itself', async () => {
    const a = await player('account');
    const b = await player('account');
    await wallet(a, 10);
    expect(await mergeGuestIntoAccount(pool, { guestId: a, accountId: b, now: 1 })).toBeNull();
    const g = await player('guest');
    expect(await mergeGuestIntoAccount(pool, { guestId: g, accountId: g, now: 1 })).toBeNull();
    const bal = (await q(`select balance from seed_wallets where player_id = $1`, [a])).rows[0];
    expect(Number(bal!.balance)).toBe(10);
  });

  it('settings, lesson progress and tips join too (migration 0030)', async () => {
    const guest = await player('guest');
    const account = await player('account');
    const docOf = (fields: Record<string, unknown>, tips: string[]) => JSON.stringify({ fields, tips, lessons: null });
    await q(`insert into account_prefs (player_id, doc, updated_at) values ($1, $2::jsonb, 1)`, [account, docOf({ sound: { v: false, at: 10 } }, ['fruit'])]);
    await q(`insert into account_prefs (player_id, doc, updated_at) values ($1, $2::jsonb, 1)`, [guest, docOf({ sound: { v: true, at: 20 }, handSide: { v: 'left', at: 5 } }, ['draw'])]);
    await mergeGuestIntoAccount(pool, { guestId: guest, accountId: account, now: 1000 });
    const doc = (await q(`select doc from account_prefs where player_id = $1`, [account])).rows[0]!.doc;
    expect(doc).toEqual({ fields: { handSide: { v: 'left', at: 5 }, sound: { v: true, at: 20 } }, tips: ['draw', 'fruit'], lessons: null });
  });

  it('a guest with nothing to bring is retired with an empty summary', async () => {
    const guest = await player('guest');
    const account = await player('account');
    expect(await mergeGuestIntoAccount(pool, { guestId: guest, accountId: account, now: 1 })).toEqual({ seeds: 0, tiles: 0, levels: 0 });
  });
});
