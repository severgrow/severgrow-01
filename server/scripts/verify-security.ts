// FUTASAKU 0.5 — P-21 security verification (runnable evidence, not just assertions).
//
//   VITE_SUPABASE_ANON_KEY=… node --env-file-if-exists=.env --import tsx server/scripts/verify-security.ts
//
// It proves, against the REAL Supabase project named by DATABASE_URL:
//   1. which migrations are applied (schema_migrations);
//   2. RLS is enabled on every public table;
//   3. anon and authenticated have NO privilege on any public table (select/insert/update/delete);
//   4. the `alter default privileges in schema public … revoke` guard holds (pg_default_acl);
//   5. a real `set role anon` / `set role authenticated` select is refused with 42501;
//   6. no table is in the `supabase_realtime` publication, AND a live anon Realtime subscription to
//      `postgres_changes` on `players` receives nothing while a real row is inserted and deleted.
//
// Exit code is non-zero if any check that must pass fails. The anon key is read from the
// environment and never printed. Without it, the live subscription step is SKIPPED (loudly).

import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import type { PgClient, PgPool } from '../src/storage/postgres.js';

type Row = Record<string, unknown>;
const rows = async (pool: PgPool, sql: string, values: readonly unknown[] = []): Promise<Row[]> => (await pool.query(sql, values)).rows;
const num = (v: unknown): number => Number(v ?? 0);

const PROJECT_REF = 'wbfrbeedlvjercrukngn';
const AUTH_TABLES = ['matches', 'players', 'player_tokens', 'match_participants', 'match_moves', 'rate_limits', 'device_link_codes'];
const ALL_TABLES = [...AUTH_TABLES, 'schema_migrations'];

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ----------------------------------------------------------------- Realtime probe

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, cb: (ev: { data?: unknown }) => void): void;
};

const realtimeProbe = async (anon: string, trigger: () => Promise<void>): Promise<void> => {
  const wsCtor = (globalThis as unknown as { WebSocket?: new (url: string) => WsLike }).WebSocket;
  if (!wsCtor) {
    check('realtime: node WebSocket available', false, 'no global WebSocket — cannot run the live subscription probe');
    return;
  }
  const url = `wss://${PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(anon)}&vsn=1.0.0`;
  const ws = new wsCtor(url);
  let receivedChanges = 0;
  let joinError: string | null = null;
  let closed = false;
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { event?: string; payload?: { response?: unknown; status?: string } };
      if (msg.event === 'postgres_changes') receivedChanges += 1;
      if (msg.event === 'phx_reply' && msg.payload?.status === 'error') joinError = JSON.stringify(msg.payload.response ?? {});
    } catch {
      /* ignore non-JSON frames (heartbeats) */
    }
  });
  ws.addEventListener('close', () => (closed = true));
  const opened = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(ws.readyState === 1), 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(true);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  if (!opened) {
    check('realtime: anon websocket connects', false, 'socket did not open');
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    return;
  }
  ws.send(
    JSON.stringify({
      topic: 'realtime:anon-changes-probe',
      event: 'phx_join',
      payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'players' }] } },
      ref: '1',
    }),
  );
  await new Promise((r) => setTimeout(r, 2000));
  // Cause a real change on `players` WHILE subscribed: if the table were in the publication the
  // anon client would receive a postgres_changes frame here.
  await trigger();
  await new Promise((r) => setTimeout(r, 2500));
  check('realtime: anon postgres_changes subscription is refused or inert', joinError !== null || receivedChanges === 0, joinError ? `join error: ${joinError}` : `no change frames received (closed=${closed})`);
  try {
    ws.close();
  } catch {
    /* ignore */
  }
};

// ----------------------------------------------------------------- pg_cron / pg_net (P-2, P-21 adjacent)

/**
 * The 0005/0007 keep-alive job (daily cadence) plus the pg_net SSRF guard.
 *
 * pg_net can make OUTBOUND HTTP requests from inside the database. It is platform-owned (the
 * `postgres` role cannot revoke its PUBLIC grants — a documented Supabase constraint), so the
 * guarantee that matters is that an anonymous visitor cannot reach it through the Data API. That
 * is proved here with the real anon key against PostgREST, alongside the DB-level cron denial.
 */
const keepaliveChecks = async (pool: PgPool, anon: string): Promise<void> => {
  const cronInstalled = num((await rows(pool, `select count(*)::int as n from pg_extension where extname = 'pg_cron'`))[0]?.n) > 0;
  const netInstalled = num((await rows(pool, `select count(*)::int as n from pg_extension where extname = 'pg_net'`))[0]?.n) > 0;
  check('pg_cron extension is installed', cronInstalled);
  check('pg_net extension is installed', netInstalled);

  if (cronInstalled) {
    const job = (await rows(pool, `select jobname, schedule, command, username, active from cron.job where jobname = 'futasaku-keepalive'`))[0];
    const command = String(job?.command ?? '');
    check(
      'futasaku-keepalive job exists with the intended (daily) cadence, target and role',
      Boolean(job) && job!.schedule === '17 6 * * *' && command.includes('/v1/health?db=1') && command.includes('/v1/sweep') && command.includes('net.http_get') && command.includes('net.http_post') && job!.username === 'postgres' && job!.active === true,
      job ? `${String(job.schedule)} as ${String(job.username)} (active=${String(job.active)})` : 'job missing — run `npm run server:migrate`',
    );
    check('the keep-alive job embeds no secret header', !command.includes('x-futasaku-cron'), 'no x-futasaku-cron header sent');
  }

  if (netInstalled) {
    const owner = String((await rows(pool, `select pg_get_userbyid(extowner) as owner from pg_extension where extname = 'pg_net'`))[0]?.owner ?? '');
    check('pg_net is platform-owned (not ours to revoke)', owner === 'supabase_admin', `owner=${owner}`);
    const login = await rows(pool, `select rolname, rolcanlogin from pg_roles where rolname in ('anon','authenticated')`);
    check('anon/authenticated cannot log in (no direct DB path to net)', login.length > 0 && login.every((r) => r.rolcanlogin === false));
  }

  // DB-level cron denial for both client roles (the row/function ACLs look permissive; schema
  // USAGE is what actually denies, so this is a real set-role attempt).
  for (const role of ['anon', 'authenticated']) {
    const exists = num((await rows(pool, 'select count(*)::int as n from pg_roles where rolname = $1', [role]))[0]?.n);
    if (exists === 0) {
      check(`cron: ${role} denied`, false, `role ${role} does not exist`);
      continue;
    }
    const client = (await pool.connect()) as PgClient;
    const denied: string[] = [];
    const allowed: string[] = [];
    try {
      await client.query(`set role ${role}`);
      for (const sql of ['select count(*) from cron.job', 'select count(*) from cron.job_run_details', `select cron.schedule('probe','* * * * *','select 1')`]) {
        try {
          await client.query(sql);
          allowed.push(sql);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === '42501') denied.push(sql);
          else allowed.push(`${sql}:${code ?? 'error'}`);
        }
      }
    } finally {
      await client.query('reset role').catch(() => undefined);
      client.release?.();
    }
    check(`set role ${role}: cron.job, cron.job_run_details and cron.schedule are refused (42501)`, allowed.length === 0, allowed.length ? `ALLOWED: ${allowed.join(' | ')}` : `denied ${denied.length}/3`);
  }

  // The reachable-path proof for pg_net (needs the public anon key).
  if (anon.length === 0) {
    console.log('  SKIP  data API: pg_net SSRF probe (set VITE_SUPABASE_ANON_KEY to run it)');
    return;
  }
  const base = `https://${PROJECT_REF}.supabase.co/rest/v1`;
  const probes: { path: string; method: 'GET' | 'POST'; body?: string }[] = [
    { path: '/rpc/http_get', method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) },
    { path: '/rpc/http_post', method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) },
    { path: '/_http_response?select=*&limit=1', method: 'GET' },
    { path: '/http_request_queue?select=*&limit=1', method: 'GET' },
  ];
  for (const probe of probes) {
    let status = 0;
    let note = '';
    try {
      const res = await fetch(`${base}${probe.path}`, {
        method: probe.method,
        headers: {
          apikey: anon,
          authorization: `Bearer ${anon}`,
          ...(probe.method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        ...(probe.body ? { body: probe.body } : {}),
      });
      status = res.status;
      note = (await res.text()).slice(0, 100).replace(/\s+/g, ' ');
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    }
    check(`data API: anon cannot reach net${probe.path}`, status !== 200, `HTTP ${status} ${note}`);
  }
};

// ----------------------------------------------------------------- main

const main = async (): Promise<void> => {
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set (put it in .env, which is git-ignored).');
    process.exit(2);
  }
  console.log(`verify-security against ${redactUrl(url)}`);
  const pool = poolFromUrl(url, { max: 3 });
  try {
    // 1) migrations
    const migrations = await rows(pool, 'select version from schema_migrations order by version');
    const versions = migrations.map((m) => String(m.version));
    check('migrations 0001–0007 applied', ['0001_init.sql', '0002_deadlines_lists.sql', '0003_open_queue.sql', '0004_timeout_grace.sql', '0005_keepalive_cron.sql', '0006_live_duels.sql', '0007_daily_sweeper.sql'].every((v) => versions.includes(v)), versions.join(', '));

    // 2) RLS on every public table
    const rls = await rows(
      pool,
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    const missingRls = rls.filter((r) => r.relrowsecurity !== true).map((r) => String(r.relname));
    check('RLS enabled on every public table', missingRls.length === 0, missingRls.length ? `missing: ${missingRls.join(', ')}` : `${rls.length} tables`);

    // 3) anon/authenticated privileges are all revoked
    const priv = await rows(
      pool,
      `select c.relname,
              has_table_privilege('anon', c.oid, 'SELECT') as a_s,
              has_table_privilege('anon', c.oid, 'INSERT') as a_i,
              has_table_privilege('anon', c.oid, 'UPDATE') as a_u,
              has_table_privilege('anon', c.oid, 'DELETE') as a_d,
              has_table_privilege('authenticated', c.oid, 'SELECT') as t_s,
              has_table_privilege('authenticated', c.oid, 'INSERT') as t_i,
              has_table_privilege('authenticated', c.oid, 'UPDATE') as t_u,
              has_table_privilege('authenticated', c.oid, 'DELETE') as t_d
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by c.relname`,
    );
    const leaks = priv.filter((r) => [r.a_s, r.a_i, r.a_u, r.a_d, r.t_s, r.t_i, r.t_u, r.t_d].some((x) => x === true)).map((r) => String(r.relname));
    check('anon + authenticated hold no privilege on any public table', leaks.length === 0, leaks.length ? `leaks: ${leaks.join(', ')}` : `${priv.length} tables × 8 privileges all false`);

    // 4) default-privileges guard (objects created later in public stay closed to client roles).
    //    Scoped to the `postgres` role — the role our migrations run as — because that is the ACL
    //    that governs the objects we create. (Supabase's own `supabase_admin` defaults are a
    //    platform value we cannot change from `postgres`; our migrations never create as that role.)
    const acl = await rows(
      pool,
      `select case defaclobjtype when 'r' then 'table' when 'S' then 'sequence' when 'f' then 'function' else defaclobjtype::text end as objtype,
              defaclacl::text as acl
         from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclrole = 'postgres'::regrole order by objtype`,
    );
    const anonDefault = acl.filter((r) => /\b(anon|authenticated)=/.test(String(r.acl ?? '')));
    check(
      'public default privileges (postgres) grant nothing to anon/authenticated',
      acl.length >= 3 && anonDefault.length === 0,
      anonDefault.length ? JSON.stringify(anonDefault) : acl.map((r) => `${r.objtype}:${r.acl}`).join(' | '),
    );

    // 5) a real SET ROLE select must be refused
    for (const role of ['anon', 'authenticated']) {
      const exists = num((await rows(pool, 'select count(*)::int as n from pg_roles where rolname = $1', [role]))[0]?.n);
      if (exists === 0) {
        check(`set role ${role} select refused`, false, `role ${role} does not exist on this database`);
        continue;
      }
      const client = (await pool.connect()) as PgClient;
      const denied: string[] = [];
      const allowed: string[] = [];
      try {
        await client.query(`set role ${role}`);
        for (const table of ALL_TABLES) {
          try {
            await client.query(`select * from ${table} limit 1`);
            allowed.push(table);
          } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === '42501') denied.push(table);
            else allowed.push(`${table}:${code ?? 'error'}`);
          }
        }
      } finally {
        await client.query('reset role').catch(() => undefined);
        client.release?.();
      }
      check(`set role ${role}: every authoritative table select refused (42501)`, allowed.length === 0, allowed.length ? `ALLOWED/other: ${allowed.join(', ')}` : `denied ${denied.length}/${ALL_TABLES.length}`);
    }

    // 6a) publication membership
    const pubs = await rows(pool, `select 1 from pg_publication where pubname = 'supabase_realtime'`);
    if (pubs.length === 0) {
      check('supabase_realtime publication has no authoritative tables', true, 'publication does not exist — nothing can be broadcast');
    } else {
      const members = await rows(
        pool,
        `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`,
      );
      check('supabase_realtime publication has no authoritative tables', members.length === 0, members.length ? `members: ${members.map((m) => m.tablename).join(', ')}` : 'publication is empty');
    }

    // 6b) live anon subscription receives nothing while a real row changes
    const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
    if (anon.length === 0) {
      console.log('  SKIP  realtime: live anon subscription probe (set VITE_SUPABASE_ANON_KEY to run it)');
    } else {
      const marker = `rt-probe-${Date.now()}`;
      const probeId = (await rows(pool, 'select gen_random_uuid() as id')).map((r) => String(r.id))[0]!;
      await realtimeProbe(anon, async () => {
        await pool.query('insert into players (id, kind, display_name, created_at) values ($1, $2, $3, $4)', [probeId, 'guest', marker, Date.now()]);
        await pool.query('delete from players where id = $1', [probeId]);
      });
      console.log(`    (inserted and deleted one namespaced players row while subscribed: ${marker})`);
    }

    // 7) P-2 keep-alive job + the pg_net SSRF guard (DB-level cron denial and a live Data-API
    //    probe with the anon key; the probe is skipped loudly when the key is not set).
    await keepaliveChecks(pool, anon);
  } finally {
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nverify-security: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.map((f) => f.name).join('; ')}`);
    process.exit(1);
  }
};

await main().catch((error: unknown) => {
  console.error(`verify-security error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
