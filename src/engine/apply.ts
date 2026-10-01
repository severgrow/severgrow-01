import { coordKey } from './board.js';
import { ACTION_PHASE, assertActionShape } from './actions.js';
import { deadwood } from './deadwood.js';
import { IllegalActionError } from './errors.js';
import { applyFruit, planFruit } from './fruit.js';
import { eventsOf } from './events.js';
import { emptyResolution, endGame, finishTurn, opponent, passTurn, severAndStrangle } from './phases.js';
import { applyPlacement, assertCoord, planRun, planSet } from './placement.js';
import type { Placement } from './placement.js';
import { knockResult } from './result.js';
import { planRot, removeTiles, rotCount } from './rot.js';
import { scores } from './scoring.js';
import type { Action, Card, Player, State } from './types.js';

const fail = (code: ConstructorParameters<typeof IllegalActionError>[0], msg: string): never => {
  throw new IllegalActionError(code, msg);
};

const setHand = (s: State, p: Player, hand: Card[]): [Card[], Card[]] => {
  const hands: [Card[], Card[]] = [...s.hands];
  hands[p] = hand;
  return hands;
};

const draw = (s: State, from: 'deck' | 'discard'): State => {
  const p = s.turnPlayer;
  if (from === 'deck') {
    const card = s.deck[0] ?? fail('DECK_EMPTY', 'the deck is empty');
    return {
      ...s,
      deck: s.deck.slice(1),
      hands: setHand(s, p, [...s.hands[p], card]),
      drawnFromDiscard: null,
      phase: 'ACT',
    };
  }
  const card = s.discard.at(-1) ?? fail('DISCARD_EMPTY', 'the discard pile is empty');
  return {
    ...s,
    discard: s.discard.slice(0, -1),
    hands: setHand(s, p, [...s.hands[p], card]),
    drawnFromDiscard: card.id,
    phase: 'ACT',
  };
};

const meld = (s: State, placement: Placement): State => {
  const p = s.turnPlayer;
  const used = new Set(placement.cards.map((c) => c.id));
  const hand = s.hands[p].filter((c) => !used.has(c.id));
  if (hand.length === 0) fail('HAND_WOULD_BE_EMPTY', 'keep at least one card for the mandatory discard');
  const out = applyPlacement(s.board, placement);
  const res = { ...emptyResolution(), placed: out.placed, overgrown: out.overgrown.map((o) => o.coord) };
  return severAndStrangle({ ...s, board: out.board, hands: setHand(s, p, hand) }, p, res);
};

const fruit = (s: State, a: Extract<Action, { t: 'Fruit' }>): State => {
  const p = s.turnPlayer;
  const plan = planFruit(s, p, s.fruitUsed[p], a.sacrifice, a.target);
  const fruitUsed: [number, number] = [...s.fruitUsed];
  fruitUsed[p]++;
  const res = { ...emptyResolution(), fruit: plan };
  return severAndStrangle({ ...s, board: applyFruit(s.board, plan), fruitUsed }, p, res);
};

const discard = (s: State, cardId: number): State => {
  const p = s.turnPlayer;
  const card = s.hands[p].find((c) => c.id === cardId) ?? fail('CARD_NOT_IN_HAND', `card ${cardId} is not in hand`);
  if (s.config.forbidRedundantDiscard && s.drawnFromDiscard === cardId) {
    fail('REDUNDANT_DISCARD', 'cannot discard the card just taken from the discard pile');
  }
  const next: State = {
    ...s,
    hands: setHand(s, p, s.hands[p].filter((c) => c.id !== cardId)),
    discard: [...s.discard, card],
  };
  if (s.finalTurn) {
    // End of the opponent's final turn (spec 7.2).
    const dw: [number, number] = [deadwood(next.hands[0]), deadwood(next.hands[1])];
    return endGame(next, knockResult(s.finalTurn.knocker, scores(next), dw));
  }
  return { ...next, phase: 'KNOCK' };
};

const knock = (s: State): State => {
  const p = s.turnPlayer;
  const dw = deadwood(s.hands[p]);
  if (dw > s.config.knockDeadwood) fail('KNOCK_TOO_MUCH_DEADWOOD', `deadwood ${dw} > ${s.config.knockDeadwood}`);
  if (!s.config.knockGivesFinalTurn) {
    const both: [number, number] = [deadwood(s.hands[0]), deadwood(s.hands[1])];
    return endGame(s, knockResult(p, scores(s), both));
  }
  return passTurn({ ...s, finalTurn: { knocker: p } });
};

const continueTurn = (s: State): State => {
  const p = s.turnPlayer;
  const plan = planRot(s, p, rotCount(deadwood(s.hands[p]), s.config));
  const board = removeTiles(s.board, plan.auto);
  if (!plan.pick) return finishTurn({ ...s, board }, plan.auto);
  return {
    ...s,
    board,
    phase: 'ROT_PICK',
    actor: opponent(p),
    rotPick: plan.pick,
    lastResolution: { ...emptyResolution(), rotted: plan.auto },
  };
};

const rotPick = (s: State, coord: unknown): State => {
  const pick = s.rotPick!;
  const c = assertCoord(coord);
  const key = coordKey(c);
  if (!pick.candidates.some((x) => coordKey(x) === key)) fail('NOT_ROT_CANDIDATE', `${key} is not a Rot candidate`);
  const rotted = [...(s.lastResolution?.rotted ?? []), c];
  const board = removeTiles(s.board, [c]);
  const remaining = pick.remaining - 1;
  if (remaining > 0) {
    return {
      ...s,
      board,
      rotPick: { remaining, candidates: pick.candidates.filter((x) => coordKey(x) !== key) },
      lastResolution: { ...emptyResolution(), rotted },
    };
  }
  return finishTurn({ ...s, board, rotPick: null, actor: s.turnPlayer, phase: 'KNOCK' }, rotted);
};

/**
 * Applies one action for `state.actor` (spec 13). Pure: never mutates `state`.
 * Throws IllegalActionError with a stable code for any illegal action.
 */
export const apply = (state: State, action: Action): State => {
  const next = applyRules(state, action);
  // The action log of events (spec 12) is kept when the state carries a history.
  return state.history ? { ...next, history: [...state.history, ...eventsOf(state, action, next)] } : next;
};

const applyRules = (state: State, action: Action): State => {
  if (state.phase === 'GAME_OVER') fail('GAME_OVER', 'the game is over');
  const a = assertActionShape(action);
  if (ACTION_PHASE[a.t] !== state.phase) fail('WRONG_PHASE', `${a.t} is not legal in ${state.phase}`);
  const p = state.turnPlayer;
  switch (a.t) {
    case 'Draw':
      return draw(state, a.from);
    case 'MeldRun':
      return meld(state, planRun(state, p, state.hands[p], a.cards, a.start, a.dir));
    case 'MeldSet':
      return meld(state, planSet(state, p, state.hands[p], a.cards, a.hexes));
    case 'Fruit':
      return fruit(state, a);
    case 'EndAct':
      return { ...state, phase: 'DISCARD' };
    case 'Discard':
      return discard(state, a.card);
    case 'Knock':
      return knock(state);
    case 'Continue':
      return continueTurn(state);
    case 'RotPick':
      return rotPick(state, a.coord);
  }
};

/** `apply` for a named player: rejects actions by anyone but the current actor. */
export const applyAs = (state: State, player: Player, action: Action): State => {
  if (state.phase !== 'GAME_OVER' && player !== state.actor) fail('NOT_ACTOR', `player ${player} is not the actor`);
  return apply(state, action);
};
