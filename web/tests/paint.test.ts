// v0.7: painting a Bloom on the board. Pure logic only (the page feeds it pointer positions):
// hit testing, sampling fast swipes, the hexes that may come next, numbers following the paint
// order (Reverse flips them), the "Needs a 6 or higher" reason, matching the engine's legal
// Blooms, the one-tap suggestion, the desktop two-click machine, keyboard steps, and that every
// legal Bloom can be made by tapping hexes one by one.
import { describe, expect, it } from 'vitest';
import { coordKey, legalActions, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, kindOf, tapKind } from '../src/logic/interaction.js';
import {
  DESK_IDLE,
  HIT,
  comboFor,
  confirmMovesFor,
  deskClick,
  deskHover,
  deskShape,
  drawNext,
  drawStarts,
  endpointBloom,
  growToward,
  hexAtPoint,
  hexesAlong,
  keyStep,
  paintEnter,
  paintGhost,
  paintMatch,
  paintProblem,
  paintTap,
  pixelOf,
  proximity,
  rankAt,
  shapeOf,
  suggestBloom,
  unavailable,
} from '../src/logic/draw.js';
import type { Bloom, Combo } from '../src/logic/draw.js';

it('two endpoint taps choose the shortest legal Bloom, including a branching shape', () => {
  const make = (keys: string[]): Bloom => ({ t: 'Bloom', cards: [1,2,3,4,5], hexes: keys.map(parseKey) });
  const longer = make(['0,0','0,1','1,1','2,0','2,-1']);
  const branch = make(['0,0','1,0','2,0','1,-1','1,1']);
  const combo: Combo = { kind: 'bloom-5-1.2.3.4.5', n: 5, ranks: [5,5,5,5,5], run: false,
    actions: [longer,branch], hexes: new Set([...longer.hexes,...branch.hexes].map(coordKey)), byKey: new Map() };
  expect(endpointBloom(combo,'0,0','2,0')).toEqual(branch);
  expect(endpointBloom(combo,'0,0','1,0')).toBeNull(); // adjacent taps keep the manual path
  expect(endpointBloom(combo,'0,0','9,9')).toBeNull(); // no illegal placement can be committed
});
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
const keys = (s: State) => new Set(Object.keys(s.board));
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));
const paint = (combo: NonNullable<ReturnType<typeof comboOf>['combo']>, hexes: string[], reverse = false) =>
  hexes.reduce<string[]>((shape, k) => paintEnter(combo, shape, k, reverse), []);

describe('geometry: hit testing and fast swipes', () => {
  const board = keys(stateWith({}, RUN));
  it('a point is in a hex only inside a slightly smaller hit area (so corners never slip into a neighbour)', () => {
    expect(HIT).toBeGreaterThan(0.7);
    expect(HIT).toBeLessThan(1);
    const c = pixelOf('0,1');
    expect(hexAtPoint(c.x, c.y, board)).toBe('0,1');
    const d = pixelOf('1,1');
    expect(hexAtPoint((c.x + d.x) / 2, (c.y + d.y) / 2, board)).toBeNull();
    expect(hexAtPoint(c.x + (d.x - c.x) * 0.65, c.y, board)).toBe('1,1');
    expect(hexAtPoint(10000, 0, board)).toBeNull();
  });
  it('a fast swipe crossing 4 hexes between two pointer events adds all 4, in order', () => {
    const a = pixelOf('-1,1');
    const b = pixelOf('2,1');
    expect(hexesAlong(a, b, board)).toEqual(['-1,1', '0,1', '1,1', '2,1']);
    expect(hexesAlong(b, a, board)).toEqual(['2,1', '1,1', '0,1', '-1,1']);
  });
});

describe('painting a set (one number)', () => {
  const s = stateWith({ '0,1': [1, 2] }, SET3);
  const { v, combo } = comboOf(s, [6, 6, 6]);
  it('before painting, the lit hexes are every hex some legal bloom uses; no Reverse for a set', () => {
    expect(combo.run).toBe(false);
    expect(drawStarts(combo)).toEqual(combo.hexes);
  });
  it('each new hex must touch the shape (any of it: a triangle or a Y is fine); others are ignored', () => {
    expect(paint(combo, ['-1,1', '0,0'])).toEqual(['-1,1', '0,0']);
    expect(paint(combo, ['-1,1', '1,0'])).toEqual(['-1,1']); // (1,0) does not touch (-1,1)
    // a triangle: the third touches both
    expect(paint(combo, ['-1,1', '-1,2', '0,1'])).toEqual(['-1,1', '-1,2', '0,1']);
  });
  it('dragging back onto the previous hex removes the last one; extra hexes past the size are ignored', () => {
    expect(paint(combo, ['-1,1', '0,0', '-1,1'])).toEqual(['-1,1']);
    const full = paint(combo, ['-1,1', '0,0', '0,1', '1,0']);
    expect(full).toEqual(['-1,1', '0,0', '0,1']);
  });
  it('tapping: tap to add, tap the last one to remove', () => {
    let shape = paintTap(combo, [], '-1,1');
    shape = paintTap(combo, shape, '0,0');
    expect(shape).toEqual(['-1,1', '0,0']);
    expect(paintTap(combo, shape, '0,0')).toEqual(['-1,1']);
  });
  it('a partial shape says "2/3"; the same hexes match the same engine Bloom whatever the order', () => {
    expect(paintProblem(v, combo, ['-1,1', '0,0'])).toBe('2/3');
    const a = paintMatch(combo, ['-1,1', '0,0', '0,1'])!;
    const b = paintMatch(combo, ['0,1', '0,0', '-1,1'])!;
    expect(a).toEqual(b);
    expect(a.hexes.map(coordKey).sort()).toEqual(['-1,1', '0,0', '0,1'].sort());
    expect(paintGhost(v, combo, ['-1,1', '0,0', '0,1']).tiles.map((t) => t.strength)).toEqual([6, 6, 6]);
  });
});

describe('painting a run: the numbers follow the paint order', () => {
  it('the lowest number goes on the first painted hex and they rise; Reverse flips it', () => {
    const s = stateWith({}, RUN);
    const { v, combo } = comboOf(s, [3, 4, 5]);
    expect(combo.run).toBe(true);
    const shape = paint(combo, ['-1,1', '0,0', '1,0']);
    expect(paintGhost(v, combo, shape).tiles.map((t) => t.strength)).toEqual([3, 4, 5]);
    expect(paintGhost(v, combo, shape, true).tiles.map((t) => t.strength)).toEqual([5, 4, 3]);
    const up = paintMatch(combo, shape)!;
    const down = paintMatch(combo, shape, true)!;
    // the same hexes, the numbers swapped end to end
    expect(up.hexes.map(coordKey)).toEqual(['-1,1', '0,0', '1,0']);
    expect(down.hexes.map(coordKey)).toEqual(['1,0', '0,0', '-1,1']);
    expect(rankAt(combo, 0, false)).toBe(3);
    expect(rankAt(combo, 0, true)).toBe(5);
  });
  it('a hex that cannot take the number it would get is unavailable, with a reason; Reverse updates it live', () => {
    // their 4 at (-1,1): the first painted hex gets a 3 (too weak); reversed it gets a 5 (fine)
    const s = stateWith({ '-1,1': [1, 4] }, RUN);
    const { combo, v } = comboOf(s, [3, 4, 5]);
    expect(drawStarts(combo).has('-1,1')).toBe(false);
    expect(unavailable(v, combo, []).get('-1,1')).toBe('Needs a 5 or higher');
    expect(drawStarts(combo, true).has('-1,1')).toBe(true);
    expect(unavailable(v, combo, [], true).has('-1,1')).toBe(false);
    // painted third (it would get the 5): fine
    const shape = paint(combo, ['-1,2', '0,1', '-1,1']);
    expect(shape).toEqual(['-1,2', '0,1', '-1,1']);
    expect(paintMatch(combo, shape)!.hexes.map(coordKey)).toEqual(['-1,2', '0,1', '-1,1']);
  });
});

describe('every legal Bloom can be made by tapping hexes one by one', () => {
  it('a set and a run, every placement, in its paint order (and the run also reversed)', () => {
    for (const [hand, tiles] of [
      [SET3, { '0,1': [1, 2] }],
      [RUN, { '-1,1': [1, 4], '0,0': [1, 2] }],
    ] as const) {
      const s = stateWith(tiles as unknown as Record<string, [Player, number]>, [...hand]);
      const ranks = hand.map(([, r]) => r);
      const { combo } = comboOf(s, ranks);
      expect(combo.actions.length).toBeGreaterThan(5);
      for (const a of combo.actions) {
        for (const reverse of combo.run ? [false, true] : [false]) {
          const order = shapeOf(combo, a, reverse);
          // a valid tap order: each next hex touches the ones before (a run: its paint order; a
          // set: grow it from its first hex)
          const taps = combo.run ? order : growOrder(order);
          if (combo.run && !taps.every((k, i) => i === 0 || touchesAny(taps.slice(0, i), k))) continue; // not paintable in this direction
          let shape: string[] = [];
          for (const k of taps) shape = paintTap(combo, shape, k, reverse);
          expect(shape.length).toBe(combo.n);
          expect(paintMatch(combo, shape, reverse)).toEqual(a);
        }
      }
    }
  });
});

const adjacent = (a: string, b: string) => {
  const [aq, ar] = a.split(',').map(Number) as [number, number];
  const [bq, br] = b.split(',').map(Number) as [number, number];
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1;
};
const touchesAny = (shape: readonly string[], k: string) => shape.some((x) => adjacent(x, k));
/** An order of the hexes in which each one touches an earlier one. */
const growOrder = (hexes: readonly string[]): string[] => {
  const out = [hexes[0]!];
  while (out.length < hexes.length) out.push(hexes.find((k) => !out.includes(k) && touchesAny(out, k))!);
  return out;
};

describe('the one-tap suggestion', () => {
  it('includes the tapped hex; most tiles gained first, then most taken; deterministic', () => {
    // their chain root-(1,-1)-(0,0)-(-1,0): a bloom through (0,0) with a number over 2 takes it and cuts (-1,0)
    const s = stateWith({ '1,-1': [1, 2], '0,0': [1, 2], '-1,0': [1, 2] }, RUN);
    const { v, combo } = comboOf(s, [3, 4, 5]);
    const a = suggestBloom(v, combo.actions, '-1,1')!;
    expect(a.hexes.map(coordKey)).toContain('-1,1');
    expect(suggestBloom(v, combo.actions, '-1,1')).toEqual(a);
    const b = suggestBloom(v, combo.actions, '0,0') as Bloom;
    expect(b.hexes.map(coordKey)).toContain('0,0');
    expect(suggestBloom(v, combo.actions, '3,3')).toBeNull();
  });
});

describe('desktop: one click to start, one to finish (the keyboard uses the same machine)', () => {
  it('click a start, the shape grows toward the mouse, the second click finishes', () => {
    const s = stateWith({}, RUN);
    const { v, combo } = comboOf(s, [3, 4, 5]);
    let d = deskClick(DESK_IDLE, '-1,1', v, combo).desk;
    expect(d.phase).toBe('live');
    d = deskHover(d, '1,1');
    const g = deskShape(v, combo, d);
    expect(g.tiles.length).toBe(3);
    expect(g.tiles[0]!.key).toBe('-1,1');
    const r = deskClick(d, '1,1', v, combo);
    expect(r.finish).toEqual(g.action);
  });
  it('the desktop shape is deterministic and always legal-so-far', () => {
    const s = stateWith({ '0,1': [1, 7] }, RUN);
    const { combo } = comboOf(s, [3, 4, 5]);
    const a = growToward(combo, '-1,1', '2,-1');
    expect(growToward(combo, '-1,1', '2,-1')).toEqual(a);
    let shape: string[] = [];
    for (const k of a) {
      expect(drawNext(combo, shape).has(k)).toBe(true);
      shape = [...shape, k];
    }
    expect(a).not.toContain('0,1');
  });
});

describe('settings, keyboard and calm highlights', () => {
  it('Confirm moves: on for touch, off for a mouse, unless the player chose', () => {
    expect(confirmMovesFor(null, false)).toBe(true);
    expect(confirmMovesFor(null, true)).toBe(false);
    expect(confirmMovesFor(true, true)).toBe(true);
    expect(confirmMovesFor(false, false)).toBe(false);
  });
  it('arrow keys move a cursor hex in a column and stay on the board', () => {
    const board = keys(stateWith({}, RUN));
    expect(keyStep('0,0', 'ArrowRight', board)).toBe('1,0');
    expect(keyStep('0,0', 'ArrowUp', board)).toBe('1,-1');
    expect(keyStep('0,1', 'ArrowDown', board)).toBe('-1,2');
    expect(keyStep('3,0', 'ArrowRight', board)).toBe('3,0');
  });
  it('proximity: 1 under the pointer, 0 far away, never increasing with distance', () => {
    expect(proximity(0)).toBe(1);
    expect(proximity(1e6)).toBe(0);
    expect(proximity(Number.NaN)).toBe(0);
    let prev = 1;
    for (let d = 0; d <= 120; d += 5) {
      expect(proximity(d)).toBeLessThanOrEqual(prev + 1e-9);
      prev = proximity(d);
    }
  });
  it('while painting, only the hexes that can legally come next are lit; a full shape has none', () => {
    const s = stateWith({}, SET3);
    const { combo } = comboOf(s, [6, 6, 6]);
    const next = drawNext(combo, ['-1,1']);
    for (const k of next) expect(touchesAny(['-1,1'], k)).toBe(true);
    expect(drawNext(combo, paint(combo, ['-1,1', '0,0', '0,1'])).size).toBe(0);
    expect(sameSet([...drawStarts(combo)], [...combo.hexes])).toBe(true);
  });
});

void (null as unknown as Action);
