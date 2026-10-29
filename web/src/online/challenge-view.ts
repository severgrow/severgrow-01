import type { WorldChallengeWire } from '../../../server/src/seeds/types.js';
import { CHALLENGE } from './challenge-copy.js';

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
 *   settling accepted, match FINISHED → NO primary: the server settles it by itself. The harmless
 *            `SETTLE NOW` fallback lives on the secondary key and nobody has to press it.
 *   resolved already settled   → no primary
 *   closed   declined/expired/stale → no primary
 */
export type ChallengeSheetMode = 'defend' | 'wait' | 'duel' | 'settling' | 'resolved' | 'closed';

export const sheetModeFor = (challenge: WorldChallengeWire, viewerId: string): ChallengeSheetMode => {
  if (challenge.status === 'resolved') return 'resolved';
  if (challenge.status === 'pending') return challenge.defenderId === viewerId ? 'defend' : 'wait';
  if (challenge.status === 'accepted') return challenge.matchFinished ? 'settling' : 'duel';
  return 'closed';
};

/**
 * THE SETTLING SHEET (owner, 2026-10-29). A finished linked duel is applied automatically by the
 * server on the read that follows; the sheet therefore offers NO primary action. `fallback` is a
 * harmless secondary key for the rare client that has not received the resolved row yet: it posts
 * the same idempotent confirm, so pressing it can never settle twice.
 */
export type SettlementSheetCopy = { line: string; meta: string; fallback: boolean; drawn: boolean };

export const settlementSheetCopy = (
  challenge: Pick<WorldChallengeWire, 'matchWinnerId' | 'challengerName' | 'defenderName' | 'challengerId' | 'stakeCellId'>,
  viewerId: string,
): SettlementSheetCopy => {
  const winner = challenge.matchWinnerId === null ? null
    : challenge.matchWinnerId === challenge.challengerId ? challenge.challengerName
      : challenge.defenderName;
  if (winner === null) {
    return { line: CHALLENGE.drawLine, meta: CHALLENGE.drawMeta, fallback: true, drawn: true };
  }
  const mine = challenge.matchWinnerId === viewerId;
  const meta = challenge.stakeCellId === null
    ? CHALLENGE.defendMeta
    : mine
      ? `YOUR TILE ${challenge.stakeCellId} AT STAKE`
      : 'YOUR CONTESTED TILE AT STAKE';
  return {
    line: CHALLENGE.settlingLine(winner),
    meta,
    fallback: true,
    drawn: false,
  };
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

/**
 * THE DEFENDER'S SHEET, AS A FUNCTION OF THE CLOCK (owner report, 2026-10-28: the defender was shown
 * the challenger's stake above ACCEPT and read it as their price; they must instead read a countdown
 * and be able to answer to keep the tile).
 *
 * The sheet is opened once, but the deadline keeps moving, so the sentence is computed from `now`
 * rather than captured on open — the sheet re-runs this every second. At zero it STOPS asking and
 * says what `expireChallenges` does: the tile goes to the challenger. Keeping that rule here (pure,
 * no DOM) is what makes both the live tick and the expired state testable.
 */
export type DefendSheetCopy = { line: string; meta: string; expired: boolean };

export const defendSheetCopy = (
  challenge: Pick<WorldChallengeWire, 'challengerName' | 'expiresAt'>,
  now: number,
): DefendSheetCopy => {
  const name = challenge.challengerName ?? 'Player';
  const left = challenge.expiresAt - now;
  if (left > 0) {
    return { line: CHALLENGE.defendLine(name, remainingLabel(left)), meta: CHALLENGE.defendMeta, expired: false };
  }
  return {
    line: CHALLENGE.deadlineLine(challenge.challengerName ?? 'The challenger'),
    meta: CHALLENGE.forfeited,
    expired: true,
  };
};

/**
 * THE CROSSED SWORDS (owner, 2026-10-24: "place 2 swords graphic on top of the tile that is being
 * challenged... if someone clicks at it they can see who challenged it too").
 *
 * The glyph is drawn in the map's own SVG, but WHICH tile carries it — and what it says when a
 * keyboard reaches it — is arithmetic, so it is asserted here instead of in a browser. The marker is
 * the pending state and nothing else: the moment a challenge is accepted, declined, expired, stale
 * or forfeited the data stops offering one, so the swords leave without a timer of their own. That is
 * also exactly the lifecycle of the timer ring (`ringFraction`), so glyph and ring arrive and leave
 * together.
 */
/** The settled sheet: what the server already did, with no key to press. */
export const resolvedSheetCopy = (
  challenge: Pick<WorldChallengeWire, 'winnerId' | 'challengerId' | 'challengerName' | 'defenderName'>,
): { line: string; meta: string } => {
  const name = challenge.winnerId === null ? null
    : challenge.winnerId === challenge.challengerId ? challenge.challengerName : challenge.defenderName;
  return {
    line: CHALLENGE.resolvedLine(name, challenge.winnerId === challenge.challengerId),
    meta: CHALLENGE.settledShort,
  };
};

/**
 * THE STAKE MARKER. The challenger's own tile is at risk for as long as the challenge is open, so
 * the map draws a quiet, static ring on it (the same six-point hex outline as everything else) and
 * tells assistive tech which tile it is. Only the CHALLENGER sees their own stake: it is their
 * property, and the defender's risk is already named on the contested tile.
 */
export type StakeMarker = { challengeId: string; cellId: string; label: string };

export const stakeMarkersFor = (
  challenges: readonly WorldChallengeWire[],
  viewerId: string,
): StakeMarker[] => challenges
  .filter((challenge) => challenge.challengerId === viewerId && challenge.stakeCellId !== null &&
    (challenge.status === 'pending' || challenge.status === 'accepted'))
  .map((challenge) => ({
    challengeId: challenge.id,
    cellId: challenge.stakeCellId!,
    // The a11y label DOES name the cell: it is not a sentence a player reads, and a screen-reader
    // user needs to know exactly which of their tiles is at risk. The visible sentence (above) must
    // never carry a coordinate — that is the split this pair exists to make.
    label: CHALLENGE.stakeLabel(`your tile ${challenge.stakeCellId!}`),
  }))
  .sort((a, b) => (a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : a.challengeId < b.challengeId ? -1 : 1));

export type ChallengeMarker = {
  /** The one challenge the marker belongs to; paint() reuses its node by this id across polls. */
  challengeId: string;
  cellId: string;
  /** True when this player DEFENDS the tile (the challenge arrived), false when they sent it. */
  incoming: boolean;
  /** The other player's display name — the answer the tap gives. */
  name: string;
  /** The glyph's accessible name. Deterministic for a challenge; never contains an id. */
  label: string;
};

/**
 * The glyph's touch target, in the map's world units. One hex is √3·R = 17.32 units wide; at the map's
 * 46 px cell floor that is 2.656 px per unit, so a radius of 8.4 units is 44.6 px — over the owner's
 * 44 px minimum — while staying inside the hex's 8.66-unit inradius. It can never grow a halo over a
 * neighbour, and it only gets larger as the map is zoomed in.
 */
export const SWORDS_HIT_RADIUS = 8.4;
const HEX_WIDTH_UNITS = Math.sqrt(3) * 10;

/** The marker's touch target in CSS pixels for a cell drawn `cellPixelWidth` wide. */
export const swordsHitPx = (cellPixelWidth: number): number =>
  (SWORDS_HIT_RADIUS * 2 / HEX_WIDTH_UNITS) * cellPixelWidth;

/**
 * The marker for one tile, or null. A pending challenge is the ONLY state with swords — an accepted
 * one already has a sheet and a duel, and a closed one is history. If a cell somehow carries more
 * than one pending entry, the defender's own answer outranks an outgoing one, then the sooner
 * deadline, then the id — the same tile always draws the same marker, whatever order the list
 * arrives in.
 */
export const challengeMarkerFor = (
  challenges: readonly WorldChallengeWire[],
  cellId: string,
): ChallengeMarker | null => {
  const open = challenges
    .filter((challenge) => challenge.cellId === cellId && challenge.status === 'pending')
    .sort((a, b) =>
      (a.fromMe === b.fromMe ? 0 : a.fromMe ? 1 : -1) ||
      a.expiresAt - b.expiresAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const challenge = open[0];
  if (!challenge) return null;
  const name = (challenge.fromMe ? challenge.defenderName : challenge.challengerName) ?? 'Player';
  return {
    challengeId: challenge.id,
    cellId,
    incoming: !challenge.fromMe,
    name,
    label: challenge.fromMe ? CHALLENGE.markerTo(name) : CHALLENGE.markerFrom(name),
  };
};
