// Territory challenges on REAL Postgres, through the real service (docs/TERRITORY-CHALLENGES.md).
//
// territory-challenges.test.ts proves the rules on the in-memory store. This file runs the same
// loop against the SQL store and SQL match storage, so the paths that move a paid tile or Seeds -
// accept -> linked duel -> confirm, the 24 h forfeit, the 7-day stale close and two challengers
// racing for one tile - have executed against the migration before anything is deployed.
// Opt-in like the other integration suites: REQUIRE_DATABASE=1 and DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import { SEED_ECONOMY, WORLD_CHALLENGE_STALE_MS, WORLD_CHALLENGE_TTL_MS } from '../src/seeds/config.js';
import type { PgPool } from '../src/storage/postgres.js';
import type { PlayerRecord } from '../src/storage/types.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;
const STAKE = SEED_ECONOMY.tileCost;

describe.skipIf(!enabled)('Territory challenges on real Postgres', () => {
  let pool: PgPool;
  let store: ReturnType<typeof postgresWorldEconomyStore>;
  let storage: ReturnType<typeof postgresStorage>;
  let clock = Date.now();
  let service: WorldEconomyService;

  beforeAll(() => {
    pool = poolFromUrl(url!);
    store = postgresWorldEconomyStore(pool);
    storage = postgresStorage(pool);
    service = new WorldEconomyService(store, storage, () => clock);
  });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });

  const newPlayer = async (name: string): Promise<PlayerRecord> => {
    const p: PlayerRecord = { id: crypto.randomUUID(), kind: 'guest', displayName: name, createdAt: clock, upgradedAt: null };
    await storage.createPlayer(p);
    return p;
  };
  /** Fund through the real reward path, so every Seed has a ledger row behind it. */
  const fund = async (p: PlayerRecord, seeds: number) => {
    while ((await store.wallet(p.id)).balance < seeds) {
      await store.settle({ playerId: p.id, sourceKey: `campaign:${crypto.randomUUID()}`, mode: 'campaign', outcome: 'win', opponentId: null, campaignLevel: 1, now: clock });
    }
  };
  const balance = async (p: PlayerRecord) => (await store.wallet(p.id)).balance;
  const owner = async (cellId: string) => (await store.world()).claims.find((c) => c.cellId === cellId)?.ownerId ?? null;
  const claim = async (p: PlayerRecord, cellId: string) =>
    expect((await store.claim(p.id, cellId, `req-${crypto.randomUUID()}`, clock)).ok).toBe(true);
  /** A free target with `n` free neighbours: one ground for the defender, n for challengers. */
  const freeCluster = async (n: number): Promise<{ target: string; near: string[] }> => {
    const held = new Set((await store.world()).claims.map((c) => c.cellId));
    for (const cell of WORLD_CELLS) {
      if (held.has(cell.id)) continue;
      const near = worldNeighbours(cell.id).filter((id) => !held.has(id));
      if (near.length >= n) return { target: cell.id, near: near.slice(0, n) };
    }
    throw new Error('No free cluster left in the test database.');
  };
  const finish = async (matchId: string, winner: PlayerRecord, loser: PlayerRecord) => {
    const seats = await storage.participantsOf(matchId);
    const seat = seats.find((s) => s.playerId === winner.id)!.seat;
    expect(await storage.resignMatch(matchId, loser.id, clock, { winner: seat, reason: 'resigned', scores: [0, 0] })).toBeTruthy();
  };
  /** A challenger next to a defender's tile, both funded for exactly what the loop needs. */
  const setup = async () => {
    const { target, near } = await freeCluster(1);
    const challenger = await newPlayer('Challenger');
    const defender = await newPlayer('Defender');
    await fund(challenger, STAKE * 2);
    await fund(defender, STAKE);
    await claim(challenger, near[0]!);
    await claim(defender, target);
    return { target, challenger, defender };
  };

  it('accept -> duel -> two simultaneous confirms: exactly one settlement, tile and stake to the winner', async () => {
    const { target, challenger, defender } = await setup();
    const total = (await balance(challenger)) + (await balance(defender));
    const start = await balance(challenger);
    const sent = await service.sendChallenge(challenger, target, `req-${crypto.randomUUID()}`);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(await balance(challenger)).toBe(start - STAKE); // escrowed

    const accepted = await service.respond(defender, sent.challenge.id, true);
    expect(accepted.challenge.status).toBe('accepted');
    expect(accepted.matchId).toBeTruthy();
    const match = await storage.matchById(accepted.matchId!);
    expect(match?.status).toBe('active');
    await expect(service.confirm(challenger, sent.challenge.id)).rejects.toMatchObject({ code: 'MATCH_NOT_FINISHED' });

    await finish(accepted.matchId!, challenger, defender);
    const [one, two] = await Promise.all([service.confirm(challenger, sent.challenge.id), service.confirm(defender, sent.challenge.id)]);
    expect([one.settled, two.settled].filter(Boolean)).toHaveLength(1);
    expect(one.winnerId).toBe(challenger.id);
    expect(two.winnerId).toBe(challenger.id);
    expect(await owner(target)).toBe(challenger.id);
    // The stake came back to the winner; no Seed was created or destroyed.
    expect(await balance(challenger)).toBe(start);
    expect((await balance(challenger)) + (await balance(defender))).toBe(total);
    const again = await service.confirm(defender, sent.challenge.id);
    expect(again).toMatchObject({ settled: false, replayed: true, winnerId: challenger.id });
  });

  it('a defender who wins the duel keeps the tile and takes the stake', async () => {
    const { target, challenger, defender } = await setup();
    const total = (await balance(challenger)) + (await balance(defender));
    const before = await balance(defender);
    const sent = await service.sendChallenge(challenger, target, `req-${crypto.randomUUID()}`);
    if (!sent.ok) throw new Error(sent.code);
    const accepted = await service.respond(defender, sent.challenge.id, true);
    await finish(accepted.matchId!, defender, challenger);
    const out = await service.confirm(challenger, sent.challenge.id);
    expect(out).toMatchObject({ settled: true, winnerId: defender.id });
    expect(await owner(target)).toBe(defender.id);
    expect(await balance(defender)).toBe(before + STAKE);
    expect((await balance(challenger)) + (await balance(defender))).toBe(total);
  });

  it('an unanswered challenge forfeits after 24 h: the tile moves, the challenger is refunded', async () => {
    const { target, challenger, defender } = await setup();
    const total = (await balance(challenger)) + (await balance(defender));
    const sent = await service.sendChallenge(challenger, target, `req-${crypto.randomUUID()}`);
    if (!sent.ok) throw new Error(sent.code);
    clock += WORLD_CHALLENGE_TTL_MS - 1;
    await service.expireChallenges();
    expect(await owner(target)).toBe(defender.id);
    clock += 2;
    expect(await service.expireChallenges()).toBeGreaterThanOrEqual(1);
    expect(await store.challenge(sent.challenge.id)).toMatchObject({ status: 'expired', winnerId: challenger.id });
    expect(await owner(target)).toBe(challenger.id);
    expect((await balance(challenger)) + (await balance(defender))).toBe(total);
    await expect(service.respond(defender, sent.challenge.id, true)).rejects.toMatchObject({ code: 'CHALLENGE_CLOSED' });
  });

  it('an accepted duel never finished closes stale after 7 days: refund, no transfer, no late confirm', async () => {
    const { target, challenger, defender } = await setup();
    const before = [await balance(challenger), await balance(defender)];
    const sent = await service.sendChallenge(challenger, target, `req-${crypto.randomUUID()}`);
    if (!sent.ok) throw new Error(sent.code);
    const accepted = await service.respond(defender, sent.challenge.id, true);
    clock += WORLD_CHALLENGE_STALE_MS + 1;
    await service.expireChallenges();
    expect(await store.challenge(sent.challenge.id)).toMatchObject({ status: 'stale' });
    expect(await owner(target)).toBe(defender.id);
    expect([await balance(challenger), await balance(defender)]).toEqual(before);
    await finish(accepted.matchId!, challenger, defender);
    await expect(service.confirm(challenger, sent.challenge.id)).rejects.toMatchObject({ code: 'CHALLENGE_CLOSED' });
    expect(await owner(target)).toBe(defender.id);
  });

  it('two challengers racing for one tile: one challenge opens, the other is refused and never debited', async () => {
    const { target, near } = await freeCluster(2);
    const defender = await newPlayer('Defender');
    const [x, y] = [await newPlayer('Racer X'), await newPlayer('Racer Y')];
    await fund(defender, STAKE);
    for (const p of [x, y]) await fund(p, STAKE * 2);
    await claim(defender, target);
    await claim(x, near[0]!);
    await claim(y, near[1]!);
    const [bx, by] = [await balance(x), await balance(y)];
    const results = await Promise.all([
      service.sendChallenge(x, target, `req-${crypto.randomUUID()}`),
      service.sendChallenge(y, target, `req-${crypto.randomUUID()}`),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, code: 'CELL_BUSY' });
    expect([bx - (await balance(x)), by - (await balance(y))].sort()).toEqual([0, STAKE]);
  });

  // ---- the owner's dashboard edits (docs/ADMIN.md §3a), on the same SQL ------

  it('admin Seeds: one admin_adjust ledger row each way, never below zero, a repeated request applies once', async () => {
    const p = await newPlayer('Grant');
    const add = await store.adminAdjustSeeds({ playerId: p.id, delta: 500, requestId: 'grant-0001', actorId: p.id, reason: 'test', now: clock });
    expect(add).toMatchObject({ ok: true, replayed: false, wallet: { balance: 500 } });
    expect(await store.adminAdjustSeeds({ playerId: p.id, delta: 500, requestId: 'grant-0001', actorId: p.id, reason: 'test', now: clock })).toMatchObject({ ok: true, replayed: true });
    expect(await store.adminAdjustSeeds({ playerId: p.id, delta: -200, requestId: 'take-0001', actorId: p.id, reason: '', now: clock })).toMatchObject({ ok: true, wallet: { balance: 300 } });
    expect(await store.adminAdjustSeeds({ playerId: p.id, delta: -301, requestId: 'take-0002', actorId: p.id, reason: '', now: clock })).toMatchObject({ ok: false, code: 'BELOW_ZERO' });
    expect(await balance(p)).toBe(300);
    const { rows } = await pool.query("select delta, balance_after, metadata from seed_ledger where player_id=$1 and category='admin_adjust' order by created_at, delta desc", [p.id]);
    expect(rows.map((r) => [Number(r.delta), Number(r.balance_after)])).toEqual([[500, 500], [-200, 300]]);
    expect(rows[0]!.metadata).toMatchObject({ reason: 'test' });
  });

  it('admin tiles: place, move and clear any cell; an open challenge on it is refunded first', async () => {
    const { target, challenger, defender } = await setup();
    const newcomer = await newPlayer('Newcomer');
    const sent = await service.sendChallenge(challenger, target, `req-${crypto.randomUUID()}`);
    if (!sent.ok) throw new Error(sent.code);
    const escrowed = await balance(challenger);
    const revision = (await store.world()).revision;

    const moved = await store.adminSetCell({ cellId: target, ownerId: newcomer.id, now: clock });
    expect(moved).toMatchObject({ ok: true, previousOwnerId: defender.id, ownerId: newcomer.id, changed: true, challengesClosed: 1 });
    expect(await owner(target)).toBe(newcomer.id);
    expect(await balance(challenger)).toBe(escrowed + STAKE);
    expect(await store.challenge(sent.challenge.id)).toMatchObject({ status: 'stale' });
    const src = await pool.query('select source from world_claims where cell_id=$1', [target]);
    expect(src.rows[0]?.source).toBe('admin');

    expect(await store.adminSetCell({ cellId: target, ownerId: newcomer.id, now: clock })).toMatchObject({ changed: false });
    expect(await store.adminSetCell({ cellId: target, ownerId: null, now: clock })).toMatchObject({ ok: true, previousOwnerId: newcomer.id, ownerId: null, changed: true });
    expect(await owner(target)).toBeNull();
    expect((await store.world()).revision).toBe(revision + 2);
    expect(await store.adminSetCell({ cellId: '999,999', ownerId: null, now: clock })).toMatchObject({ ok: false, code: 'INVALID_CELL' });
  });
});
