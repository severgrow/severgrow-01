// TERRITORY ACHIEVEMENTS (owner, 2026-10-29: "turn it into achievements and pay seeds for those —
// for beta we want quick easy engagement in territory"). Server-verified, one-time, generous.
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { ACHIEVEMENTS, achievementFacts, achievementViews } from '../src/seeds/achievements.js';
import { SEED_ECONOMY } from '../src/seeds/config.js';
import { WORLD_CELLS, worldNeighbours } from '../src/world.js';
import type { PlayerRecord } from '../src/storage/types.js';

const START = Date.UTC(2026, 9, 29, 12);
const player = (id: string): PlayerRecord => ({ id, kind: 'guest', displayName: id, createdAt: START, upgradedAt: null });
const ring = (() => {
  for (const cell of WORLD_CELLS) { const n = worldNeighbours(cell.id); if (n.length >= 4) return { home: cell.id, n }; }
  throw new Error('no ring');
})();

const harness = async () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  let clock = START;
  const service = new WorldEconomyService(store, storage, () => clock);
  const [a, b] = [player('a'), player('b')];
  await storage.createPlayer(a); await storage.createPlayer(b);
  const own = (cellId: string, ownerId: string) =>
    store.claims.set(cellId, { cellId, ownerId, ownerName: null, ownerLevel: null, claimedAt: clock });
  return { storage, store, service, a, b, own, advance: (ms: number) => { clock += ms; } };
};

describe('the set', () => {
  it('is generous for the beta: 900 Seeds in all, the first one pays back a tile', () => {
    expect(ACHIEVEMENTS.reduce((n, a) => n + a.seeds, 0)).toBe(900);
    expect(ACHIEVEMENTS[0]).toMatchObject({ id: 'roots', goal: 1 });
    expect(ACHIEVEMENTS[0]!.seeds).toBe(SEED_ECONOMY.tileCost);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('reads tiles, neighbours, challenges and rank from what the server stores', () => {
    const claims = [
      { cellId: ring.home, ownerId: 'a' }, { cellId: ring.n[0]!, ownerId: 'b' },
      { cellId: ring.n[1]!, ownerId: 'b' }, { cellId: ring.n[2]!, ownerId: 'b' },
    ];
    const rows = [
      { challengerId: 'a', defenderId: 'b', status: 'expired' as const, matchId: null, winnerId: null },
      { challengerId: 'b', defenderId: 'a', status: 'resolved' as const, matchId: 'm1', winnerId: 'a' },
      { challengerId: 'b', defenderId: 'a', status: 'declined' as const, matchId: null, winnerId: null },
    ];
    expect(achievementFacts('a', claims, rows)).toEqual({ tiles: 1, neighbour: true, sent: 1, accepted: 1, won: 2, rank: 2 });
    expect(achievementFacts('nobody', claims, [])).toMatchObject({ tiles: 0, neighbour: false, rank: null });
  });

  it('caps progress at the goal and marks done/claimed', () => {
    const views = achievementViews({ tiles: 12, neighbour: false, sent: 0, accepted: 0, won: 0, rank: 1 }, new Set(['achievement:roots']));
    expect(views.find((v) => v.id === 'estate')).toMatchObject({ progress: 10, goal: 10, done: true, claimed: false });
    expect(views.find((v) => v.id === 'roots')).toMatchObject({ done: true, claimed: true });
    expect(views.find((v) => v.id === 'neighbours')).toMatchObject({ progress: 0, done: false });
  });
});

describe('claiming', () => {
  it('pays the fixed amount once, outside the daily cap, and a retry replays it', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    const first = await h.service.claimAchievement(h.a, 'roots');
    expect(first).toMatchObject({ ok: true, awarded: 100, replayed: false });
    expect((await h.store.wallet('a')).balance).toBe(100);
    const again = await h.service.claimAchievement(h.a, 'roots');
    expect(again).toMatchObject({ ok: true, awarded: 100, replayed: true });
    expect((await h.store.wallet('a')).balance).toBe(100);
    expect((await h.service.achievements(h.a)).find((v) => v.id === 'roots')).toMatchObject({ claimed: true });
  });

  it('refuses an achievement not earned yet, and pays nothing', async () => {
    const h = await harness();
    expect(await h.service.claimAchievement(h.a, 'roots')).toEqual({ ok: false, code: 'NOT_EARNED' });
    expect((await h.store.wallet('a')).balance).toBe(0);
  });

  it('stays claimed after the tiles are gone (selling cannot re-arm it)', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    await h.service.claimAchievement(h.a, 'roots');
    h.store.claims.delete(ring.home);
    expect(await h.service.claimAchievement(h.a, 'roots')).toMatchObject({ ok: true, replayed: true });
    expect((await h.store.wallet('a')).balance).toBe(100);
  });

  it('rejects an unknown id', async () => {
    const h = await harness();
    await expect(h.service.claimAchievement(h.a, 'free-money')).rejects.toThrow();
  });

  it('a sent challenge earns throw-down; the defender who accepts earns stand-ground', async () => {
    const h = await harness();
    h.own(ring.home, 'a'); h.own(ring.n[0]!, 'b');
    const sent = await h.service.sendChallenge(h.a, ring.n[0]!, 'req-ach-1');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect((await h.service.claimAchievement(h.a, 'throw-down')).ok).toBe(true);
    expect(await h.service.claimAchievement(h.b, 'stand-ground')).toEqual({ ok: false, code: 'NOT_EARNED' });
    await h.service.respond(h.b, sent.challenge.id, true);
    expect((await h.service.claimAchievement(h.b, 'stand-ground')).ok).toBe(true);
  });
});

describe('HTTP', () => {
  it('lists and claims with a bearer token, and answers 409 for an unearned claim', async () => {
    const h = await harness();
    h.own(ring.home, 'a');
    const router = createWorldEconomyRouter({ economy: h.service, authenticate: async (t) => { if (t !== 'tok-a') throw new Error('auth'); return h.a; } });
    const req = (method: string, path: string, body?: unknown) => router(new Request(`http://x${path}`, {
      method, headers: { authorization: 'Bearer tok-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), path);
    const list = await req('GET', '/v1/seeds/achievements');
    expect(list?.status).toBe(200);
    const views = (list!.body as { achievements: { id: string; done: boolean }[] }).achievements;
    expect(views.map((v) => v.id)).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(views.find((v) => v.id === 'roots')?.done).toBe(true);
    expect((await req('POST', '/v1/seeds/achievements/claim', { id: 'roots' }))?.status).toBe(200);
    const unearned = await req('POST', '/v1/seeds/achievements/claim', { id: 'estate' });
    expect(unearned?.status).toBe(409);
    expect(unearned?.body).toMatchObject({ ok: false, code: 'NOT_EARNED' });
  });
});

describe('admin', () => {
  it('the Campaign screen never counts an achievement as a level', async () => {
    const { shapeCampaign } = await import('../src/admin/campaign.js');
    const shaped = shapeCampaign([
      { sourceKey: 'achievement:roots', awarded: 100, denial: null, utcDay: '2026-10-29' },
      { sourceKey: 'campaign:c1-01', awarded: 100, denial: null, utcDay: '2026-10-29' },
    ], []);
    expect(JSON.stringify(shaped)).not.toContain('achievement');
  });
});
