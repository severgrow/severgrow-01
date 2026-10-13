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
import { createFetchApp } from './fetch-app.js';
import { MatchService } from './service.js';
import { postgresStorage } from './storage/postgres.js';
import { poolFromPostgresJs } from './storage/postgres-js-pool.js';

const edgeConfig: ServerConfig = {
  ...DEFAULT_SERVER_CONFIG,
  rulesVersion: CURRENT_RULES_VERSION,
  corsOrigin: PRODUCTION_CORS_ORIGIN,
};

// Preflight + early error/health responses must allow the client's custom
// headers, or the browser blocks every request (guest creation included).
const cors = corsHeaders(PRODUCTION_CORS_ORIGIN);
const corsJson = { ...cors, 'content-type': 'application/json; charset=utf-8' };

let appPromise: Promise<(req: Request) => Promise<Response>> | null = null;

const buildApp = async (): Promise<(req: Request) => Promise<Response>> => {
  const databaseUrl = Deno.env.get('DATABASE_URL') ?? '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL secret is not set on the Edge Function.');
  }
  const sql = postgres(databaseUrl, {
    prepare: false,
    // Two connections. A single connection (max: 1) is shared by every query, so when the Edge
    // runtime drops an invocation mid-transaction (`Shutdown … EarlyDrop`) the next query can run
    // inside that leftover transaction and read a stale snapshot — which showed up as the two seats
    // disagreeing about whose turn it was. But a large pool is not free either: every warm Edge
    // isolate keeps `max` idle connections, and a burst of isolates exhausted the project's
    // connection slots (Postgres "remaining connection slots are reserved for the SUPERUSER
    // attribute"), which made the live API answer 500 for everyone. Two is the balance: a poisoned
    // connection is not immediately reused, yet the footprint stays small. The durable fix is the
    // Transaction pooler URI (port 6543) on the DATABASE_URL secret.
    max: 2,
    idle_timeout: 15,
    // Recycle connections so a connection wedged by a dropped invocation cannot linger.
    max_lifetime: 120,
    connect_timeout: 10,
    ssl: 'require',
  });
  const service = new MatchService({
    storage: postgresStorage(poolFromPostgresJs(sql)),
    config: edgeConfig,
  });
  return createFetchApp({
    service,
    config: edgeConfig,
    logger: (line) => console.log(line),
  });
};

const getApp = (): Promise<(req: Request) => Promise<Response>> => {
  if (!appPromise) appPromise = buildApp();
  return appPromise;
};

const normalizePath = (pathname: string): string => {
  let path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const mount of ['/functions/v1/duel', '/duel']) {
    if (path === mount) return '/';
    if (path.startsWith(`${mount}/`)) return path.slice(mount.length) || '/';
  }
  return path;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  const url = new URL(req.url);
  const path = normalizePath(url.pathname);
  // Health without ?db=1 answers even before DATABASE_URL is configured.
  if (req.method === 'GET' && path === '/v1/health' && url.searchParams.get('db') !== '1') {
    return new Response(
      JSON.stringify({
        ok: true,
        rulesVersion: CURRENT_RULES_VERSION,
        serverNow: Date.now(),
        dbConfigured: Boolean(Deno.env.get('DATABASE_URL')),
      }),
      { status: 200, headers: corsJson },
    );
  }
  try {
    const app = await getApp();
    return await app(req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const missingSecret = message.includes('DATABASE_URL');
    console.log(`EDGE_BOOT_ERROR ${message}`);
    return new Response(
      JSON.stringify({
        ok: false,
        code: missingSecret ? 'DB_SECRET_MISSING' : 'EDGE_BOOT_ERROR',
        message: missingSecret
          ? 'Set the DATABASE_URL Edge secret to the Transaction pooler URI (port 6543). See docs/DEPLOY-ONLINE.md.'
          : 'The duel API failed to start. Check Edge Function logs.',
        rulesVersion: CURRENT_RULES_VERSION,
        serverNow: Date.now(),
      }),
      { status: missingSecret ? 503 : 500, headers: corsJson },
    );
  }
});
