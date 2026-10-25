// A five/six-card Bloom must stay cheap while the finger is down. The freeze reported on
// 2026-10-25 ("the game completely crashes and freeze when u trying to place a bloom longer then
// 4 cards") came from the endpoint preview re-running the exhaustive completion search on EVERY
// frame, and from the drag retarget asking that same search on every pointer move. These tests
// pin the cheap path: a plain walk for endpoints, a small node budget for the retarget, and no
// growth of the exhaustive memo.
import { describe, expect, it } from 'vitest';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import {
  RETARGET_NODE_BUDGET,
  bloomEndpoints,
  comboFor,
  drawNext,
  drawStarts,
  paintMatch,
  paintRetarget,
  searchStats,
  shapeOf,
} from '../src/logic/draw.js';
import type { Combo } from '../src/logic/draw.js';
import { EMPTY_SEL, kindOf } from '../src/logic/interaction.js';

/** A real position on a full-size board: the hand is a run 1-6 of one suit and the turn is ACT. */
function position(): { state: State; v: ReturnType<typeof viewFor>; combo: Combo; first: string[]; end: string[] } {
  const start = newGame(11);
  const terrain = { ...start.terrain };
  for (const key of Object.keys(terrain)) terrain[key] = 'normal';
  const hand: Card[] = [1, 2, 3, 4, 5, 6].map((rank, id) => ({ id: 900 + id, suit: 0 as const, rank }));
  const state: State = { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [hand, start.hands[1]] };
  const v = viewFor(state, 0);
  const legal = legalActions(v);
  const six = legal.find((a) => a.t === 'Bloom' && a.cards.length === 6 && a.cards.every((id) => hand.some((c) => c.id === id))) as Extract<typeof legal[number], { t: 'Bloom' }>;
  const kind = kindOf(six)!;
  const combo = comboFor(v, legal, { ...EMPTY_SEL, kind })!;
  let first: string[] = [];
  for (const s of drawStarts(combo)) {
    first = [s];
    while (first.length < 6) {
      const next = [...drawNext(combo, first)][0];
      if (!next) break;
      first.push(next);
    }
    if (first.length === 6 && paintMatch(combo, first)) break;
  }
  expect(first).toHaveLength(6);
  expect(paintMatch(combo, first)).not.toBeNull();
  return { state, v, combo, first, end: shapeOf(combo, six) };
}

const six = position();

/** An endpoint the retarget accepts: legal from the prefix, not the current last tile. */
const retargetOf = (combo: Combo, shape: readonly string[]) => {
  const prefix = shape.slice(0, -1);
  for (const key of combo.hexes) {
    const next = paintRetarget(combo, shape, key);
    if (next) return { key, next, prefix, combo };
  }
  return null;
};

describe('six-card Bloom: the endpoint preview does not search completions', () => {
  it('a FULL shape has no next hex — and looking for one never walks the board', () => {
    const { combo, first } = six;
    combo.completion!.clear();
    searchStats.completionNodes = 0;
    expect(drawNext(combo, first).size).toBe(0);
    // The reported freeze: the five/six-card branch used to recurse past the shape size, so a
    // complete Bloom walked the whole board on every frame. Zero nodes proves it stops at once.
    expect(searchStats.completionNodes).toBe(0);
    expect(combo.completion!.size).toBe(0);
    // one past the end must be just as quiet
    expect(drawNext(combo, [...first, '0,0']).size).toBe(0);
  });

  it('a complete FIVE-card shape is just as quiet', () => {
    const start = newGame(11);
    const terrain = { ...start.terrain };
    for (const key of Object.keys(terrain)) terrain[key] = 'normal';
    const hand: Card[] = [1, 2, 3, 4, 5].map((rank, id) => ({ id: 930 + id, suit: 0 as const, rank }));
    const state: State = { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [hand, start.hands[1]] };
    const v = viewFor(state, 0);
    const legal = legalActions(v);
    const five = legal.find((a) => a.t === 'Bloom' && a.cards.length === 5 && a.cards.every((id) => hand.some((c) => c.id === id))) as Extract<typeof legal[number], { t: 'Bloom' }>;
    const combo = comboFor(v, legal, { ...EMPTY_SEL, kind: kindOf(five)! })!;
    let order: string[] = [];
    for (const s of drawStarts(combo)) {
      order = [s];
      while (order.length < 5) {
        const next = [...drawNext(combo, order)][0];
        if (!next) break;
        order.push(next);
      }
      if (order.length === 5 && paintMatch(combo, order)) break;
    }
    expect(order).toHaveLength(5);
    combo.completion!.clear();
    searchStats.completionNodes = 0;
    expect(drawNext(combo, order).size).toBe(0);
    expect(searchStats.completionNodes).toBe(0);
    expect(combo.completion!.size).toBe(0);
  });

  it('returns every real endpoint, cached, and never touches the exhaustive memo', () => {
    const { combo, first } = six;
    const start = first[0]!;
    combo.completion!.clear();
    searchStats.endpointNodes = 0;
    const firstCall = bloomEndpoints(combo, start);
    const nodes = searchStats.endpointNodes;
    const memoAfter = combo.completion!.size;

    // A plain connected walk, per start: bounded by the walk tree, not by a completion search
    // repeated at every node. Six steps on a 37-hex board is a few thousand nodes.
    expect(nodes).toBeGreaterThan(0);
    expect(nodes).toBeLessThan(30_000);
    expect(memoAfter).toBe(0);

    // The same start returns the very same set: this is what makes the per-frame overlay O(1).
    expect(bloomEndpoints(combo, start)).toBe(firstCall);
    expect(searchStats.endpointNodes).toBe(nodes);

    // Every endpoint really can finish a Bloom from the start (the ordinary tap shortcut).
    const starts = new Set([...bloomEndpoints(combo, start)]);
    expect(starts.size).toBeGreaterThan(0);
    for (const end of [...starts].slice(0, 4)) {
      expect(drawNext(combo, [start]).has(end)).toBe(false);
    }
  });

  it('a five-card endpoint walk agrees with the exhaustive two-step rule', () => {
    // The reference is the previous semantics: a hex is an endpoint when some full Bloom ends on
    // it and it is not already an ordinary neighbour of the first tile.
    const start = newGame(11);
    const terrain = { ...start.terrain };
    for (const key of Object.keys(terrain)) terrain[key] = 'normal';
    const hand: Card[] = [1, 2, 3, 4, 5].map((rank, id) => ({ id: 910 + id, suit: 0 as const, rank }));
    const state: State = { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [hand, start.hands[1]] };
    const v = viewFor(state, 0);
    const legal = legalActions(v);
    const five = legal.find((a) => a.t === 'Bloom' && a.cards.length === 5 && a.cards.every((id) => hand.some((c) => c.id === id))) as Extract<typeof legal[number], { t: 'Bloom' }>;
    const combo = comboFor(v, legal, { ...EMPTY_SEL, kind: kindOf(five)! })!;
    const startKey = [...drawStarts(combo)][0]!;
    const next = drawNext(combo, [startKey]);
    const reference = new Set<string>();
    const walk = (shape: string[]) => {
      if (shape.length === combo.n) {
        const end = shape.at(-1)!;
        if (end !== startKey && !next.has(end) && paintMatch(combo, shape)) reference.add(end);
        return;
      }
      for (const key of drawNext(combo, shape)) walk([...shape, key]);
    };
    walk([startKey]);
    expect([...bloomEndpoints(combo, startKey)].sort()).toEqual([...reference].sort());
  });
});

describe('six-card Bloom: the drag retarget is bounded per pointer move', () => {
  it('a full-shape retarget moves only the last tile, stays legal, and uses at most the node budget', () => {
    const { combo, first } = six;
    combo.completion!.clear();
    const found = retargetOf(combo, first);
    expect(found).not.toBeNull();
    searchStats.retargetNodes = 0;
    const before = combo.completion!.size;
    const moved = paintRetarget(combo, first, found!.key)!;
    expect(moved).toEqual([...first.slice(0, -1), found!.key]);
    expect(paintMatch(combo, moved)).not.toBeNull();
    // The retarget's search is capped, so a wobble can never walk a huge space.
    expect(searchStats.retargetNodes).toBeLessThanOrEqual(RETARGET_NODE_BUDGET);
    // and it does not feed the exhaustive memo either
    expect(combo.completion!.size).toBe(before);
  });

  it('a shallow retarget (second tile) is bounded too, whatever the board offers', () => {
    const { combo, first } = six;
    combo.completion!.clear();
    const shape = first.slice(0, 2);
    let calls = 0;
    for (const key of combo.hexes) {
      searchStats.retargetNodes = 0;
      paintRetarget(combo, shape, key);
      expect(searchStats.retargetNodes).toBeLessThanOrEqual(RETARGET_NODE_BUDGET);
      calls++;
    }
    expect(calls).toBeGreaterThan(30);
    expect(combo.completion!.size).toBe(0);
  });

  it('the same retarget still works at five and four cards', () => {
    for (const n of [5, 4]) {
      const { first, combo } = six;
      const shape = first.slice(0, n);
      expect(shape).toHaveLength(n);
      const found = retargetOf(combo, shape);
      if (!found) continue; // a board may offer no alternative end for this exact path
      const moved = paintRetarget(combo, shape, found.key)!;
      expect(moved).toEqual([...shape.slice(0, -1), found.key]);
    }
  });

  it('an illegal end is still refused and leaves the shape untouched', () => {
    const { combo, first } = six;
    const shape = first.slice(0, 3);
    for (const key of combo.hexes) {
      if (shape.includes(key) || drawNext(combo, shape.slice(0, -1)).has(key)) continue;
      expect(paintRetarget(combo, shape, key)).toBeNull();
    }
  });
});
