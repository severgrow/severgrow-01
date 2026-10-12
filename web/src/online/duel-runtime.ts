// Module-level online duel handle so main.ts can gate bot/coach/play without deep rewrites.
import type { OnlineSession } from './duel-session.js';

let active: OnlineSession | null = null;

export const isOnlineDuel = (): boolean => active !== null;

export const getOnlineSession = (): OnlineSession | null => active;

export const setOnlineSession = (session: OnlineSession | null): void => {
  active = session;
};

/** Regression: with the online flag off, no duel session is active. */
export const onlinePathsActive = (): boolean => active !== null;
