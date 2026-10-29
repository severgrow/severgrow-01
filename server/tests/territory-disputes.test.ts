// THE PUBLIC DISPUTE LIST (owner, 2026-10-29): "find a smart way to have that icon on EVERY players
// tile that is in duel challenge right now, but also, other people challenges".
//
// The map is a public read. A dispute therefore has to be readable by somebody who is not one of its
// two players — which means it crosses the wire in `GET /v1/world`. This file is the gate on that:
//
//   * every open dispute, for the whole map, in ONE read (never one query per cell);
//   * nothing for a closed row: history is never a dispute;
//   * pending and accepted are both disputes (`live` says which), because a running duel has not
//     resolved anything yet;
//   * the shape is MINIMAL and pinned key-by-key: no stake, no stake cell, no match id, no request
//     key, no token. The map already publishes an owner's id and name per claim, so the two ids and
//     the phase add no privacy beyond what the map already shows.
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import type { PlayerRecord } from '../src/storage/types.js';
import type { WorldChallenge } from '../src/seeds/types.js';

const START = Date.UTC(2026, 9, 29, 9);

/** The exact and only keys a dispute may carry across the wire. Adding one fails this list. */
const DISPUTE_KEYS = ['cellId', 'challengerId', 'defenderId', 'live'];

const player = (id: string, displayName: string): PlayerRecord =>
  ({ id, kind: 'guest', displayName, createdAt: START, upgradedAt: null });

/** A defender's tile with two free neighbours (the challenger's own ground). */
const cluster = ((): { target: string; near: string; near2: string } => {
  for (const cell of WORLD_CELLS) {
    const neighbours = worldNeighbours(cell.id);
    if (neighbours.length >= 3) return { target: cell.id, near: neighbours[0]!, near2: neighbours[1]! };
  }
  throw new Error('the frozen world must contain a cell with three neighbours');
})();

const harness = () => {
  let clock = START;
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const service = new WorldEconomyService(store, storage, () => clock);
  const a = player('player-a', 'BloomHeron');
  const b = player('player-b', 'RYK');
  const c = player('player-c', 'Lidwingo');
  const register = async (...players: PlayerRecord[]) => {
    for (const p of players) await storage.createPlayer(p);
  };
  const own = (cellId: string, ownerId: string) => {
    store.claims.set(cellId, { cellId, ownerId, ownerName: null, ownerLevel: null, claimedAt: clock });
  };
  const row = (over: Partial<WorldChallenge> & Pick<WorldChallenge, 'id' | 'cellId' | 'challengerId' | 'defenderId'>): WorldChallenge => ({
    status: 'pending', stake: 0, stakeCellId: null, createdAt: clock, expiresAt: clock + 60 * 60 * 1000,
    respondedAt: null, matchId: null, winnerId: null, resolvedAt: null, ...over,
  });
  return {
    storage, store, service, a, b, c, register, own, row,
    advance: (ms: number) => { clock += ms; },
    now: () => clock,
  };
};

describe('the store’s public dispute read', () => {
  it('returns every OPEN dispute for the whole map in one call, and nothing for a closed one', async () => {
    const h = harness();
    h.store.challenges.set('open-pending', h.row({ id: 'open-pending', cellId: '0,0', challengerId: 'a', defenderId: 'b' }));
    h.store.challenges.set('open-live', h.row({
      id: 'open-live', cellId: '1,0', challengerId: 'c', defenderId: 'a', status: 'accepted', matchId: 'm-1',
    }));
    for (const status of ['declined', 'expired', 'stale', 'resolved'] as const) {
      h.store.challenges.set(status, h.row({ id: status, cellId: '2,0', challengerId: 'a', defenderId: 'c', status }));
    }
    const disputes = await h.store.disputedCells();
    expect(disputes).toEqual([
      { cellId: '0,0', challengerId: 'a', defenderId: 'b', live: false },
      { cellId: '1,0', challengerId: 'c', defenderId: 'a', live: true },
    ]);
    // Deterministic across calls: the same map always draws the same layer.
    expect(await h.store.disputedCells()).toEqual(disputes);
  });

  it('a challenge that closes disappears from the read, with no cleanup elsewhere', async () => {
    const h = harness();
    h.store.challenges.set('c1', h.row({ id: 'c1', cellId: '0,0', challengerId: 'a', defenderId: 'b' }));
    expect(await h.store.disputedCells()).toHaveLength(1);
    h.store.challenges.get('c1')!.status = 'declined';
    expect(await h.store.disputedCells()).toEqual([]);
  });

  it('the SQL store is ONE statement over the open rows, never one query per cell', async () => {
    const calls: { text: string; values: readonly unknown[] }[] = [];
    const rows: PgRow[] = [
      { cell_id: '0,0', challenger_id: 'a', defender_id: 'b', status: 'pending' },
      { cell_id: '1,0', challenger_id: 'c', defender_id: 'a', status: 'accepted' },
    ];
    const pool: PgPool = {
      query: async (text: string, values: readonly unknown[] = []): Promise<PgQueryResult> => {
        calls.push({ text, values });
        return { rows };
      },
      connect: async () => ({ query: async () => ({ rows: [] }) }),
    };
    const disputes = await postgresWorldEconomyStore(pool).disputedCells();
    expect(calls).toHaveLength(1);
    const statement = calls[0]!.text.replace(/\s+/g, ' ').toLowerCase();
    // Only open rows, and the read is bounded by the partial index's own predicate.
    expect(statement).toContain("status in ('pending','accepted')");
    expect(statement).toContain('from world_challenges');
    expect(statement).toContain('order by cell_id');
    // No N+1: no `$1` parameter means no cell id is being passed in a loop.
    expect(calls[0]!.values).toEqual([]);
    expect(disputes).toEqual([
      { cellId: '0,0', challengerId: 'a', defenderId: 'b', live: false },
      { cellId: '1,0', challengerId: 'c', defenderId: 'a', live: true },
    ]);
  });

  it('both backends answer with the same shape for the same open rows', async () => {
    const h = harness();
    h.store.challenges.set('c1', h.row({ id: 'c1', cellId: '0,0', challengerId: 'a', defenderId: 'b' }));
    const memory = await h.store.disputedCells();
    const pool: PgPool = {
      query: async (): Promise<PgQueryResult> => ({
        rows: [{ cell_id: '0,0', challenger_id: 'a', defender_id: 'b', status: 'pending' }],
      }),
      connect: async () => ({ query: async () => ({ rows: [] }) }),
    };
    const sql = await postgresWorldEconomyStore(pool).disputedCells();
    expect(sql).toEqual(memory);
    expect(Object.keys(sql[0]!).sort()).toEqual(DISPUTE_KEYS);
  });
});

describe('the world payload’s dispute list', () => {
  it('carries pending and accepted disputes with the minimal shape and nothing private', async () => {
    const h = harness();
    await h.register(h.a, h.b, h.c);
    h.own(cluster.near, h.a.id);
    h.own(cluster.near2, h.c.id);
    h.own(cluster.target, h.b.id);
    const sent = await h.service.sendChallenge(h.a, cluster.target, 'request-1');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    // The row carries a stake cell, and once accepted a match id: neither may cross the wire.
    expect(sent.challenge.stakeCellId).not.toBeNull();
    const accepted = await h.service.respond(h.b, sent.challenge.id, true);
    expect(accepted.matchId).toBeTruthy();

    const world = await h.service.world();
    expect(world.disputes).toEqual([
      { cellId: cluster.target, challengerId: h.a.id, defenderId: h.b.id, live: true },
    ]);
    expect(Object.keys(world.disputes[0]!).sort()).toEqual(DISPUTE_KEYS);

    // The WHOLE public body is checked, not just the dispute entry: the match id and the request key
    // must be absent from it. (The STAKE CELL is a real tile on the map — it is public ground — so
    // the guarantee for it is the key set above: the dispute names only `cellId`, never the stake.)
    const router = createWorldEconomyRouter({
      economy: h.service,
      authenticate: async () => { throw new Error('the world is public'); },
    });
    const response = await router(new Request('http://test.local/v1/world'), '/v1/world');
    expect(response?.status).toBe(200);
    const body = JSON.stringify(response?.body);
    const disputesBody = JSON.stringify(world.disputes);
    expect(body).not.toContain(accepted.matchId!);
    expect(body).not.toContain('request-1');
    expect(body).not.toContain('"stake"');
    expect(body).not.toContain('stakeCellId');
    expect(body).not.toContain('token');
    expect(disputesBody).not.toContain('stake');
    expect(disputesBody).not.toContain(accepted.matchId!);
  });

  it('drops a dispute the moment it closes, on the same lazy read', async () => {
    const h = harness();
    await h.register(h.a, h.b);
    h.own(cluster.near, h.a.id);
    h.own(cluster.target, h.b.id);
    const sent = await h.service.sendChallenge(h.a, cluster.target, 'request-1');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect((await h.service.world()).disputes).toHaveLength(1);
    await h.service.respond(h.b, sent.challenge.id, false);
    expect((await h.service.world()).disputes).toEqual([]);
  });

  it('never breaks the map when the dispute read is unavailable', async () => {
    const h = harness();
    h.store.disputedCells = async () => { throw new Error('world_challenges is not migrated'); };
    // A mark is decoration; the map must still answer.
    const world = await h.service.world();
    expect(world.disputes).toEqual([]);
    expect(world.claims).toEqual([]);
  });
});
