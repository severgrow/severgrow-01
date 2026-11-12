// THE PUBLIC MAP READ GUARD (launch readiness, 2026-11-12).
//
// `GET /v1/world` needs no account, and one uncached read is several database round trips (the lazy
// settles, the map, the disputes). Before this guard it was the one unmetered public read: anyone
// could loop it. Two small, in-memory protections, per Edge isolate:
//
//   * A short cache for ANONYMOUS reads. However many people look, one isolate reads the database at
//     most once per WORLD_CACHE_MS. Concurrent reads share one load. A failed load is never cached.
//   * A per-IP hourly budget (`rateLimits.worldPerIpPerHour`) for every read. In memory on purpose:
//     a Postgres-backed limiter is itself one database write per read, which is the cost we are
//     trying to bound. Per isolate, so it is a flood guard, not an exact quota.
//
// A FRESH read (a signed-in caller) skips the cache and refreshes it for everyone: a player who has
// just claimed, sold or confirmed a tile must never be shown the map from before their own move,
// even when the write landed on another isolate. A write in this isolate also drops the cache.
import { ApiError } from '../errors.js';

/** How long an anonymous map read may be served from memory. The page polls every 12 s. */
export const WORLD_CACHE_MS = 3000;
/** Past this many tracked IPs in one hour the table is cleared (fail open, never unbounded memory). */
const MAX_TRACKED_IPS = 20_000;
const HOUR_MS = 3_600_000;

export type WorldReadGuard<T> = {
  /** Reads the map. `fresh` skips the cache. Throws RATE_LIMITED past the IP's budget. */
  read(ip: string | null, fresh: boolean): Promise<T>;
  /** Drops the cached map (after a write). */
  invalidate(): void;
};

export const createWorldReadGuard = <T>(
  load: () => Promise<T>,
  options: { now: () => number; perIpPerHour: number; cacheMs?: number },
): WorldReadGuard<T> => {
  const cacheMs = options.cacheMs ?? WORLD_CACHE_MS;
  let cached: { at: number; value: T } | null = null;
  let flight: Promise<T> | null = null;
  let generation = 0;
  let hour = -1;
  const hits = new Map<string, number>();

  const spend = (ip: string | null): void => {
    const nowHour = Math.floor(options.now() / HOUR_MS);
    if (nowHour !== hour || hits.size > MAX_TRACKED_IPS) {
      hour = nowHour;
      hits.clear();
    }
    const key = ip ?? 'unknown';
    const used = (hits.get(key) ?? 0) + 1;
    hits.set(key, used);
    if (used > options.perIpPerHour) throw new ApiError('RATE_LIMITED', 'Too many map reads. Wait a moment.');
  };

  const loadAndStore = (): Promise<T> => {
    const mine = generation;
    const started = options.now();
    const run = load().then((value) => {
      // A write that landed while this read was in flight wins: do not cache a pre-write answer.
      if (mine === generation) cached = { at: started, value };
      return value;
    });
    return run;
  };

  return {
    async read(ip, fresh) {
      spend(ip);
      if (fresh) return loadAndStore();
      if (cached && options.now() - cached.at < cacheMs) return cached.value;
      if (!flight) flight = loadAndStore().finally(() => { flight = null; });
      return flight;
    },
    invalidate() {
      generation++;
      cached = null;
      flight = null;
    },
  };
};
