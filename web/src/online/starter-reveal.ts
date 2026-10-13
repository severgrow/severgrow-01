// Online duels — the permanent "who starts" chip plus the exactly-once lottery marker.
//
// The starting-player lottery is drawn by the shared engine and never changes after setup, so the
// chip is always correct. The animation is a one-off courtesy: it plays once per player per match,
// only at the live-join moment (the match turned ACTIVE while this player was on the screen). A
// refresh, a later entry, an async catch-up or a waiting match never replays it — the chip is what
// tells the player who started in those cases.

import { ONLINE } from '../../../src/strings.js';
import type { Player } from '../../../src/engine/index.js';
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

export type StarterChipModel = { meStarts: boolean; word: string; srText: string };

/**
 * The chip's words, from this seat's point of view. Uses the engine `startingPlayer` compared with
 * the local seat — never hard-coded to seat 0 — so both seats read it correctly.
 */
export const starterChip = (startingPlayer: Player, seat: Player): StarterChipModel => {
  const meStarts = startingPlayer === seat;
  return {
    meStarts,
    word: meStarts ? ONLINE.starterYou : ONLINE.starterOpponent,
    srText: meStarts ? ONLINE.starterYouSr : ONLINE.starterOpponentSr,
  };
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
