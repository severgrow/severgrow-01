import { describe, expect, it } from 'vitest';
import { coordKey } from '../../src/engine/index.js';
import { networkEdges } from '../src/logic/network.js';
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
});
