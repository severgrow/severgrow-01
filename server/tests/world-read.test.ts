// THE PUBLIC MAP READ (launch readiness, 2026-11-12). `GET /v1/world` needs no account, and each
// uncached read does several database round trips (lazy settles, the map, disputes). So an
// anonymous read is served from a short per-isolate cache (one database read per few seconds no
// matter how many people look) and every read counts against a per-IP budget. A signed-in read is
// always fresh, so a player who just claimed a tile never sees the map from before their claim.
import { describe, expect, it } from 'vitest';
import { WORLD_CACHE_MS, createWorldReadGuard } from '../src/seeds/world-read.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import type { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord } from '../src/storage/types.js';

const counter = () => {
  let loads = 0;
  return { load: async () => ({ n: ++loads }), loads: () => loads };
};

describe('world read guard', () => {
  it('serves anonymous reads from one cached load inside the window', async () => {
    let now = 1_000_000;
    const c = counter();
    const guard = createWorldReadGuard(c.load, { now: () => now, perIpPerHour: 1000 });
    await guard.read('1.1.1.1', false);
    await guard.read('2.2.2.2', false);
    now += WORLD_CACHE_MS - 1;
    await guard.read('3.3.3.3', false);
    expect(c.loads()).toBe(1);
    now += 2;
    expect(await guard.read('3.3.3.3', false)).toEqual({ n: 2 });
  });

  it('joins concurrent anonymous reads into one load', async () => {
    const c = counter();
    const guard = createWorldReadGuard(c.load, { now: () => 5, perIpPerHour: 1000 });
    await Promise.all([guard.read('a', false), guard.read('b', false), guard.read('c', false)]);
    expect(c.loads()).toBe(1);
  });

  it('a fresh read always loads, and refreshes the cache for everyone', async () => {
    const c = counter();
    const guard = createWorldReadGuard(c.load, { now: () => 5, perIpPerHour: 1000 });
    await guard.read('a', false);
    expect(await guard.read('a', true)).toEqual({ n: 2 });
    expect(await guard.read('b', false)).toEqual({ n: 2 });
  });

  it('a write in this isolate drops the cache', async () => {
    const c = counter();
    const guard = createWorldReadGuard(c.load, { now: () => 5, perIpPerHour: 1000 });
    await guard.read('a', false);
    guard.invalidate();
    expect(await guard.read('a', false)).toEqual({ n: 2 });
  });

  it('refuses an IP past its hourly budget, and only that IP, and resets on the hour', async () => {
    let now = 3_600_000 * 10;
    const guard = createWorldReadGuard(counter().load, { now: () => now, perIpPerHour: 3 });
    for (let i = 0; i < 3; i++) await guard.read('9.9.9.9', false);
    await expect(guard.read('9.9.9.9', false)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(guard.read('9.9.9.9', true)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(guard.read('8.8.8.8', false)).resolves.toBeDefined();
    now += 3_600_000;
    await expect(guard.read('9.9.9.9', false)).resolves.toBeDefined();
  });

  it('a failed load is not cached', async () => {
    let fail = true;
    const guard = createWorldReadGuard(async () => { if (fail) throw new Error('db'); return 1; }, { now: () => 5, perIpPerHour: 100 });
    await expect(guard.read('a', false)).rejects.toThrow('db');
    fail = false;
    await expect(guard.read('a', false)).resolves.toBe(1);
  });
});

describe('GET /v1/world through the router', () => {
  const setup = () => {
    let reads = 0;
    const economy = {
      world: async () => ({ revision: ++reads }),
      claim: async () => ({ ok: true }),
    } as unknown as WorldEconomyService;
    const player = { id: 'p1' } as PlayerRecord;
    const router = createWorldEconomyRouter({
      economy,
      authenticate: async (token) => { if (token !== 'good') throw new Error('bad token'); return player; },
      worldReadsPerIpPerHour: 100,
    });
    const get = (headers: Record<string, string> = {}) =>
      router(new Request('http://x/v1/world', { headers: { 'x-real-ip': '7.7.7.7', ...headers } }), '/v1/world');
    return { router, get, reads: () => reads };
  };

  it('anonymous reads share the cache; a signed-in read is fresh', async () => {
    const s = setup();
    await s.get();
    await s.get();
    expect(s.reads()).toBe(1);
    const fresh = await s.get({ authorization: 'Bearer good' });
    expect(fresh?.body).toMatchObject({ ok: true, world: { revision: 2 } });
    // A bad token is just an anonymous read, never an error on the public map.
    await s.get({ authorization: 'Bearer nope' });
    expect(s.reads()).toBe(2);
  });

  it('a claim drops the cache', async () => {
    const s = setup();
    await s.get();
    await s.router(new Request('http://x/v1/world/claims', {
      method: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ cellId: 'c', requestId: 'r' }),
    }), '/v1/world/claims');
    await s.get();
    expect(s.reads()).toBe(2);
  });
});
