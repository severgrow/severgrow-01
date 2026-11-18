// NO DATABASE WRITE ON A PLAIN READ (owner, 2026-11-18: "make the server side of things way more
// reliable and efficient"). Chat pages were read every few seconds, and every read first wrote a
// rate-limit row to Postgres: a write per poll, competing with real work for two connections per
// isolate. Reads are now limited in memory per isolate (a flood guard, like the public map's);
// sending, blocking and reporting keep their database budgets.
import { describe, expect, it } from 'vitest';
import { createMemoryLimiter } from '../src/memory-limit.js';
import { createTerritoryChatRouter } from '../src/chat/territory.js';

describe('the in-memory read limit', () => {
  it('allows up to the budget per key per window, then refuses, and a new window starts fresh', () => {
    let now = 0;
    const limit = createMemoryLimiter({ max: 3, windowMs: 60_000, now: () => now });
    expect([limit.hit('a'), limit.hit('a'), limit.hit('a'), limit.hit('a')]).toEqual([true, true, true, false]);
    expect(limit.hit('b'), 'another key has its own budget').toBe(true);
    now += 60_000;
    expect(limit.hit('a')).toBe(true);
  });
  it('never grows without bound: past the key cap the table is cleared (fails open)', () => {
    const limit = createMemoryLimiter({ max: 1, windowMs: 60_000, now: () => 0, maxKeys: 3 });
    for (const k of ['a', 'b', 'c', 'd']) limit.hit(k);
    expect(limit.size()).toBeLessThanOrEqual(3);
  });
});

describe('Global chat reads write nothing to the database', () => {
  const route = () => {
    const writes: string[] = [];
    const router = createTerritoryChatRouter({
      store: { history: async () => ({ messages: [] }) } as never,
      service: { authenticate: async () => ({ id: 'p1' }), serverNow: () => 1_000 } as never,
      storage: { hitRateLimit: async (bucket: string) => { writes.push(bucket); return { ok: true, count: 1 }; } } as never,
    });
    return { router, writes };
  };
  it('a chat page read spends no database rate-limit row', async () => {
    const { router, writes } = route();
    const out = await router(new Request('http://x/v1/territory/chat', { headers: { authorization: 'Bearer t' } }), '/v1/territory/chat');
    expect(out?.status).toBe(200);
    expect(writes).toEqual([]);
  });
  it('a flood of reads is still refused, from memory', async () => {
    const { router } = route();
    let refused = 0;
    for (let i = 0; i < 130; i++) {
      try { await router(new Request('http://x/v1/territory/chat', { headers: { authorization: 'Bearer t' } }), '/v1/territory/chat'); }
      catch (e) { if ((e as { code?: string }).code === 'RATE_LIMITED') refused++; }
    }
    expect(refused).toBeGreaterThan(0);
  });
  it('sending still spends the database budgets', async () => {
    const { router, writes } = route();
    await router(new Request('http://x/v1/territory/chat', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ text: 'hi', requestId: '11111111-1111-4111-8111-111111111111' }) }), '/v1/territory/chat').catch(() => undefined);
    expect(writes.length).toBeGreaterThan(0);
  });
});

describe('match chat reads write nothing to the database', () => {
  it('a history read spends no database rate-limit row; a flood is refused from memory', async () => {
    const { createChatRouter } = await import('../src/chat/router.js');
    const writes: string[] = [];
    const router = createChatRouter({
      store: { execute: async () => ({ messages: [] }) } as never,
      service: { authenticate: async () => ({ id: 'p1' }), serverNow: () => 1_000 } as never,
      storage: { hitRateLimit: async (bucket: string) => { writes.push(bucket); return { ok: true, count: 1 }; } } as never,
    });
    const id = '22222222-2222-4222-8222-222222222222';
    const read = () => router(new Request(`http://x/v1/matches/${id}/chat`, { headers: { authorization: 'Bearer t' } }), `/v1/matches/${id}/chat`);
    await read().catch(() => undefined);
    expect(writes).toEqual([]);
    let refused = 0;
    for (let i = 0; i < 130; i++) await read().catch((e: { code?: string }) => { if (e.code === 'RATE_LIMITED') refused++; });
    expect(refused).toBeGreaterThan(0);
  });
});
