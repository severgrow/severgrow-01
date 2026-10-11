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
 * Spec 8: higher score wins. With the parked leftover-card rules on, a tie goes to lower
 * kept-hand deadwood first. Futasaku 0.4 (`strengths` given): a tie goes to the higher total
 * tile strength, and equal strength is a draw. Archived rules (no strengths): a tie goes to P2.
 */
export const deckExhaustionResult = (
  scores: [number, number],
  deadwood: [number, number] | null,
  reason: 'deck_exhaustion' | 'turn_limit' = 'deck_exhaustion',
  strengths: [number, number] | null = null,
): GameResult => {
  let winner: Player | null;
  let usedStrength = false;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else if (deadwood && deadwood[0] !== deadwood[1]) winner = deadwood[0] < deadwood[1] ? 0 : 1;
  else if (strengths) {
    usedStrength = true;
    winner = strengths[0] === strengths[1] ? null : strengths[0] > strengths[1] ? 0 : 1;
  } else winner = 1;
  return {
    winner, reason, scores,
    ...(deadwood ? { deadwood } : {}),
    ...(usedStrength && strengths ? { strengths } : {}),
  };
};

/** Spec 8.6: the strangled player loses; both strangled is a draw. */
export const strangleResult = (outcome: StrangleOutcome, scores: [number, number]): GameResult =>
  outcome.reason === 'double_strangle'
    ? { winner: null, reason: 'double_strangle', scores }
    : { winner: other(outcome.loser), reason: 'strangle', scores };
