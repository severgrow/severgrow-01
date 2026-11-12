// The Bloom recipe menu shows the BIGGEST (longest) Bloom first (owner, 2026-10-30:
// "when big bloom (4+cards) available and theres bloom menu opening - show the biggest/longest
// blooms first"). The product channel (`IS_FUTA04`) asks `moveButtons(..., true)` for one button
// per recipe; that branch used to return `kindsAvailable`'s order, which is sorted by a string
// built from card ids (shortest first, then arbitrary). These tests pin the new rule: order by the
// recipe's REAL card count, longest first, with a deterministic tie-break.
import { describe, expect, it } from 'vitest';
import { allNeighbors, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { EMPTY_SEL, kindCards, kindsAvailable, moveButtons } from '../src/logic/interaction.js';

/** A live ACT position whose only hand is the authored one (same shape as bloom-expanded-ui). */
const actState = (hand: readonly Card[]): State => {
  const start = newGame(11);
  const terrain = { ...start.terrain };
  for (const key of Object.keys(terrain)) terrain[key] = 'normal';
  return { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [[...hand], start.hands[1]] };
};

const card = (id: number, suit: Card['suit'], rank: number): Card => ({ id, suit, rank });
/** Every recipe `moveButtons(..., true)` offers, in the order the menu renders them. */
const shown = (hand: readonly Card[]) => {
  const v = viewFor(actState(hand), 0);
  const legal = legalActions(v);
  return { v, legal, recipes: moveButtons(v, legal, EMPTY_SEL, true) };
};
/** Every Bloom recipe the engine offers (the content the menu must keep, whatever its order). */
const offered = (v: ReturnType<typeof viewFor>, legal: ReturnType<typeof legalActions>) =>
  kindsAvailable(v, legal, EMPTY_SEL)
    .filter((k) => k.kind.startsWith('bloom-'))
    .map((k) => k.kind)
    .sort();

// One maximal run per suit, no two suits sharing a rank, so the hand offers Blooms of exactly
// 3, 4, 5 and 6 cards (each run also offers its shorter windows, which is the point: many sizes).
const MIXED: Card[] = [
  card(901, 0, 1), card(902, 0, 2), card(903, 0, 3),
  card(911, 1, 1), card(912, 1, 2), card(913, 1, 3), card(914, 1, 4),
  card(921, 2, 1), card(922, 2, 2), card(923, 2, 3), card(924, 2, 4), card(925, 2, 5),
  card(931, 3, 1), card(932, 3, 2), card(933, 3, 3), card(934, 3, 4), card(935, 3, 5), card(936, 3, 6),
];
// Two separate 3-card runs: nothing to reorder, and no other size in the hand.
const THREE: Card[] = [
  card(1001, 0, 1), card(1002, 0, 2), card(1003, 0, 3),
  card(1011, 1, 4), card(1012, 1, 5), card(1013, 1, 6),
];

describe('Bloom recipe menu: the biggest Bloom comes first', () => {
  it('orders every recipe by its REAL card count, longest first', () => {
    const { recipes } = shown(MIXED);
    const counts = recipes.map((r) => kindCards(r.kind).length);
    expect(counts[0]).toBe(6); // the six-card run leads
    expect(counts).toEqual([...counts].sort((a, b) => b - a)); // non-increasing
    // the order is by the cards, never by the label: the count comes from kindCards(kind)
    for (const r of recipes) expect(r.kind.split('-')[1]).toBe(String(kindCards(r.kind).length));
  });

  it('still offers every recipe exactly once', () => {
    const { v, legal, recipes } = shown(MIXED);
    const kinds = recipes.map((r) => r.kind);
    expect(new Set(kinds).size).toBe(kinds.length); // no duplicates
    expect([...kinds].sort()).toEqual(offered(v, legal)); // nothing missing, nothing extra
    for (const r of recipes) expect(r.kinds).toEqual([r.kind]);
  });

  it('is deterministic: the same hand renders the same order on every call', () => {
    const first = shown(MIXED).recipes.map((r) => r.kind);
    const second = shown(MIXED).recipes.map((r) => r.kind);
    expect(second).toEqual(first);
  });

  it('a hand with only 3-card Blooms keeps its content (nothing to reorder)', () => {
    const { v, legal, recipes } = shown(THREE);
    expect(recipes.map((r) => kindCards(r.kind).length)).toEqual([3, 3]);
    expect([...recipes.map((r) => r.kind)].sort()).toEqual(offered(v, legal));
    // the old order was already ascending by size, so an all-3 hand is unchanged
    expect(recipes.map((r) => r.kind)).toEqual(
      kindsAvailable(v, legal, EMPTY_SEL).filter((k) => k.kind.startsWith('bloom-')).map((k) => k.kind),
    );
  });

  it('keeps Blast in its old place: last, below every three-plus-card Bloom', () => {
    const base = newGame(3107);
    const target = { q: -1, r: 2 };
    const board = { ...base.board, [coordKey(target)]: { owner: 1 as const, strength: 9 } };
    for (const n of allNeighbors(target)) if (board[coordKey(n)] === null) board[coordKey(n)] = { owner: 1 as const, strength: 4 };
    const hand: Card[] = [
      card(1200, null, 0), card(1201, null, 0),
      card(900, 0, 1), card(901, 0, 2), card(902, 0, 3),
      card(910, 1, 5), card(911, 1, 6), card(912, 1, 7), card(913, 1, 8), card(914, 1, 9),
    ];
    const state: State = { ...base, board, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [hand, base.hands[1]] };
    const v = viewFor(state, 0);
    const legal = legalActions(v);
    expect(legal.some((a) => a.t === 'MegaBomb')).toBe(true); // a legal target exists
    const recipes = moveButtons(v, legal, EMPTY_SEL, true);
    expect(recipes.filter((r) => r.kind.startsWith('bloom-mega-'))).toHaveLength(1);
    // A MegaBomb is its two Bomb cards; every Bloom is 3+, so the count order leaves Blast last —
    // exactly where the old (shortest-first) order had it.
    expect(recipes.at(-1)!.kind.startsWith('bloom-mega-')).toBe(true);
    expect(kindCards(recipes.at(-1)!.kind)).toHaveLength(2);
  });

  it('the family branch (no showEveryRecipe) keeps its own order — no regression', () => {
    const { v, legal } = shown(MIXED);
    expect(moveButtons(v, legal, EMPTY_SEL, false).map((k) => k.kind)).toEqual([
      'bloom-6-931.932.933.934.935.936',
      'bloom-5-921.922.923.924.925',
      'bloom-5-932.933.934.935.936',
      'bloom-4-901.911.921.931',
      'bloom-4-902.912.922.932',
      'bloom-4-903.913.923.933',
      'bloom-4-911.912.913.914',
      'bloom-4-922.923.924.925',
      'bloom-4-933.934.935.936',
      'bloom-3-901.902.903',
      'bloom-3-901.911.921',
      'bloom-3-902.912.922',
      'bloom-3-903.913.923',
      'bloom-3-912.913.914',
      'bloom-3-914.924.934',
      'bloom-3-923.924.925',
      'bloom-3-934.935.936',
    ]);
  });
});
