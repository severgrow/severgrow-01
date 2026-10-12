// Client-side shadow State from a safe View (Phase 0 g / P-7). Deck and opponent hand
// are opaque placeholders with the right counts only — never real hidden cards.
import { isFruitCard, opponent } from '../../../src/engine/index.js';
import type { Card, Player, State, View } from '../../../src/engine/index.js';

/** Opaque placeholder ids must never collide with real deck ids (createCards uses 0..n-1). */
export const PLACEHOLDER_ID_BASE = 50_000;

const placeholderCard = (slot: number): Card => ({
  id: PLACEHOLDER_ID_BASE + slot,
  suit: 0,
  rank: 1,
});

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Reconstruct fruitKnown[opponent] from public View fields so fruitUnseen stays consistent.
 * fruitKnown[me] is unknown to us; 0 is safe for mid-turn Grow/Bloom/Throw preview.
 */
export const fruitKnownFromView = (view: View): [number, number] => {
  const me = view.player;
  const opp = opponent(me);
  const myFruit = view.hand.filter(isFruitCard).length;
  const discardFruit = view.discard.filter(isFruitCard).length;
  const oppKnown = Math.max(
    0,
    view.config.fruitCardCount - myFruit - view.fruitPlayed - discardFruit - view.fruitUnseen,
  );
  const known: [number, number] = [0, 0];
  known[opp] = oppKnown;
  known[me] = 0;
  return known;
};

/**
 * Shadow State visible to the viewer: real hand/board/discard; fake deck + opponent hand by count.
 * Used only for local draft preview after a committed Draw. Never sent to the server.
 */
export const shadowFromView = (view: View): State => {
  const me = view.player;
  const opp = opponent(me);
  const deck = Array.from({ length: view.deckCount }, (_, i) => placeholderCard(i));
  const oppHand = Array.from({ length: view.opponentHandCount }, (_, i) => placeholderCard(10_000 + i));
  const hands: [Card[], Card[]] = [[], []];
  hands[me] = copy(view.hand);
  hands[opp] = oppHand;

  // When the deck is empty under deck-final rules, invent a minimal deckFinal so EndAct
  // preview does not throw; the server remains authoritative for the real Throw.
  const deckFinal =
    view.config.deckFinalTurns && view.deckCount === 0 && view.phase !== 'GAME_OVER'
      ? { first: view.turnPlayer as Player, remaining: 2 as const }
      : null;

  return {
    seed: 0,
    config: copy(view.config),
    board: copy(view.board),
    terrain: copy(view.terrain),
    hands,
    deck,
    discard: copy(view.discard),
    turnPlayer: view.turnPlayer,
    startingPlayer: view.turnPlayer,
    actor: view.actor,
    phase: view.phase,
    drawnFromDiscard: view.drawnFromDiscard,
    fruitPlayed: view.fruitPlayed,
    fruitKnown: fruitKnownFromView(view),
    strengthenUsed: [...view.strengthenUsed] as [number, number],
    finalTurn: copy(view.finalTurn),
    deckFinal,
    rotPick: copy(view.rotPick),
    turnNumber: view.turnNumber,
    result: copy(view.result),
    lastResolution: copy(view.lastResolution),
    sproutsThisTurn: view.sproutsThisTurn,
  };
};
