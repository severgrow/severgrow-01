/**
 * "Does this match need MY response?" — the one decision behind the lobby's red "!" badge.
 *
 * Owner instruction (2026-10-25): in Play online, "your matches" sits behind a collapsed "Your
 * matches" button, and both that button and the specific match row carry a red "!" while a match
 * is waiting for HIS move.
 *
 * The decision is deliberately narrow. The server's `MatchListEntry` says everything we need:
 *   - `status` 'waiting'  — I own an invite nobody has joined yet. It waits for an OPPONENT.
 *   - `status` 'active'   — the duel is in play; `turnPlayer` is the seat to act now.
 *   - `status` 'finished' — over. A result may be unseen, but it is not a move to make.
 *   - `mySeat`            — which seat I hold.
 * So a match needs my response exactly when it is ACTIVE and `turnPlayer === mySeat`.
 *
 * `unseenTurn` is intentionally NOT an input: server/src/service.ts only sets it when
 * `status === 'active' && gated.turnPlayer === row.mySeat`, i.e. it is already a subset of this
 * decision. Using it could only widen the badge to states that are not a move (finished results),
 * which is exactly the false alarm that teaches a player to ignore the mark.
 *
 * This module is pure and DOM-free so the rule can be unit-tested and shared by the lobby.
 */
import type { MatchListEntry } from '../../../server/src/protocol.js';
import { ONLINE } from '../../../src/strings.js';

/** The three payload fields the decision reads (a Pick keeps the tests honest about that). */
export type AttentionSource = Pick<MatchListEntry, 'status' | 'mySeat' | 'turnPlayer'>;

export const needsMyResponse = (entry: AttentionSource): boolean =>
  entry.status === 'active' && entry.turnPlayer === entry.mySeat;

export const countNeedingResponse = (entries: readonly AttentionSource[]): number =>
  entries.reduce((count, entry) => (needsMyResponse(entry) ? count + 1 : count), 0);

/** "Your matches (3)" — the button's visible label. */
export const yourMatchesLabel = (total: number): string => ONLINE.yourMatchesCount(total);

/** The badge's spoken sentence. Empty when nothing is waiting. */
export const attentionBadgeWords = (waiting: number): string => {
  if (waiting <= 0) return '';
  return waiting === 1 ? ONLINE.matchesWaitingOne : ONLINE.matchesWaitingMany(waiting);
};

/**
 * The disclosure button's accessible name: the visible label PLUS the waiting count in words, so a
 * screen reader user learns what the red "!" means without seeing it.
 */
export const yourMatchesButtonName = (total: number, waiting: number): string => {
  const label = yourMatchesLabel(total);
  const words = attentionBadgeWords(waiting);
  return words ? `${label}. ${words}` : label;
};
