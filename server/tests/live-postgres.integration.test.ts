// Live duels against a REAL Postgres (skipped unless LIVE_DATABASE_URL is set).
//
//   LIVE_DATABASE_URL=postgres://postgres@127.0.0.1:55432/futalive npx vitest run server/tests/live-postgres.integration.test.ts
//
// Use a THROWAWAY database that has Supabase-like `anon` / `authenticated` roles. The suite applies
// every migration except 0005 (pg_cron/pg_net are Supabase extensions) into a fresh schema state,
// then proves: RLS + revokes on every live table/column (anon/authenticated DENIED with 42501),
// nothing in the realtime publication, the one-pending index, and real row-locked races.
import { mkdtempSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';
import { MatchService } from '../src/service.js';
import { postgresLiveStore } from '../src/live/postgres.js';
import { createLiveRuntime } from '../src/live/runtime.js';
import type { LiveService } from '../src/live/service.js';
import { migrate } from '../scripts/migrate.js';
import { ENTRY, LIMIT, liveTestConfig, serverTestConfig } from './live-harness.js';

const URL_ = (process.env.LIVE_DATABASE_URL ?? '').trim();
const suite = describe.skipIf(URL_.length === 0);
if (!URL_) console.warn('\n*** LIVE POSTGRES TESTS SKIPPED — LIVE_DATABASE_URL is not set ***\n');

let pool: PgPool & { end?: () => Promise<void> };
let service: MatchService;
let live: LiveService;
let clock = 1_800_000_000_000;

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return String((e as { code?: unknown }).code ?? e);
  }
};

const pair = async () => {
  const ga = await service.createGuest();
  const gb = await service.createGuest();
  const a = await service.authenticate(ga.token);
  const b = await service.authenticate(gb.token);
  const m = await service.createMatch(a);
  await service.joinMatch(b, m.match.inviteCode);
  await live.presence(a, 'idle', null);
  await live.presence(b, 'idle', null);
  return { a, b, matchId: m.match.matchId };
};

const denied = async (role: string, sql: string): Promise<string> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query(sql);
    return 'ALLOWED';
  } catch (e) {
    return String((e as { code?: unknown }).code);
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release?.();
  }
};

suite('live duels on real Postgres', () => {
  beforeAll(async () => {
    pool = poolFromUrl(URL_) as typeof pool;
    const dir = mkdtempSync(join(tmpdir(), 'futa-live-mig-'));
    const src = fileURLToPath(new URL('../migrations', import.meta.url));
    for (const f of readdirSync(src)) if (f.endsWith('.sql') && !f.startsWith('0005')) copyFileSync(join(src, f), join(dir, f));
    await migrate(pool, () => 1, false, dir);
    // Idempotent: a second run applies nothing.
    const again = await migrate(pool, () => 1, false, dir);
    expect(again.applied).toEqual([]);
    // Re-running the SQL itself (not just the runner) is also safe.
    const { readFileSync } = await import('node:fs');
    await pool.query(readFileSync(join(dir, '0006_live_duels.sql'), 'utf8'));
    const storage = postgresStorage(pool);
    const server = serverTestConfig();
    const rt = createLiveRuntime({ storage, live: postgresLiveStore(pool), server, config: liveTestConfig(), now: () => clock });
    service = new MatchService({ storage: rt.storage, config: server, now: () => clock });
    live = rt.service;
  });

  afterAll(async () => {
    await pool?.end?.();
  });

  it('P-21: RLS is on and anon/authenticated are DENIED on every live table and column', async () => {
    const { rows } = await pool.query(
      `select relname, relrowsecurity from pg_class where relname in ('live_challenges','matches','players') and relkind = 'r'`,
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.relrowsecurity).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      expect(await denied(role, 'select * from live_challenges')).toBe('42501');
      expect(await denied(role, "insert into live_challenges (match_id, from_player, to_player, kind, limit_ms, created_at, expires_at) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'live', 1, 1, 1)")).toBe('42501');
      expect(await denied(role, 'select live_match_id, presence_status from players')).toBe('42501');
      expect(await denied(role, 'select live_since, live_strikes_seat0 from matches')).toBe('42501');
      expect(await denied(role, 'update players set live_challenges_enabled = false')).toBe('42501');
    }
    const grants = await pool.query(
      `select grantee, table_name from information_schema.role_table_grants
        where grantee in ('anon','authenticated') and table_name in ('live_challenges','matches','players')`,
    );
    expect(grants.rows).toEqual([]);
  });

  it('nothing is in the realtime publication', async () => {
    const { rows } = await pool.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
    expect(rows).toEqual([]);
  });

  it('a whole live session: go live, a timeout auto-play, a strike, and the board unchanged by the switch', async () => {
    const { a, b, matchId } = await pair();
    const before = await service.viewPayload(a, matchId);
    const c = await live.challenge(a, matchId, 'live');
    await live.accept(b, c.challenge.id);
    const mid = await service.viewPayload(a, matchId);
    expect(mid.view).toEqual(before.view);
    expect(mid.turnDeadlineAt).toBe(clock + LIMIT + ENTRY);
    clock += LIMIT + ENTRY + 1;
    const s = await live.status(a, matchId);
    expect(s.live).toBe(true);
    expect(s.strikes[before.actor]).toBe(1);
    const after = await service.viewPayload(a, matchId);
    expect(after.actor).not.toBe(before.actor);
    expect(after.status).toBe('active');
  });

  it('the database allows only ONE pending challenge per match (racing inserts)', async () => {
    const { a, b, matchId } = await pair();
    const out = await Promise.all([code(live.challenge(a, matchId, 'live')), code(live.challenge(a, matchId, 'live'))]);
    expect(out.sort()).toEqual(['OK', 'TOO_MANY_PENDING']);
    const { rows } = await pool.query(`select count(*)::int n from live_challenges where match_id = $1 and status = 'pending'`, [matchId]);
    expect(rows[0]!.n).toBe(1);
    void b;
  });

  it('simultaneous mutual challenges → ONE live session (real row locks)', async () => {
    const { a, b, matchId } = await pair();
    const out = await Promise.allSettled([live.challenge(a, matchId, 'live'), live.challenge(b, matchId, 'live')]);
    expect(out.every((r) => r.status === 'fulfilled')).toBe(true);
    const { rows } = await pool.query('select live_match_id from players where id = any($1::uuid[])', [[a.id, b.id]]);
    expect(rows.map((r) => r.live_match_id)).toEqual([matchId, matchId]);
    const acc = await pool.query(`select count(*)::int n from live_challenges where match_id = $1 and status = 'accepted'`, [matchId]);
    expect(acc.rows[0]!.n).toBe(1);
  });

  it('accept race: two accepts of one challenge commit once', async () => {
    const { a, b, matchId } = await pair();
    const c = await live.challenge(a, matchId, 'live');
    const out = await Promise.all([code(live.accept(b, c.challenge.id)), code(live.accept(b, c.challenge.id))]);
    expect(out.sort()).toEqual(['CHALLENGE_CLOSED', 'OK']);
  });

  it('a racing late move and the timeout tick: exactly one turn is applied', async () => {
    const { a, b, matchId } = await pair();
    const c = await live.challenge(a, matchId, 'live');
    await live.accept(b, c.challenge.id);
    const v0 = await service.viewPayload(a, matchId);
    const actor = v0.actor === v0.seat ? a : b;
    const v = await service.viewPayload(actor, matchId);
    clock += LIMIT + ENTRY + 1;
    const draw = v.legalActions.find((x) => x.t === 'Draw')!;
    await Promise.all([
      code(service.submitAction(actor, matchId, { expectedRevision: v.revision, requestId: 'late-race', action: draw })),
      live.status(a, matchId),
      live.status(b, matchId),
    ]);
    const moves = await pool.query(`select request_id from match_moves where match_id = $1 order by revision`, [matchId]);
    const ids = moves.rows.map((r) => String(r.request_id));
    expect(ids.some((id) => id.startsWith('live-auto-'))).toBe(true);
    expect(ids).not.toContain('late-race');
  });
});
