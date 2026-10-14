// Deno Edge entry for the FUTASAKU duel API (Supabase Edge Functions).
// Built by `npm run server:build-edge` into supabase/functions/duel/bundle.ts.
//
// Auth is our own bearer tokens — Supabase JWT verification must stay OFF on this function.
/// <reference path="./edge-deno.d.ts" />
import postgres from 'postgres';
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG, PRODUCTION_CORS_ORIGIN } from './config.js';
import type { ServerConfig } from './config.js';
import { corsHeaders } from './cors.js';
import { ApiError } from './errors.js';
import { createFetchApp } from './fetch-app.js';
import { MatchService } from './service.js';
import { createSupabaseBroadcaster } from './broadcast-supabase.js';
import type { MatchBroadcaster } from './broadcast.js';
import { postgresStorage } from './storage/postgres.js';
import { wireLiveEdge } from './live/runtime.js';
import type { PgPool } from './storage/postgres.js';
import { poolFromPostgresJs } from './storage/postgres-js-pool.js';
import {
  classifyDatabaseUrl,
  edgePoolOptions,
  isConnectionAcquisitionError,
  safeErrorText,
  withSingleRetry,
} from './storage/pool-config.js';
import type { ConnectionDiagnostics } from './storage/pool-config.js';

const edgeConfig: ServerConfig = {
  ...DEFAULT_SERVER_CONFIG,
  rulesVersion: CURRENT_RULES_VERSION,
  corsOrigin: PRODUCTION_CORS_ORIGIN,
};

// Preflight + early error/health responses must allow the client's custom
// headers, or the browser blocks every request (guest creation included).
const cors = corsHeaders(PRODUCTION_CORS_ORIGIN);
const corsJson = { ...cors, 'content-type': 'application/json; charset=utf-8' };

const log = (line: string): void => console.log(line);

type EdgeRuntime = {
  app: (req: Request) => Promise<Response>;
  service: MatchService;
  /** Which pooler the DATABASE_URL secret points at (host/port only — never the URL). */
  dbInfo: ConnectionDiagnostics;
};

let runtimePromise: Promise<EdgeRuntime> | null = null;

/**
 * Wrap the postgres.js pool so a transient failure to OPEN a connection is retried once, and a
 * persistent one becomes a clean `DB_UNAVAILABLE` (503) instead of an opaque 500.
 *
 * Only the two acquisition points are retried — a standalone `query` (autocommit, no statement has
 * been sent when the connection cannot be opened) and `connect`/`reserve` (nothing executed yet).
 * Queries already running on a reserved client are NOT retried, so a write can never be applied
 * twice. `isConnectionAcquisitionError` also excludes mid-statement errors like `ECONNRESET`.
 */
const withEdgeConnectionRetry = (pool: PgPool): PgPool => ({
  async query(text, values) {
    try {
      return await withSingleRetry(
        () => pool.query(text, values),
        (error) => log(`EDGE_DB_RETRY query ${safeErrorText(error)}`),
      );
    } catch (error) {
      return databaseUnavailable(error);
    }
  },
  async connect() {
    try {
      return await withSingleRetry(
        () => pool.connect(),
        (error) => log(`EDGE_DB_RETRY connect ${safeErrorText(error)}`),
      );
    } catch (error) {
      return databaseUnavailable(error);
    }
  },
});

/** A persistent connection-acquisition failure becomes a friendly 503; anything else is rethrown. */
const databaseUnavailable = (error: unknown): never => {
  if (isConnectionAcquisitionError(error)) {
    throw new ApiError('DB_UNAVAILABLE', 'The duel database is briefly busy. Please retry in a moment.');
  }
  throw error;
};

/** Realtime broadcast publisher, or undefined when the platform key is unavailable. */
const broadcaster = ((): MatchBroadcaster | undefined => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !key) return undefined;
  return createSupabaseBroadcaster({ url, key, onError: (error) => log(`REALTIME_PING_ERROR ${safeErrorText(error)}`) });
})();

const buildRuntime = async (): Promise<EdgeRuntime> => {
  const databaseUrl = Deno.env.get('DATABASE_URL') ?? '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL secret is not set on the Edge Function.');
  }
  const sql = postgres(databaseUrl, {
    // `edgePoolOptions` holds `prepare: false` (required for the Transaction pooler, port 6543),
    // the bounded pool size and the idle/lifetime/connect-timeout values. Every value is
    // overridable with an Edge secret so the pool can be tuned without a code change.
    ...edgePoolOptions((name) => Deno.env.get(name)),
    ssl: 'require',
  });
  const pool = withEdgeConnectionRetry(poolFromPostgresJs(sql));
  const live = wireLiveEdge({ storage: postgresStorage(pool), pool, server: edgeConfig, env: (n) => Deno.env.get(n), ...(broadcaster ? { broadcaster } : {}) });
  const service = new MatchService({
    storage: live.storage,
    config: edgeConfig,
    // Live pings: the platform exposes SUPABASE_URL / SUPABASE_ANON_KEY to every function.
    // Missing values just mean the browser falls back to polling (P-11); no failure either way.
    ...(broadcaster ? { broadcaster } : {}),
  });
  const app = createFetchApp({ service, config: edgeConfig, logger: log, live: live.router(service) }); // live duels: docs/LIVE.md
  return { app, service, dbInfo: classifyDatabaseUrl(databaseUrl) };
};

const getRuntime = (): Promise<EdgeRuntime> => {
  if (!runtimePromise) {
    runtimePromise = buildRuntime().catch((error: unknown) => {
      // Never cache a failed boot: a transient connection problem must not permanently wedge the
      // isolate (the previous promise would have stayed rejected forever, turning every later
      // request into a 500).
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
};

const normalizePath = (pathname: string): string => {
  let path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const mount of ['/functions/v1/duel', '/duel']) {
    if (path === mount) return '/';
    if (path.startsWith(`${mount}/`)) return path.slice(mount.length) || '/';
  }
  return path;
};

/** A start/connection failure the caller can read: 503 when retryable, 500 when something else broke. */
const failureResponse = (error: unknown): Response => {
  const message = error instanceof Error ? error.message : String(error);
  const missingSecret = message.includes('DATABASE_URL');
  const unavailable = !missingSecret && isConnectionAcquisitionError(error);
  const code = missingSecret ? 'DB_SECRET_MISSING' : unavailable ? 'DB_UNAVAILABLE' : 'EDGE_BOOT_ERROR';
  const body = missingSecret
    ? 'Set the DATABASE_URL Edge secret to the Transaction pooler URI (port 6543). See docs/DEPLOY-ONLINE.md.'
    : unavailable
      ? 'The duel database is briefly busy. Please retry in a moment.'
      : 'The duel API failed to start. Check Edge Function logs.';
  log(`EDGE_BOOT_ERROR ${code} ${safeErrorText(error)}`);
  return new Response(
    JSON.stringify({ ok: false, code, message: body, rulesVersion: CURRENT_RULES_VERSION, serverNow: Date.now() }),
    { status: missingSecret || unavailable ? 503 : 500, headers: corsJson },
  );
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  const url = new URL(req.url);
  const path = normalizePath(url.pathname);
  // Health is answered by the Edge entry so `?db=1` doubles as a connection diagnostic: it reports
  // which pooler the DATABASE_URL secret points at (classification only — never the URL or secret).
  if (req.method === 'GET' && path === '/v1/health') {
    const dbConfigured = Boolean(Deno.env.get('DATABASE_URL'));
    if (url.searchParams.get('db') !== '1') {
      return new Response(
        JSON.stringify({ ok: true, rulesVersion: CURRENT_RULES_VERSION, serverNow: Date.now(), dbConfigured }),
        { status: 200, headers: corsJson },
      );
    }
    try {
      const runtime = await getRuntime();
      const startedDb = Date.now();
      await runtime.service.pingStorage();
      const body = {
        ok: true,
        rulesVersion: runtime.service.rulesVersion,
        serverNow: runtime.service.serverNow(),
        db: { ok: true, ms: Date.now() - startedDb, pooler: runtime.dbInfo.kind, port: runtime.dbInfo.port },
      };
      return new Response(JSON.stringify(body), { status: 200, headers: corsJson });
    } catch (error: unknown) {
      return failureResponse(error);
    }
  }
  try {
    const runtime = await getRuntime();
    return await runtime.app(req);
  } catch (error: unknown) {
    return failureResponse(error);
  }
});
