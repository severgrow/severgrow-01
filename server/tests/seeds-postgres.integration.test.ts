import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;

describe.skipIf(!enabled)('Seeds and claims on real Postgres', () => {
  let pool: PgPool;
  let world: ReturnType<typeof postgresWorldEconomyStore>;
  let a: string;
  let b: string;
  beforeAll(async () => {
    pool = poolFromUrl(url!);
    world = postgresWorldEconomyStore(pool);
    const players = postgresStorage(pool);
    a = crypto.randomUUID(); b = crypto.randomUUID();
    for (const id of [a, b]) await players.createPlayer({ id, kind: 'guest', displayName: `Test ${id.slice(0, 4)}`, createdAt: Date.now(), upgradedAt: null });
  });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });

  const credit = async (playerId: string, key: string) => world.settle({
    playerId, sourceKey: key, mode: 'campaign', outcome: 'win', opponentId: null, campaignLevel: 1, now: Date.now(),
  });

  it('settles duplicates once and keeps a balanced auditable ledger', async () => {
    const key = `campaign:${crypto.randomUUID()}`;
    const [first, second] = await Promise.all([credit(a, key), credit(a, key)]);
    expect([first.awarded, second.awarded].sort()).toEqual([50, 50]);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const { rows } = await pool.query('select count(*)::int as n from seed_ledger where player_id=$1 and source_key=$2', [a, key]);
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('serializes competing owners and never debits a rejected claim', async () => {
    await credit(a, `campaign:${crypto.randomUUID()}`);
    await credit(b, `campaign:${crypto.randomUUID()}`);
    await credit(b, `campaign:${crypto.randomUUID()}`);
    const beforeA = await world.wallet(a), beforeB = await world.wallet(b);
    const cell = '6,0';
    const [one, two] = await Promise.all([
      world.claim(a, cell, `req-${crypto.randomUUID()}`, Date.now()),
      world.claim(b, cell, `req-${crypto.randomUUID()}`, Date.now()),
    ]);
    expect([one.ok, two.ok].filter(Boolean)).toHaveLength(1);
    expect((await world.wallet(a)).balance + (await world.wallet(b)).balance).toBe(beforeA.balance + beforeB.balance - 100);
    expect((await world.world()).claims.filter((claim) => claim.cellId === cell)).toHaveLength(1);
  });

  it('a purchase request replays without a second charge', async () => {
    const buyer = (await world.world()).claims.find((claim) => claim.cellId === '6,0')!.ownerId;
    const requestId = `req-${crypto.randomUUID()}`;
    await credit(buyer, `campaign:${crypto.randomUUID()}`);
    await credit(buyer, `campaign:${crypto.randomUUID()}`);
    const first = await world.claim(buyer, '5,0', requestId, Date.now());
    expect(first.ok).toBe(true);
    const again = await world.claim(buyer, '5,0', requestId, Date.now());
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect((await world.wallet(buyer)).balance).toBe(first.wallet.balance);
  });
});
