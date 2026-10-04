import { coordKey } from './board.js';
import { ACTION_PHASE, assertActionShape } from './actions.js';
import { deadwood } from './deadwood.js';
import { IllegalActionError } from './errors.js';
import { isFruitCard } from './cards.js';
import { planFruitCard } from './fruit.js';
import { eventsOf } from './events.js';
import { afterDiscard, emptyResolution, endGame, finishTurn, opponent, passTurn, severAndStrangle } from './phases.js';
import { applyPlacement, assertCoord, planBloom, planSprout } from './placement.js';
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

/** v0.6: the Fruit cards known to be in p's hand can only drop when p's hand loses Fruit cards. */
const knownAfter = (s: State, p: Player, hand: readonly Card[]): [number, number] => {
  const known: [number, number] = [...s.fruitKnown];
  known[p] = Math.min(known[p], hand.filter(isFruitCard).length);
  return known;
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
  // v0.6: a Fruit card taken from the throw pile is known to be in this hand
  const fruitKnown: [number, number] = [...s.fruitKnown];
  if (isFruitCard(card)) fruitKnown[p]++;
  return {
    ...s,
    fruitKnown,
    discard: s.discard.slice(0, -1),
    hands: setHand(s, p, [...s.hands[p], card]),
    drawnFromDiscard: card.id,
    phase: 'ACT',
  };
};

/** v0.7 Bloom: the cards leave the hand, one tile per card, then cut and Strangle checks. */
const bloom = (s: State, placement: Placement): State => {
  const p = s.turnPlayer;
  const used = new Set(placement.cards.map((c) => c.id));
  const hand = s.hands[p].filter((c) => !used.has(c.id));
  const out = applyPlacement(s.board, placement);
  const bloomed = { cards: placement.cards.map((c) => c.id), hexes: placement.tiles.map((t) => ({ ...t.coord })) };
  const res = { ...emptyResolution(), placed: out.placed, overgrown: out.overgrown.map((o) => o.coord), bloom: bloomed };
  return severAndStrangle({ ...s, board: out.board, hands: setHand(s, p, hand) }, p, res);
};

const sprout = (s: State, cardId: number, coord: unknown): State => {
  const p = s.turnPlayer;
  if (s.sproutsThisTurn >= s.config.sproutsPerTurn) fail('SPROUT_LIMIT', `at most ${s.config.sproutsPerTurn} sprout(s) per turn`);
  const used = s.strengthenUsed ?? [0, 0];
  const plan = planSprout(s, p, s.hands[p], cardId, coord as never, used[p]);
  const out = applyPlacement(s.board, plan);
  const hand = s.hands[p].filter((c) => c.id !== cardId);
  if (plan.strengthen) {
    // v0.5 Strengthen: the tile stays, only its number rises; connections cannot change.
    const strengthenUsed: [number, number] = [...used];
    strengthenUsed[p]++;
    const t = plan.tiles[0]!;
    const res = { ...emptyResolution(), strengthen: { coord: { ...t.coord }, from: plan.strengthen.from, to: t.strength } };
    return severAndStrangle({ ...s, board: out.board, hands: setHand(s, p, hand), sproutsThisTurn: s.sproutsThisTurn + 1, strengthenUsed }, p, res);
  }
  const res = { ...emptyResolution(), placed: out.placed, overgrown: out.overgrown.map((o) => o.coord), sprout: { ...out.placed[0]! } };
  return severAndStrangle({ ...s, board: out.board, hands: setHand(s, p, hand), sproutsThisTurn: s.sproutsThisTurn + 1 }, p, res);
};

/** End of the opponent's final turn after a Knock (spec 7.2). */
const knockEnd = (s: State): State => {
  const dw: [number, number] = [deadwood(s.hands[0]), deadwood(s.hands[1])];
  return endGame(s, knockResult(s.finalTurn!.knocker, scores(s), dw));
};

/** EndAct: go to the discard, or skip it when the hand is empty (v0.4). */
const endAct = (s: State): State => (s.hands[s.turnPlayer].length === 0 ? afterDiscard(s, knockEnd) : { ...s, phase: 'DISCARD' });

/** v0.6 PlayFruit: the target goes, the card leaves the game; then cut and Strangle checks. */
const playFruit = (s: State, a: Extract<Action, { t: 'PlayFruit' }>): State => {
  const p = s.turnPlayer;
  // v0.8: a Fruit card uses the turn's Sprout
  if (s.config.fruitUsesSprout && s.sproutsThisTurn >= s.config.sproutsPerTurn) fail('SPROUT_LIMIT', `a Fruit card uses the turn's sprout (at most ${s.config.sproutsPerTurn} per turn)`);
  const plan = planFruitCard(s, p, s.hands[p], a.card, a.target);
  const hand = s.hands[p].filter((c) => c.id !== plan.card.id);
  const board = removeTiles(s.board, [plan.target]);
  const res = { ...emptyResolution(), fruit: { card: plan.card.id, target: { ...plan.target }, strength: plan.strength } };
  const next: State = { ...s, board, hands: setHand(s, p, hand), fruitPlayed: s.fruitPlayed + 1, fruitKnown: knownAfter(s, p, hand), sproutsThisTurn: s.config.fruitUsesSprout ? s.sproutsThisTurn + 1 : s.sproutsThisTurn };
  return severAndStrangle(next, p, res);
};

const discard = (s: State, cardId: number): State => {
  const p = s.turnPlayer;
  const card = s.hands[p].find((c) => c.id === cardId) ?? fail('CARD_NOT_IN_HAND', `card ${cardId} is not in hand`);
  // v0.4: allowed when it is the only card in hand, so the turn can never freeze.
  if (s.config.forbidRedundantDiscard && s.drawnFromDiscard === cardId && s.hands[p].length > 1) {
    fail('REDUNDANT_DISCARD', 'cannot discard the card just taken from the discard pile');
  }
  const hand = s.hands[p].filter((c) => c.id !== cardId);
  const next: State = {
    ...s,
    hands: setHand(s, p, hand),
    discard: [...s.discard, card],
    fruitKnown: knownAfter(s, p, hand),
  };
  return afterDiscard(next, knockEnd);
};

const knock = (s: State): State => {
  const p = s.turnPlayer;
  if (!s.config.knockEnabled) fail('KNOCK_DISABLED', 'Knock is switched off in this game');
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
  const plan = planRot(s, p, s.config.rotEnabled ? rotCount(deadwood(s.hands[p]), s.config) : 0);
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
    case 'Bloom':
      return bloom(state, planBloom(state, p, state.hands[p], a.cards, a.hexes));
    case 'PlayFruit':
      return playFruit(state, a);
    case 'Sprout':
      return sprout(state, a.card, a.coord);
    case 'EndAct':
      return endAct(state);
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
