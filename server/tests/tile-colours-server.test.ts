// A PLAYER'S TILE COLOUR ON THE WIRE (owner, 2026-10-30).
//
// Three guarantees, and this file is their gate:
//
//   * the public map carries the palette colour, and a STORED choice wins over the derived default;
//   * reading never writes - a player who has never chosen keeps "no row" and the derived colour,
//     so nobody's colour depends on who happened to load the map first;
//   * both backends answer the same way for the same data, and an UNMIGRATED database (no
//     player_tile_colours table) still serves a map and refuses a save honestly instead of losing it.
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { PALETTE_SIZE, TILE_COLOURS, colourFor, defaultColourId, resolveTileColours } from '../../src/tile-colours.js';

const START = Date.UTC(2026, 9, 30, 9);
const player = (id: string, displayName: string): PlayerRecord =>
  ({ id, kind: 'guest', displayName, createdAt: START, upgradedAt: null });

const harness = () => {
  const clock = START;
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const service = new WorldEconomyService(store, storage, () => clock);
  const a = player('player-a', 'BloomHeron');
  const b = player('player-b', 'RYK');
  const register = async (...players: PlayerRecord[]) => { for (const p of players) await storage.createPlayer(p); };
  const own = (cellId: string, ownerId: string, at = clock) => {
    store.claims.set(cellId, { cellId, ownerId, ownerName: null, ownerLevel: null, claimedAt: at });
  };
  const router = () => createWorldEconomyRouter({
    economy: service,
    authenticate: async (token: string | null) => {
      if (token === 'token-a') return a;
      if (token === 'token-b') return b;
      throw Object.assign(new Error('no'), { code: 'UNAUTHORIZED' });
    },
  });
  return { storage, store, service, a, b, register, own, router };
};

const call = async (h: ReturnType<typeof harness>, method: 'GET' | 'POST', path: string, token: string, body?: unknown) => {
  const request = new Request(`http://test.local${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return await h.router()(request, path);
};

const colourOf = (world: { claims: { cellId: string; colour: string }[] }, cellId: string) =>
  world.claims.find((claim) => claim.cellId === cellId)!.colour;

/** A fake pool that answers the world read (revision + claims) and the colour-table probe. */
const fakePool = (options: { table: boolean; rows: PgRow[] }): PgPool => ({
  query: async (text: string): Promise<PgQueryResult> => {
    if (text.includes('information_schema.tables')) return { rows: options.table ? [{ present: 1 }] : [] };
    return { rows: [] };
  },
  connect: async () => ({
    query: async (text: string): Promise<PgQueryResult> => {
      if (text.includes('from world_meta')) return { rows: [{ revision: 7 }] };
      if (text.includes('from world_claims')) return { rows: options.rows };
      return { rows: [] };
    },
    release: () => undefined,
  }),
});

describe('the public map carries the palette colour', () => {
  it('derives a colour from the player id when nothing has been chosen', async () => {
    const h = harness();
    await h.register(h.a);
    h.own('0,0', h.a.id);
    const world = await h.service.world();
    expect(colourOf(world, '0,0')).toBe(colourFor(h.a.id));
    expect(TILE_COLOURS.map((colour) => colour.css)).toContain(colourOf(world, '0,0'));
    // ...and reading it wrote nothing.
    expect(h.store.colours.size).toBe(0);
  });

  it('lets a stored choice win, for every one of that player\'s tiles', async () => {
    const h = harness();
    await h.register(h.a);
    h.own('0,0', h.a.id);
    h.own('0,1', h.a.id);
    const chosen = (defaultColourId(h.a.id) + 5) % PALETTE_SIZE;
    await h.service.chooseColour(h.a, chosen);
    const world = await h.service.world();
    expect(colourOf(world, '0,0')).toBe(TILE_COLOURS[chosen]!.css);
    expect(colourOf(world, '0,1')).toBe(TILE_COLOURS[chosen]!.css);
  });

  it('separates two colliding neighbours on the wire, not in the client', async () => {
    // Find two ids that derive the same slot, then put them side by side.
    const slots = new Map<number, string>();
    let a = '', b = '';
    for (let i = 0; i < 400 && !b; i++) {
      const id = `collide-${i}`;
      const slot = defaultColourId(id);
      const other = slots.get(slot);
      if (other) { a = other; b = id; } else slots.set(slot, id);
    }
    expect(b).not.toBe('');
    const h = harness();
    h.own('0,0', a, START);
    h.own('1,0', b, START + 1);
    const world = await h.service.world();
    expect(colourOf(world, '0,0')).toBe(colourFor(a));
    expect(colourOf(world, '1,0')).not.toBe(colourFor(b));
    // The service and the shared resolver agree, so the client draws what the server decided.
    const resolved = resolveTileColours([
      { cellId: '0,0', ownerId: a, claimedAt: START, chosen: null },
      { cellId: '1,0', ownerId: b, claimedAt: START + 1, chosen: null },
    ]);
    expect(TILE_COLOURS[resolved.get('1,0')!]!.css).toBe(colourOf(world, '1,0'));
  });
});

describe('GET /v1/world/colour', () => {
  it('reports the derived colour before a choice, without writing a row', async () => {
    const h = harness();
    await h.register(h.a);
    const response = await call(h, 'GET', '/v1/world/colour', 'token-a');
    expect(response?.status).toBe(200);
    const body = response?.body as { colour: { colourId: number; colour: string; chosen: boolean; name: string } };
    expect(body.colour.colourId).toBe(defaultColourId(h.a.id));
    expect(body.colour.colour).toBe(TILE_COLOURS[defaultColourId(h.a.id)]!.css);
    expect(body.colour.name).toBe(TILE_COLOURS[defaultColourId(h.a.id)]!.name);
    expect(body.colour.chosen).toBe(false);
    expect(h.store.colours.size).toBe(0);
  });

  it('saves a choice and reports it back, on either device', async () => {
    const h = harness();
    await h.register(h.a);
    const saved = await call(h, 'POST', '/v1/world/colour', 'token-a', { colourId: 12 });
    expect(saved?.status).toBe(200);
    expect(saved?.body).toMatchObject({ colour: { colourId: 12, colour: TILE_COLOURS[12]!.css, name: 'Glacier' } });
    // A second read (the other device) sees the same choice.
    const read = await call(h, 'GET', '/v1/world/colour', 'token-a');
    expect(read?.body).toMatchObject({ colour: { colourId: 12, chosen: true } });
    // Idempotent: choosing the same colour again is one row, not two.
    await call(h, 'POST', '/v1/world/colour', 'token-a', { colourId: 12 });
    expect(h.store.colours.size).toBe(1);
  });

  it('refuses a colour that is not in the palette, and leaves the stored choice alone', async () => {
    const h = harness();
    await h.register(h.a);
    await call(h, 'POST', '/v1/world/colour', 'token-a', { colourId: 4 });
    for (const colourId of [20, -1, 1.5, '7', null]) {
      await expect(call(h, 'POST', '/v1/world/colour', 'token-a', { colourId })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(h.store.colours.get(h.a.id)).toBe(4);
  });

  it('is private: a token only ever reads and writes its own colour', async () => {
    const h = harness();
    await h.register(h.a, h.b);
    await call(h, 'POST', '/v1/world/colour', 'token-a', { colourId: 9 });
    await call(h, 'POST', '/v1/world/colour', 'token-b', { colourId: 3 });
    expect((await call(h, 'GET', '/v1/world/colour', 'token-a'))?.body).toMatchObject({ colour: { colourId: 9 } });
    expect((await call(h, 'GET', '/v1/world/colour', 'token-b'))?.body).toMatchObject({ colour: { colourId: 3 } });
  });
});

describe('both backends agree', () => {
  const ROW: PgRow = { cell_id: '0,0', owner_id: 'player-a', claimed_at: START, owner_name: 'BloomHeron', owner_level: null, colour_id: 6 };

  it('the SQL store reads the stored slot, and the memory store matches it', async () => {
    const store = postgresWorldEconomyStore(fakePool({ table: true, rows: [ROW] }));
    const snapshot = await store.world();
    expect(snapshot.claims[0]!.colourId).toBe(6);
    // The memory store, given the same facts, produces the same snapshot fields.
    const memory = new MemoryWorldEconomyStore();
    memory.claims.set('0,0', { cellId: '0,0', ownerId: 'player-a', ownerName: 'BloomHeron', ownerLevel: null, claimedAt: START });
    memory.colours.set('player-a', 6);
    const fromMemory = await memory.world();
    expect(fromMemory.claims).toEqual(snapshot.claims);
  });

  it('the SQL store joins the colour table in the SAME world query (no second read per claim)', async () => {
    const calls: string[] = [];
    const pool = fakePool({ table: true, rows: [ROW] });
    const wrapped: PgPool = {
      query: async (text: string): Promise<PgQueryResult> => { calls.push(text); return await pool.query(text); },
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async (text: string, values?: readonly unknown[]): Promise<PgQueryResult> => { calls.push(text); return await client.query(text, values); },
          release: () => client.release?.(),
        };
      },
    };
    await postgresWorldEconomyStore(wrapped).world();
    const claimReads = calls.filter((text) => text.includes('from world_claims'));
    expect(claimReads).toHaveLength(1);
    expect(claimReads[0]).toContain('player_tile_colours');
  });

  it('an unmigrated database still serves the map, and refuses a save honestly', async () => {
    const store = postgresWorldEconomyStore(fakePool({ table: false, rows: [{ ...ROW, colour_id: null }] }));
    const snapshot = await store.world();
    expect(snapshot.claims[0]!.colourId).toBeNull();
    expect(await store.colourChoice('player-a')).toBeNull();
    await expect(store.setColourChoice('player-a', 3, START)).rejects.toMatchObject({ code: 'COLOUR_MIGRATION_PENDING' });
  });
});
