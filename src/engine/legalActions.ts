import { allNeighbors, boardCoords, coordKey } from './board.js';
import { MAX_RANK, MIN_RANK, SUITS } from './constants.js';
import { fruitTargetBlocker } from './fruit.js';
import { claimBlocker } from './overgrow.js';
import { strengthenBlocker, touchesNetwork } from './placement.js';
import type { Action, Card, Coord, State, View } from './types.js';
import { viewFor } from './view.js';

/** Lowest-id card for each (suit, rank) in the hand, optionally skipping one id. */
const representatives = (hand: readonly Card[], skipId: number | null = null, numberedOnly = true): Map<string, Card> => {
  const reps = new Map<string, Card>();
  for (const c of [...hand].sort((a, b) => a.id - b.id)) {
    if (c.id === skipId || (numberedOnly && c.suit === null)) continue;
    const k = `${c.suit}:${c.rank}`;
    if (!reps.has(k)) reps.set(k, c);
  }
  return reps;
};

/** v0.7: runs of exactly 3 or 4 consecutive numbers in one suit (one representative per suit/number). */
const runGroups = (reps: Map<string, Card>): Card[][] => {
  const groups: Card[][] = [];
  for (const suit of SUITS) {
    for (const k of [3, 4]) {
      for (let lo = MIN_RANK; lo + k - 1 <= MAX_RANK; lo++) {
        const run = Array.from({ length: k }, (_, i) => reps.get(`${suit}:${lo + i}`));
        if (run.every((c) => c !== undefined)) groups.push(run as Card[]);
      }
    }
  }
  return groups;
};

/** Card groups that form valid 3- or 4-card sets. */
const setGroups = (reps: Map<string, Card>): Card[][] => {
  const groups: Card[][] = [];
  for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
    const bySuit = SUITS.map((s) => reps.get(`${s}:${rank}`)).filter((c): c is Card => c !== undefined);
    for (let mask = 1; mask < 1 << bySuit.length; mask++) {
      const g = bySuit.filter((_, i) => (mask >> i) & 1);
      if (g.length === 3 || g.length === 4) groups.push(g);
    }
  }
  return groups;
};

/** v0.7: every card group in the hand that can bloom (identical copies once): runs first, then sets. */
export const bloomGroups = (hand: readonly Card[]): { kind: 'set' | 'run'; cards: Card[] }[] => {
  const reps = representatives(hand);
  return [...runGroups(reps).map((cards) => ({ kind: 'run' as const, cards })), ...setGroups(reps).map((cards) => ({ kind: 'set' as const, cards }))];
};

/** All connected k-hex subsets of `allowed`, each in board order, deduplicated. */
const connectedSubsets = (allowed: Coord[], k: number): Coord[][] => {
  const order = new Map(allowed.map((c, i) => [coordKey(c), i]));
  const seen = new Set<string>();
  const out: Coord[][] = [];
  const grow = (set: Coord[]) => {
    const key = set.map((c) => order.get(coordKey(c))!).sort((x, y) => x - y).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    if (set.length === k) {
      out.push([...set].sort((a, b) => order.get(coordKey(a))! - order.get(coordKey(b))!));
      return;
    }
    const inSet = new Set(set.map(coordKey));
    for (const c of set) {
      for (const n of allNeighbors(c)) {
        const nk = coordKey(n);
        if (order.has(nk) && !inSet.has(nk)) grow([...set, n]);
      }
    }
  };
  for (const c of allowed) grow([c]);
  return out;
};

/** Permutations of 0..n-1 in lexicographic order. */
const permutations = (n: number): number[][] => {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const rest of permutations(n - 1)) for (let i = 0; i <= rest.length; i++) out.push([...rest.slice(0, i), n - 1, ...rest.slice(i)]);
  return out.sort((a, b) => a.join(',').localeCompare(b.join(',')));
};
const PERMS = [0, 1, 2, 3, 4].map(permutations);

/**
 * v0.7: one legal Bloom choice in compact form: a card group (ascending), a cluster of hexes
 * (board order) and every legal assignment: `orders[j][i]` is the index in `hexes` that card i
 * goes to. A set has one assignment (all numbers are equal); a run has up to 24.
 */
export type BloomChoice = { kind: 'set' | 'run'; cards: Card[]; hexes: Coord[]; orders: number[][] };

/** Every legal Bloom of the view's player, in compact form, in a fixed order (spec 7.2). */
export const bloomChoices = (v: View): BloomChoice[] => {
  if (v.phase !== 'ACT' || v.player !== v.actor) return [];
  const p = v.player;
  const board = boardCoords(v.config);
  const out: BloomChoice[] = [];
  const claimable = new Map<number, Coord[]>();
  const claimableBy = (rank: number) => {
    if (!claimable.has(rank)) claimable.set(rank, board.filter((c) => claimBlocker(v, p, c, rank) === null));
    return claimable.get(rank)!;
  };
  const touching = new Set(board.filter((c) => touchesNetwork(v.board, p, c)).map(coordKey));
  const clusters = new Map<string, Coord[][]>();
  for (const g of bloomGroups(v.hand)) {
    const ranks = g.cards.map((c) => c.rank);
    const top = Math.max(...ranks);
    const ck = `${top}:${g.cards.length}`;
    if (!clusters.has(ck)) {
      const all = connectedSubsets(claimableBy(top), g.cards.length);
      clusters.set(ck, v.config.bloomMustTouchNetwork ? all.filter((h) => h.some((c) => touching.has(coordKey(c)))) : all);
    }
    for (const hexes of clusters.get(ck)!) {
      if (g.kind === 'set') {
        out.push({ kind: 'set', cards: g.cards, hexes, orders: [hexes.map((_, i) => i)] });
        continue;
      }
      const ok = hexes.map((h) => new Set(ranks.filter((r) => claimBlocker(v, p, h, r) === null)));
      const orders = PERMS[g.cards.length]!.filter((perm) => perm.every((hi, ci) => ok[hi]!.has(ranks[ci]!)));
      if (orders.length > 0) out.push({ kind: 'run', cards: g.cards, hexes, orders });
    }
  }
  return out;
};

/** The Bloom action for one choice and one of its assignments (hexes[i] receives cards[i]). */
export const bloomAction = (c: BloomChoice, order: readonly number[]): Action => ({
  t: 'Bloom',
  cards: c.cards.map((x) => x.id),
  hexes: order.map((hi) => ({ ...c.hexes[hi]! })),
});

const actActions = (v: View): Action[] => {
  const p = v.player;
  const board = boardCoords(v.config);
  const reps = representatives(v.hand);
  const out: Action[] = [];
  // v0.7 Bloom: every legal assignment of every choice (a set once per hex set)
  for (const choice of bloomChoices(v)) for (const order of choice.orders) out.push(bloomAction(choice, order));

  // Sprout (v0.4): one card, one tile next to the network; one card per suit/rank. v0.5
  // Strengthen is a Sprout on my own weaker non-root tile, listed in the same board order.
  if (v.sproutsThisTurn < v.config.sproutsPerTurn) {
    const startKeys = new Set(board.filter((c) => touchesNetwork(v.board, p, c)).map(coordKey));
    const used = (v.strengthenUsed ?? [0, 0])[p];
    for (const card of [...reps.values()].sort((x, y) => x.id - y.id)) {
      for (const coord of board) {
        const own = v.board[coordKey(coord)]?.owner === p;
        if (own ? v.config.allowStrengthen && strengthenBlocker(v, p, coord, card.rank, used) === null : startKeys.has(coordKey(coord)) && claimBlocker(v, p, coord, card.rank) === null) {
          out.push({ t: 'Sprout', card: card.id, coord });
        }
      }
    }
  }

  // v0.6 Fruit cards: all alike, so the lowest-id one is listed, once per target, in board order.
  const fruitCard = [...v.hand].sort((a, b) => a.id - b.id).find((c) => c.suit === null);
  if (fruitCard && (!v.config.fruitUsesSprout || v.sproutsThisTurn < v.config.sproutsPerTurn)) {
    for (const target of board) if (fruitTargetBlocker(v, p, target) === null) out.push({ t: 'PlayFruit', card: fruitCard.id, target });
  }

  out.push({ t: 'EndAct' });
  return out;
};

/**
 * Every legal action for the view's player (spec 13), or [] when that player is not
 * the actor or the game is over. Identical card copies are deduplicated using the
 * lowest ids (Fruit cards are all alike). A set Bloom is listed once per hex set (board order);
 * a run Bloom once per legal assignment, cards ascending. Fruit targets in board order.
 */
export const legalActions = (view: View): Action[] => {
  if (view.phase === 'GAME_OVER' || view.player !== view.actor) return [];
  switch (view.phase) {
    case 'DRAW': {
      const out: Action[] = [];
      // Lab: with reshuffle on, an empty deck can still be drawn from (the throw pile comes back)
      if (view.deckCount > 0 || (view.config.reshuffleDiscard && view.discard.length > 1)) out.push({ t: 'Draw', from: 'deck' });
      if (view.discard.length > 0) out.push({ t: 'Draw', from: 'discard' });
      return out;
    }
    case 'ACT':
      return actActions(view);
    case 'DISCARD': {
      // v0.4: the card just taken may be discarded when it is the only card.
      const skip = view.config.forbidRedundantDiscard && view.hand.length > 1 ? view.drawnFromDiscard : null;
      // a Fruit card can be thrown like any card (numberedOnly off)
      const reps = [...representatives(view.hand, skip, false).values()].sort((a, b) => a.id - b.id);
      return reps.map((c) => ({ t: 'Discard', card: c.id }));
    }
    case 'KNOCK':
      return view.config.knockEnabled && view.myDeadwood <= view.config.knockDeadwood
        ? [{ t: 'Knock' }, { t: 'Continue' }]
        : [{ t: 'Continue' }];
    case 'ROT_PICK':
      return (view.rotPick?.candidates ?? []).map((coord) => ({ t: 'RotPick', coord: { ...coord } }));
  }
};

/** Engine-internal convenience for sims: legal actions for the current actor. */
export const legalActionsForState = (state: State): Action[] => legalActions(viewFor(state, state.actor));

