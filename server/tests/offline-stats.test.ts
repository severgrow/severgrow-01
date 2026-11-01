// THE OFFLINE GAME RECORD ACROSS DEVICES (migration 0022).
//
// Offline duels live in localStorage on the device that played them. The Profile screen's three
// numbers must belong to the ACCOUNT, so every device posts its running totals and the server
// keeps one row per (player, device). These tests pin the two decisions that are easy to get
// wrong: a streak is a MAX across devices (never a sum), and a cumulative snapshot can only raise
// a counter (a stale request must not erase progress).
//
// The SQL is exercised through a recording fake pool, so its shape is checked without a database.
// What a fake pool cannot prove is that Postgres runs it: the live SQL paths stay unverified until
// the migration is deployed (the same posture as the other storage unit tests).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { aggregateOfflineStats, mergeOfflineCounters, parseOfflineCounters } from '../src/offline.js';
import type { OfflineCounters } from '../src/protocol.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgClient, PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';

const counters = (over: Partial<OfflineCounters> = {}): OfflineCounters => ({
  deviceId: 'device-aaaa',
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  bestStreak: 0,
  ...over,
});

describe('the aggregate adds games/wins/draws and MAXes the streak', () => {
  it('sums played, wins and draws across devices', () => {
    const summary = aggregateOfflineStats([
      counters({ deviceId: 'phone-0001', played: 10, wins: 6, losses: 3, draws: 1, bestStreak: 2 }),
      counters({ deviceId: 'laptop-001', played: 5, wins: 2, losses: 2, draws: 1, bestStreak: 3 }),
    ]);
    expect(summary).toEqual({ games: 15, wins: 8, draws: 2, longestStreak: 3 });
  });

  it('takes the longest streak as the MAX, not the sum', () => {
    const summary = aggregateOfflineStats([
      counters({ deviceId: 'phone-0001', played: 10, wins: 6, bestStreak: 4 }),
      counters({ deviceId: 'laptop-001', played: 5, wins: 2, bestStreak: 9 }),
    ]);
    expect(summary.longestStreak).toBe(9);
    // The sum would have been 13: a streak nobody ever had.
    expect(summary.longestStreak).not.toBe(4 + 9);
  });

  it('ignores a third device with zeroes', () => {
    const twoDevices = aggregateOfflineStats([
      counters({ deviceId: 'phone-0001', played: 7, wins: 4, draws: 1, bestStreak: 3 }),
      counters({ deviceId: 'laptop-001', played: 2, wins: 1, draws: 0, bestStreak: 2 }),
    ]);
    const withIdle = aggregateOfflineStats([
      counters({ deviceId: 'phone-0001', played: 7, wins: 4, draws: 1, bestStreak: 3 }),
      counters({ deviceId: 'laptop-001', played: 2, wins: 1, draws: 0, bestStreak: 2 }),
      counters({ deviceId: 'tablet-001' }),
    ]);
    expect(withIdle).toEqual(twoDevices);
  });

  it('reads an empty record as all zeroes (never -Infinity from an empty maximum)', () => {
    expect(aggregateOfflineStats([])).toEqual({ games: 0, wins: 0, draws: 0, longestStreak: 0 });
  });
});

describe('a cumulative snapshot never moves a counter down', () => {
  it('keeps the greater of every counter when two snapshots are merged', () => {
    const stored = counters({ played: 10, wins: 6, losses: 3, draws: 1, bestStreak: 4 });
    const stale = counters({ played: 2, wins: 1, losses: 1, draws: 0, bestStreak: 1 });
    expect(mergeOfflineCounters(stored, stale)).toEqual(stored);
    const newer = counters({ played: 12, wins: 7, losses: 4, draws: 1, bestStreak: 8 });
    expect(mergeOfflineCounters(stored, newer)).toEqual({ ...newer, deviceId: stored.deviceId });
  });

  it('STORAGE: a lower snapshot does not reduce, a higher one raises, per device', async () => {
    const storage = new MemoryStorage();
    const first = await storage.mergeOfflineStats('player-a', counters({ played: 10, wins: 6, losses: 3, draws: 1, bestStreak: 4 }), 1_000);
    expect(first).toEqual({ games: 10, wins: 6, draws: 1, longestStreak: 4 });

    // A delayed/racing request carrying an older snapshot changes nothing.
    const stale = await storage.mergeOfflineStats('player-a', counters({ played: 2, wins: 1, losses: 1, draws: 0, bestStreak: 1 }), 2_000);
    expect(stale).toEqual({ games: 10, wins: 6, draws: 1, longestStreak: 4 });

    // Real progress is kept.
    const newer = await storage.mergeOfflineStats('player-a', counters({ played: 12, wins: 7, losses: 4, draws: 1, bestStreak: 8 }), 3_000);
    expect(newer).toEqual({ games: 12, wins: 7, draws: 1, longestStreak: 8 });
  });

  it('keeps one row per device: the second device adds to the first', async () => {
    const storage = new MemoryStorage();
    await storage.mergeOfflineStats('player-a', counters({ deviceId: 'phone-0001', played: 10, wins: 6, draws: 1, bestStreak: 4 }), 1_000);
    const summary = await storage.mergeOfflineStats('player-a', counters({ deviceId: 'laptop-001', played: 5, wins: 2, draws: 0, bestStreak: 9 }), 2_000);
    expect(summary).toEqual({ games: 15, wins: 8, draws: 1, longestStreak: 9 });
    // A third device that never played changes nothing.
    expect(await storage.mergeOfflineStats('player-a', counters({ deviceId: 'tablet-001' }), 3_000)).toEqual(summary);
    // ...and a standing read sees the same numbers.
    expect(await storage.offlineSummaryOf('player-a')).toEqual(summary);
  });

  it('is isolated per player: A\'s devices never appear in B\'s aggregate', async () => {
    const storage = new MemoryStorage();
    await storage.mergeOfflineStats('player-a', counters({ deviceId: 'phone-0001', played: 9, wins: 8, bestStreak: 7 }), 1_000);
    expect(await storage.offlineSummaryOf('player-b')).toEqual({ games: 0, wins: 0, draws: 0, longestStreak: 0 });
    await storage.mergeOfflineStats('player-b', counters({ deviceId: 'laptop-001', played: 3, wins: 1, bestStreak: 2 }), 2_000);
    expect(await storage.offlineSummaryOf('player-a')).toEqual({ games: 9, wins: 8, draws: 0, longestStreak: 7 });
    expect(await storage.offlineSummaryOf('player-b')).toEqual({ games: 3, wins: 1, draws: 0, longestStreak: 2 });
  });
});

describe('validation', () => {
  const invalid = (body: Record<string, unknown>): void => {
    let caught: unknown;
    try {
      parseOfflineCounters(body);
    } catch (error) {
      caught = error;
    }
    expect(caught, JSON.stringify(body)).toMatchObject({ code: 'INVALID_REQUEST' });
  };

  it('accepts a well-formed snapshot', () => {
    expect(parseOfflineCounters({ ...counters({ played: 4, wins: 2, losses: 1, draws: 1, bestStreak: 2 }) }))
      .toEqual({ deviceId: 'device-aaaa', played: 4, wins: 2, losses: 1, draws: 1, bestStreak: 2 });
  });

  it('rejects negative and non-integer counters', () => {
    invalid({ ...counters(), wins: -1 });
    invalid({ ...counters(), played: 4, wins: 2.5 });
    invalid({ ...counters(), played: 4, draws: 0.1 });
    invalid({ ...counters(), played: 4, bestStreak: Number.NaN });
    invalid({ ...counters(), played: 4, losses: Number.POSITIVE_INFINITY });
    invalid({ ...counters(), played: '4' });
  });

  it('rejects a counter above one billion', () => {
    invalid({ ...counters(), played: 1_000_000_001 });
    invalid({ ...counters(), played: 4, bestStreak: 1_000_000_001 });
    // The bound itself is allowed.
    expect(parseOfflineCounters({ ...counters(), played: 1_000_000_000 }).played).toBe(1_000_000_000);
  });

  it('rejects wins+losses+draws greater than played', () => {
    invalid({ ...counters(), played: 4, wins: 3, losses: 1, draws: 1 });
    // Equality is legal: every game ended in one of the three ways.
    expect(parseOfflineCounters({ ...counters(), played: 4, wins: 3, losses: 1, draws: 0 }).played).toBe(4);
  });

  it('rejects a bad deviceId: too short, too long, illegal characters, wrong type, missing', () => {
    invalid({ ...counters(), deviceId: 'short' });
    invalid({ ...counters(), deviceId: 'a'.repeat(65) });
    invalid({ ...counters(), deviceId: 'device/aaaa' });
    invalid({ ...counters(), deviceId: 'device aaaa' });
    invalid({ ...counters(), deviceId: 12345678 });
    invalid({ ...counters(), deviceId: undefined });
    // Both edges are legal.
    expect(parseOfflineCounters({ ...counters(), deviceId: 'a'.repeat(8) }).deviceId).toHaveLength(8);
    expect(parseOfflineCounters({ ...counters(), deviceId: 'a'.repeat(64) }).deviceId).toHaveLength(64);
  });
});

describe('migration 0022 is additive and locked down', () => {
  const sql = readFileSync(new URL('../migrations/0022_offline_stats.sql', import.meta.url), 'utf8')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  it('creates one row per (player, device), cascading with the account, with a player index', () => {
    expect(sql).toContain('create table if not exists offline_stats');
    expect(sql).toContain('primary key (player_id, device_id)');
    expect(sql).toContain('references players(id) on delete cascade');
    expect(sql).toContain('create index if not exists offline_stats_player_idx on offline_stats (player_id)');
  });

  it('enables RLS, revokes client roles and grants no policy', () => {
    expect(sql).toContain('alter table offline_stats enable row level security');
    expect(sql).toContain("revoke all on offline_stats from anon");
    expect(sql).toContain("revoke all on offline_stats from authenticated");
    expect(sql).not.toContain('create policy');
  });

  it('uses if not exists everywhere, so re-running it is safe', () => {
    const creates = sql.match(/create (table|index)[^;]*/g) ?? [];
    expect(creates.length).toBeGreaterThanOrEqual(2);
    for (const statement of creates) expect(statement).toContain('if not exists');
  });
});

describe('GET/POST /v1/players/me/offline', () => {
  const setup = () => {
    const storage = new MemoryStorage();
    let now = 5_000;
    const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
    const service = new MatchService({ storage, config, now: () => now });
    const app = createFetchApp({ service, config });
    type Json = Record<string, unknown> & {
      offline?: { games: number; wins: number; draws: number; longestStreak: number };
      code?: string;
      serverNow?: number;
    };
    const call = async (method: string, path: string, body: unknown, token?: string) => {
      const res = await app(
        new Request(`http://x${path}`, {
          method,
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      return { status: res.status, json: (await res.json()) as Json };
    };
    const token = async (): Promise<string> => (await service.createGuest()).token;
    return { storage, call, token, tick: () => (now += 1_000) };
  };

  it('reads zeroes before anything was posted, and writes nothing', async () => {
    const h = setup();
    const token = await h.token();
    const res = await h.call('GET', '/v1/players/me/offline', undefined, token);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, offline: { games: 0, wins: 0, draws: 0, longestStreak: 0 } });
    expect(typeof res.json.serverNow).toBe('number');
  });

  it('stores one device, then combines a second device, returning the fresh aggregate', async () => {
    const h = setup();
    const token = await h.token();
    const first = await h.call('POST', '/v1/players/me/offline', counters({ deviceId: 'phone-0001', played: 10, wins: 6, losses: 3, draws: 1, bestStreak: 4 }), token);
    expect(first.status).toBe(200);
    expect(first.json.offline).toEqual({ games: 10, wins: 6, draws: 1, longestStreak: 4 });

    h.tick();
    const second = await h.call('POST', '/v1/players/me/offline', counters({ deviceId: 'laptop-001', played: 5, wins: 2, losses: 3, draws: 0, bestStreak: 9 }), token);
    expect(second.json.offline).toEqual({ games: 15, wins: 8, draws: 1, longestStreak: 9 });

    const read = await h.call('GET', '/v1/players/me/offline', undefined, token);
    expect(read.json.offline).toEqual({ games: 15, wins: 8, draws: 1, longestStreak: 9 });
  });

  it('never lets a stale snapshot lower a stored counter', async () => {
    const h = setup();
    const token = await h.token();
    await h.call('POST', '/v1/players/me/offline', counters({ played: 10, wins: 6, losses: 3, draws: 1, bestStreak: 5 }), token);
    h.tick();
    const stale = await h.call('POST', '/v1/players/me/offline', counters({ played: 1, wins: 1, losses: 0, draws: 0, bestStreak: 1 }), token);
    expect(stale.json.offline).toEqual({ games: 10, wins: 6, draws: 1, longestStreak: 5 });
  });

  it('uses the token as the player: a body-supplied player id is ignored, and players stay isolated', async () => {
    const h = setup();
    const a = await h.token();
    const b = await h.token();
    const written = await h.call('POST', '/v1/players/me/offline', { ...counters({ played: 4, wins: 4 }), playerId: 'someone-else' }, a);
    expect(written.status).toBe(200);
    expect((await h.call('GET', '/v1/players/me/offline', undefined, a)).json.offline).toEqual({ games: 4, wins: 4, draws: 0, longestStreak: 0 });
    expect((await h.call('GET', '/v1/players/me/offline', undefined, b)).json.offline).toEqual({ games: 0, wins: 0, draws: 0, longestStreak: 0 });
  });

  it('requires a bearer token on both methods', async () => {
    const h = setup();
    expect((await h.call('GET', '/v1/players/me/offline', undefined)).status).toBe(401);
    expect((await h.call('POST', '/v1/players/me/offline', counters({ played: 1 }))).status).toBe(401);
  });

  it('rejects a bad snapshot with the existing INVALID_REQUEST shape and stores nothing', async () => {
    const h = setup();
    const token = await h.token();
    for (const body of [
      { ...counters(), played: -1 },
      { ...counters(), played: 2.5 },
      { ...counters(), played: 1_000_000_001 },
      { ...counters(), played: 2, wins: 2, losses: 1 },
      { ...counters(), deviceId: 'short' },
      { ...counters(), deviceId: 'a'.repeat(65) },
      { ...counters(), deviceId: 'no/slashes' },
      {},
    ]) {
      const res = await h.call('POST', '/v1/players/me/offline', body, token);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.code, JSON.stringify(body)).toBe('INVALID_REQUEST');
    }
    expect((await h.call('GET', '/v1/players/me/offline', undefined, token)).json.offline).toEqual({ games: 0, wins: 0, draws: 0, longestStreak: 0 });
  });
});

describe('the Postgres adapter', () => {
  const SUMMARY: PgRow = { games: '15', wins: '8', draws: '1', longest_streak: '9' };

  /** A recording pool: `from offline_stats` is the aggregate read; everything else is recorded. */
  const fakePool = () => {
    const calls: { text: string; values: readonly unknown[] }[] = [];
    const respond = (text: string, values: readonly unknown[]): PgQueryResult => {
      calls.push({ text, values });
      if (text.includes('from offline_stats')) return { rows: [SUMMARY] };
      return { rows: [] };
    };
    const client: PgClient = { query: async (text, values = []) => respond(text, values) };
    const pool: PgPool = {
      query: async (text, values = []) => respond(text, values),
      connect: async () => client,
    };
    return { pool, calls, statements: () => calls.map((call) => call.text.replace(/\s+/g, ' ').trim()) };
  };

  it('GET is ONE aggregate query: sums plus max(best_streak), no per-device reads', async () => {
    const h = fakePool();
    const summary = await postgresStorage(h.pool).offlineSummaryOf('player-a');
    expect(summary).toEqual({ games: 15, wins: 8, draws: 1, longestStreak: 9 });
    const reads = h.calls.filter((call) => call.text.includes('from offline_stats'));
    expect(reads).toHaveLength(1);
    const sql = reads[0]!.text.replace(/\s+/g, ' ').toLowerCase();
    expect(sql).toContain('sum(played)');
    expect(sql).toContain('sum(wins)');
    expect(sql).toContain('sum(draws)');
    expect(sql).toContain('max(best_streak)');
    expect(sql).not.toContain('group by');
    expect(reads[0]!.values).toEqual(['player-a']);
  });

  it('POST is one upsert that uses greatest for every counter, in a transaction', async () => {
    const h = fakePool();
    const summary = await postgresStorage(h.pool).mergeOfflineStats(
      'player-a',
      counters({ deviceId: 'phone-0001', played: 10, wins: 6, losses: 3, draws: 1, bestStreak: 4 }),
      1_234,
    );
    expect(summary).toEqual({ games: 15, wins: 8, draws: 1, longestStreak: 9 });
    const statements = h.statements();
    const upsert = statements.find((text) => text.includes('insert into offline_stats'));
    expect(upsert).toBeDefined();
    expect(upsert!.toLowerCase()).toContain('on conflict (player_id, device_id) do update set');
    for (const column of ['played', 'wins', 'losses', 'draws', 'best_streak']) {
      expect(upsert!.toLowerCase()).toContain(`${column} = greatest(offline_stats.${column}, excluded.${column})`);
    }
    expect(upsert).toContain('$2'); // the device id is written, never a client player id
    expect(statements[0]).toBe('begin');
    expect(statements).toContain('commit');
    // The aggregate still runs exactly once, in the same transaction.
    expect(h.calls.filter((call) => call.text.includes('from offline_stats'))).toHaveLength(1);
  });
});
