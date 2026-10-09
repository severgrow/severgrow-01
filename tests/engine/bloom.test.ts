// Bloom: a set (3–6 cards, one number) or a run (3–6
// cards, one suit, numbers in a row, no wraparound) grows one tile per card, each with its own
// card's number, on a connected cluster of any shape that touches my network (before the move).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  FRUIT_CARD_RANK,
  apply,
  coordKey,
  eventsOf,
  legalActions,
  newGame,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Coord, Player, RulesConfig, State } from '../../src/engine/index.js';
import { clone, codeOf } from '../helpers.js';

const c = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });
const fruit = (id: number): Card => ({ id, suit: null, rank: FRUIT_CARD_RANK });
const at = (k: string): Coord => {
  const [q, r] = k.split(',').map(Number) as [number, number];
  return { q, r };
};

/** P1 root (-2,2), P2 root (2,-2), all terrain normal unless given. */
const position = (o: { tiles?: Record<string, [Player, number]>; hand?: Card[]; rock?: string[]; config?: Partial<RulesConfig> } = {}): State => {
  const s = newGame(1, o.config ?? {});
  const board: State['board'] = {};
  const terrain: State['terrain'] = {};
  for (const k of Object.keys(s.board)) {
    board[k] = s.board[k]?.root ? s.board[k]! : null;
    terrain[k] = o.rock?.includes(k) ? 'rock' : 'normal';
  }
  for (const [k, [owner, strength]] of Object.entries(o.tiles ?? {})) board[k] = { owner, strength };
  return {
    ...s,
    board,
    terrain,
    hands: [o.hand ?? [], [c(90, 1, 3), c(91, 2, 4)]],
    discard: [c(95, 3, 9)],
    phase: 'ACT',
    turnPlayer: 0,
    actor: 0,
    history: [],
  };
};
const bloom = (cards: number[], hexes: string[]): Action => ({ t: 'Bloom', cards, hexes: hexes.map(at) });
const code = (s: State, a: Action) => codeOf(() => apply(s, a)) ?? null;
const tile = (s: State, k: string) => s.board[k];

// a set of 5s and a run of hearts-like suit 0: 3,4,5,6,7
const SET5 = [c(1, 0, 5), c(2, 1, 5), c(3, 2, 5), c(4, 3, 5)];
const RUN = [c(10, 0, 3), c(11, 0, 4), c(12, 0, 5), c(13, 0, 6), c(14, 0, 7)];

// hexes next to my root (-2,2): (-1,2) (-1,1) (-2,1) (-3,2) (-3,3) (-2,3)
const TRIANGLE = ['-1,1', '-1,2', '0,1'];

describe('which cards can bloom', () => {
  const s = position({ hand: [...SET5, ...RUN, c(20, 1, 4), c(21, 1, 6), fruit(72), c(22, 2, 9), c(23, 1, 9), c(24, 1, 1)] });
  it('a set of 3, a set of 4, a run of 3 and a run of 4 are legal', () => {
    expect(code(s, bloom([1, 2, 3], TRIANGLE))).toBeNull();
    expect(code(s, bloom([1, 2, 3, 4], [...TRIANGLE, '0,2']))).toBeNull();
    expect(code(s, bloom([10, 11, 12], TRIANGLE))).toBeNull();
    expect(code(s, bloom([10, 11, 12, 13], [...TRIANGLE, '0,2']))).toBeNull();
  });
  it('rejects mixed numbers, gaps, wraparound, mixed suits, 2 cards and a Fruit card', () => {
    expect(code(s, bloom([1, 2, 20], TRIANGLE))).toBe('RUN_MIXED_SUITS'); // 5,5,4: not a set, not one suit
    expect(code(s, bloom([12, 1, 2], TRIANGLE))).toBeNull(); // repeated suit is a valid same-rank set
    expect(code(s, bloom([10, 11, 13], TRIANGLE))).toBe('RUN_NOT_CONSECUTIVE');
    expect(code(s, bloom([22, 23, 24], TRIANGLE))).toBe('RUN_MIXED_SUITS');
    const wrap = position({ hand: [c(30, 1, 8), c(31, 1, 9), c(32, 1, 1)] });
    expect(code(wrap, bloom([30, 31, 32], TRIANGLE))).toBe('RUN_NOT_CONSECUTIVE');
    expect(code(s, bloom([10, 20, 12], TRIANGLE))).toBe('RUN_MIXED_SUITS');
    expect(code(s, bloom([1, 2], ['-1,1', '-1,2']))).toBe('BLOOM_WRONG_SIZE');
    expect(code(s, bloom([10, 11, 12, 13, 14], [...TRIANGLE, '0,2', '1,1']))).toBeNull();
    expect(code(s, bloom([1, 2, 72], TRIANGLE))).toBe('NOT_A_NUMBER_CARD');
  });
  it('four of a kind used as 3 cards keeps the fourth; a 5-card run used as 3 or 4 consecutive cards', () => {
    const a = apply(s, bloom([1, 3, 4], TRIANGLE));
    expect(a.hands[0].map((x) => x.id)).toContain(2);
    const b = apply(s, bloom([12, 13, 14], TRIANGLE));
    expect(b.hands[0].map((x) => x.id)).toEqual(expect.arrayContaining([10, 11]));
    const d = apply(s, bloom([11, 12, 13, 14], [...TRIANGLE, '0,2']));
    expect(d.hands[0].map((x) => x.id)).toContain(10);
    expect(code(s, bloom([10, 12, 14], TRIANGLE))).toBe('RUN_NOT_CONSECUTIVE');
  });
});

describe('where it grows', () => {
  const s = position({ hand: [...SET5, ...RUN] });
  it('any connected shape: triangle, Y, bent chain, straight chain, blob', () => {
    expect(code(s, bloom([1, 2, 3], TRIANGLE))).toBeNull();
    expect(code(s, bloom([1, 2, 3, 4], ['-1,1', '0,1', '-1,0', '0,0']))).toBeNull(); // blob (rhombus)
    expect(code(s, bloom([1, 2, 3, 4], ['-1,1', '0,0', '0,1', '1,-1']))).toBeNull(); // Y: (0,0) in the middle
    expect(code(s, bloom([1, 2, 3], ['-1,2', '0,1', '0,0']))).toBeNull(); // bent chain
    expect(code(s, bloom([1, 2, 3], ['-1,1', '0,0', '1,-1']))).toBeNull(); // straight chain
  });
  it('a disconnected cluster, a cluster not touching my network', () => {
    expect(code(s, bloom([1, 2, 3], ['-1,1', '-1,2', '1,0']))).toBe('HEXES_NOT_CONNECTED');
    expect(code(s, bloom([1, 2, 3], ['0,0', '1,0', '1,-1']))).toBe('NOT_ADJACENT');
  });
  it('off board, rock, my own tile, an opponent root, duplicate hexes, wrong hex count', () => {
    expect(code(s, bloom([1, 2, 3], ['-2,3', '-3,3', '-3,4']))).toBe('OFF_BOARD');
    const rock = position({ hand: SET5, rock: ['0,1'] });
    expect(code(rock, bloom([1, 2, 3], TRIANGLE))).toBe('ROCK');
    const own = position({ hand: SET5, tiles: { '-1,1': [0, 2] } });
    expect(code(own, bloom([1, 2, 3], TRIANGLE))).toBe('OWN_TILE');
    const near = position({ hand: SET5, tiles: { '0,1': [0, 2], '1,0': [0, 2], '1,-1': [0, 2] } });
    expect(code(near, bloom([1, 2, 3], ['2,-1', '2,-2', '1,-2']))).toBe('ROOT_IMMUNE');
    expect(code(s, bloom([1, 2, 3], ['-1,1', '-1,1', '-1,2']))).toBe('DUPLICATE_HEX');
    expect(code(s, bloom([1, 2, 3], ['-1,1', '-1,2']))).toBe('HEX_COUNT_MISMATCH');
  });
  it('touching is judged on the board before the bloom; my root counts', () => {
    // the cluster touches only my root
    expect(code(s, bloom([1, 2, 3], ['-3,2', '-3,1', '-2,1']))).toBeNull();
    const off = position({ hand: SET5, config: { bloomMustTouchNetwork: false } });
    expect(code(off, bloom([1, 2, 3], ['0,0', '1,0', '1,-1']))).toBeNull();
    expect(DEFAULT_CONFIG.bloomMustTouchNetwork).toBe(true);
  });
});

describe('strengths and replacing', () => {
  it('a set: all tiles share the number; a run: each tile keeps its own card number', () => {
    const s = position({ hand: [...SET5, ...RUN] });
    const a = apply(s, bloom([1, 2, 3], TRIANGLE));
    expect(TRIANGLE.map((k) => tile(a, k)?.strength)).toEqual([5, 5, 5]);
    const b = apply(s, bloom([10, 11, 12], ['0,1', '-1,1', '-1,2']));
    expect(tile(b, '0,1')?.strength).toBe(3);
    expect(tile(b, '-1,1')?.strength).toBe(4);
    expect(tile(b, '-1,2')?.strength).toBe(5);
  });
  it('the assignment matters: a 5 can replace a 4, a 3 cannot; equal is blocked', () => {
    const s = position({ hand: RUN, tiles: { '-1,1': [1, 4] } });
    expect(code(s, bloom([10, 11, 12], ['-1,1', '-1,2', '0,1']))).toBe('NOT_STRONGER'); // the 3 on the 4
    expect(code(s, bloom([11, 10, 12], ['-1,1', '-1,2', '-2,1']))).toBe('NOT_STRONGER'); // the 4 on the 4
    const ok = apply(s, bloom([12, 10, 11], ['-1,1', '-1,2', '-2,1'])); // the 5 on the 4
    expect(tile(ok, '-1,1')).toEqual({ owner: 0, strength: 5 });
  });
});

describe('after a bloom', () => {
  it('cuts are checked for both players, and the events list the bloom, the overgrowth and the cut', () => {
    // their chain: root (2,-2) - (1,-1) - (0,0) - (-1,0); my 6 replaces (0,0) and cuts (-1,0)
    const s = position({ hand: RUN, tiles: { '-1,1': [0, 2], '1,-1': [1, 2], '0,0': [1, 5], '-1,0': [1, 3] } });
    const a = bloom([10, 11, 13], ['0,1', '-1,2', '0,0']);
    expect(code(s, a)).toBe('RUN_NOT_CONSECUTIVE');
    const ok = bloom([11, 12, 13], ['0,1', '-1,2', '0,0']); // 4, 5, 6: the 6 lands on their 5
    const after = apply(s, ok);
    expect(tile(after, '0,0')).toEqual({ owner: 0, strength: 6 });
    expect(tile(after, '-1,0')).toBeNull();
    const ev = eventsOf(s, ok, after);
    expect(ev[0]).toEqual({ t: 'Bloom', player: 0, cards: [11, 12, 13], hexes: [at('0,1'), at('-1,2'), at('0,0')] });
    expect(ev.map((e) => e.t)).toEqual(['Bloom', 'Overgrow', 'Sever']);
    expect(after.lastResolution?.bloom).toEqual({ cards: [11, 12, 13], hexes: [at('0,1'), at('-1,2'), at('0,0')] });
  });
  it('a bloom can strangle', () => {
    // their root (2,-2): neighbours (3,-2) (3,-3) (2,-3) (1,-2) (1,-1) (2,-1); off board: (3,-3)? no: on board.
    const nb = ['3,-2', '3,-3', '2,-3', '1,-2', '1,-1', '2,-1'];
    const tiles: Record<string, [Player, number]> = { '0,0': [0, 2], '-1,1': [0, 2] };
    // a chain of mine from my root to (1,-1), then 3 of the root's neighbours already mine
    tiles['1,-1'] = [0, 2];
    tiles['1,-2'] = [0, 2];
    tiles['2,-3'] = [0, 2];
    const s = position({ hand: SET5, tiles });
    const a = bloom([1, 2, 3], ['3,-3', '3,-2', '2,-1']);
    expect(nb.every((k) => k in s.board)).toBe(true);
    const after = apply(s, a);
    expect(after.result?.reason).toBe('strangle');
    expect(after.result?.winner).toBe(0);
  });
  it('atomic failure leaves the state untouched; the input is never mutated; determinism; JSON round trip', () => {
    const s = position({ hand: RUN, tiles: { '-1,1': [1, 4] } });
    const before = clone(s);
    expect(code(s, bloom([10, 11, 12], ['-1,1', '-1,2', '0,1']))).toBe('NOT_STRONGER'); // the 3 on their 4
    expect(s).toEqual(before);
    const a = bloom([12, 11, 10], ['-1,1', '-1,2', '-2,1']);
    const x = apply(s, a);
    const y = apply(clone(s), a);
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    expect(s).toEqual(before);
    expect(JSON.parse(JSON.stringify(x))).toEqual(x);
    expect(apply(JSON.parse(JSON.stringify(s)) as State, JSON.parse(JSON.stringify(a)) as Action)).toEqual(x);
  });
});

describe('legalActions for Blooms', () => {
  const legalBlooms = (s: State) => legalActions(viewFor(s, 0)).filter((a) => a.t === 'Bloom') as Extract<Action, { t: 'Bloom' }>[];
  it('every listed Bloom is legal and nothing is listed twice', () => {
    const s = position({ hand: [...SET5.slice(0, 3), ...RUN.slice(0, 4)], tiles: { '-1,1': [1, 4], '0,1': [1, 7] } });
    const list = legalBlooms(s);
    expect(list.length).toBeGreaterThan(0);
    for (const a of list) expect(code(s, a)).toBeNull();
    const keys = list.map((a) => JSON.stringify(a));
    expect(new Set(keys).size).toBe(keys.length);
    // a set is listed once per hex set (every ordering is equal)
    const isSet = (a: { cards: number[] }) => a.cards.every((id) => id >= 1 && id <= 3);
    const setKeys = list.filter(isSet).map((a) => a.hexes.map(coordKey).sort().join('|'));
    expect(new Set(setKeys).size).toBe(setKeys.length);
  });
  it('is exhaustive on a small region: every legal bloom of these cards on these hexes is listed', () => {
    const s = position({ hand: RUN.slice(0, 3), tiles: { '-1,1': [1, 4] } });
    const list = legalBlooms(s).map((a) => a.hexes.map(coordKey).join('|'));
    // the run 3,4,5 on the triangle (-1,1),(-1,2),(0,1): only the 5 may go on (-1,1)
    const tri = ['-1,1', '-1,2', '0,1'];
    const perms = [
      ['-1,1', '-1,2', '0,1'],
      ['-1,1', '0,1', '-1,2'],
      ['-1,2', '-1,1', '0,1'],
      ['-1,2', '0,1', '-1,1'],
      ['0,1', '-1,1', '-1,2'],
      ['0,1', '-1,2', '-1,1'],
    ];
    const legalPerms = perms.filter((p) => p[2] === '-1,1');
    for (const p of perms) {
      const listed = list.includes(p.join('|'));
      expect(listed, p.join(' ')).toBe(legalPerms.includes(p));
    }
    expect(tri.length).toBe(3);
  });
  it('the list is deterministic, and the repeated suit has its own four-card recipe', () => {
    const twin = position({ hand: [c(1, 0, 5), c(2, 1, 5), c(3, 2, 5), c(40, 2, 5)] });
    const a = legalBlooms(twin);
    expect(a.some((x) => x.cards.includes(40) && x.cards.length===4)).toBe(true);
    expect(JSON.stringify(legalBlooms(twin))).toBe(JSON.stringify(a));
  });
  it('a Fruit card is never in a listed Bloom', () => {
    const s = position({ hand: [...SET5.slice(0, 3), fruit(72)] });
    expect(legalBlooms(s).every((a) => !a.cards.includes(72))).toBe(true);
  });
});
