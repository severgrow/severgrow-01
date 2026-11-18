// A STUCK DATABASE CONNECTION HEALS ITSELF (owner, 2026-11-18: "make the server side of things way
// more reliable").
//
// Measured on the real server that day: 1 of 10 one-line database pings (`/v1/health?db=1`) hung for
// 25 s while the other 9 answered in 0.6 s, and guest creation, chat and wallet reads went silent the
// same way while the database itself answered a ping in 3 ms. The shape is one Edge isolate whose
// two pooled connections (EDGE_POOL_DEFAULTS.max) are stuck — most likely dead sockets the pooler
// has dropped — so every request routed to that isolate waits for ever.
//
// THE GUARD: every database call (a plain query, reserving a connection, and each statement on a
// reserved connection) that does not come back within the stall limit fails as DB_UNAVAILABLE (a 503
// the page already retries), and the isolate swaps in a FRESH postgres client, closing the stuck one.
// Closing it ends any open transaction on it, which Postgres rolls back.
//
// What it deliberately does NOT do: send a stalled statement again. A write that may or may not have
// run is never repeated here; the caller's request fails cleanly and the page's own retry (with its
// own request id) decides. Several stalls at once recycle once. Pure: no Deno, no postgres.js import.
import { ApiError } from '../errors.js';
import type { PgClient, PgPool } from './postgres.js';

export const QUERY_STALL_DEFAULT_MS = 10_000;
const BOUNDS = { min: 3_000, max: 30_000 } as const;

/** The stall limit: `EDGE_QUERY_STALL_MS` when set (clamped to 3–30 s), else 10 s. */
export const queryStallMs = (env: (name: string) => string | undefined): number => {
  const raw = Number(env('EDGE_QUERY_STALL_MS')?.trim());
  if (!Number.isFinite(raw) || raw <= 0) return QUERY_STALL_DEFAULT_MS;
  return Math.min(BOUNDS.max, Math.max(BOUNDS.min, Math.floor(raw)));
};

export type RecyclableClient = { pool: PgPool; end: () => Promise<void> };

export const createRecyclingPool = (
  make: () => RecyclableClient,
  options: { stallMs: number; onRecycle?: (reason: string) => void },
): PgPool => {
  let current = make();
  /** Bumped on every swap: a stall noticed on an already-replaced client recycles nothing. */
  let generation = 0;
  const recycle = (seen: number, reason: string) => {
    if (seen !== generation) return;
    generation++;
    const old = current;
    current = make();
    options.onRecycle?.(reason);
    void old.end().catch(() => undefined);
  };
  const guard = <T>(work: () => Promise<T>, what: string): Promise<T> => {
    const seen = generation;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        recycle(seen, what);
        reject(new ApiError('DB_UNAVAILABLE', 'The duel database is briefly busy. Please retry in a moment.'));
      }, options.stallMs);
      work().then(
        (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } },
        (error: unknown) => { if (!done) { done = true; clearTimeout(timer); reject(error); } },
      );
    });
  };
  return {
    query: (text, values) => {
      const pool = current.pool;
      return guard(() => pool.query(text, values), 'query');
    },
    async connect(): Promise<PgClient> {
      const pool = current.pool;
      const client = await guard(() => pool.connect(), 'reserve');
      return {
        query: (text, values) => guard(() => client.query(text, values), 'statement'),
        release: () => client.release?.(),
      };
    },
  };
};
