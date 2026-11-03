// ANOTHER PLAYER'S PROFILE (owner, 2026-11-01: "allow to look up other peoples profile on
// territory").
//
// Three things are easy to get wrong here, so each has its own gate:
//
//   1. THE AGGREGATION. Games and wins are COUNTS; the longest streak is a MAX of runs, never a
//      total. Only FINISHED matches count, and a player with no matches is a known 0 — not an
//      unknown. The memory backend exercises the endpoint's real semantics; the Postgres SQL is
//      checked for shape (a fake pool cannot execute window functions), and that gap is stated.
//   2. THE PRIVACY ALLOW-LIST. The response shape is closed. A test fails if an email, a Seeds
//      field, an offline record, a token or a device ever appears in the body — or in the SQL.
//   3. THE COST. One aggregate statement per profile (plus a one-off, cached catalogue probe for
//      the colour table), awaited SEQUENTIALLY, never in parallel. The Edge compute budget has been
//      lost once to an N+1 fan-out (`WORKER_RESOURCE_LIMIT`, HTTP 546), and abandoning a query with a
//      `Promise.race` deadline would leak the pool connection it holds — so there is no deadline.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import type { MatchRecord, PlayerRecord } from '../src/storage/types.js';
import { CURRENT_RULES_VERSION, newMatch } from '../../src/engine/index.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PgPool, PgQueryResult } from '../src/storage/postgres.js';
import { colourIdFor } from '../../src/tile-colours.js';
import { playerTag } from '../../src/player-tag.js';

const NOW = Date.UTC(2026, 10, 1, 12);
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const RIVAL = '22222222-2222-4222-8222-222222222222';
const QUIET = '33333333-3333-4333-8333-333333333333';

const player = (id: string, displayName: string | null): PlayerRecord =>
  ({ id, kind: 'account', displayName, createdAt: NOW, upgradedAt: NOW });

/** One finished (or still running) match with `subject` in it, on the given seat. */
const matchRecord = (id: string, opts: {
  winner: 0 | 1 | null; finishedAt?: number; status?: 'waiting' | 'active' | 'finished';
}): MatchRecord => {
  const state = newMatch(1);
  const finished = (opts.status ?? 'finished') === 'finished';
  return {
    id,
    inviteCode: `Code${id.slice(0, 4)}`,
    rulesVersion: CURRENT_RULES_VERSION,
    seed: 1,
    config: state.config,
    startingPlayer: 0,
    status: opts.status ?? 'finished',
    revision: 0,
    state,
    result: finished ? { winner: opts.winner, reason: 'knock', scores: [2, 1] } : null,
    createdAt: NOW,
    updatedAt: opts.finishedAt ?? NOW,
    finishedAt: finished ? opts.finishedAt ?? NOW : null,
    turnDeadlineAt: null,
    turnTimeoutMs: 86_400_000,
    graceUsed: [0, 0],
    gracePeriods: 1,
    graceExtensionMs: 86_400_000,
    turnStartRevision: 0,
    turnStartState: null,
    expiresAt: null,
    openQueue: false,
  };
};

const harness = async () => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore(storage);
  const economy = new WorldEconomyService(store, storage, () => NOW);
  const service = new MatchService({ storage, config: { ...DEFAULT_SERVER_CONFIG }, economy, now: () => NOW });
  const app = createFetchApp({ service, config: { ...DEFAULT_SERVER_CONFIG }, logger: () => undefined });
  await storage.createPlayer(player(SUBJECT, 'BloomHeron'));
  await storage.createPlayer(player(RIVAL, 'RYK'));
  await storage.createPlayer(player(QUIET, 'QuietFern'));
  const caller = await service.createGuest();
  const subject = await service.authenticate(caller.token);
  return { storage, store, economy, service, app, subject, caller };
};

const get = async (h: Awaited<ReturnType<typeof harness>>, id: string, token: string | null = h.caller.token) => {
  const res = await h.app(new Request(`http://test.local/v1/players/${encodeURIComponent(id)}/profile`, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

const addPair = async (h: Awaited<ReturnType<typeof harness>>, id: string, seat: 0 | 1) => {
  await h.storage.addParticipant({ matchId: id, playerId: SUBJECT, seat, joinedAt: NOW, lastSeenAt: NOW });
  await h.storage.addParticipant({ matchId: id, playerId: RIVAL, seat: seat === 0 ? 1 : 0, joinedAt: NOW, lastSeenAt: NOW });
};

const seedMatches = async (h: Awaited<ReturnType<typeof harness>>) => {
  // ORDERED BY finishedAt: win, win, loss, draw, win. Longest run = 2 (the first two), NOT 3
  // (which is the total number of wins) and NOT 1 (which would be only the last run).
  const plan: { id: string; winner: 0 | 1 | null; at: number; seat: 0 | 1 }[] = [
    { id: 'm1', winner: 0, at: NOW + 1_000, seat: 0 },
    { id: 'm2', winner: 1, at: NOW + 2_000, seat: 1 },
    { id: 'm3', winner: 1, at: NOW + 3_000, seat: 0 },
    { id: 'm4', winner: null, at: NOW + 4_000, seat: 0 },
    { id: 'm5', winner: 0, at: NOW + 5_000, seat: 0 },
  ];
  for (const m of plan) {
    await h.storage.createMatch(matchRecord(m.id, { winner: m.winner, finishedAt: m.at }));
    await addPair(h, m.id, m.seat);
  }
  // A running match and a match the subject is not in must both be excluded.
  await h.storage.createMatch(matchRecord('m6', { winner: null, status: 'active' }));
  await addPair(h, 'm6', 0);
  await h.storage.createMatch(matchRecord('m7', { winner: 0, finishedAt: NOW + 6_000 }));
  await h.storage.addParticipant({ matchId: 'm7', playerId: RIVAL, seat: 0, joinedAt: NOW, lastSeenAt: NOW });
  await h.storage.addParticipant({ matchId: 'm7', playerId: QUIET, seat: 1, joinedAt: NOW, lastSeenAt: NOW });
};

describe('the online record: counts sum, a streak is a MAX of runs, only finished matches count', () => {
  it('reports games, wins and the LONGEST run (not the win total)', async () => {
    const h = await harness();
    await seedMatches(h);
    const { status, body } = await get(h, SUBJECT);
    expect(status).toBe(200);
    expect((body.profile as { online: unknown }).online).toEqual({ games: 5, wins: 3, longestStreak: 2 });
  });

  it('a player with no matches is a known 0 / 0 / 0', async () => {
    const h = await harness();
    const { status, body } = await get(h, QUIET);
    expect(status).toBe(200);
    expect((body.profile as { online: unknown }).online).toEqual({ games: 0, wins: 0, longestStreak: 0 });
  });

  it('a draw breaks a winning run without scoring one', async () => {
    const h = await harness();
    // win, draw, win, win: the best run is 2, not 3 across the draw.
    const plan: { id: string; winner: 0 | 1 | null; at: number }[] = [
      { id: 'd1', winner: 0, at: NOW + 1_000 },
      { id: 'd2', winner: null, at: NOW + 2_000 },
      { id: 'd3', winner: 0, at: NOW + 3_000 },
      { id: 'd4', winner: 0, at: NOW + 4_000 },
    ];
    for (const m of plan) {
      await h.storage.createMatch(matchRecord(m.id, { winner: m.winner, finishedAt: m.at }));
      await addPair(h, m.id, 0);
    }
    const { body } = await get(h, SUBJECT);
    expect((body.profile as { online: unknown }).online).toEqual({ games: 4, wins: 3, longestStreak: 2 });
  });
});

describe('the public facts beside the record', () => {
  it('carries the name, the tag, the level, the tile count and the resolved colour', async () => {
    const h = await harness();
    h.store.claims.set('0,0', { cellId: '0,0', ownerId: SUBJECT, ownerName: 'BloomHeron', ownerLevel: null, claimedAt: NOW });
    h.store.claims.set('1,0', { cellId: '1,0', ownerId: SUBJECT, ownerName: 'BloomHeron', ownerLevel: null, claimedAt: NOW });
    h.store.claims.set('2,0', { cellId: '2,0', ownerId: RIVAL, ownerName: 'RYK', ownerLevel: null, claimedAt: NOW });
    h.store.colours.set(SUBJECT, 4);
    h.store.receipts.set('campaign:c1-7', {
      input: { playerId: SUBJECT, sourceKey: 'campaign:c1-7', mode: 'campaign', outcome: 'win', opponentId: null, now: NOW - 1 },
      awarded: 50,
      reason: null,
    });
    const { status, body } = await get(h, SUBJECT);
    expect(status).toBe(200);
    expect(body.profile).toEqual({
      displayName: 'BloomHeron',
      tag: playerTag(SUBJECT),
      level: 7,
      tiles: 2,
      connectedTiles: 2,
      colourId: 4,
      online: { games: 0, wins: 0, longestStreak: 0 },
    });
  });

  it('derives the palette colour when the player never chose one', async () => {
    const h = await harness();
    const { body } = await get(h, SUBJECT);
    const colourId = colourIdFor(SUBJECT, null);
    expect((body.profile as { colourId: number }).colourId).toBe(colourId);
    // The wire carries the SLOT, not a second copy of the palette: colourById is the client's job.
    expect(body.profile as Record<string, unknown>).not.toHaveProperty('colour');
  });
});

describe('the allow-list is closed: nothing private can appear', () => {
  it('returns exactly these keys, and nothing else', async () => {
    const h = await harness();
    await seedMatches(h);
    const { body } = await get(h, SUBJECT);
    expect(Object.keys(body).sort()).toEqual(['ok', 'profile', 'serverNow']);
    const profile = body.profile as Record<string, unknown>;
    expect(Object.keys(profile).sort()).toEqual([
      'colourId', 'connectedTiles', 'displayName', 'level', 'online', 'tag', 'tiles',
    ]);
    expect(Object.keys(profile.online as Record<string, unknown>).sort()).toEqual([
      'games', 'longestStreak', 'wins',
    ]);
    // A blunt second net: no private noun anywhere in the serialised answer.
    const json = JSON.stringify(body).toLowerCase();
    for (const forbidden of ['email', 'token', 'wallet', 'seed', 'device', 'offline', 'identity']) {
      expect(json, `the profile body must never carry "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('the SQL reads only the allow-listed tables and never a balance or an identity', async () => {
    const statements: string[] = [];
    const pool: PgPool = {
      query: async (text: string): Promise<PgQueryResult> => {
        statements.push(text);
        if (text.includes('information_schema.tables')) return { rows: [{ present: 1 }] };
        return {
          rows: [{
            display_name: 'BloomHeron', level: 7, tiles: 2, cell_ids: ['0,0','1,0'], colour_id: 4,
            games: 5, wins: 3, longest_streak: 2,
          }],
        };
      },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    const store = postgresWorldEconomyStore(pool);
    const publicRow = await store.publicProfile(SUBJECT);
    expect(publicRow?.connectedTiles).toBe(2);
    const sql = statements.find((text) => !text.includes('information_schema.tables')) ?? '';
    expect(sql, 'the profile is ONE statement').not.toBe('');
    // The tables it may read.
    expect(sql).toContain('from players');
    expect(sql).toContain('from world_claims');
    expect(sql).toContain('join match_participants');
    expect(sql).toContain('from matches');
    // The private side it must never touch.
    for (const forbidden of [
      'seed_wallets', 'seed_ledger', 'player_tokens', 'offline_stats', 'player_identities',
      'email', 'device_id', 'token_hash', 'balance',
    ]) {
      expect(sql.toLowerCase(), `the SQL must not read "${forbidden}"`).not.toContain(forbidden);
    }
    // The one receipts read IS the public campaign level: the opaque campaign key, no balance.
    expect(sql).toContain("substring(r.source_key from '^campaign:c[0-9]+-([0-9]+)$')");
    // Only finished matches can be counted.
    expect(sql.toLowerCase()).toContain("where m.status = 'finished' and m.result is not null");
    // The longest run comes from the window partition, not from the win count.
    expect(sql.toLowerCase()).toContain('partition by won');
  });
});

describe('the cost: one aggregate statement, plus a cached catalogue probe', () => {
  it('counts the statements with a recording pool', async () => {
    const statements: string[] = [];
    const pool: PgPool = {
      query: async (text: string): Promise<PgQueryResult> => {
        statements.push(text);
        if (text.includes('information_schema.tables')) return { rows: [{ present: 1 }] };
        return { rows: [{
          display_name: 'BloomHeron', level: null, tiles: 0, colour_id: null,
          games: 0, wins: 0, longest_streak: 0,
        }] };
      },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    const store = postgresWorldEconomyStore(pool);
    expect(await store.publicProfile(SUBJECT)).not.toBeNull();
    // First call: the colour-table catalogue probe + the ONE profile statement.
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('information_schema.tables');
    // After the probe is cached, every profile is exactly ONE statement, whatever its size.
    expect(await store.publicProfile(RIVAL)).not.toBeNull();
    expect(statements).toHaveLength(3);
    expect(statements.filter((text) => text.includes('with me as'))).toHaveLength(2);
  });

  it('is SEQUENTIAL: the store awaits its probe before the aggregate, never in parallel', async () => {
    // The Edge pool is `max: 2`; a fan-out of parallel reads is what queued three of five statements
    // and hung a previous endpoint (HTTP 546). This pins the order a fake pool actually sees.
    let inFlight = 0;
    let peak = 0;
    const statements: string[] = [];
    const pool: PgPool = {
      query: async (text: string): Promise<PgQueryResult> => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        statements.push(text);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        if (text.includes('information_schema.tables')) return { rows: [{ present: 1 }] };
        return { rows: [{ display_name: 'BloomHeron', level: 7, tiles: 2, cell_ids: ['0,0','1,0'], colour_id: 4, games: 5, wins: 3, longest_streak: 2 }] };
      },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    const store = postgresWorldEconomyStore(pool);
    await store.publicProfile(SUBJECT);
    // The probe lands before the profile statement starts, and nothing ever overlaps.
    expect(peak).toBe(1);
    expect(statements[0]).toContain('information_schema.tables');
    expect(statements[1]).toContain('with me as');
  });
});

describe('bad ids are the same honest 404', () => {
  it('404s an unknown player', async () => {
    const h = await harness();
    const { status, body } = await get(h, '44444444-4444-4444-8444-444444444444');
    expect(status).toBe(404);
    expect(body).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('404s a malformed id without a cast error', async () => {
    const h = await harness();
    for (const id of ['not-a-uuid', '11111111-1111-4111-8111', '..%2F..']) {
      const { status } = await get(h, id);
      expect(status, id).toBe(404);
    }
  });

  it('requires the caller to be signed in', async () => {
    const h = await harness();
    const res = await get(h, SUBJECT, null);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
  });
});


describe('authoritative connected territory',()=>{
 it('updates map standings and profiles from the same ownership, including a bridge cut',async()=>{
  const h=await harness();
  for(let q=0;q<5;q++)h.store.claims.set(`${q},0`,{cellId:`${q},0`,ownerId:SUBJECT,ownerName:'BloomHeron',ownerLevel:null,claimedAt:NOW});
  expect((await h.economy.world()).rankings.find(r=>r.ownerId===SUBJECT)).toMatchObject({connectedTiles:5,totalTiles:5});
  const bridge=h.store.claims.get('2,0')!;h.store.claims.set('2,0',{...bridge,ownerId:RIVAL});
  const world=await h.economy.world();
  expect(world.claims.filter(c=>c.ownerId===SUBJECT)).toHaveLength(4);
  expect(world.rankings.find(r=>r.ownerId===SUBJECT)).toMatchObject({connectedTiles:2,totalTiles:4});
  expect((await get(h,SUBJECT)).body.profile).toMatchObject({connectedTiles:2,tiles:4});
  h.store.claims.set('2,0',bridge);
  expect((await get(h,SUBJECT)).body.profile).toMatchObject({connectedTiles:5,tiles:5});
 });
});
