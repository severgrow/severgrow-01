// Pure, dependency-free connection/pool helpers for the duel API.
//
// This module is imported by BOTH `server/src/edge-entry.ts` (the Deno Edge function) and
// `server/src/storage/pg-pool.ts` (the Node server, migrations and tests). It must stay free of
// imports: the Edge bundle must not pull in the Node-only `pg` package, and keeping one copy stops
// the Node and Edge pool settings from drifting apart.
//
// Nothing here reads the connection string's password: `classifyDatabaseUrl` only looks at the
// host and port, and returns a classification (never the URL, host or user).

export type PoolerKind = 'transaction-pooler' | 'session-pooler' | 'direct' | 'local' | 'unknown';

export type ConnectionDiagnostics = {
  /** What kind of endpoint the connection string points at. */
  kind: PoolerKind;
  /** The port from the URL (defaults to 5432 when omitted). Not a secret. */
  port: string;
  /** True when the host is a Supabase Supavisor pooler host. */
  poolerHost: boolean;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const POOLER_SUFFIXES = ['.pooler.supabase.com', '.pooler.supabase.net'];

/**
 * Classify a Postgres connection string by host and port only. Used by the Edge health diagnostics
 * so the owner can confirm — from outside, without ever reading the secret — which pooler the
 * deployed `DATABASE_URL` uses.
 *
 * - `transaction-pooler`: `*.pooler.supabase.com:6543` (multiplexes many clients onto a small,
 *   bounded server-side pool — the correct choice for short-lived Edge isolates).
 * - `session-pooler`: `*.pooler.supabase.com:5432` (one Postgres backend pinned per client
 *   connection, so N isolates × pool `max` can exhaust the project's connection slots).
 * - `direct`: `db.<ref>.supabase.co`.
 */
export const classifyDatabaseUrl = (url: string): ConnectionDiagnostics => {
  let host = '';
  let port = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    port = parsed.port;
  } catch {
    return { kind: 'unknown', port: '', poolerHost: false };
  }
  const poolerHost = POOLER_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (LOCAL_HOSTS.has(host)) return { kind: 'local', port: port || '5432', poolerHost: false };
  if (poolerHost && port === '6543') return { kind: 'transaction-pooler', port, poolerHost: true };
  if (poolerHost && (port === '5432' || port === '')) return { kind: 'session-pooler', port: port || '5432', poolerHost: true };
  if (host.startsWith('db.') && host.endsWith('.supabase.co')) return { kind: 'direct', port: port || '5432', poolerHost: false };
  return { kind: 'unknown', port, poolerHost };
};

// ---- Edge (postgres.js) pool options -----------------------------------------------------------

export type EdgePoolEnv = (name: string) => string | undefined;

export type EdgePoolOptions = {
  /** The Transaction pooler (6543) does not support named prepared statements — keep this off. */
  prepare: false;
  /** Connections one warm isolate may hold. Every warm isolate keeps up to `max` of them. */
  max: number;
  /** Seconds an idle connection may sit before postgres.js closes it. */
  idle_timeout: number;
  /** Seconds before a connection is recycled, so a connection wedged by a dropped invocation frees. */
  max_lifetime: number;
  /** Seconds to wait for a new connection before failing. */
  connect_timeout: number;
  connection: { application_name: string };
};

/** Hard clamps so a typo in an override can never cripple the shared project. */
export const EDGE_POOL_BOUNDS = {
  max: { min: 1, max: 4 },
  idleTimeoutSeconds: { min: 2, max: 120 },
  maxLifetimeSeconds: { min: 15, max: 900 },
  connectTimeoutSeconds: { min: 2, max: 30 },
} as const;

/**
 * Measured defaults (see docs/DEPLOY-ONLINE.md). Two connections per isolate are enough to keep a
 * poisoned connection out of immediate reuse, while a short idle/max lifetime stops warm isolates
 * from parking connections forever on a pooler that pins one backend per client.
 */
export const EDGE_POOL_DEFAULTS = {
  max: 2,
  idleTimeoutSeconds: 10,
  maxLifetimeSeconds: 60,
  connectTimeoutSeconds: 8,
} as const;

export const EDGE_APPLICATION_NAME = 'futasaku-duel-edge';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.floor(value)));

const envInt = (
  env: EdgePoolEnv,
  name: string,
  fallback: number,
  bounds: { min: number; max: number },
): number => {
  const raw = env(name)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, bounds.min, bounds.max) : fallback;
};

/** The postgres.js options for the Edge client. Every value is overridable by an Edge secret. */
export const edgePoolOptions = (env: EdgePoolEnv = () => undefined): EdgePoolOptions => ({
  prepare: false,
  max: envInt(env, 'EDGE_POOL_MAX', EDGE_POOL_DEFAULTS.max, EDGE_POOL_BOUNDS.max),
  idle_timeout: envInt(env, 'EDGE_POOL_IDLE_TIMEOUT', EDGE_POOL_DEFAULTS.idleTimeoutSeconds, EDGE_POOL_BOUNDS.idleTimeoutSeconds),
  max_lifetime: envInt(env, 'EDGE_POOL_MAX_LIFETIME', EDGE_POOL_DEFAULTS.maxLifetimeSeconds, EDGE_POOL_BOUNDS.maxLifetimeSeconds),
  connect_timeout: envInt(
    env,
    'EDGE_POOL_CONNECT_TIMEOUT',
    EDGE_POOL_DEFAULTS.connectTimeoutSeconds,
    EDGE_POOL_BOUNDS.connectTimeoutSeconds,
  ),
  connection: { application_name: EDGE_APPLICATION_NAME },
});

// ---- Single transparent retry on connection acquisition ---------------------------------------

/**
 * Codes that mean "a connection could not be established at all". Deliberately EXCLUDES
 * `ECONNRESET` / `ETIMEDOUT`, because those can surface *after* the server already ran a statement
 * — retrying then could apply a write twice. Acquisition-only codes are safe to retry: no
 * statement was sent, so a second attempt cannot double-apply anything.
 */
export const CONNECTION_ACQUISITION_CODES = new Set([
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'CONNECT_TIMEOUT',
]);

const ACQUISITION_PHRASES = [
  'connection slots', // "remaining connection slots are reserved for the SUPERUSER attribute"
  'too many clients',
  'too many connections',
  'max client connections',
  'connection refused',
  'connect timeout',
  'timeout expired while connecting',
];

/** True when the error is a failure to open a database connection (safe to retry once). */
export const isConnectionAcquisitionError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && CONNECTION_ACQUISITION_CODES.has(code)) return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return ACQUISITION_PHRASES.some((phrase) => lower.includes(phrase));
};

/**
 * Run `fn` once; if it fails to acquire a connection, run it one more time before giving up. A
 * transient pooler hiccup then succeeds transparently instead of surfacing as a 500, and a
 * persistent failure is reported to the caller (which the Edge entry turns into a clean 503).
 */
export const withSingleRetry = async <T>(fn: () => Promise<T>, onRetry?: (error: unknown) => void): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (!isConnectionAcquisitionError(error)) throw error;
    onRetry?.(error);
    return await fn();
  }
};

/** A log-safe one-line description of an error (strips any `//user:pass@` credentials). */
export const safeErrorText = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  const cleaned = message.replace(/\/\/[^@\s]*@/g, '//***@').slice(0, 200);
  return typeof code === 'string' && code.length > 0 ? `${code} ${cleaned}` : cleaned;
};
