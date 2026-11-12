// FIND OPPONENT IN TIERS (owner, 2026-11-12): "first 7s looking only for online players to create a
// duel together, after 7 seconds looking for any open games that other people sent ... it can open
// game as soon as we know there is no games waiting".
//
//   * A searcher on the search screen says so every few seconds (a repeat Find: the HEARTBEAT, which
//     refreshes their waiting game's `updatedAt`). A search seen within FIND_PRESENT_MS is PRESENT.
//   * For the first FIND_LIVE_WINDOW_MS of a search, only a PRESENT searcher is joined: two people
//     who are here right now get their duel at once (a normal duel; Blitz is offered inside it).
//   * After that window, a heartbeat may join the oldest open game someone left earlier (its owner
//     away), retiring the searcher's own open game in the same step.
//   * When nobody present is waiting, the search is parked AT ONCE as an open game anyone can join.
//   * The answer says how many other open games are waiting, so the page can say which phase it is in.
//   * A heartbeat is rate-limited on its own budget, never the fresh-search budget.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';
import { postgresStorage, type PgPool } from '../src/storage/postgres.js';
import type { Storage } from '../src/storage/types.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { FIND_LIVE_WINDOW_MS, FIND_PRESENT_MS, MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { ApiError } from '../src/errors.js';

const config = (overrides: Partial<ServerConfig['rateLimits']> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  rateLimits: { ...DEFAULT_SERVER_CONFIG.rateLimits, guestPerIpPerHour: 1000, joinPerPlayerPerHour: 1000, joinPerIpPerHour: 1000, ...overrides },
});

// The same rules on real rows, when an isolated LOCAL database is given (never production).
const localUrl = process.env.FIND_TEST_DATABASE_URL;
if (localUrl && !['localhost', '127.0.0.1'].includes(new URL(localUrl).hostname))
  throw new Error('These tests require an isolated LOCAL database, never production.');
let pool: Pool | undefined;
beforeAll(async () => {
  if (!localUrl) return;
  pool = new Pool({ connectionString: localUrl, max: 8 });
  await pool.query(
    "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;",
  );
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort().filter((f) => f.endsWith('.sql') && !/^000[57]_/.test(f)))
    await pool.query(readFileSync(new URL(f, dir), 'utf8'));
});
afterAll(async () => { await pool?.end(); });
let storageKind: 'memory' | 'postgres' = 'memory';

const harness = (c = config()) => {
  const storage: Storage = storageKind === 'memory' ? new MemoryStorage() : postgresStorage(pool as unknown as PgPool);
  let now = 5_000_000;
  const service = new MatchService({ storage, config: c, now: () => now });
  const guest = async (name: string) => {
    const created = await service.createGuest(name);
    return service.authenticate(created.token);
  };
  return { service, guest, advance: (ms: number) => { now += ms; } };
};

for (const kind of ['memory', ...(localUrl ? ['postgres'] : [])] as const)
describe(`${kind}: find opponent tiers`, () => {
  beforeEach(async () => {
    storageKind = kind as 'memory' | 'postgres';
    // Each test starts with an empty queue (the rows are shared on Postgres).
    if (kind === 'postgres') await pool!.query("delete from matches where open_queue = true");
  });
  it('two players searching at the same time are paired at once', async () => {
    const h = harness();
    const a = await h.guest('A');
    const b = await h.guest('B');
    const parked = await h.service.findOpponent(a);
    expect(parked.paired).toBe(false);
    h.advance(2_000);
    const joined = await h.service.findOpponent(b);
    expect(joined.paired).toBe(true);
    expect(joined.match.matchId).toBe(parked.match.matchId);
  });

  it('a present searcher keeps being present through heartbeats', async () => {
    const h = harness();
    const a = await h.guest('A');
    const b = await h.guest('B');
    const parked = await h.service.findOpponent(a);
    for (let i = 0; i < 10; i++) { h.advance(3_000); await h.service.findOpponent(a); }
    const joined = await h.service.findOpponent(b);
    expect(joined.paired).toBe(true);
    expect(joined.match.matchId).toBe(parked.match.matchId);
  });

  it('in the first seconds, an open game whose owner is away is NOT joined; the search opens its own game', async () => {
    const h = harness();
    const away = await h.guest('Away');
    const left = await h.service.findOpponent(away);
    h.advance(FIND_PRESENT_MS + 60_000);
    const b = await h.guest('B');
    const first = await h.service.findOpponent(b);
    expect(first.paired).toBe(false);
    expect(first.match.matchId).not.toBe(left.match.matchId);
    expect(first.othersWaiting).toBe(1);
  });

  it('after the live window, the next heartbeat joins that open game and retires its own', async () => {
    const h = harness();
    const away = await h.guest('Away');
    const left = await h.service.findOpponent(away);
    h.advance(FIND_PRESENT_MS + 60_000);
    const b = await h.guest('B');
    const own = await h.service.findOpponent(b);
    h.advance(3_000);
    expect((await h.service.findOpponent(b)).paired).toBe(false);
    h.advance(FIND_LIVE_WINDOW_MS);
    const later = await h.service.findOpponent(b);
    expect(later.paired).toBe(true);
    expect(later.match.matchId).toBe(left.match.matchId);
    // B's own open game is gone: nobody else can be seated in it.
    const c = await h.guest('C');
    const cSearch = await h.service.findOpponent(c);
    expect(cSearch.match.matchId).not.toBe(own.match.matchId);
    expect(cSearch.paired).toBe(false);
  });

  it('with nothing waiting anywhere, the search opens its game at once and says nobody else is waiting', async () => {
    const h = harness();
    const a = await h.guest('A');
    const res = await h.service.findOpponent(a);
    expect(res.paired).toBe(false);
    expect(res.othersWaiting).toBe(0);
  });

  it('a heartbeat uses its own budget, not the fresh-search budget', async () => {
    const h = harness(config({ joinPerPlayerPerHour: 2, searchHeartbeatPerPlayerPerHour: 5 }));
    const a = await h.guest('A');
    await h.service.findOpponent(a);
    for (let i = 0; i < 5; i++) await h.service.findOpponent(a);
    let caught: unknown;
    try { await h.service.findOpponent(a); } catch (error) { caught = error; }
    expect((caught as ApiError).code).toBe('RATE_LIMITED');
  });
});
