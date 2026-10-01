import { describe, expect, it } from 'vitest';
import { coordKey } from '../../src/engine/index.js';
import { looseEdges, networkEdges } from '../src/logic/network.js';
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
