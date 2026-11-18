// A STUCK DATABASE CONNECTION HEALS ITSELF (owner, 2026-11-18: "make the server side of things way
// more reliable"). Measured on the real server that day: 1 of 10 one-line database pings hung for
// 25 s while the other 9 answered in 0.6 s; guest creation, chat and wallet reads went silent the
// same way. An isolate whose two connections are stuck kept every request it received waiting for
// ever. Now a database call that does not come back within the stall limit fails as DB_UNAVAILABLE
// (503, which the page already retries) and the isolate opens fresh connections.
import { describe, expect, it, vi } from 'vitest';
import { createRecyclingPool, QUERY_STALL_DEFAULT_MS, queryStallMs } from '../src/storage/stall-guard.js';
import type { PgPool } from '../src/storage/postgres.js';

const never = () => new Promise<never>(() => {});
const rows = (n: number) => ({ rows: [{ n }] });

/** A client factory whose clients the test controls; records ends. */
const factory = (behave: (generation: number) => PgPool) => {
  let generation = 0;
  const ended: number[] = [];
  return {
    ended,
    make: () => {
      const g = ++generation;
      return { pool: behave(g), end: async () => { ended.push(g); } };
    },
    generation: () => generation,
  };
};

describe('a database call that never comes back', () => {
  it('a call that answers in time passes straight through', async () => {
    const f = factory(() => ({ query: async () => rows(1), connect: async () => ({ query: async () => rows(2) }) }));
    const pool = createRecyclingPool(f.make, { stallMs: 1000 });
    await expect(pool.query('select 1')).resolves.toEqual(rows(1));
    expect(f.generation()).toBe(1);
  });

  it('a stalled call fails as DB_UNAVAILABLE at the limit, and the next call uses fresh connections', async () => {
    vi.useFakeTimers();
    try {
      const f = factory((g) => ({ query: g === 1 ? never : async () => rows(g), connect: async () => ({ query: async () => rows(g) }) }));
      const pool = createRecyclingPool(f.make, { stallMs: 1000 });
      const stuck = pool.query('select 1');
      const failed = expect(stuck).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
      await vi.advanceTimersByTimeAsync(1000);
      await failed;
      expect(f.ended, 'the stuck connections are closed').toEqual([1]);
      await expect(pool.query('select 1')).resolves.toEqual(rows(2));
    } finally { vi.useRealTimers(); }
  });

  it('several stalls at once open fresh connections once, not once each', async () => {
    vi.useFakeTimers();
    try {
      const f = factory((g) => ({ query: g === 1 ? never : async () => rows(g), connect: async () => ({ query: async () => rows(g) }) }));
      const pool = createRecyclingPool(f.make, { stallMs: 1000 });
      const all = [pool.query('a'), pool.query('b'), pool.query('c')].map((p) => p.catch((e: { code: string }) => e.code));
      await vi.advanceTimersByTimeAsync(1000);
      expect(await Promise.all(all)).toEqual(['DB_UNAVAILABLE', 'DB_UNAVAILABLE', 'DB_UNAVAILABLE']);
      expect(f.generation()).toBe(2);
    } finally { vi.useRealTimers(); }
  });

  it('a stalled write is never sent again on its own (nothing can happen twice)', async () => {
    vi.useFakeTimers();
    try {
      const sent: string[] = [];
      const f = factory((g) => ({ query: async (text: string) => { sent.push(`${g}:${text}`); return g === 1 ? never() : rows(g); }, connect: async () => ({ query: async () => rows(g) }) }));
      const pool = createRecyclingPool(f.make, { stallMs: 1000 });
      const write = pool.query('insert into players values (1)').catch(() => 'failed');
      await vi.advanceTimersByTimeAsync(1000);
      expect(await write).toBe('failed');
      expect(sent).toEqual(['1:insert into players values (1)']);
    } finally { vi.useRealTimers(); }
  });

  it('a reserved connection (a transaction) is guarded too, at reserve and at each statement', async () => {
    vi.useFakeTimers();
    try {
      const f = factory((g) => ({ query: async () => rows(g), connect: g === 1 ? never : async () => ({ query: async () => rows(g) }) }));
      const pool = createRecyclingPool(f.make, { stallMs: 1000 });
      const reserving = pool.connect().catch((e: { code: string }) => e.code);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await reserving).toBe('DB_UNAVAILABLE');
      const client = await pool.connect();
      await expect(client.query('select 1')).resolves.toEqual(rows(2));
    } finally { vi.useRealTimers(); }
  });

  it('a real database error is passed on as it is and recycles nothing', async () => {
    const f = factory(() => ({ query: async () => { throw Object.assign(new Error('duplicate key'), { code: '23505' }); }, connect: async () => ({ query: async () => rows(1) }) }));
    const pool = createRecyclingPool(f.make, { stallMs: 1000 });
    await expect(pool.query('insert')).rejects.toMatchObject({ code: '23505' });
    expect(f.generation()).toBe(1);
  });

  it('the limit is tunable by an Edge secret, within safe bounds', () => {
    expect(queryStallMs(() => undefined)).toBe(QUERY_STALL_DEFAULT_MS);
    expect(queryStallMs(() => '20000')).toBe(20000);
    expect(queryStallMs(() => '50')).toBe(3000);
    expect(queryStallMs(() => '999999')).toBe(30000);
    expect(queryStallMs(() => 'nonsense')).toBe(QUERY_STALL_DEFAULT_MS);
  });
});
