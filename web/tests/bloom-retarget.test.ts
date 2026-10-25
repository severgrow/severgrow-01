// THE BLOOM'S LAST TILE FOLLOWS THE FINGER (owner, 2026-10-25): "when you are at the last one and
// you move your finger to different last tile of bloom - it follows. at the moment you have to
// 'drag back' to the previous tile and then you can drag to another ending tile".
//
// While a drag is in progress the last painted hex is still tentative, so moving onto a different
// hex that can legally BE the end REPLACES it — the path adjusts, no step back first. The retarget
// is decided by one pure function; a hex that cannot legally end the shortened path is refused and
// the shape comes back exactly as it was (never a gap, never an illegal Bloom). Tapping keeps its
// own rules untouched (see paintTap / bloomStepBack).
import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, legalActions, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import type { Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, kindOf, tapKind } from '../src/logic/interaction.js';
import {
  comboFor,
  deskTrace,
  drawNext,
  paintEnter,
  paintGhost,
  paintMatch,
  paintRetarget,
  paintTap,
  retargetShape,
} from '../src/logic/draw.js';
import { fixture } from '../../tests/helpers.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], opts: { rock?: string[]; config?: Partial<RulesConfig> } = {}): State => {
  const g = newGame(5, opts.config);
  const f = fixture({ tiles, rock: opts.rock ?? [], config: opts.config ?? {} });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => c.suit !== null);
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', turnPlayer: 0, actor: 0 };
};
const RUN: [Suit, number][] = [[0, 3], [0, 4], [0, 5]];
const SET3: [Suit, number][] = [[0, 6], [1, 6], [2, 6]];
/** The painting machine for the group made of these card numbers (a set or a run). */
const comboOf = (s: State, ranks: number[]) => {
  const v = viewFor(s, 0);
  const legal = legalActions(v);
  const want = [...ranks].sort((a, b) => a - b).join(',');
  const a = legal.find((x) => x.t === 'Bloom' && x.cards.map((id) => v.hand.find((c) => c.id === id)!.rank).sort((p, q) => p - q).join(',') === want)!;
  return { v, legal, combo: comboFor(v, legal, tapKind(EMPTY_SEL, kindOf(a)!))! };
};

describe('retargetShape: a tentative last hex is replaced, a bad one is refused', () => {
  const legal = new Set(['b1', 'b2', 'c1']);

  it('nothing painted yet, or only the first hex: there is nothing tentative to replace', () => {
    expect(retargetShape([], 'b1', legal)).toEqual([]);
    // The one hex of a fresh paint is the START: the drag-begin/append rules own it, so a wobble
    // onto another legal start never moves where the paint began.
    expect(retargetShape(['a0'], 'b1', legal)).toEqual(['a0']);
  });

  it('replaces ONLY the last hex and keeps the path before it', () => {
    expect(retargetShape(['a0', 'b1'], 'b2', legal)).toEqual(['a0', 'b2']);
    expect(retargetShape(['a0', 'b1', 'c1'], 'b2', legal)).toEqual(['a0', 'b1', 'b2']);
  });

  it('a hex that cannot legally come next after the shortened path is refused (no gap, no illegal Bloom)', () => {
    expect(retargetShape(['a0', 'b1'], 'z9', legal)).toEqual(['a0', 'b1']);
    expect(retargetShape(['a0', 'b1', 'c1'], 'z9', legal)).toEqual(['a0', 'b1', 'c1']);
  });

  it('a path never folds onto itself: a hex already painted is not a retarget', () => {
    expect(retargetShape(['a0', 'b1', 'c1'], 'a0', legal)).toEqual(['a0', 'b1', 'c1']);
    expect(retargetShape(['a0', 'b1', 'c1'], 'b1', legal)).toEqual(['a0', 'b1', 'c1']);
  });

  it('the hex already under the finger changes nothing, and the input is never mutated', () => {
    const shape = ['a0', 'b1'];
    expect(retargetShape(shape, 'b1', legal)).toEqual(['a0', 'b1']);
    retargetShape(shape, 'b2', legal);
    expect(shape).toEqual(['a0', 'b1']);
  });
});

describe('dragging a Bloom onto a different last tile (a real board)', () => {
  // A run 3-4-5 with their 4 and 2 sitting where the shape would want to go, so the legal ends are
  // narrow: the third hex of [0,1; 0,0] must be -1,1 or -1,2 and nothing else.
  const s = stateWith({ '-1,1': [1, 4], '0,0': [1, 2] }, RUN);

  it('the drag replaces the end directly: no step back, and the new shape is still a legal Bloom so far', () => {
    const { v, combo } = comboOf(s, [3, 4, 5]);
    const shape = ['0,1', '0,0'];
    const next = paintRetarget(combo, shape, '1,1');
    expect(next).toEqual(['0,1', '1,1']);
    // the tentative end is gone, not appended after it
    expect(next).not.toContain('0,0');
    // and the path can still be finished (the ghost's own rule), with the numbers in paint order
    const third = [...drawNext(combo, next!)][0]!;
    const full = [...next!, third];
    const played = paintMatch(combo, full)!;
    expect(played.hexes.map(coordKey)).toEqual(full);
    expect(paintGhost(v, combo, full).tiles.map((t) => t.strength)).toEqual([3, 4, 5]);
  });

  it('a retarget that is refused leaves the shape intact and still completable', () => {
    const { combo } = comboOf(s, [3, 4, 5]);
    const shape = ['0,1', '0,0'];
    // -1,0 touches the LAST hex but cannot legally come after the first one: accepting it would
    // leave a gap in the recipe, so the shape must be untouched.
    expect(hexDistance(parseKey('-1,0'), parseKey('0,0'))).toBe(1);
    expect(drawNext(combo, ['0,1']).has('-1,0')).toBe(false);
    expect(paintRetarget(combo, shape, '-1,0')).toBeNull();
    // nothing off the board, nothing not touching
    expect(paintRetarget(combo, shape, '5,5')).toBeNull();
    // the shape itself did not change and can still be finished
    const third = [...drawNext(combo, shape)];
    expect(third.length).toBeGreaterThan(0);
    expect(paintMatch(combo, [...shape, third[0]!])).not.toBeNull();
  });

  it('a full shape retargets its end too (the owner’s exact case: the third tile moves)', () => {
    // A 3-set: paint the triangle, then move the finger from its last hex to a sibling end.
    const set = stateWith({ '0,1': [1, 2] }, SET3);
    const { combo } = comboOf(set, [6, 6, 6]);
    const full = ['-1,1', '0,0', '0,1'];
    expect(paintMatch(combo, full)).not.toBeNull();
    const moved = paintRetarget(combo, full, '1,0');
    expect(moved).toEqual(['-1,1', '0,0', '1,0']);
    expect(paintMatch(combo, moved!)).not.toBeNull();
  });

  it('the finger’s own last hex or a hex already painted is not a retarget', () => {
    const set = stateWith({ '0,1': [1, 2] }, SET3);
    const { combo } = comboOf(set, [6, 6, 6]);
    expect(paintRetarget(combo, ['-1,1', '0,0'], '0,0')).toBeNull();
    expect(paintRetarget(combo, ['-1,1', '0,0'], '-1,1')).toBeNull();
  });

  it('a run’s numbers follow the new order (the last tile still takes the last number)', () => {
    const { v, combo } = comboOf(s, [3, 4, 5]);
    const full = ['0,1', '1,1', '-1,1'];
    expect(paintMatch(combo, full)).not.toBeNull();
    const moved = paintRetarget(combo, full, '-1,2');
    expect(moved).toEqual(['0,1', '1,1', '-1,2']);
    const ghost = paintGhost(v, combo, moved!);
    expect(ghost.action).not.toBeNull();
    expect(ghost.tiles.map((t) => t.strength)).toEqual([3, 4, 5]);
    // what you see painted is what gets played
    expect(ghost.action).toEqual(paintMatch(combo, moved!));
  });

  it('the mouse trail retargets exactly as the finger does', () => {
    const { combo } = comboOf(s, [3, 4, 5]);
    const desk = { phase: 'live' as const, start: '0,1', hover: '0,0', trail: ['0,1', '0,0'] };
    const moved = deskTrace(combo, desk, '1,1');
    expect(moved.phase === 'live' ? moved.trail : null).toEqual(['0,1', '1,1']);
    // a step back is still a step back, never a retarget
    const back = deskTrace(combo, desk, '0,1');
    expect(back.phase === 'live' ? back.trail : null).toEqual(['0,1']);
  });

  it('a shape of one hex still grows normally, and is never retargeted', () => {
    const { combo } = comboOf(s, [3, 4, 5]);
    expect(drawNext(combo, ['0,1']).has('0,0')).toBe(true);
    expect(paintEnter(combo, ['0,1'], '0,0')).toEqual(['0,1', '0,0']);
    // a hex that is only a legal START (not a second) cannot move the first tile
    expect(paintRetarget(combo, ['0,1'], '0,-1')).toBeNull();
  });

  it('tapping keeps its own rules: a tap on another end still steps back (never retargets)', () => {
    const { combo } = comboOf(s, [3, 4, 5]);
    expect(paintTap(combo, ['0,1', '0,0'], '1,1')).toEqual(['0,1', '0,0']);
    // and dragging back onto the previous hex still pops the last one
    expect(paintEnter(combo, ['0,1', '0,0'], '0,1')).toEqual(['0,1']);
  });
});
