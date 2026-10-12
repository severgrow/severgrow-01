// One place that turns a connection string into a node-postgres pool, with the TLS behaviour
// managed hosts (Supabase included) require. The server, the migration runner and the database
// integration tests all connect through here, so they cannot drift apart.
//
// `pg` is imported only in this file and in the scripts; `storage/postgres.ts` stays decoupled
// behind the structural `PgPool` type and remains testable with a fake pool.
import { Pool } from 'pg';
import type { PgPool } from './postgres.js';

export type SslSetting = false | { rejectUnauthorized: boolean };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Decides TLS from the URL/`PGSSL`, defaulting to TLS for anything that is not localhost. */
export const sslForUrl = (url: string, env: NodeJS.ProcessEnv = process.env): SslSetting => {
  const override = (env.PGSSL ?? '').trim().toLowerCase();
  if (override === '0' || override === 'disable' || override === 'false') return false;

  let host = '';
  let mode = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    mode = (parsed.searchParams.get('sslmode') ?? '').toLowerCase();
  } catch {
    // A malformed URL is left to `pg` to reject with a clear message.
    return { rejectUnauthorized: false };
  }

  if (override === 'verify-full' || override === 'verify-ca' || mode === 'verify-full' || mode === 'verify-ca') {
    return { rejectUnauthorized: true };
  }
  if (override === 'require' || mode === 'require' || mode === 'prefer') return { rejectUnauthorized: false };
  if (mode === 'disable') return false;
  return LOCAL_HOSTS.has(host) ? false : { rejectUnauthorized: false };
};

export type PoolOptions = { max?: number; connectionTimeoutMillis?: number; idleTimeoutMillis?: number };

/** A pool with a small cap (Supabase's free tier has a low connection limit). */
export const poolFromUrl = (url: string, options: PoolOptions = {}, env: NodeJS.ProcessEnv = process.env): PgPool => {
  const pool = new Pool({
    connectionString: url,
    ssl: sslForUrl(url, env),
    max: options.max ?? 5,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 15_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    application_name: 'futasaku-duel',
  });
  // The adapter only needs `query` and `connect`; the structural cast keeps it decoupled from pg.
  return pool as unknown as PgPool;
};

/** The configured database URL, or null when the server should use in-memory storage. */
export const databaseUrlFromEnv = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const url = (env.DATABASE_URL ?? '').trim();
  return url.length > 0 ? url : null;
};

/** Redacts the password from a connection string so it is safe to log. */
export const redactUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<unparseable connection string>';
  }
};
