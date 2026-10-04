// v0.7 Step 9: the adversarial Bloom positions (1-7 of the 12; 8-12 are in web/tests).
import { describe, expect, it } from 'vitest';
import { allCoords, allNeighbors, apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Coord, Player, State } from '../../src/engine/index.js';

const c = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });
const at = (k: string): Coord => {
  const [q, r] = k.split(',').map(Number) as [number, number];
  return { q, r };
};
const MY_ROOT = '-2,2';
const OPP_ROOT = '2,-2';

/** My Grow step. `open` lists the only non-rock hexes besides the homes and the tiles (all others are rock) when given. */
const position = (o: { tiles?: Record<string, [Player, number]>; hand: Card[]; open?: string[] }): State => {
  const s = newGame(1);
  const board: State['board'] = {};
  const terrain: State['terrain'] = {};
  const keep = o.open ? new Set([...o.open, MY_ROOT, OPP_ROOT, ...Object.keys(o.tiles ?? {})]) : null;
  for (const k of Object.keys(s.board)) {
    board[k] = s.board[k]?.root ? s.board[k]! : null;
    terrain[k] = keep && !keep.has(k) ? 'rock' : 'normal';
  }
  for (const [k, [owner, strength]] of Object.entries(o.tiles ?? {})) board[k] = { owner, strength };
  return { ...s, board, terrain, hands: [o.hand, [c(90, 1, 3), c(91, 2, 4)]], discard: [c(95, 3, 9)], phase: 'ACT', turnPlayer: 0, actor: 0, history: [] };
};
const blooms = (s: State) => legalActions(viewFor(s, 0)).filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom');
const keysOf = (a: Extract<Action, { t: 'Bloom' }>) => a.hexes.map(coordKey);
const rankOf = (s: State, id: number) => s.hands[0].find((x) => x.id === id)!.rank;
const SET5 = [c(1, 0, 5), c(2, 1, 5), c(3, 2, 5), c(4, 3, 5)];

describe('ADVERSARIAL (v0.7 Bloom)', () => {
  it('1. the only legal shape is a bent chain: it is found, and nothing else is offered', () => {
    // root (-2,2) -> (-1,2) -> (0,1) -> (1,1): turns at (0,1)
    const s = position({ hand: SET5.slice(0, 3), open: ['-1,2', '0,1', '1,1'] });
    const b = blooms(s);
    expect(b.length).toBeGreaterThan(0);
    for (const a of b) expect(new Set(keysOf(a))).toEqual(new Set(['-1,2', '0,1', '1,1']));
    // it really is bent: the three centres are not on one line
    const [p, q, r] = ['-1,2', '0,1', '1,1'].map(at) as [Coord, Coord, Coord];
    expect((q.q - p.q) * (r.r - q.r) - (q.r - p.r) * (r.q - q.q)).not.toBe(0);
    expect(() => apply(s, b[0]!)).not.toThrow();
  });

  it('2. fewer legal hexes than the Bloom size touch my network: the cluster reaches outward through the one that does; with too little room there is no Bloom', () => {
    const roomy = position({ hand: SET5.slice(0, 3), open: ['-1,2', '0,1', '0,2', '1,1'] });
    const touching = allNeighbors(at(MY_ROOT)).map(coordKey).filter((k) => roomy.terrain[k] === 'normal' && !roomy.board[k]);
    expect(touching).toEqual(['-1,2']);
    const b = blooms(roomy);
    expect(b.length).toBeGreaterThan(0);
    for (const a of b) expect(keysOf(a)).toContain('-1,2');
    const cramped = position({ hand: SET5.slice(0, 3), open: ['-1,2', '0,1'] });
    expect(blooms(cramped)).toEqual([]);
  });

  it('3. four of a kind where a Bloom of 4 is impossible but a Bloom of 3 is legal', () => {
    const s = position({ hand: SET5, open: ['-1,2', '0,1', '1,1'] });
    const b = blooms(s);
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((a) => a.cards.length === 3)).toBe(true);
    // every choice of 3 of the 4 fives is offered
    expect(new Set(b.map((a) => [...a.cards].sort().join(','))).size).toBe(4);
  });

  it('4. a run 3-4-5 where only one assignment can replace an opponent 4: the 5 always goes there', () => {
    const s = position({ hand: [c(10, 0, 3), c(11, 0, 4), c(12, 0, 5)], tiles: { '1,1': [1, 4] }, open: ['-1,2', '0,1'] });
    const b = blooms(s);
    expect(b.length).toBeGreaterThan(0);
    for (const a of b) {
      const i = keysOf(a).indexOf('1,1');
      expect(i).toBeGreaterThanOrEqual(0);
      expect(rankOf(s, a.cards[i]!)).toBe(5);
    }
    // the reverse (the 3 on the opponent 4) is refused
    const a = b[0]!;
    const i = keysOf(a).indexOf('1,1');
    const wrong = { ...a, cards: a.cards.map((id, j) => (j === i ? 10 : id === 10 ? a.cards[i]! : id)) };
    expect(() => apply(s, wrong)).toThrow();
  });

  it('5. a run of 5 where only one run of 3 in a row is legal (5-6-7, the 7 on the opponent 6)', () => {
    const run = [c(10, 0, 3), c(11, 0, 4), c(12, 0, 5), c(13, 0, 6), c(14, 0, 7)];
    const s = position({ hand: run, tiles: { '1,1': [1, 6] }, open: ['-1,2', '0,1'] });
    const b = blooms(s);
    expect(b.length).toBeGreaterThan(0);
    for (const a of b) {
      expect(a.cards.map((id) => rankOf(s, id)).sort()).toEqual([5, 6, 7]);
      expect(rankOf(s, a.cards[keysOf(a).indexOf('1,1')]!)).toBe(7);
    }
  });

  it('6. a Bloom that replaces an opponent tile and cuts them off in two places', () => {
    // the opponent: home (2,-2) -> (1,-1) -> (0,0) = X, and from X two branches: (-1,0)-(-2,0) and (0,1)-(1,1)
    const s = position({
      hand: SET5.slice(0, 3),
      tiles: { '1,-1': [1, 2], '0,0': [1, 2], '-1,0': [1, 1], '-2,0': [1, 1], '0,1': [1, 1], '1,1': [1, 1], '-1,1': [0, 3] },
    });
    const a: Action = { t: 'Bloom', cards: [1, 2, 3], hexes: ['0,0', '1,0', '0,-1'].map(at) };
    // legal: the engine accepts it (apply throws on an illegal Bloom)
    const after = apply(s, a);
    expect(after.board['0,0']?.owner).toBe(0);
    const cut = (after.lastResolution?.severed ?? []).filter((x) => x.player === 1).flatMap((x) => x.coords.map(coordKey));
    expect(new Set(cut)).toEqual(new Set(['-1,0', '-2,0', '0,1', '1,1']));
    // two separate pieces
    const pieces = (keys: string[]) => {
      const left = new Set(keys);
      let n = 0;
      while (left.size) {
        n++;
        const todo = [left.values().next().value as string];
        left.delete(todo[0]!);
        while (todo.length) for (const nb of allNeighbors(at(todo.pop()!)).map(coordKey)) if (left.delete(nb)) todo.push(nb);
      }
      return n;
    };
    expect(pieces(cut)).toBe(2);
  });

  it('7. two Blooms in one turn from two different groups', () => {
    const s = position({ hand: [c(1, 0, 5), c(2, 1, 5), c(3, 2, 5), c(10, 3, 6), c(11, 3, 7), c(12, 3, 8)] });
    const first = blooms(s).find((a) => a.cards.every((id) => id <= 3))!;
    expect(first).toBeDefined();
    const mid = apply(s, first);
    expect(mid.phase).toBe('ACT');
    const second = blooms(mid).find((a) => a.cards.every((id) => id >= 10));
    expect(second).toBeDefined();
    const end = apply(mid, second!);
    expect(end.hands[0].length).toBe(0);
    expect(Object.values(end.board).filter((t) => t?.owner === 0 && !t.root).length).toBe(6);
    expect(allCoords(end.config.boardRadius).length).toBe(37);
  });
});
