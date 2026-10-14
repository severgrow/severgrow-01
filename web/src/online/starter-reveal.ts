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

/**
 * The index of the matches whose marker is still worth keeping (newest first). Without it the
 * per-match keys accumulate in localStorage for every duel ever played on this device and are never
 * removed — a slow, unbounded growth measured across a 15-match soak. The marker is only ever read
 * at a LIVE JOIN, which cannot happen for a match older than the recent list, so pruning is safe.
 */
export const STARTER_REVEAL_INDEX_KEY = 'severgrow.duel.starterRevealed.v1.index';
/** How many match markers are kept. Beyond this the entry (and its key) is dropped. */
export const STARTER_REVEAL_KEEP = 50;

export const starterRevealKey = (matchId: string): string => `${STARTER_REVEAL_PREFIX}${matchId}`;

const readIndex = (storage: KeyValue): string[] => {
  try {
    const raw = storage.get(STARTER_REVEAL_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
};

/** True when this device has already played the reveal for this match. */
export const hasStarterRevealed = (storage: KeyValue | null, matchId: string): boolean => {
  if (!storage || !matchId) return false;
  try {
    return storage.get(starterRevealKey(matchId)) === '1';
  } catch {
    return false;
  }
};

/**
 * Persist that the reveal has played (storage failures just mean a possible replay, never a crash).
 * The marker is bounded: the newest `STARTER_REVEAL_KEEP` matches are kept and older markers are
 * removed, so a device that plays duels for months does not accumulate one key per duel forever.
 */
export const markStarterRevealed = (storage: KeyValue | null, matchId: string): void => {
  if (!storage || !matchId) return;
  try {
    storage.set(starterRevealKey(matchId), '1');
    const previous = readIndex(storage);
    const kept = [matchId, ...previous.filter((id) => id !== matchId)].slice(0, STARTER_REVEAL_KEEP);
    const dropped = previous.filter((id) => !kept.includes(id));
    for (const id of dropped) storage.remove(starterRevealKey(id));
    storage.set(STARTER_REVEAL_INDEX_KEY, JSON.stringify(kept));
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
