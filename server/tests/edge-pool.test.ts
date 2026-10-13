// Regression guard for the live Edge connection-exhaustion outage.
//
// A 200-duel soak and a 40-concurrent health burst both reproduced transient HTTP 500s from the
// deployed `duel` function: every warm Edge isolate kept its own Postgres connection(s), the shared
// free-tier project ran out of the ~57 non-superuser connection slots, and new connections were
// refused. These pure helpers are the fix: a bounded, self-recycling Edge pool, a single retry on
// connection acquisition, and a clean 503 (never an opaque 500) when the pooler is saturated.
//
// The sources are read as text (like server/tests/edge-cors.test.ts) so config drift in the Deno
// entry — which cannot be imported under Node — is still caught by `npm run check`.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_ACQUISITION_CODES,
  EDGE_POOL_BOUNDS,
  EDGE_POOL_DEFAULTS,
  classifyDatabaseUrl,
  edgePoolOptions,
  isConnectionAcquisitionError,
  safeErrorText,
  withSingleRetry,
} from '../src/storage/pool-config.js';
import { NODE_POOL_DEFAULTS } from '../src/storage/pg-pool.js';
import { ApiError } from '../src/errors.js';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');
const edgeEntry = read('../src/edge-entry.ts');
const poolConfig = read('../src/storage/pool-config.ts');
const buildEdge = read('../scripts/build-edge.mjs');

const env = (values: Record<string, string>) => (name: string): string | undefined => values[name];

describe('classifyDatabaseUrl', () => {
  it('recognises the Transaction pooler on 6543', () => {
    expect(classifyDatabaseUrl('postgresql://postgres.abcdef:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres')).toEqual({
      kind: 'transaction-pooler',
      port: '6543',
      poolerHost: true,
    });
  });

  it('recognises the Session pooler on 5432 (the connection-pinning case)', () => {
    expect(classifyDatabaseUrl('postgresql://postgres.abcdef:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres')).toEqual({
      kind: 'session-pooler',
      port: '5432',
      poolerHost: true,
    });
    // Supavisor's session pooler is 5432; a missing port defaults to 5432.
    expect(classifyDatabaseUrl('postgresql://postgres.abcdef:pw@aws-0-eu-west-1.pooler.supabase.com/postgres').kind).toBe(
      'session-pooler',
    );
  });

  it('recognises a direct Supabase host and localhost apart', () => {
    expect(classifyDatabaseUrl('postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres').kind).toBe('direct');
    expect(classifyDatabaseUrl('postgresql://postgres:pw@localhost:5432/postgres').kind).toBe('local');
    expect(classifyDatabaseUrl('postgresql://postgres:pw@127.0.0.1:5432/postgres').kind).toBe('local');
  });

  it('never throws or leaks on a malformed URL', () => {
    expect(classifyDatabaseUrl('not-a-url')).toEqual({ kind: 'unknown', port: '', poolerHost: false });
    expect(classifyDatabaseUrl('')).toEqual({ kind: 'unknown', port: '', poolerHost: false });
  });

  it('does not return any part of the connection string', () => {
    const info = classifyDatabaseUrl('postgresql://postgres.abcdef:SuperSecret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres');
    expect(JSON.stringify(info)).not.toContain('SuperSecret');
    expect(JSON.stringify(info)).not.toContain('abcdef');
  });
});

describe('edgePoolOptions', () => {
  it('disables prepared statements and bounds the pool by default', () => {
    const options = edgePoolOptions();
    expect(options.prepare).toBe(false);
    expect(options.max).toBe(EDGE_POOL_DEFAULTS.max);
    expect(options.max).toBeLessThanOrEqual(EDGE_POOL_BOUNDS.max.max);
    expect(options.idle_timeout).toBe(EDGE_POOL_DEFAULTS.idleTimeoutSeconds);
    expect(options.max_lifetime).toBe(EDGE_POOL_DEFAULTS.maxLifetimeSeconds);
    expect(options.connect_timeout).toBe(EDGE_POOL_DEFAULTS.connectTimeoutSeconds);
    // A tag so the Edge connections are identifiable in pg_stat_activity.
    expect(options.connection.application_name).toBe('futasaku-duel-edge');
  });

  it('recycles connections sooner than a long-lived process would', () => {
    // Warm Edge isolates must not park connections forever; bounded lifetimes free them.
    expect(EDGE_POOL_DEFAULTS.maxLifetimeSeconds).toBeLessThanOrEqual(120);
    expect(EDGE_POOL_DEFAULTS.idleTimeoutSeconds).toBeLessThanOrEqual(30);
    expect(EDGE_POOL_DEFAULTS.connectTimeoutSeconds).toBeLessThanOrEqual(30);
  });

  it('lets an Edge secret tune each value, clamped to a safe range', () => {
    expect(edgePoolOptions(env({ EDGE_POOL_MAX: '3' })).max).toBe(3);
    expect(edgePoolOptions(env({ EDGE_POOL_MAX: '99' })).max).toBe(EDGE_POOL_BOUNDS.max.max);
    expect(edgePoolOptions(env({ EDGE_POOL_MAX: '0' })).max).toBe(EDGE_POOL_BOUNDS.max.min);
    expect(edgePoolOptions(env({ EDGE_POOL_MAX: 'abc' })).max).toBe(EDGE_POOL_DEFAULTS.max);
    expect(edgePoolOptions(env({ EDGE_POOL_MAX_LIFETIME: '1' })).max_lifetime).toBe(EDGE_POOL_BOUNDS.maxLifetimeSeconds.min);
    expect(edgePoolOptions(env({ EDGE_POOL_IDLE_TIMEOUT: '5' })).idle_timeout).toBe(5);
    expect(edgePoolOptions(env({ EDGE_POOL_CONNECT_TIMEOUT: '99' })).connect_timeout).toBe(
      EDGE_POOL_BOUNDS.connectTimeoutSeconds.max,
    );
    // An override can never turn prepared statements back on.
    expect(edgePoolOptions(env({ EDGE_POOL_MAX: '2' })).prepare).toBe(false);
  });
});

describe('isConnectionAcquisitionError', () => {
  it('matches the codes and messages a saturated pooler returns', () => {
    expect(isConnectionAcquisitionError({ code: '53300' })).toBe(true); // too_many_connections
    expect(isConnectionAcquisitionError({ code: 'CONNECT_TIMEOUT' })).toBe(true);
    expect(isConnectionAcquisitionError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(
      isConnectionAcquisitionError({
        message: 'remaining connection slots are reserved for roles with the SUPERUSER attribute',
      }),
    ).toBe(true);
    expect(isConnectionAcquisitionError({ message: 'Max client connections reached' })).toBe(true);
    for (const code of CONNECTION_ACQUISITION_CODES) expect(isConnectionAcquisitionError({ code })).toBe(true);
  });

  it('does NOT match mid-statement errors (retrying could apply a write twice)', () => {
    expect(isConnectionAcquisitionError({ code: 'ECONNRESET' })).toBe(false);
    expect(isConnectionAcquisitionError({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isConnectionAcquisitionError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isConnectionAcquisitionError(new Error('stale revision'))).toBe(false);
    expect(isConnectionAcquisitionError(null)).toBe(false);
    expect(isConnectionAcquisitionError('nope')).toBe(false);
  });
});

describe('withSingleRetry', () => {
  it('retries exactly once on a connection-acquisition failure and then succeeds', async () => {
    const attempts: number[] = [];
    const onRetry = vi.fn();
    const result = await withSingleRetry(async () => {
      attempts.push(1);
      if (attempts.length === 1) throw Object.assign(new Error('remaining connection slots'), { code: '53300' });
      return 'ok';
    }, onRetry);
    expect(result).toBe('ok');
    expect(attempts).toHaveLength(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-acquisition error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('syntax error');
    });
    await expect(withSingleRetry(fn)).rejects.toThrow('syntax error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the second failure so the caller can report a clean error', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('too many clients'), { code: '53300' });
    });
    await expect(withSingleRetry(fn)).rejects.toThrow('too many clients');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a successful call', async () => {
    const fn = vi.fn(async () => 'ok');
    await expect(withSingleRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('safeErrorText', () => {
  it('strips credentials and keeps a short code + message for logs', () => {
    const text = safeErrorText(
      Object.assign(new Error('connect failed to postgresql://user:SuperSecret@host:5432/db'), { code: 'ECONNREFUSED' }),
    );
    expect(text.startsWith('ECONNREFUSED')).toBe(true);
    expect(text).not.toContain('SuperSecret');
    expect(text.length).toBeLessThanOrEqual(210);
    expect(safeErrorText('plain failure')).toBe('plain failure');
  });
});

describe('the Edge entry is wired to the fix', () => {
  it('uses the shared Edge pool options and disables prepared statements', () => {
    expect(edgeEntry).toContain('edgePoolOptions');
    expect(edgeEntry).not.toContain('prepare: true');
    // The single source of truth for `prepare: false`.
    expect(poolConfig).toContain('prepare: false');
  });

  it('retries connection acquisition once and reports DB_UNAVAILABLE (not a bare 500)', () => {
    expect(edgeEntry).toContain('withSingleRetry');
    expect(edgeEntry).toContain('isConnectionAcquisitionError');
    expect(edgeEntry).toContain("'DB_UNAVAILABLE'");
    const dbUnavailable = new ApiError('DB_UNAVAILABLE', 'busy');
    expect(dbUnavailable.status).toBe(503);
  });

  it('exposes the pooler classification on the health check but no URL/host/user', () => {
    expect(edgeEntry).toContain('classifyDatabaseUrl');
    expect(edgeEntry).toContain('pooler');
    expect(edgeEntry).not.toMatch(/postgres(?:ql)?:\/\//);
    // The classification is computed from the URL without echoing it into the response.
    expect(edgeEntry).toContain('classifyDatabaseUrl(databaseUrl)');
    expect(edgeEntry).not.toMatch(/JSON\.stringify\([^)]*databaseUrl/);
  });

  it('does not cache a failed boot forever', () => {
    expect(edgeEntry).toContain('runtimePromise = null');
  });
});

describe('build-time guards', () => {
  it('refuses to bundle a credential-bearing connection string', () => {
    expect(buildEdge).toMatch(/credentialLeak/);
    expect(buildEdge).toContain('postgres(?:ql)?');
  });

  it('refuses to bundle an incomplete Edge pool configuration', () => {
    expect(buildEdge).toContain('prepare:\\s*!1');
    expect(buildEdge).toContain('max_lifetime');
    expect(buildEdge).toContain('connect_timeout');
  });
});

describe('Node pool defaults stay separate from the Edge pool', () => {
  it('keeps the documented long-lived defaults', () => {
    expect(NODE_POOL_DEFAULTS.max).toBe(5);
    expect(NODE_POOL_DEFAULTS.connectionTimeoutMillis).toBeLessThanOrEqual(15_000);
    expect(NODE_POOL_DEFAULTS.idleTimeoutMillis).toBeLessThanOrEqual(30_000);
  });
});
