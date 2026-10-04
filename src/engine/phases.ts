import { deadwood } from './deadwood.js';
import { drawFromDeck, reshuffleDiscard } from './deck.js';
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
    sproutsThisTurn: 0,
  };
};

/** True when a parked leftover-card rule (Rot or Knock) is on (v0.4). */
export const leftoverRulesOn = (s: State): boolean => s.config.rotEnabled || s.config.knockEnabled;

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
  // Lab: with reshuffle on, a short deck takes the throw pile back first
  const stocked = settled.deck.length < need ? reshuffleDiscard(settled) : settled;
  const { drawn, deck } = drawFromDeck(stocked.deck, need);
  const hands: [typeof kept, typeof kept] = [stocked.hands[0], stocked.hands[1]];
  hands[p] = [...kept, ...drawn];
  let refilled: State = { ...stocked, hands, deck };
  if (s.config.reshuffleDiscard) {
    // the deck never ends the game: only the turn limit does (a hand may stay short)
    if (refilled.deck.length === 0) refilled = reshuffleDiscard(refilled);
    if (s.config.maxTurnsPerPlayer > 0 && s.turnNumber >= 2 * s.config.maxTurnsPerPlayer) {
      const dw: [number, number] = [deadwood(refilled.hands[0]), deadwood(refilled.hands[1])];
      return endGame(refilled, deckExhaustionResult(scores(refilled), leftoverRulesOn(s) ? dw : null, 'turn_limit'));
    }
    return passTurn(refilled);
  }

  if (drawn.length < need) {
    // Kept-hand deadwood: the turn player's hand before the refill; the opponent's
    // current hand (their kept hand from their own last turn plus its refill).
    const dw: [number, number] = [0, 0];
    dw[p] = deadwood(kept);
    dw[opponent(p)] = deadwood(settled.hands[opponent(p)]);
    return endGame(refilled, deckExhaustionResult(scores(refilled), leftoverRulesOn(s) ? dw : null));
  }
  if (deck.length === 0) {
    // v0.3.1: a turn never starts with an empty deck. Both hands are current here.
    const dw: [number, number] = [deadwood(refilled.hands[0]), deadwood(refilled.hands[1])];
    return endGame(refilled, deckExhaustionResult(scores(refilled), leftoverRulesOn(s) ? dw : null));
  }
  if (s.config.maxTurnsPerPlayer > 0 && s.turnNumber >= 2 * s.config.maxTurnsPerPlayer) {
    // v0.4 turn limit: every game ends, scored like the deck running out.
    const dw: [number, number] = [deadwood(refilled.hands[0]), deadwood(refilled.hands[1])];
    return endGame(refilled, deckExhaustionResult(scores(refilled), leftoverRulesOn(s) ? dw : null, 'turn_limit'));
  }
  return passTurn(refilled);
};

/**
 * After the discard (or when an empty hand skips it, v0.4): a final turn ends the game;
 * with Rot or Knock on, the KNOCK step follows; otherwise the turn finishes by itself.
 */
export const afterDiscard = (s: State, knockEnd: (s: State) => State): State => {
  if (s.finalTurn) return knockEnd(s);
  if (leftoverRulesOn(s)) return { ...s, phase: 'KNOCK' };
  return finishTurn(s, []);
};
