// Real database integration: these run against the actual Postgres/Supabase instance named by
// DATABASE_URL and are SKIPPED when it is not set (so `npm run check` stays green in CI).
//
//   npm run server:migrate      # apply the schema first
//   npm run server:db-test      # run this file
//
// It proves what the fake-pool tests cannot: real transactional locking under concurrency, real
// persistence across a new connection, real rollbacks, real RLS/privilege enforcement, and a full
// two-guest create/join/play slice written to and read back from disk.
//
// Data is created with unique ids and deleted again in afterAll.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PgClient, PgPool } from '../../server/src/storage/postgres.js';
import { poolFromUrl, redactUrl } from '../../server/src/storage/pg-pool.js';
import { postgresStorage } from '../../server/src/storage/postgres.js';
import { MatchService } from '../../server/src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { ApiError } from '../../server/src/errors.js';
import { hashToken } from '../../server/src/ids.js';
import { loadMigrations, migrate } from '../scripts/migrate.js';
import type { Action } from '../../src/engine/index.js';
import type { MatchRecord, MoveRecord, PlayerRecord, Storage } from '../../server/src/storage/types.js';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const enabled = DATABASE_URL.length > 0;

const PLAYERS: string[] = [];
const MATCHES: string[] = [];

/** The suite is skipped (not failed) when there is no database to talk to. */
const suite = describe.skipIf(!enabled);

let pool: PgPool;
let service: MatchService;

const guest = async (name: string | null = null) => {
  const created = await service.createGuest(name);
  PLAYERS.push(created.player.id);
  return created;
};

const newMatchFor = async (displayName: string) => {
  const a = await guest(displayName);
  const pa = await service.authenticate(a.token);
  const created = await service.createMatch(pa);
  MATCHES.push(created.match.matchId);
  const b = await guest(`${displayName}-B`);
  const pb = await service.authenticate(b.token);
  await service.joinMatch(pb, created.match.inviteCode);
  return { tokenA: a.token, tokenB: b.token, pa, pb, matchId: created.match.matchId, inviteCode: created.match.inviteCode };
};

const actorOf = async (pa: PlayerRecord, pb: PlayerRecord, matchId: string) => {
  const va = await service.viewPayload(pa, matchId);
  if (va.legalActions.length > 0) return { player: pa, revision: va.revision, legal: va.legalActions };
  const vb = await service.viewPayload(pb, matchId);
  if (vb.legalActions.length > 0) return { player: pb, revision: vb.revision, legal: vb.legalActions };
  return null;
};

const rowCount = async (sql: string, values: readonly unknown[] = []): Promise<number> => {
  const { rows } = await pool.query(sql, values);
  return Number(rows[0]?.n ?? 0);
};

suite('real database: schema and migration process', () => {
  beforeAll(() => {
    pool = poolFromUrl(DATABASE_URL, { max: 8 });
    service = new MatchService({ storage: postgresStorage(pool), config: DEFAULT_SERVER_CONFIG });
  });

  afterAll(async () => {
    // Remove everything this run created (matches cascade to participants and moves).
    try {
      if (MATCHES.length > 0) await pool.query('delete from matches where id = any($1::uuid[])', [MATCHES]);
      if (PLAYERS.length > 0) await pool.query('delete from players where id = any($1::uuid[])', [PLAYERS]);
    } finally {
      await (pool as unknown as { end?: () => Promise<void> }).end?.();
    }
  });

  it('connects and reports the server version', async () => {
    const { rows } = await pool.query('select version() as v');
    expect(String(rows[0]?.v)).toMatch(/PostgreSQL/);
    console.log(`    connected: ${redactUrl(DATABASE_URL)}`);
    console.log(`    ${String(rows[0]?.v).split(' ').slice(0, 3).join(' ')}`);
  });

  it('has every migration applied, with matching checksums', async () => {
    // Re-running migrate must be a no-op: the schema is already there and unchanged.
    const migrations = loadMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    const result = await migrate(pool);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(migrations.map((m) => m.version));
    expect(result.pending).toEqual([]);
  });

  it('created the five tables', async () => {
    for (const table of ['players', 'player_tokens', 'matches', 'match_participants', 'match_moves', 'schema_migrations']) {
      expect(await rowCount('select count(*)::int as n from information_schema.tables where table_schema = $1 and table_name = $2', ['public', table])).toBe(1);
    }
  });

  it('has the columns and constraints the adapter relies on', async () => {
    const cols = async (table: string): Promise<string[]> => {
      const { rows } = await pool.query(
        'select column_name from information_schema.columns where table_schema = $1 and table_name = $2',
        ['public', table],
      );
      return rows.map((r) => String(r.column_name)).sort();
    };
    expect(await cols('matches')).toEqual(
      expect.arrayContaining(['id', 'invite_code', 'rules_version', 'seed', 'config', 'starting_player', 'status', 'revision', 'state', 'result', 'created_at', 'updated_at', 'finished_at']),
    );
    expect(await cols('match_moves')).toEqual(
      expect.arrayContaining(['match_id', 'revision', 'seat', 'player_id', 'action', 'events', 'request_id', 'created_at']),
    );
    // The idempotency unique constraint is what makes retries safe.
    const unique = await pool.query(
      `select conname from pg_constraint where contype = 'u' and conrelid = 'match_moves'::regclass`,
    );
    expect(unique.rows.length).toBeGreaterThan(0);
  });

  it('has Row Level Security enabled on every table', async () => {
    const { rows } = await pool.query(
      `select relname, relrowsecurity from pg_class
       where relname = any($1::text[]) and relnamespace = 'public'::regnamespace`,
      [['players', 'player_tokens', 'matches', 'match_participants', 'match_moves', 'schema_migrations']],
    );
    expect(rows.length).toBe(6);
    for (const row of rows) expect(row.relrowsecurity, `${String(row.relname)} must have RLS enabled`).toBe(true);
  });

  it('denies the Supabase client roles any access to authoritative tables', async () => {
    const { rows } = await pool.query(
      `select rolname from pg_roles where rolname in ('anon', 'authenticated')`,
    );
    const roles = rows.map((r) => String(r.rolname));
    if (roles.length === 0) {
      console.log('    no anon/authenticated roles on this database — skipping the role check');
      return;
    }
    for (const role of roles) {
      for (const table of ['matches', 'players', 'player_tokens', 'match_participants', 'match_moves']) {
        const { rows: priv } = await pool.query('select has_table_privilege($1, $2, $3) as ok', [role, table, 'select']);
        expect(priv[0]?.ok, `${role} must not be able to select ${table}`).toBe(false);
      }
    }
    // And prove it by switching into the role.
    const client = (await pool.connect()) as PgClient;
    try {
      await client.query(`set role ${roles[0]}`);
      await expect(client.query('select * from matches limit 1')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('reset role').catch(() => undefined);
      client.release?.();
    }
  });
});

suite('real database: storage round-trips', () => {
  it('stores and finds a player by its token hash, never by the token', async () => {
    const storage: Storage = postgresStorage(pool);
    const created = await guest('Round Trip');
    const player = (await storage.playerById(created.player.id)) as PlayerRecord;
    expect(player.kind).toBe('guest');
    expect(player.displayName).toBe('Round Trip');

    const tokenHash = hashToken(created.token);
    expect((await storage.playerByTokenHash(tokenHash))?.id).toBe(created.player.id);
    expect(await storage.playerByTokenHash(created.token)).toBeNull();
    // The raw token must not be stored anywhere.
    expect(await rowCount('select count(*)::int as n from player_tokens where token_hash = $1', [created.token])).toBe(0);
  });

  it('persists a match row with its immutable rules version, seed and config', async () => {
    const { matchId, inviteCode } = await newMatchFor('Persist');
    const stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    expect(stored.inviteCode).toBe(inviteCode);
    expect(stored.rulesVersion).toBe(DEFAULT_SERVER_CONFIG.rulesVersion);
    expect(Number.isInteger(stored.seed)).toBe(true);
    expect([0, 1]).toContain(stored.startingPlayer);
    expect(stored.config).toMatchObject({ boardRadius: 3 });
    expect(stored.status).toBe('active');
    expect(stored.revision).toBe(0);
  });

  it('reads a match back through a brand-new pool (proves it is on disk, not in memory)', async () => {
    const { matchId, inviteCode } = await newMatchFor('Restart');
    await (pool as unknown as { end?: () => Promise<void> }).end?.(); // drop the current connections
    const freshPool = poolFromUrl(DATABASE_URL, { max: 4 });
    try {
      const freshStorage = postgresStorage(freshPool);
      const byId = (await freshStorage.matchById(matchId)) as MatchRecord;
      const byCode = (await freshStorage.matchByInviteCode(inviteCode)) as MatchRecord;
      expect(byId.revision).toBe(0);
      expect(byId.rulesVersion).toBe(DEFAULT_SERVER_CONFIG.rulesVersion);
      expect(byCode.id).toBe(matchId);
      const participants = await freshStorage.participantsOf(matchId);
      expect(participants.map((p) => p.seat).sort()).toEqual([0, 1]);
    } finally {
      await (freshPool as unknown as { end?: () => Promise<void> }).end?.();
      pool = poolFromUrl(DATABASE_URL, { max: 8 }); // restore for the remaining tests
      service = new MatchService({ storage: postgresStorage(pool), config: DEFAULT_SERVER_CONFIG });
    }
  });
});

suite('real database: a persisted two-guest match', () => {
  it('creates, joins and plays a match entirely through real rows', async () => {
    const { pa, pb, matchId } = await newMatchFor('Slice');
    // The row exists and starts waiting for a second seat to be filled.
    expect(await rowCount('select count(*)::int as n from match_participants where match_id = $1', [matchId])).toBe(2);

    const next = (await actorOf(pa, pb, matchId))!;
    expect(next.legal.length).toBeGreaterThan(0);
    const action = next.legal[0]! as Action;
    const submitted = await service.submitAction(next.player, matchId, {
      expectedRevision: next.revision,
      requestId: `slice-${matchId}`,
      action,
    });
    expect(submitted.replayed).toBe(false);
    expect(submitted.player.revision).toBe(1);

    // The move is a real row, tied to the seat from the database.
    const seat = next.player.id === pa.id ? 0 : 1;
    expect(await rowCount('select count(*)::int as n from match_moves where match_id = $1 and revision = 1 and seat = $2', [matchId, seat])).toBe(1);
    const stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    expect(stored.revision).toBe(1);
    expect(stored.state.turnNumber).toBeGreaterThanOrEqual(1);
    expect(stored.state.deck.length).toBeGreaterThan(0);

    // Both seats see revision 1, and neither payload leaks hidden state.
    const va = await service.viewPayload(pa, matchId);
    const vb = await service.viewPayload(pb, matchId);
    expect(va.revision).toBe(1);
    expect(vb.revision).toBe(1);
    for (const payload of [va, vb]) {
      for (const key of ['seed', 'deck', 'hands', 'history', 'fruitKnown', 'reshuffles']) {
        expect(Object.keys(payload.view)).not.toContain(key);
      }
      const seen = new Set([...JSON.stringify(payload).matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])));
      for (const card of stored.state.deck) expect(seen.has(card.id)).toBe(false);
    }
  });

  it('applies a repeated request id exactly once, at the database level', async () => {
    const { pa, pb, matchId } = await newMatchFor('Idempotent');
    const next = (await actorOf(pa, pb, matchId))!;
    const request = { expectedRevision: next.revision, requestId: `dup-${matchId}`, action: next.legal[0]! as Action };
    const first = await service.submitAction(next.player, matchId, request);
    const second = await service.submitAction(next.player, matchId, request);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.player.revision).toBe(first.player.revision);
    expect(await rowCount('select count(*)::int as n from match_moves where match_id = $1', [matchId])).toBe(1);
  });
});

suite('real database: concurrency and atomicity', () => {
  it('lets only one of two racing moves win the same revision', async () => {
    const { pa, pb, matchId } = await newMatchFor('Race');
    const next = (await actorOf(pa, pb, matchId))!;
    const decideBoth = async (requestId: string) =>
      postgresStorage(pool).commitMove({
        matchId,
        playerId: next.player.id,
        expectedRevision: 0,
        requestId,
        now: Date.now(),
        decide: ({ match }) => ({
          kind: 'apply',
          nextState: match.state,
          events: [],
          action: next.legal[0]! as Action,
          status: 'active',
          result: null,
        }),
      });

    // Fire both without awaiting in between: they must serialise on the match row lock.
    const [a, b] = await Promise.all([decideBoth(`race-a-${matchId}`), decideBoth(`race-b-${matchId}`)]);
    const outcomes = [a, b];
    const ok = outcomes.filter((r) => r.ok);
    const failed = outcomes.filter((r) => !r.ok);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as { code: string }).code).toMatch(/STALE_REVISION/);

    // Exactly one move row, and the revision advanced exactly once.
    const stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    expect(stored.revision).toBe(1);
    expect(await rowCount('select count(*)::int as n from match_moves where match_id = $1', [matchId])).toBe(1);
  });

  it('applies one of ten identical retries exactly once', async () => {
    const { pa, pb, matchId } = await newMatchFor('Storm');
    const next = (await actorOf(pa, pb, matchId))!;
    const same = () =>
      postgresStorage(pool).commitMove({
        matchId,
        playerId: next.player.id,
        expectedRevision: 0,
        requestId: `storm-${matchId}`,
        now: Date.now(),
        decide: ({ match }) => ({
          kind: 'apply',
          nextState: match.state,
          events: [],
          action: next.legal[0]! as Action,
          status: 'active',
          result: null,
        }),
      });
    const results = await Promise.all(Array.from({ length: 10 }, same));
    expect(results.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.replayed)).toHaveLength(9);
    expect(await rowCount('select count(*)::int as n from match_moves where match_id = $1 and request_id = $2', [matchId, `storm-${matchId}`])).toBe(1);
    const stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    expect(stored.revision).toBe(1);
  });

  it('rolls back a rejected move and leaves the match untouched', async () => {
    const { pa, pb, matchId } = await newMatchFor('Rollback');
    const next = (await actorOf(pa, pb, matchId))!;
    // A stale revision must not write anything.
    await expect(
      service.submitAction(next.player, matchId, { expectedRevision: 99, requestId: `stale-${matchId}`, action: next.legal[0]! as Action }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(await rowCount('select count(*)::int as n from match_moves where match_id = $1', [matchId])).toBe(0);
    let stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    expect(stored.revision).toBe(0);

    // An illegal move must not write anything either.
    await expect(
      service.submitAction(next.player, matchId, { expectedRevision: 0, requestId: `illegal-${matchId}`, action: { t: 'RotPick', coord: { q: 0, r: 0 } } }),
    ).rejects.toBeInstanceOf(ApiError);
    stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    expect(stored.revision).toBe(0);
    expect(await rowCount('select count(*)::int as n from match_moves where match_id = $1', [matchId])).toBe(0);

    // The connection is still healthy after those rollbacks.
    const next2 = (await actorOf(pa, pb, matchId))!;
    const ok = await service.submitAction(next2.player, matchId, { expectedRevision: 0, requestId: `good-${matchId}`, action: next2.legal[0]! as Action });
    expect(ok.replayed).toBe(false);
    expect(ok.player.revision).toBe(1);
  });

  it('rolls back a real constraint violation and keeps the pool usable', async () => {
    const { inviteCode, matchId } = await newMatchFor('Constraint');
    const storage = postgresStorage(pool);
    const existing = (await storage.matchById(matchId)) as MatchRecord;
    // Re-inserting the same invite code violates a real unique index.
    const clash = await storage.createMatch({ ...existing, id: existing.id });
    expect(clash.ok).toBe(false);
    if (clash.ok) return;
    expect(clash.code).toMatch(/DUPLICATE_INVITE_CODE|23505/i);
    // The pool still answers afterwards.
    expect((await storage.matchById(matchId))?.inviteCode).toBe(inviteCode);
  });
});

suite('real database: player views never leak', () => {
  it('hides the seed, the deck and the opponent hand for both seats', async () => {
    const { pa, pb, matchId } = await newMatchFor('Privacy');
    const stored = (await postgresStorage(pool).matchById(matchId)) as MatchRecord;
    for (const [player, seat] of [
      [pa, 0],
      [pb, 1],
    ] as const) {
      const payload = await service.viewPayload(player, matchId);
      expect(payload.seat).toBe(seat);
      const text = JSON.stringify(payload);
      const seen = new Set([...text.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])));
      for (const card of stored.state.deck) expect(seen.has(card.id), 'deck card leaked').toBe(false);
      const opponentHand = stored.state.hands[seat === 0 ? 1 : 0]!;
      for (const card of opponentHand) expect(seen.has(card.id), 'opponent card leaked').toBe(false);
      // The viewer's own hand is present.
      expect(payload.view.hand.map((c) => c.id)).toEqual(stored.state.hands[seat]!.map((c) => c.id));
    }
  });

  it('hides the opponent deck draws in the persisted event stream', async () => {
    const { pa, pb, matchId } = await newMatchFor('Events');
    const next = (await actorOf(pa, pb, matchId))!;
    await service.submitAction(next.player, matchId, { expectedRevision: 0, requestId: `ev-${matchId}`, action: next.legal[0]! as Action });
    // Read the raw stored events directly (they are the un-filtered source).
    const moves: MoveRecord[] = await postgresStorage(pool).movesOf(matchId, 0);
    expect(moves).toHaveLength(1);
    const viewA = await service.viewPayload(pa, matchId);
    for (const event of viewA.events) {
      if (event.t === 'Draw' && event.from === 'deck' && event.player !== viewA.seat) expect(event.card).toBeUndefined();
    }
  });
});
