import type { WorldChallengeWire } from '../../../server/src/seeds/types.js';

/**
 * The challenge layer's pure arithmetic and state machine. Kept out of `world-view.ts` so the ring's
 * drain, the low-time threshold and the sheet's one-primary state are asserted without a browser.
 */
export const CHALLENGE_LOW_MS = 6 * 60 * 60 * 1000;

/**
 * How many chips the Territory rail shows at once. Past this the rail says "+N MORE" rather than
 * dropping the rest silently: the cap exists to protect the map's height, not to hide information.
 */
export const CHALLENGE_RAIL_MAX = 8;

/** How much of the 24 h answer window is LEFT, 1 → 0. Nothing but a pending challenge has a ring. */
export const ringFraction = (
  challenge: Pick<WorldChallengeWire, 'createdAt' | 'expiresAt' | 'status'>,
  now: number,
): number => {
  if (challenge.status !== 'pending') return 0;
  const span = challenge.expiresAt - challenge.createdAt;
  if (!(span > 0)) return 0;
  return Math.max(0, Math.min(1, (challenge.expiresAt - now) / span));
};

/** Under six hours the ring starts its slow breath (the design's one new motion). */
export const isLow = (challenge: Pick<WorldChallengeWire, 'expiresAt' | 'status'>, now: number): boolean => {
  if (challenge.status !== 'pending') return false;
  const left = challenge.expiresAt - now;
  return left > 0 && left <= CHALLENGE_LOW_MS;
};

/** "43 min", "22 h", "3 d" — the one time label used on the map, the sheet and the list.
 *
 *  Floor, never round up: this is a countdown, and a label that claimed "24 h" with 23 h 01 m left
 *  would be telling the player they have time they do not have. `0 min` is the honest floor.
 */
export const remainingLabel = (ms: number): string => {
  if (!(ms > 0)) return '0 min';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
};

/** The open challenge on a cell, if any. History never marks a cell. */
export const challengeForCell = (
  challenges: readonly WorldChallengeWire[],
  cellId: string,
): WorldChallengeWire | null =>
  challenges.find((c) => c.cellId === cellId && (c.status === 'pending' || c.status === 'accepted')) ?? null;

/**
 * The challenge sheet has exactly one state at a time, and at most ONE primary key:
 *   defend   incoming pending  → ACCEPT (primary) / DECLINE
 *   wait     outgoing pending  → no primary, the sentence explains the wait
 *   duel     accepted, match running → OPEN DUEL (primary)
 *   confirm  accepted, match FINISHED → TAKE THE GROUND (primary)
 *   resolved already settled   → no primary
 *   closed   declined/expired/stale → no primary
 */
export type ChallengeSheetMode = 'defend' | 'wait' | 'duel' | 'confirm' | 'resolved' | 'closed';

export const sheetModeFor = (challenge: WorldChallengeWire, viewerId: string): ChallengeSheetMode => {
  if (challenge.status === 'resolved') return 'resolved';
  if (challenge.status === 'pending') return challenge.defenderId === viewerId ? 'defend' : 'wait';
  if (challenge.status === 'accepted') return challenge.matchFinished ? 'confirm' : 'duel';
  return 'closed';
};

/** A participant's display name from the wire, or null for an unrelated id. */
export const playerName = (challenge: WorldChallengeWire, playerId: string | null): string | null => {
  if (playerId === null) return null;
  if (playerId === challenge.challengerId) return challenge.challengerName;
  if (playerId === challenge.defenderId) return challenge.defenderName;
  return null;
};

/** The other player's display name, or a neutral word — never an id on screen. */
export const opponentName = (challenge: WorldChallengeWire, viewerId: string): string =>
  (challenge.challengerId === viewerId ? challenge.defenderName : challenge.challengerName) ?? 'Player';

/** The settled winner's name, or null for a draw / an unsettled challenge. */
export const winnerName = (challenge: WorldChallengeWire): string | null => {
  if (challenge.winnerId === null) return null;
  return challenge.winnerId === challenge.challengerId ? challenge.challengerName : challenge.defenderName;
};
