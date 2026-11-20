// THE PROFILE SHEET IN ONE REQUEST (owner, 2026-11-20: "make it load up quickly cheaply and be
// visible for all players ... collapse the profile's reads into ONE server request").
//
// Two things are pinned here:
//   1. THE DATA. The public profile now carries the OFFLINE row — completed Practice games and the
//      two longest win runs — computed from rows that ALREADY exist (migration 0028), with no new
//      tracking and no pass over per-game history. A HARD run and a Blitz run with gaps in them
//      prove the aggregate is a longest-run MAX, not a win total.
//   2. THE SHAPE. `/card` answers the profile allow-list plus the achievements count and the best
//      online Blitz streak — one round trip for the whole sheet — and adds NOTHING private. The
//      closed allow-list is asserted key by key, and `/profile`/`/record` keep working for older
//      callers.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { memoryBlitzResults, memoryStreakStore } from '../src/streaks/store.js';
import { memoryCountryStore } from '../src/accounts/country.js';
import { achievementsCount } from '../src/streaks/router.js';
import { postgresStreakStore } from '../src/streaks/postgres.js';
import type { PgPool, PgQueryResult } from '../src/storage/postgres.js';
import { playerTag } from '../../src/player-tag.js';

const NOW = Date.UTC(2026, 10, 20, 12);
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const QUIET = '33333333-3333-4333-8333-333333333333';

const player = (id: string, displayName: string | null): PlayerRecord =>
  ({ id, kind: 'account', displayName, createdAt: NOW, upgradedAt: NOW });

const harness = async () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore(storage);
  const economy = new WorldEconomyService(store, storage, () => NOW);
  const streaks = memoryStreakStore({ blitzResults: memoryBlitzResults(storage) });
  const country = memoryCountryStore();
  const service = new MatchService({
    storage, config: { ...DEFAULT_SERVER_CONFIG }, economy, now: () => NOW, streaks, country,
  });
  const app = createFetchApp({
    service,
    config: { ...DEFAULT_SERVER_CONFIG },
    country,
    card: {
      achievementsOf: achievementsCount(storage, economy),
      onlineBlitzBest: async (id) => (await streaks.onlineBlitz(id, NOW)).best,
    },
  });
  await storage.createPlayer(player(SUBJECT, 'BloomHeron'));
  await storage.createPlayer(player(QUIET, 'QuietFern'));
  const caller = await service.createGuest();
  return { storage, store, economy, streaks, country, service, app, caller };
};

type H = Awaited<ReturnType<typeof harness>>;

const get = async (h: H, path: string, token: string | null = h.caller.token) => {
  const res = await h.app(new Request(`http://test.local${path}`, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

/**
 * HARD: W W L W W W  -> the best run is 3.
 * BLITZ: W L W W D   -> the best run is 2 (the draw ends the second run).
 * EASY: one game that must not leak into either number.
 */
const seedPractice = async (h: H) => {
  await h.streaks.recordPractice(SUBJECT, [
    { id: 'h1', tier: 'hard', result: 'win' },
    { id: 'h2', tier: 'hard', result: 'win' },
    { id: 'h3', tier: 'hard', result: 'loss' },
    { id: 'h4', tier: 'hard', result: 'win' },
    { id: 'h5', tier: 'hard', result: 'win' },
    { id: 'h6', tier: 'hard', result: 'win' },
    { id: 'b1', tier: 'blitz', result: 'win' },
    { id: 'b2', tier: 'blitz', result: 'loss' },
    { id: 'b3', tier: 'blitz', result: 'win' },
    { id: 'b4', tier: 'blitz', result: 'win' },
    { id: 'b5', tier: 'blitz', result: 'draw' },
    { id: 'e1', tier: 'easy', result: 'win' },
  ], NOW);
};

describe('the offline row: completed games, and the two longest win runs', () => {
  it('reports the HARD run, the BLITZ run and the completed games, ignoring the other tiers', async () => {
    const h = await harness();
    await seedPractice(h);
    const { status, body } = await get(h, `/v1/players/${SUBJECT}/card`);
    expect(status).toBe(200);
    expect((body.profile as { offline: unknown }).offline).toEqual({ games: 12, hardStreak: 3, blitzStreak: 2 });
  });

  it('a player who never played Practice is a known 0 / 0 / 0, not unknown', async () => {
    const h = await harness();
    const { body } = await get(h, `/v1/players/${QUIET}/card`);
    expect((body.profile as { offline: unknown }).offline).toEqual({ games: 0, hardStreak: 0, blitzStreak: 0 });
  });

  it('a repeated game id counts once, exactly as the account counts it', async () => {
    const h = await harness();
    await seedPractice(h);
    // A retry of the same games (a second tab, the offline queue) must not extend anything.
    await seedPractice(h);
    const { body } = await get(h, `/v1/players/${SUBJECT}/card`);
    expect((body.profile as { offline: unknown }).offline).toEqual({ games: 12, hardStreak: 3, blitzStreak: 2 });
  });

  it('the one SQL read is a single indexed statement, and an unmigrated database reads null', async () => {
    const statements: string[] = [];
    const pool: PgPool = {
      query: async (text: string): Promise<PgQueryResult> => {
        statements.push(text);
        return { rows: [{ hard_streak: 3, blitz_streak: 2, games: 12 }] };
      },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    const streaks = postgresStreakStore(pool);
    await expect(streaks.profileStreaks(SUBJECT)).resolves.toEqual({ games: 12, hardStreak: 3, blitzStreak: 2 });
    expect(statements).toHaveLength(1);
    const sql = statements[0]!.toLowerCase();
    expect(sql).toContain('from practice_streaks');
    expect(sql).toContain('from practice_streak_games');
    // Only the two requested keys, and only completed games.
    expect(sql).toContain("tier = 'hard'");
    expect(sql).toContain("tier = 'blitz'");
    expect(sql).toContain("result in ('win','loss','draw')");
    // Nothing else may be read to answer it.
    for (const forbidden of ['matches', 'player_tokens', 'seed_wallets', 'offline_stats', 'player_identities']) {
      expect(sql).not.toContain(forbidden);
    }

    const missing: PgPool = {
      query: async (): Promise<PgQueryResult> => { throw Object.assign(new Error('no table'), { code: '42P01' }); },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    await expect(postgresStreakStore(missing).profileStreaks(SUBJECT)).resolves.toBeNull();
  });
});

describe('the card is the whole sheet in one answer', () => {
  it('carries the profile, the achievements count and the online Blitz streak together', async () => {
    const h = await harness();
    await seedPractice(h);
    const { status, body } = await get(h, `/v1/players/${SUBJECT}/card`);
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['achievements', 'headToHead', 'ok', 'onlineBlitzBest', 'profile', 'serverNow']);
    expect(body.achievements).toMatchObject({ done: expect.any(Number), total: expect.any(Number) });
    expect(typeof body.onlineBlitzBest).toBe('number');
    expect(body.headToHead).toEqual({ games: 0, youWins: 0, themWins: 0, draws: 0 });
    const profile = body.profile as Record<string, unknown>;
    expect(profile).toMatchObject({
      displayName: 'BloomHeron',
      tag: playerTag(SUBJECT),
      country: null,
      offline: { games: 12, hardStreak: 3, blitzStreak: 2 },
    });
  });

  it('carries no head-to-head on your OWN card, and does carry your own offline totals', async () => {
    const h = await harness();
    const self = await h.service.authenticate(h.caller.token);
    const own = await h.app(new Request(`http://test.local/v1/players/${self.id}/card`, {
      headers: { authorization: `Bearer ${h.caller.token}` },
    }));
    expect(own.status).toBe(200);
    const body = await own.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('headToHead');
    // One request for your own sheet: the account's classic offline totals ride the card.
    expect(body.ownOffline).toEqual({ games: 0, wins: 0, draws: 0, longestStreak: 0 });
  });

  it('a visitor never receives the subject\'s own offline totals', async () => {
    const h = await harness();
    const { body } = await get(h, `/v1/players/${SUBJECT}/card`);
    expect(body).not.toHaveProperty('ownOffline');
  });

  it('the stored country is served to a visitor, and nothing else is', async () => {
    const h = await harness();
    await h.country.save(SUBJECT, 'pl', NOW);
    const { body } = await get(h, `/v1/players/${SUBJECT}/card`);
    expect((body.profile as { country: unknown }).country).toBe('PL');
  });

  it('the OLD profile endpoint still works, and now carries the same offline row and flag', async () => {
    const h = await harness();
    await seedPractice(h);
    await h.country.save(SUBJECT, 'DE', NOW);
    const profile = await get(h, `/v1/players/${SUBJECT}/profile`);
    expect(profile.status).toBe(200);
    expect(profile.body.profile).toMatchObject({ country: 'DE', offline: { games: 12, hardStreak: 3, blitzStreak: 2 } });
  });

  it('an unknown player and a malformed id are the same 404, and a signed-out caller is 401', async () => {
    const h = await harness();
    for (const id of ['44444444-4444-4444-8444-444444444444', 'not-a-uuid']) {
      expect((await get(h, `/v1/players/${id}/card`)).status).toBe(404);
    }
    expect((await get(h, `/v1/players/${SUBJECT}/card`, null)).status).toBe(401);
  });
});

describe('the allow-list stays closed', () => {
  it('a visitor gets exactly these profile keys, and the offline row has exactly three', async () => {
    const h = await harness();
    await seedPractice(h);
    await h.country.save(SUBJECT, 'PL', NOW);
    const { body } = await get(h, `/v1/players/${SUBJECT}/card`);
    const profile = body.profile as Record<string, unknown>;
    expect(Object.keys(profile).sort()).toEqual([
      'colourId', 'connectedTiles', 'country', 'displayName', 'level', 'offline', 'online', 'tag', 'tiles',
    ]);
    expect(Object.keys(profile.offline as Record<string, unknown>).sort()).toEqual([
      'blitzStreak', 'games', 'hardStreak',
    ]);
    expect(Object.keys(profile.online as Record<string, unknown>).sort()).toEqual([
      'games', 'longestStreak', 'wins',
    ]);
    // A blunt second net over the WHOLE answer: no private noun anywhere in it.
    const json = JSON.stringify(body).toLowerCase();
    for (const forbidden of ['email', 'token', 'wallet', 'seed', 'device', 'identity', 'recorded_at', 'game_id']) {
      expect(json, `the card must never carry "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
