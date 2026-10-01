import type { StrangleOutcome } from './strangle.js';
import type { GameResult, Player } from './types.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** Spec 7.3: the knocker wins only with a strictly higher score; otherwise Undercut. */
export const knockResult = (knocker: Player, scores: [number, number], deadwood: [number, number]): GameResult => {
  const wins = scores[knocker] > scores[other(knocker)];
  return {
    winner: wins ? knocker : other(knocker),
    reason: 'knock',
    undercut: !wins,
    scores,
    deadwood,
  };
};

/**
 * Spec 11: higher score wins. With the parked leftover-card rules on, a tie goes to
 * lower kept-hand deadwood, then P2. In the core game (no deadwood given) a tie goes
 * straight to P2 (v0.4).
 */
export const deckExhaustionResult = (
  scores: [number, number],
  deadwood: [number, number] | null,
  reason: 'deck_exhaustion' | 'turn_limit' = 'deck_exhaustion',
): GameResult => {
  let winner: Player;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else if (deadwood && deadwood[0] !== deadwood[1]) winner = deadwood[0] < deadwood[1] ? 0 : 1;
  else winner = 1;
  return deadwood ? { winner, reason, scores, deadwood } : { winner, reason, scores };
};

/** Spec 8.6: the strangled player loses; both strangled is a draw. */
export const strangleResult = (outcome: StrangleOutcome, scores: [number, number]): GameResult =>
  outcome.reason === 'double_strangle'
    ? { winner: null, reason: 'double_strangle', scores }
    : { winner: other(outcome.loser), reason: 'strangle', scores };
