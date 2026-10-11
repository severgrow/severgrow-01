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
 * Spec 11: higher score wins.
 * Core game (no deadwood): equal score → higher total tile strength; still equal → draw.
 * Parked leftover-card rules (deadwood given): lower deadwood, then P2 (archived path).
 */
export const deckExhaustionResult = (
  scores: [number, number],
  deadwood: [number, number] | null,
  reason: 'deck_exhaustion' | 'turn_limit' = 'deck_exhaustion',
  tileStrengths: [number, number] | null = null,
): GameResult => {
  let winner: Player | null;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else if (deadwood) {
    if (deadwood[0] !== deadwood[1]) winner = deadwood[0] < deadwood[1] ? 0 : 1;
    else winner = 1;
  } else if (tileStrengths && tileStrengths[0] !== tileStrengths[1]) {
    winner = tileStrengths[0] > tileStrengths[1] ? 0 : 1;
  } else if (tileStrengths) {
    winner = null;
  } else {
    // Archived core path without strength totals (pre-0.4 fixtures): P2 wins ties.
    winner = 1;
  }
  const base = deadwood ? { winner, reason, scores, deadwood } : { winner, reason, scores };
  return tileStrengths && !deadwood ? { ...base, strengths: tileStrengths } : base;
};

/** Spec 8.6: the strangled player loses; both strangled is a draw. */
export const strangleResult = (outcome: StrangleOutcome, scores: [number, number]): GameResult =>
  outcome.reason === 'double_strangle'
    ? { winner: null, reason: 'double_strangle', scores }
    : { winner: other(outcome.loser), reason: 'strangle', scores };
