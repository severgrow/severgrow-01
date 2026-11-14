import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PlayerRecord } from '../src/storage/types.js';
import type { PgPool, PgQueryResult } from '../src/storage/postgres.js';

const player = (id: string): PlayerRecord => ({ id, kind: 'guest', displayName: id, createdAt: 1, upgradedAt: null });
const setup = () => {
  const a = player('player-a'), b = player('player-b');
  const store = new MemoryWorldEconomyStore();
  const service = new WorldEconomyService(store, new MemoryStorage(), () => 42);
  store.claims.set('0,0', { cellId: '0,0', ownerId: a.id, ownerName: null, ownerLevel: null, claimedAt: 1 });
  store.claims.set('1,0', { cellId: '1,0', ownerId: b.id, ownerName: null, ownerLevel: null, claimedAt: 1 });
  const router = createWorldEconomyRouter({ economy: service, authenticate: async token => {
    if (token === 'a') return a;
    if (token === 'b') return b;
    throw new Error('Unauthorised');
  } });
  const call = (method: 'GET' | 'POST', token: string, body?: unknown) => router(
    new Request(`http://test.local/v1/world/skin`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), '/v1/world/skin');
  return { a, b, store, service, call };
};

describe('authenticated public Planet appearance', () => {
  it('keeps an account without a choice plain and does not change the world revision on a cosmetic save', async () => {
    const h = setup();
    expect((await h.call('GET', 'a'))?.body).toEqual({ ok: true, skin: null });
    expect(h.store.skins.size).toBe(0);
    const before = h.store.revision;
    expect((await h.call('POST', 'a', { skin: 'water' }))?.body).toEqual({ ok: true, skin: 'water' });
    expect(h.store.revision).toBe(before);
    expect(h.store.colours.size).toBe(0);
    const map = await h.service.world();
    expect(map.claims.find(c => c.ownerId === h.a.id)?.skin).toBe('water');
    expect(map.claims.find(c => c.ownerId === h.b.id)?.skin).toBeNull();
  });

  it('uses the token owner, validates the four public ids and survives a new client read', async () => {
    const h = setup();
    await h.call('POST', 'a', { skin: 'toxic', ownerId: h.b.id });
    expect(h.store.skins.get(h.a.id)).toBe('toxic');
    expect(h.store.skins.has(h.b.id)).toBe(false);
    expect((await h.call('GET', 'a'))?.body).toEqual({ ok: true, skin: 'toxic' });
    for (const skin of ['unknown', 'FOREST', '', null, 4]) {
      await expect(h.call('POST', 'a', { skin })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(h.store.skins.get(h.a.id)).toBe('toxic');
  });
});

describe('rolling server migration', () => {
  const pool = (migrated: boolean): PgPool => ({
    query: async (sql: string): Promise<PgQueryResult> => {
      if (sql.includes('information_schema.tables')) return { rows: sql.includes('player_tile_skins') && !migrated ? [] : [{ present: 1 }] };
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql: string): Promise<PgQueryResult> => {
        if (sql.includes('from world_meta')) return { rows: [{ revision: 3 }] };
        if (sql.includes('from world_claims')) return { rows: [{ cell_id: '0,0', owner_id: 'player-a', owner_name: 'A', owner_level: null, claimed_at: 1, colour_id: null, skin_id: migrated ? 'ash' : null }] };
        return { rows: [] };
      },
      release: () => undefined,
    }),
  });

  it('serves the map on an unmigrated database and refuses an unsaved choice', async () => {
    const store = postgresWorldEconomyStore(pool(false));
    expect((await store.world()).claims[0]?.skinId).toBeNull();
    await expect(store.setSkinChoice?.('player-a', 'ash', 42)).rejects.toMatchObject({ code: 'SKIN_MIGRATION_PENDING' });
  });

  it('joins the owner choice in one map read after migration', async () => {
    const store = postgresWorldEconomyStore(pool(true));
    expect((await store.world()).claims[0]?.skinId).toBe('ash');
  });
});
