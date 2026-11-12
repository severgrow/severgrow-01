// Module-level online duel handle so main.ts can gate bot/coach/play without deep rewrites.
import type { OnlineSession } from './duel-session.js';

let active: OnlineSession | null = null;
const matchIds = new WeakMap<OnlineSession, string>();
const listeners = new Set<(session: OnlineSession | null) => void>();

export const subscribeOnlineSession = (listener: (session: OnlineSession | null) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const isOnlineDuel = (): boolean => active !== null;

export const getOnlineSession = (): OnlineSession | null => active;

/** A session's match never changes. Metadata polls need not rebuild its board and legal moves. */
export const getOnlineMatchId = (): string | null => {
  if (!active) return null;
  let id = matchIds.get(active);
  if (id === undefined) {
    id = active.driver.snapshot().matchId;
    matchIds.set(active, id);
  }
  return id;
};

export const setOnlineSession = (session: OnlineSession | null): void => {
  if (active === session) return;
  active = session;
  for (const listener of listeners) {
    try { listener(session); } catch { /* UI refresh must not interrupt authoritative match entry. */ }
  }
};

/** Regression: with the online flag off, no duel session is active. */
export const onlinePathsActive = (): boolean => active !== null;
