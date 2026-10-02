// UI polish pass 3, Part 4: drawing a line or clump on the board instead of "Other way".
// Pure logic only (the page feeds it pointer positions): hit testing with a smaller hit area,
// sampling the segment between pointer events, snapping to one of the 6 directions with a
// dead zone and hysteresis, line ghosts, the matcher to the engine's legal actions, clump
// drawing (backtracking, completion, partial shapes), the desktop two-click state machine,
// the deterministic desktop clump, the Confirm-moves default, and keyboard steps.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, kindOf, options, pendingAction, tapCard, tapHex, tapKind } from '../src/logic/interaction.js';
import {
  DESK_IDLE,
  HIT,
  clumpEnter,
  clumpHexes,
  clumpMatch,
  clumpProblem,
  clumpTap,
  comboFor,
  confirmMovesFor,
  deskCancel,
  deskClick,
  deskHover,
  deskShape,
  dirToward,
  drawStarts,
  growClump,
  hexAtPoint,
  hexesAlong,
  keyStep,
  lineArrows,
  lineGhost,
  onlyPlacement,
  pixelOf,
  snapDir,
} from '../src/logic/draw.js';
import { fixture } from '../../tests/helpers.js';
import { S } from '../src/ui/geom.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], opts: { rock?: string[]; config?: Partial<RulesConfig> } = {}): State => {
  const g = newGame(5, opts.config);
  const f = fixture({ tiles, rock: opts.rock ?? [], config: opts.config ?? {} });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT' };
};
const RUN: [Suit, number][] = [[0, 3], [0, 4], [0, 5]];
const SET4: [Suit, number][] = [[0, 6], [1, 6], [2, 6], [3, 6]];
const comboOf = (s: State, kind: string) => {
  const v = viewFor(s, 0);
  const legal = legalActions(v);
  return { v, legal, combo: comboFor(v, legal, tapKind(EMPTY_SEL, kind))! };
};
const keys = (s: State) => new Set(Object.keys(s.board));
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));

describe('geometry: hit testing and fast swipes', () => {
  const board = keys(stateWith({}, RUN));

  it('a point is in a hex only inside a slightly smaller hit area (so corners never slip into a neighbour)', () => {
    expect(HIT).toBeGreaterThan(0.7);
    expect(HIT).toBeLessThan(1);
    const c = pixelOf('0,1');
    expect(hexAtPoint(c.x, c.y, board)).toBe('0,1');
    // on the shared edge between (0,1) and (1,1): in neither
    const d = pixelOf('1,1');
    expect(hexAtPoint((c.x + d.x) / 2, (c.y + d.y) / 2, board)).toBeNull();
    // a little way in from the edge, towards (1,1): already (1,1)
    expect(hexAtPoint(c.x + (d.x - c.x) * 0.65, c.y, board)).toBe('1,1');
    // off the board: nothing
    expect(hexAtPoint(10000, 0, board)).toBeNull();
  });

  it('a fast swipe crossing 4 hexes between two pointer events adds all 4, in order', () => {
    const a = pixelOf('-1,1');
    const b = pixelOf('2,1');
    expect(hexesAlong(a, b, board)).toEqual(['-1,1', '0,1', '1,1', '2,1']);
    expect(hexesAlong(b, a, board)).toEqual(['2,1', '1,1', '0,1', '-1,1']);
  });
});

describe('direction snapping', () => {
  const unit = (deg: number, len = 40) => [Math.cos((deg * Math.PI) / 180) * len, Math.sin((deg * Math.PI) / 180) * len] as const;

  it('each of the 6 directions snaps from its own screen angle', () => {
    // dir 0 (q+1) is to the right; screen y grows downwards
    const angles = [0, -60, -120, 180, 120, 60];
    angles.forEach((deg, dir) => expect(snapDir(...unit(deg), null)).toBe(dir));
  });

  it('a small movement (the dead zone) keeps what was there; near a boundary the current direction holds (hysteresis)', () => {
    expect(snapDir(...unit(0, 4), null)).toBeNull();
    expect(snapDir(...unit(0, 4), 2)).toBe(2);
    // 33 degrees: closer to dir 5 (60) than... no: closer to dir 0 (0) by 33 vs 27? 33 is nearer 60 (27 away)
    expect(snapDir(...unit(33), null)).toBe(5);
    // but coming from dir 0, a wobble just past the half-way line does not flip it
    expect(snapDir(...unit(33), 0)).toBe(0);
    // a clear turn does
    expect(snapDir(...unit(45), 0)).toBe(5);
  });

  it('dirToward: the direction from one hex towards another (desktop hover, keyboard)', () => {
    expect(dirToward('0,0', '3,0')).toBe(0);
    expect(dirToward('0,0', '0,-2')).toBe(2);
    expect(dirToward('0,0', '0,0')).toBeNull();
  });
});

describe('drawing a line', () => {
  // only my root (-2,2) on the board; a run of 3, 4, 5
  const s = stateWith({}, RUN);
  const { v, legal, combo } = comboOf(s, 'line-3');

  it('the start hexes glow: free hexes touching my network with at least one legal direction', () => {
    expect(combo.kind).toBe('line');
    expect(combo.n).toBe(3);
    const starts = drawStarts(combo);
    for (const a of combo.actions as Extract<Action, { t: 'MeldRun' }>[]) expect(starts.has(coordKey(a.start))).toBe(true);
    expect(starts.has('-1,1')).toBe(true);
    expect(starts.has('2,-2')).toBe(false);
  });

  it('the ghost shows all N tiles in the snapped direction, numbers rising from the start; all 6 directions', () => {
    for (let dir = 0; dir < 6; dir++) {
      const g = lineGhost(v, combo, '-1,1', dir);
      expect(g.tiles.length).toBeGreaterThan(0);
      expect(g.tiles[0]!.key).toBe('-1,1');
    }
    const g = lineGhost(v, combo, '-1,1', 0);
    expect(g.tiles.map((t) => t.key)).toEqual(['-1,1', '0,1', '1,1']);
    expect(g.tiles.map((t) => t.strength)).toEqual([3, 4, 5]);
    expect(g.tiles.every((t) => t.ok)).toBe(true);
    expect(g.action).toEqual(combo.actions.find((a) => a.t === 'MeldRun' && coordKey(a.start) === '-1,1' && a.dir === 0));
  });

  it('either end: starting at the far end and dragging back to the network finds the same placement', () => {
    const g = lineGhost(v, combo, '1,1', 3);
    expect(g.action).toMatchObject({ t: 'MeldRun', start: { q: -1, r: 1 }, dir: 0 });
    // the numbers still rise from the network end
    expect(g.tiles.find((t) => t.key === '-1,1')!.strength).toBe(3);
    expect(g.tiles.find((t) => t.key === '1,1')!.strength).toBe(5);
  });

  it('when only the start is touched, arrows show the legal directions', () => {
    const arrows = lineArrows(combo, '-1,1');
    expect(arrows).toContain(0);
    for (const d of arrows) expect(lineGhost(v, combo, '-1,1', d).action).not.toBeNull();
  });

  it('the edge of the board: the line is blocked, nothing to commit', () => {
    const g = lineGhost(v, combo, '-3,3', 3);
    expect(g.action).toBeNull();
    expect(g.reason).toBe('The line runs off the board');
  });

  it('exactly one legal placement shows as a ready preview', () => {
    expect(onlyPlacement(combo)).toBeNull(); // many here
    const one = { ...combo, actions: [combo.actions[0]!] };
    expect(onlyPlacement(one)).toEqual(combo.actions[0]);
  });

  it('a placement made by drawing is exactly the engine action the old method gave', () => {
    for (const a of combo.actions as Extract<Action, { t: 'MeldRun' }>[]) {
      const g = lineGhost(v, combo, coordKey(a.start), a.dir);
      expect(g.action).toEqual(a);
      // the old way: kind, card, start hex, then cycling to it
      let sel = tapKind(EMPTY_SEL, kindOf(a)!);
      sel = tapCard(v, legal, sel, a.cards[0]!);
      sel = tapHex(v, legal, sel, coordKey(a.start));
      const i = options(v, legal, sel).findIndex((x) => JSON.stringify(x) === JSON.stringify(a));
      expect(pendingAction(v, legal, { ...sel, option: i })).toEqual(a);
      expect(apply(s, g.action!)).toEqual(apply(s, pendingAction(v, legal, { ...sel, option: i })!));
    }
  });
});

describe('a blocked line direction', () => {
  it('rock in the way: that hex shows as "can\'t", the line cannot be committed; another direction can', () => {
    const s = stateWith({}, RUN, { rock: ['0,1'] });
    const { v, combo } = comboOf(s, 'line-3');
    const g = lineGhost(v, combo, '-1,1', 0);
    expect(g.action).toBeNull();
    expect(g.tiles.find((t) => t.key === '0,1')!.ok).toBe(false);
    expect(g.reason).toBe('Rock is in the way');
    expect(lineArrows(combo, '-1,1')).not.toContain(0);
    expect(lineArrows(combo, '-1,1').length).toBeGreaterThan(0);
  });

  it('a stronger enemy tile in the way, or my own tile: blocked with a reason', () => {
    const s = stateWith({ '0,1': [1, 9], '-1,2': [0, 2] }, RUN);
    const { v, combo } = comboOf(s, 'line-3');
    expect(lineGhost(v, combo, '-1,1', 0).reason).toBe('A stronger tile is in the way');
    // (0,2) dir 3 runs over my own tile at (-1,2)
    expect(lineGhost(v, combo, '0,2', 3).reason).toBe('Your own tile is in the way');
  });

  it('both ends touch my network: the end where the finger started is the start', () => {
    // my tile at (1,0) makes (1,1) touch my network too
    const s = stateWith({ '1,0': [0, 2] }, RUN);
    const { v, combo } = comboOf(s, 'line-3');
    expect(lineGhost(v, combo, '1,1', 3).action).toMatchObject({ start: { q: 1, r: 1 }, dir: 3 });
    expect(lineGhost(v, combo, '-1,1', 0).action).toMatchObject({ start: { q: -1, r: 1 }, dir: 0 });
  });
});

describe('drawing a clump', () => {
  const s = stateWith({}, SET4);
  const { v, legal, combo } = comboOf(s, 'clump-4');
  const all = clumpHexes(combo);

  it('drag: each new legal hex touching the shape is added; illegal or not touching ones are ignored', () => {
    let sh: string[] = [];
    sh = clumpEnter(sh, '-1,1', combo);
    expect(sh).toEqual(['-1,1']);
    sh = clumpEnter(sh, '2,-2', combo); // their root: not legal, ignored
    expect(sh).toEqual(['-1,1']);
    sh = clumpEnter(sh, '1,1', combo); // legal but not touching the shape: ignored
    expect(sh).toEqual(['-1,1']);
    sh = clumpEnter(sh, '0,1', combo);
    expect(sh).toEqual(['-1,1', '0,1']);
    expect(all.has('0,1')).toBe(true);
  });

  it('a Y shape (not a single path): a hex may touch ANY hex of the shape', () => {
    let sh: string[] = [];
    for (const k of ['0,1', '-1,1', '0,0', '1,0']) sh = clumpEnter(sh, k, combo);
    // (0,1) is the hub: (-1,1), (0,0) and (1,0) all touch it, not each other in a line
    expect(sh).toEqual(['0,1', '-1,1', '0,0', '1,0']);
    const a = clumpMatch(combo, sh)!;
    expect(a.t).toBe('MeldSet');
    expect(sameSet((a as Extract<Action, { t: 'MeldSet' }>).hexes.map(coordKey), sh)).toBe(true);
  });

  it('dragging back onto the previous hex removes the last one; completion at N; extra hexes are ignored', () => {
    let sh = ['-1,1', '0,1', '1,0'];
    sh = clumpEnter(sh, '0,1', combo);
    expect(sh).toEqual(['-1,1', '0,1']);
    for (const k of ['0,0', '1,0']) sh = clumpEnter(sh, k, combo);
    expect(sh.length).toBe(4);
    expect(clumpEnter(sh, '1,1', combo)).toEqual(sh);
  });

  it('tapping works too: tap to add, tap the last one to remove', () => {
    let sh: string[] = [];
    sh = clumpTap(sh, '-1,1', combo);
    sh = clumpTap(sh, '0,1', combo);
    expect(sh).toEqual(['-1,1', '0,1']);
    sh = clumpTap(sh, '0,1', combo);
    expect(sh).toEqual(['-1,1']);
  });

  it('a partial shape stays (2/4), with a note; a full one that does not touch my tiles cannot be confirmed', () => {
    expect(clumpProblem(v, combo, ['-1,1', '0,1'])).toBe('2/4: keep going, from any hex of the shape');
    // a far-away cluster: legal hexes each, but not touching my network
    const far = ['1,-1', '2,-1', '1,0', '0,0'];
    expect(clumpMatch(combo, far)).toBeNull();
    expect(clumpProblem(v, combo, far)).toBe('Your clump needs to touch your tiles');
  });

  it('the same shape matches the same engine action whatever order it was drawn in', () => {
    for (const a of (combo.actions as Extract<Action, { t: 'MeldSet' }>[]).slice(0, 30)) {
      const hexes = a.hexes.map(coordKey);
      const sel = tapCard(v, legal, tapKind(EMPTY_SEL, 'clump-4'), a.cards[0]!);
      const m1 = clumpMatch(combo, hexes)!;
      const m2 = clumpMatch(combo, [...hexes].reverse())!;
      expect(m1).toEqual(m2);
      expect(sameSet(m1.t === 'MeldSet' ? m1.hexes.map(coordKey) : [], hexes)).toBe(true);
      // the old way (card, a hex, cycle) reaches an action with the same hexes and the same result
      const opts = options(v, legal, tapHex(v, legal, sel, hexes[0]!));
      const old = opts.find((x) => x.t === 'MeldSet' && sameSet(x.hexes.map(coordKey), hexes))!;
      expect(apply(s, m1)).toEqual(apply(s, old));
    }
  });
});

describe('desktop: one click to start, one to finish', () => {
  const s = stateWith({}, RUN);
  const { v, combo } = comboOf(s, 'line-3');

  it('click a start, hover shapes the line, the second click finishes; Esc and right-click cancel', () => {
    let d = deskClick(DESK_IDLE, '2,-2', v, combo).desk; // not a start: nothing happens
    expect(d).toEqual(DESK_IDLE);
    d = deskClick(DESK_IDLE, '-1,1', v, combo).desk;
    expect(d).toMatchObject({ phase: 'live', start: '-1,1' });
    d = deskHover(d, '2,1');
    expect(deskShape(v, combo, d).action).toMatchObject({ start: { q: -1, r: 1 }, dir: 0 });
    const done = deskClick(d, '2,1', v, combo);
    expect(done.finish).toMatchObject({ t: 'MeldRun', dir: 0 });
    expect(done.desk).toEqual(DESK_IDLE);
    expect(deskCancel()).toEqual(DESK_IDLE);
  });

  it('a second click on a blocked shape finishes nothing (and keeps drawing)', () => {
    const r = deskClick(deskHover(deskClick(DESK_IDLE, '-3,3', v, combo).desk, '-3,3'), '-3,3', v, combo);
    expect(r.finish).toBeNull();
  });

  it('the desktop clump grows deterministically from the start toward the hover', () => {
    const c4 = comboOf(stateWith({}, SET4), 'clump-4');
    const a = growClump(c4.combo, '-1,1', '2,1');
    expect(a.length).toBe(4);
    expect(a[0]).toBe('-1,1');
    expect(growClump(c4.combo, '-1,1', '2,1')).toEqual(a); // same hover, same shape
    // the shortest path towards (2,1) runs along the row
    expect(a.slice(0, 3)).toEqual(['-1,1', '0,1', '1,1']);
    expect(clumpMatch(c4.combo, a)).not.toBeNull();
  });
});

describe('settings and keyboard', () => {
  it('Confirm moves: on for touch, off for a mouse, unless the player chose', () => {
    expect(confirmMovesFor(null, false)).toBe(true);
    expect(confirmMovesFor(null, true)).toBe(false);
    expect(confirmMovesFor(true, true)).toBe(true);
    expect(confirmMovesFor(false, false)).toBe(false);
  });

  it('arrow keys move a cursor hex in a column (Up and Down zig-zag, as the board always did) and stay on the board', () => {
    const board = keys(stateWith({}, RUN));
    expect(keyStep('0,0', 'ArrowRight', board)).toBe('1,0');
    expect(keyStep('0,0', 'ArrowLeft', board)).toBe('-1,0');
    expect(keyStep('0,0', 'ArrowUp', board)).toBe('1,-1');
    expect(keyStep('1,-1', 'ArrowUp', board)).toBe('1,-2');
    expect(keyStep('0,0', 'ArrowDown', board)).toBe('0,1');
    expect(keyStep('0,1', 'ArrowDown', board)).toBe('-1,2');
    expect(keyStep('3,0', 'ArrowRight', board)).toBe('3,0');
  });

  it('keyboard drawing: Enter starts, Enter on another hex finishes a line (the same machine as clicks)', () => {
    const s = stateWith({}, RUN);
    const { v, combo } = comboOf(s, 'line-3');
    let d = deskClick(DESK_IDLE, '-1,1', v, combo).desk;
    d = deskHover(d, '1,1');
    expect(deskClick(d, '1,1', v, combo).finish).toMatchObject({ start: { q: -1, r: 1 }, dir: 0 });
    expect(S).toBe(30);
  });
});

describe('review fixes (polish pass 3 follow-up)', () => {
  it("a line over the opponent's root says the root is in the way (not the start rule)", () => {
    // their root is at (2,-2); from (2,0) going up (dir 2) the line runs (2,0),(2,-1),(2,-2)
    const s = stateWith({ '1,1': [0, 2], '1,0': [0, 2], '2,1': [0, 2] }, RUN);
    const { v, combo } = comboOf(s, 'line-3');
    const g = lineGhost(v, combo, '2,0', 2);
    expect(g.action).toBeNull();
    expect(g.reason).toBe('A root is in the way');
    expect(g.tiles.find((t) => t.key === '2,-2')!.ok).toBe(false);
  });
});
