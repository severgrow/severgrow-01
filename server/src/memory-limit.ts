// A RATE LIMIT FOR PLAIN READS, IN MEMORY (owner, 2026-11-18: "make the server side of things way
// more reliable and efficient"). A Postgres-backed limit is itself one database write per request;
// on a read that is polled every few seconds that write is the main cost. Per Edge isolate, so it is
// a flood guard, not an exact quota (the same trade as the public map read, seeds/world-read.ts).
// Writes (sending, blocking, reporting) keep their database budgets.

export type MemoryLimiter = { hit(key: string): boolean; size(): number };

export const createMemoryLimiter = (options: {
  max: number;
  windowMs: number;
  now: () => number;
  /** Past this many tracked keys the table is cleared: fail open, never unbounded memory. */
  maxKeys?: number;
}): MemoryLimiter => {
  const maxKeys = options.maxKeys ?? 20_000;
  let window = -1;
  const hits = new Map<string, number>();
  return {
    hit(key) {
      const current = Math.floor(options.now() / options.windowMs);
      if (current !== window || hits.size >= maxKeys) { window = current; hits.clear(); }
      const used = (hits.get(key) ?? 0) + 1;
      hits.set(key, used);
      return used <= options.max;
    },
    size: () => hits.size,
  };
};
