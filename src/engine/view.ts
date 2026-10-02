import { deadwood } from './deadwood.js';
import { opponent } from './phases.js';
import { score } from './scoring.js';
import type { State, View, Player } from './types.js';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * A player's view (spec 12): never the opponent's hand or the deck order. The
 * discard pile is public. Returns fresh data that shares nothing with `state`.
 */
export const viewFor = (state: State, player: Player): View => ({
  player,
  config: copy(state.config),
  board: copy(state.board),
  terrain: copy(state.terrain),
  hand: copy(state.hands[player]),
  opponentHandCount: state.hands[opponent(player)].length,
  discard: copy(state.discard),
  deckCount: state.deck.length,
  turnPlayer: state.turnPlayer,
  actor: state.actor,
  phase: state.phase,
  drawnFromDiscard: state.drawnFromDiscard,
  fruitUsed: [...state.fruitUsed],
  strengthenUsed: [...(state.strengthenUsed ?? [0, 0])] as [number, number],
  finalTurn: copy(state.finalTurn),
  rotPick: copy(state.rotPick),
  turnNumber: state.turnNumber,
  sproutsThisTurn: state.sproutsThisTurn,
  score: score(state, player),
  opponentScore: score(state, opponent(player)),
  myDeadwood: deadwood(state.hands[player]),
  result: copy(state.result),
  lastResolution: copy(state.lastResolution),
});
