import { deadwood } from './deadwood.js';
import { drawFromDeck } from './deck.js';
import { deckExhaustionResult, strangleResult } from './result.js';
import { scores } from './scoring.js';
import { sever } from './sever.js';
import { strangleOutcome } from './strangle.js';
import type { Coord, GameResult, Player, ResolutionSummary, State } from './types.js';

export const opponent = (p: Player): Player => (p === 0 ? 1 : 0);

export const emptyResolution = (): ResolutionSummary => ({ placed: [], overgrown: [], rotted: [], severed: [] });

export const endGame = (s: State, result: GameResult): State => ({ ...s, phase: 'GAME_OVER', result, rotPick: null });

/** Hands the turn to the other player at DRAW. */
export const passTurn = (s: State): State => {
  const next = opponent(s.turnPlayer);
  return {
    ...s,
    turnPlayer: next,
    actor: next,
    phase: 'DRAW',
    turnNumber: s.turnNumber + 1,
    drawnFromDiscard: null,
    rotPick: null,
  };
};

/**
 * Sever, then the Strangle check (spec 8.5-8.6). Records severed tiles and any
 * strangle in the resolution and ends the game if a root is strangled.
 */
export const severAndStrangle = (s: State, mover: Player, res: ResolutionSummary): State => {
  const cut = sever(s.board, s.config, mover);
  const resolution: ResolutionSummary = { ...res, severed: [...res.severed, ...cut.severed] };
  const after: State = { ...s, board: cut.board, lastResolution: resolution };
  const outcome = strangleOutcome(after);
  if (!outcome) return after;
  const withStrangle: State =
    outcome.reason === 'strangle' ? { ...after, lastResolution: { ...resolution, strangled: outcome.loser } } : after;
  return endGame(withStrangle, strangleResult(outcome, scores(after)));
};

/**
 * Continue steps 2-4 (spec 6.4), after all Rot removals: Sever + Strangle, Refill,
 * end of turn. A short refill draws what exists and ends the game, and so does a
 * refill that leaves the deck empty (spec 6.5, v0.3.1).
 */
export const finishTurn = (s: State, rotted: Coord[]): State => {
  const res: ResolutionSummary = { ...emptyResolution(), rotted };
  const settled = severAndStrangle(s, s.turnPlayer, res);
  if (settled.phase === 'GAME_OVER') return settled;

  const p = s.turnPlayer;
  const kept = settled.hands[p];
  const need = Math.max(0, s.config.handSize - kept.length);
  const { drawn, deck } = drawFromDeck(settled.deck, need);
  const hands: [typeof kept, typeof kept] = [...settled.hands];
  hands[p] = [...kept, ...drawn];
  const refilled: State = { ...settled, hands, deck };

  if (drawn.length < need) {
    // Kept-hand deadwood: the turn player's hand before the refill; the opponent's
    // current hand (their kept hand from their own last turn plus its refill).
    const dw: [number, number] = [0, 0];
    dw[p] = deadwood(kept);
    dw[opponent(p)] = deadwood(settled.hands[opponent(p)]);
    return endGame(refilled, deckExhaustionResult(scores(refilled), dw));
  }
  if (deck.length === 0) {
    // v0.3.1: a turn never starts with an empty deck. Both hands are current here.
    const dw: [number, number] = [deadwood(refilled.hands[0]), deadwood(refilled.hands[1])];
    return endGame(refilled, deckExhaustionResult(scores(refilled), dw));
  }
  return passTurn(refilled);
};
