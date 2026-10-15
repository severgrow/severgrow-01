// Accounts on a REAL Postgres (skipped unless LIVE_DATABASE_URL is set) — the same throwaway local
// database the live-duel suite uses, never the production project.
//
//   LIVE_DATABASE_URL=postgres://postgres@127.0.0.1:55432/futalive PGSSL=disable npx vitest run server/tests/accounts-postgres.integration.test.ts
//
// 0005 and 0007 need pg_cron (a Supabase extension) and are skipped here. Proves: 0010 applies (and re-applies) cleanly, RLS + revokes deny anon/authenticated, the unique
// keys stop one Google from landing on two players (and one player from carrying two Googles), a
// racing first sign-in ends on ONE player, and "delete my account" revokes the other devices' tokens.
import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';
import { MatchService } from '../src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { createAccountsRouter, postgresIdentityLinkStore } from '../src/accounts/accounts.js';
import type { AuthProvider } from '../src/accounts/accounts.js';
import { migrate } from '../scripts/migrate.js';

const URL_ = (process.env.LIVE_DATABASE_URL ?? '').trim();
const suite = describe.skipIf(URL_.length === 0);

const CREATED: string[] = [];
const CLOCK = 1_800_000_000_000; // future timestamps no real row has, so cleanup is exact
let pool: PgPool & { end?: () => Promise<void> };
let service: MatchService;
let app: ReturnType<typeof createFetchApp>;
const deleted: string[] = [];
const auth: AuthProvider = {
  async user(t) {
    const m = /^access-(.+)-[0-9]+-pad-pad-pad$/.exec(t);
    return m ? { id: `pgtest-${m[1]}`, email: `${m[1]}@gmail.com`, providers: ['google'] } : null;
  },
  async deleteUser(id) {
    deleted.push(id);
    return true;
  },
};
let n = 0;
const google = (who: string) => `access-${who}-${(n += 1)}-pad-pad-pad`;
const call = async (method: string, path: string, body: unknown, token?: string) => {
  const res = await app(
    new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${n % 250}.1`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const json = (await res.json()) as { player: { id: string; kind: string }; token: string; outcome: string; code?: string };
  if (json.player?.id) CREATED.push(json.player.id);
  return { status: res.status, json };
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

suite('accounts on real Postgres', () => {
  beforeAll(async () => {
    pool = poolFromUrl(URL_) as typeof pool;
    const dir = mkdtempSync(join(tmpdir(), 'futa-acct-mig-'));
    const src = fileURLToPath(new URL('../migrations', import.meta.url));
    for (const f of readdirSync(src)) if (f.endsWith('.sql') && !f.startsWith('0005') && !f.startsWith('0007')) copyFileSync(join(src, f), join(dir, f));
    await migrate(pool, () => 1, false, dir);
    expect((await migrate(pool, () => 1, false, dir)).applied).toEqual([]);
    await pool.query(readFileSync(join(dir, '0010_accounts.sql'), 'utf8')); // the SQL itself re-runs safely
    const storage = postgresStorage(pool);
    const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
    service = new MatchService({ storage, config, now: () => CLOCK });
    const accounts = createAccountsRouter({ links: postgresIdentityLinkStore(pool), storage, auth, authenticate: (t) => service.authenticate(t), now: () => CLOCK });
    app = createFetchApp({ service, config, live: accounts });
  });

  afterAll(async () => {
    if (pool === undefined) return;
    try {
      if (CREATED.length > 0) await pool.query('delete from players where id = any($1::uuid[])', [[...new Set(CREATED)]]); // cascades to links + tokens
      await pool.query('delete from rate_limits where window_start >= $1', [Math.floor(CLOCK / 3_600_000) * 3_600_000]);
    } finally {
      await pool.end?.();
    }
  });

  it('P-21: RLS is on and anon/authenticated are denied on player_identities', async () => {
    const { rows } = await pool.query(`select relrowsecurity from pg_class where relname = 'player_identities' and relkind = 'r'`);
    expect(rows[0]?.relrowsecurity).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      expect(await denied(role, 'select * from player_identities')).toBe('42501');
      expect(await denied(role, `insert into player_identities (provider, subject, player_id, created_at) values ('google','x',gen_random_uuid(),1)`)).toBe('42501');
    }
    const pub = await pool.query(`select 1 from pg_publication_tables where tablename = 'player_identities'`);
    expect(pub.rows).toHaveLength(0);
  });

  it('a guest upgrades in place, another device recovers the same player, and a racing first sign-in makes one player', async () => {
    const g = await service.createGuest();
    CREATED.push(g.player.id);
    const linked = await call('POST', '/v1/auth/google', { accessToken: google('ann') }, g.token);
    expect(linked.json.outcome).toBe('linked');
    expect(linked.json.player.id).toBe(g.player.id);
    const other = await call('POST', '/v1/auth/google', { accessToken: google('ann') });
    expect(other.json.player.id).toBe(g.player.id);

    const [x, y] = await Promise.all([call('POST', '/v1/auth/google', { accessToken: google('race') }), call('POST', '/v1/auth/google', { accessToken: google('race') })]);
    expect(x.status).toBe(200);
    expect(y.status).toBe(200);
    expect(x.json.player.id).toBe(y.json.player.id);
    const { rows } = await pool.query(`select count(*)::int as n from player_identities where subject = 'pgtest-race'`);
    expect(rows[0]!.n).toBe(1);
  });

  it('the database itself refuses one Google on two players, or two Googles on one player', async () => {
    const a = await service.createGuest();
    const b = await service.createGuest();
    CREATED.push(a.player.id, b.player.id);
    await pool.query(`insert into player_identities values ('google','pgtest-uniq',$1,1)`, [a.player.id]);
    await expect(pool.query(`insert into player_identities values ('google','pgtest-uniq',$1,1)`, [b.player.id])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query(`insert into player_identities values ('google','pgtest-uniq2',$1,1)`, [a.player.id])).rejects.toMatchObject({ code: '23505' });
  });

  it('delete my account: link gone, Supabase user deleted, other devices signed out, this device keeps playing', async () => {
    const g = await service.createGuest();
    CREATED.push(g.player.id);
    const p1 = await call('POST', '/v1/auth/google', { accessToken: google('del') }, g.token);
    const p2 = await call('POST', '/v1/auth/google', { accessToken: google('del') });
    const res = await call('POST', '/v1/auth/google/delete', {}, p1.json.token);
    expect(res.status).toBe(200);
    expect(res.json.player.kind).toBe('guest');
    expect(deleted).toContain('pgtest-del');
    expect((await service.authenticate(p1.json.token)).id).toBe(g.player.id);
    await expect(service.authenticate(p2.json.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(service.authenticate(g.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const { rows } = await pool.query(`select 1 from player_identities where subject = 'pgtest-del'`);
    expect(rows).toHaveLength(0);
  });
});
