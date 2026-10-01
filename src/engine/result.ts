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

/** Spec 11: higher score; tie -> lower kept-hand deadwood; still tied -> P2. */
export const deckExhaustionResult = (scores: [number, number], deadwood: [number, number]): GameResult => {
  let winner: Player;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else if (deadwood[0] !== deadwood[1]) winner = deadwood[0] < deadwood[1] ? 0 : 1;
  else winner = 1;
  return { winner, reason: 'deck_exhaustion', scores, deadwood };
};

/** Spec 8.6: the strangled player loses; both strangled is a draw. */
export const strangleResult = (outcome: StrangleOutcome, scores: [number, number]): GameResult =>
  outcome.reason === 'double_strangle'
    ? { winner: null, reason: 'double_strangle', scores }
    : { winner: other(outcome.loser), reason: 'strangle', scores };
