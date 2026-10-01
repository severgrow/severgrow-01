import { allCoords, allNeighbors, coordKey } from './board.js';
import { DIRECTIONS, MAX_RANK, MIN_RANK, SUITS } from './constants.js';
import { IllegalActionError } from './errors.js';
import { planFruit } from './fruit.js';
import { claimBlocker } from './overgrow.js';
import { planRun, touchesNetwork } from './placement.js';
import type { Action, Card, Coord, State, View } from './types.js';
import { viewFor } from './view.js';

const legal = (fn: () => unknown): boolean => {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof IllegalActionError) return false;
    throw e;
  }
};

/** Lowest-id card for each (suit, rank) in the hand, optionally skipping one id. */
const representatives = (hand: readonly Card[], skipId: number | null = null): Map<string, Card> => {
  const reps = new Map<string, Card>();
  for (const c of [...hand].sort((a, b) => a.id - b.id)) {
    if (c.id === skipId) continue;
    const k = `${c.suit}:${c.rank}`;
    if (!reps.has(k)) reps.set(k, c);
  }
  return reps;
};

/** Card groups (one representative per suit/rank) that form valid runs. */
const runGroups = (reps: Map<string, Card>): Card[][] => {
  const groups: Card[][] = [];
  for (const suit of SUITS) {
    for (let lo = MIN_RANK; lo <= MAX_RANK; lo++) {
      const run: Card[] = [];
      for (let r = lo; r <= MAX_RANK; r++) {
        const c = reps.get(`${suit}:${r}`);
        if (!c) break;
        run.push(c);
        if (run.length >= 3) groups.push([...run]);
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

/** All connected k-hex subsets of `allowed`, each in board order, deduplicated. */
const connectedSubsets = (allowed: Coord[], k: number): Coord[][] => {
  const order = new Map(allowed.map((c, i) => [coordKey(c), i]));
  const seen = new Set<string>();
  const out: Coord[][] = [];
  const grow = (set: Coord[]) => {
    const key = set.map(coordKey).sort().join('|');
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

const actActions = (v: View): Action[] => {
  const p = v.player;
  const radius = v.config.boardRadius;
  const board = allCoords(radius);
  const reps = representatives(v.hand);
  const out: Action[] = [];
  // Hypha: start must touch the network; planRun checks every hex on the line.
  const starts = board.filter((c) => touchesNetwork(v.board, p, c));
  for (const g of runGroups(reps)) {
    const cards = g.map((c) => c.id);
    for (const start of starts) {
      for (let dir = 0; dir < DIRECTIONS.length; dir++) {
        if (legal(() => planRun(v, p, v.hand, cards, start, dir))) out.push({ t: 'MeldRun', cards, start, dir });
      }
    }
  }

  // Bloom: connected clusters of claimable hexes with at least one network contact.
  for (const g of setGroups(reps)) {
    const rank = g[0]!.rank;
    const claimable = board.filter((c) => claimBlocker(v, p, c, rank) === null);
    for (const hexes of connectedSubsets(claimable, g.length)) {
      if (hexes.some((c) => touchesNetwork(v.board, p, c))) out.push({ t: 'MeldSet', cards: g.map((c) => c.id), hexes });
    }
  }

  // Sprout (v0.4): one card, one tile next to the network; one card per suit/rank.
  if (v.sproutsThisTurn < v.config.sproutsPerTurn) {
    for (const card of [...reps.values()].sort((x, y) => x.id - y.id)) {
      for (const coord of starts) {
        if (claimBlocker(v, p, coord, card.rank) === null) out.push({ t: 'Sprout', card: card.id, coord });
      }
    }
  }

  // Fruit: connected own non-root trios and an adjacent enemy non-root target.
  if (v.fruitUsed[p] < v.config.fruitPerPlayer) {
    const mine = board.filter((c) => {
      const t = v.board[coordKey(c)];
      return t !== null && t !== undefined && t.owner === p && !t.root;
    });
    for (const sacrifice of connectedSubsets(mine, 3)) {
      const targets = board.filter((t) => sacrifice.some((s) => allNeighbors(s).some((n) => coordKey(n) === coordKey(t))));
      for (const target of targets) {
        if (legal(() => planFruit(v, p, v.fruitUsed[p], sacrifice, target))) out.push({ t: 'Fruit', sacrifice, target });
      }
    }
  }

  out.push({ t: 'EndAct' });
  return out;
};

/**
 * Every legal action for the view's player (spec 13), or [] when that player is not
 * the actor or the game is over. Identical card copies are deduplicated using the
 * lowest ids; Bloom hexes and Fruit sacrifices are listed in board order.
 */
export const legalActions = (view: View): Action[] => {
  if (view.phase === 'GAME_OVER' || view.player !== view.actor) return [];
  switch (view.phase) {
    case 'DRAW': {
      const out: Action[] = [];
      if (view.deckCount > 0) out.push({ t: 'Draw', from: 'deck' });
      if (view.discard.length > 0) out.push({ t: 'Draw', from: 'discard' });
      return out;
    }
    case 'ACT':
      return actActions(view);
    case 'DISCARD': {
      // v0.4: the card just taken may be discarded when it is the only card.
      const skip = view.config.forbidRedundantDiscard && view.hand.length > 1 ? view.drawnFromDiscard : null;
      const reps = [...representatives(view.hand, skip).values()].sort((a, b) => a.id - b.id);
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

