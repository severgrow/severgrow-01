import { describe, expect, it } from 'vitest';
import { coordKey } from '../../src/engine/index.js';
import { looseEdges, networkEdges, veinLook, weakestLink } from '../src/logic/network.js';
import { customBoard, playGame, rootFan } from './ui-helpers.js';

describe('network veins', () => {
  it('joins connected tiles back to the root; a single link is fragile, a loop is not', () => {
    const base = customBoard({});
    const { root, a, b, c } = rootFan(base, 0);
    const far = { q: -root.q, r: -root.r + 0 }; // somewhere else, not joined to the root
    const s = customBoard({
      [coordKey(a)]: { owner: 0, strength: 3 },
      [coordKey(b)]: { owner: 0, strength: 4 },
      [coordKey(c)]: { owner: 0, strength: 2 },
    });
    const edges = networkEdges(s.board, s.config, 0);
    const key = (x: string, y: string) => [x, y].sort().join('|');
    const got = new Map(edges.map((e) => [key(e.a, e.b), e.fragile]));
    const [R, A, B, C] = [root, a, b, c].map(coordKey) as [string, string, string, string];
    expect(got.get(key(R, A))).toBe(false); // root-A-C triangle: a loop
    expect(got.get(key(R, C))).toBe(false);
    expect(got.get(key(A, C))).toBe(false);
    expect(got.get(key(A, B))).toBe(true); // B hangs by one link
    expect(edges.every((e) => e.owner === 0)).toBe(true);
    expect(edges.some((e) => e.a === coordKey(far) || e.b === coordKey(far))).toBe(false);
  });

  it('in real games every vein joins two tiles of the same owner that touch', () => {
    const s = playGame(7, undefined, 120);
    for (const p of [0, 1] as const) {
      for (const e of networkEdges(s.board, s.config, p)) {
        expect(s.board[e.a]?.owner).toBe(p);
        expect(s.board[e.b]?.owner).toBe(p);
      }
    }
  });

  it('tiles cut off from the root are joined by loose (dead) veins, never by live ones', () => {
    const base = customBoard({});
    const { a, b } = rootFan(base, 0);
    // b alone, without a: b is not joined to the root
    const lone = customBoard({ [coordKey(b)]: { owner: 0, strength: 3 } });
    expect(networkEdges(lone.board, lone.config, 0).some((e) => e.a === coordKey(b) || e.b === coordKey(b))).toBe(false);
    const { b: b2 } = rootFan(base, 0);
    const pair = { ...lone.board };
    // put a second loose tile next to b, away from the root: two cut-off tiles touching
    const nb = Object.keys(pair).find((k) => k !== coordKey(a) && pair[k] === null && Math.abs(Number(k.split(',')[0]) - b2.q) + Math.abs(Number(k.split(',')[1]) - b2.r) === 1 && lone.terrain[k] !== 'rock' && !networkEdges({ ...pair, [k]: { owner: 0, strength: 1 } }, lone.config, 0).length)!;
    pair[nb] = { owner: 0, strength: 1 };
    const loose = looseEdges(pair, lone.config, 0);
    expect(loose.length).toBe(1);
    expect([loose[0]!.a, loose[0]!.b].sort()).toEqual([coordKey(b), nb].sort());
  });
});

describe('vein thickness: how many tiles depend on each link', () => {
  const base = customBoard({});
  const { root, a, b, c } = rootFan(base, 0);
  const s = customBoard({
    [coordKey(a)]: { owner: 0, strength: 3 },
    [coordKey(b)]: { owner: 0, strength: 4 },
    [coordKey(c)]: { owner: 0, strength: 2 },
  });
  const [R, A, B, C] = [root, a, b, c].map(coordKey) as [string, string, string, string];
  const edges = networkEdges(s.board, s.config, 0);
  const find = (x: string, y: string) => edges.find((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x))!;

  it('the load of a link is the number of tiles that reach the root through it', () => {
    expect(find(A, B).load).toBe(1); // just B
    expect(find(R, A).load).toBe(2); // A and B
    expect(find(R, C).load).toBe(1);
    expect(find(A, C).load).toBe(0); // a spare link in a loop carries no one
  });

  it('a fragile link knows how many tiles cutting it would remove', () => {
    expect(find(A, B)).toMatchObject({ fragile: true, cut: 1 });
    expect(find(R, A)).toMatchObject({ fragile: false, cut: 0 });
  });

  it('in real games: loads add up (every tile but the root is carried by exactly one link)', () => {
    const g = playGame(7, undefined, 120);
    for (const p of [0, 1] as const) {
      const es = networkEdges(g.board, g.config, p);
      const joined = new Set(es.flatMap((e) => [e.a, e.b]));
      const children = es.filter((e) => e.load > 0);
      expect(children.length).toBe(Math.max(0, joined.size - 1)); // a tree: one carrying link per tile
      for (const e of es) if (e.fragile) expect(e.cut).toBe(e.load);
    }
  });

  it('thicker and brighter with more tiles depending on it; fragile links are thin; both capped', () => {
    const w = [0, 1, 2, 4, 8, 30].map((n) => veinLook(n, false));
    for (let i = 1; i < w.length; i++) {
      expect(w[i]!.width).toBeGreaterThanOrEqual(w[i - 1]!.width);
      expect(w[i]!.opacity).toBeGreaterThanOrEqual(w[i - 1]!.opacity);
    }
    expect(w.at(-1)!.width).toBeLessThanOrEqual(2.6);
    expect(w.at(-1)!.opacity).toBeLessThanOrEqual(1);
    expect(veinLook(5, true).width).toBeLessThan(veinLook(5, false).width);
    expect(veinLook(5, true).width).toBeLessThan(veinLook(0, false).width + 0.01);
  });

  it('the weakest link is the fragile link that would cut the most tiles (none when there is no fragile link)', () => {
    expect(weakestLink(edges)).toMatchObject({ cut: 1 });
    expect(weakestLink(edges.filter((e) => !e.fragile))).toBeNull();
  });
});
