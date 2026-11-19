// A visitor's IP address is never written to the database (privacy review, 2026-11-19).
//
// Rate limits are counted per bucket, and several buckets are named after the client IP
// (`guest:ip:<ip>`, `join:ip:<ip>`, `feedback:report:ip:<ip>`, ...). The counter needs a stable
// name, not the address, so the stored bucket is a one-way hash of it. Counting is unchanged.
// Runs only with REQUIRE_DATABASE=1 and a throwaway DATABASE_URL, like the other *.integration suites.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import type { PgPool } from '../src/storage/postgres.js';
import { postgresStorage } from '../src/storage/postgres.js';

const url = process.env.DATABASE_URL;
const enabled = process.env.REQUIRE_DATABASE === '1' && !!url;

describe.skipIf(!enabled)('rate limits on real Postgres', () => {
  let pool: PgPool;
  beforeAll(() => { pool = poolFromUrl(url!); });
  afterAll(async () => { await (pool as PgPool & { end?: () => Promise<void> }).end?.(); });

  it('stores no IP address, and still counts per bucket', async () => {
    const storage = postgresStorage(pool);
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const bucket = `guest:ip:${ip}:${randomUUID()}`;
    const window = 1_000_000;
    expect(await storage.hitRateLimit(bucket, window, 2)).toEqual({ ok: true, count: 1 });
    expect(await storage.hitRateLimit(bucket, window, 2)).toEqual({ ok: true, count: 2 });
    expect(await storage.hitRateLimit(bucket, window, 2)).toEqual({ ok: false, count: 3 });
    // Another address has its own count.
    expect(await storage.hitRateLimit(`${bucket}x`, window, 2)).toEqual({ ok: true, count: 1 });
    const stored = await pool.query('select bucket from rate_limits where bucket like $1', [`%${ip}%`]);
    expect(stored.rows, 'no bucket name carries an address').toEqual([]);
  });
});
