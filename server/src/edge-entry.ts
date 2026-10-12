// Deno Edge entry for the FUTASAKU duel API (Supabase Edge Functions).
// Built by `node server/scripts/build-edge.mjs` into supabase/functions/duel/index.ts.
//
// Auth is our own bearer tokens — Supabase JWT verification must stay OFF on this function.
/// <reference path="./edge-deno.d.ts" />
import postgres from 'postgres';
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import { PRODUCTION_CORS_ORIGIN } from './config.js';
import type { ServerConfig } from './config.js';
import { createFetchApp } from './fetch-app.js';
import { MatchService } from './service.js';
import { postgresStorage } from './storage/postgres.js';
import { poolFromPostgresJs } from './storage/postgres-js-pool.js';

const databaseUrl = Deno.env.get('DATABASE_URL') ?? '';
if (!databaseUrl) {
  throw new Error('DATABASE_URL secret is not set on the Edge Function.');
}

const edgeConfig: ServerConfig = {
  rulesVersion: CURRENT_RULES_VERSION,
  maxMovesPerMatch: 10_000,
  inviteCodeLength: 8,
  maxBodyBytes: 64 * 1024,
  maxOpenMatchesPerPlayer: 10,
  corsOrigin: PRODUCTION_CORS_ORIGIN,
};

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: 'require',
});

const service = new MatchService({
  storage: postgresStorage(poolFromPostgresJs(sql)),
  config: edgeConfig,
});

const app = createFetchApp({
  service,
  config: edgeConfig,
  logger: (line) => console.log(line),
});

Deno.serve((req) => app(req));
