// Online duels — the exactly-once "who starts" lottery reveal.
//
// Who starts is drawn by the shared engine and never changes after setup. It is surfaced once, by
// the lottery animation, at the live-join moment (the match turned ACTIVE while this player was on
// the screen). A refresh, a later entry, an async catch-up or a waiting match never replays it.
//
// The persistent "who starts" HUD chip that used to live beside this marker was removed after the
// two-phone playtest: the owner found it said too much, and the one-time reveal is enough.

import type { MatchStatus } from '../../../server/src/protocol.js';
import type { KeyValue } from '../../../server/src/client.js';

/** One marker per match, beside the existing duel session storage. */
export const STARTER_REVEAL_PREFIX = 'severgrow.duel.starterRevealed.v1.';

export const starterRevealKey = (matchId: string): string => `${STARTER_REVEAL_PREFIX}${matchId}`;

/** True when this device has already played the reveal for this match. */
export const hasStarterRevealed = (storage: KeyValue | null, matchId: string): boolean => {
  if (!storage || !matchId) return false;
  try {
    return storage.get(starterRevealKey(matchId)) === '1';
  } catch {
    return false;
  }
};

/** Persist that the reveal has played (storage failures just mean a possible replay, never a crash). */
export const markStarterRevealed = (storage: KeyValue | null, matchId: string): void => {
  if (!storage || !matchId) return;
  try {
    storage.set(starterRevealKey(matchId), '1');
  } catch {
    /* storage blocked: nothing to persist */
  }
};

export type StarterRevealContext = {
  /** Match status at this entry. */
  status: MatchStatus;
  /** True only at the live-join moment: the match became ACTIVE while this player was on screen. */
  liveJoin: boolean;
  /** The per-match marker already exists (refresh / return / async). */
  alreadyRevealed: boolean;
};

/**
 * The lottery plays exactly once per player per match, and only live. Every other path — page
 * refresh, re-entering the match, async catch-up, a match that is still waiting or already
 * finished — returns false.
 */
export const shouldPlayStarterLottery = (ctx: StarterRevealContext): boolean =>
  ctx.liveJoin && ctx.status === 'active' && !ctx.alreadyRevealed;
