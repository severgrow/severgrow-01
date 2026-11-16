// OPENING A MATCH FROM THE LIST IS INSTANT (owner, 2026-11-16: "opening match from play online/your
// matches when its our turn - takes long ... make that instant").
//
// Measured before (phone viewport, 4x CPU, 250 ms network): the tap asked the server for the match and
// only then built the board — the read was the first ~330 ms of an ~800 ms open. The list already
// knows which matches wait for my move, so it asks for those while the player is looking at the list;
// the tap then builds the board at once from that answer. The duel's own sync reads again the moment
// it is open (as it always did), so an answer a few seconds old can never leave the board behind.
//
// Small by design: only matches where it is my turn, at most PREFETCH_MAX of them, once per new move
// (a poll that shows the same list asks for nothing), and an answer is used once, fresh, and only if
// this device has not seen more of that match since (the answer carries the turns to replay).

/** At most this many reads per list, however long the list is. */
export const PREFETCH_MAX = 3;
/** An answer older than this is not used: the tap reads again. */
export const PREFETCH_FRESH_MS = 30_000;

type Entry = { matchId: string; status: string; mySeat: number; turnPlayer: number | null; revision: number };
type Cached<T> = { revision: number; seen: number | undefined; at: number; view: Promise<T>; failed: boolean };

export type ViewPrefetch<T> = {
  /** The list as it is now: start a read for each match waiting for my move that has none yet. */
  warm: (entries: readonly Entry[]) => void;
  /** The answer for this match, if one is fresh and still matches this device; used once. */
  take: (matchId: string) => Promise<T> | null;
};

export const createViewPrefetch = <T>(deps: {
  fetch: (matchId: string) => Promise<T>;
  /** The revision this device has seen of the match (what the answer's catch-up is cut from). */
  seen: (matchId: string) => number | undefined;
  now?: () => number;
}): ViewPrefetch<T> => {
  const now = deps.now ?? (() => Date.now());
  const cache = new Map<string, Cached<T>>();
  return {
    warm(entries) {
      const waiting = entries.filter((e) => e.status === 'active' && e.turnPlayer === e.mySeat).slice(0, PREFETCH_MAX);
      const keep = new Set(waiting.map((e) => e.matchId));
      for (const id of [...cache.keys()]) if (!keep.has(id)) cache.delete(id);
      for (const entry of waiting) {
        const held = cache.get(entry.matchId);
        const stale = !held || held.failed || held.revision !== entry.revision || now() - held.at > PREFETCH_FRESH_MS;
        if (!stale) continue;
        const slot: Cached<T> = { revision: entry.revision, seen: deps.seen(entry.matchId), at: now(), view: Promise.resolve() as Promise<T>, failed: false };
        slot.view = deps.fetch(entry.matchId);
        slot.view.catch(() => { slot.failed = true; if (cache.get(entry.matchId) === slot) cache.delete(entry.matchId); });
        cache.set(entry.matchId, slot);
      }
    },
    take(matchId) {
      const held = cache.get(matchId);
      if (!held) return null;
      cache.delete(matchId);
      if (held.failed || now() - held.at > PREFETCH_FRESH_MS || held.seen !== deps.seen(matchId)) return null;
      return held.view;
    },
  };
};
