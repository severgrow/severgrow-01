// Match channel: Realtime pings are a hint; polling is truth (P-11). Fakes for unit tests.

import type { MatchChannel, MatchPing, PresenceSnapshot } from './types.js';

export type FakeChannelController = {
  channel: MatchChannel;
  emitPing: (matchId: string, ping: MatchPing) => void;
  emitPresence: (matchId: string, presence: PresenceSnapshot) => void;
  /** Drop all handlers (simulates Realtime outage). */
  goDown: () => void;
  /** Allow subscriptions again after goDown. */
  goUp: () => void;
  tracked: { matchId: string; online: boolean }[];
};

/** In-memory channel for unit tests (ordering, duplicates, dropped pings, presence). */
export const createFakeChannel = (): FakeChannelController => {
  type Handlers = {
    onPing: (ping: MatchPing) => void;
    onPresence: (presence: PresenceSnapshot) => void;
  };
  const subs = new Map<string, Set<Handlers>>();
  let down = false;
  const tracked: { matchId: string; online: boolean }[] = [];

  const channel: MatchChannel = {
    subscribe(matchId, handlers) {
      if (down) return () => undefined;
      let set = subs.get(matchId);
      if (!set) {
        set = new Set();
        subs.set(matchId, set);
      }
      set.add(handlers);
      return () => {
        set!.delete(handlers);
        if (set!.size === 0) subs.delete(matchId);
      };
    },
    track(matchId, online) {
      tracked.push({ matchId, online });
    },
  };

  return {
    channel,
    tracked,
    emitPing(matchId, ping) {
      if (down) return;
      for (const h of subs.get(matchId) ?? []) h.onPing(ping);
    },
    emitPresence(matchId, presence) {
      if (down) return;
      for (const h of subs.get(matchId) ?? []) h.onPresence(presence);
    },
    goDown() {
      down = true;
      subs.clear();
    },
    goUp() {
      down = false;
    },
  };
};

/**
 * Browser channel stub. Phase 6 wires real Supabase Realtime broadcast.
 * Until then this is a no-op subscribe so polling alone keeps the board fresh.
 */
export const createNoopChannel = (): MatchChannel => ({
  subscribe() {
    return () => undefined;
  },
  track() {
    /* intentional no-op until Realtime is wired */
  },
});
