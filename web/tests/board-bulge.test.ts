// THE BOARD AS A SMALL PLANET (0.75, owner 2026-11-04: "A 5% bulge on the board, using the spread
// curve from the flat Territory globe ... Must never make the board harder to read or to tap: test
// tap accuracy at the edges").
// OWNER CHANGED THE RULE (2026-11-04: "there are gaps in the map between empty piles - should never
// happen"): the first cut drew each tile smaller about its own centre and pinned "the grout only
// opens"; now every CORNER is bent, and this test pins that neighbours share their corners exactly.
import { afterEach, describe, expect, it } from 'vitest';
import { coordKey } from '../../src/engine/index.js';
import { BOARD_BULGE, S, boardBulge, centerOf, cornerPts, latticeCentre, setBoardBulge } from '../src/ui/geom.js';
import { hexAtPoint } from '../src/logic/draw.js';
import { GLOBE_SHAPE } from '../src/online/map-globe.js';

const board = (radius: number) => {
  const keys: string[] = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) if (Math.abs(q + r) <= radius) keys.push(coordKey({ q, r }));
  return keys;
};
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;
const close = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

afterEach(() => setBoardBulge(null));

describe('the board bends like a small planet', () => {
  for (const radius of [2, 3]) {
    const keys = board(radius);
    it(`radius ${radius}: drawn on the Territory globe's own spread curve, 5% at the rim`, () => {
      setBoardBulge(keys);
      const pose = boardBulge()!;
      expect(pose.falloff).toBe(BOARD_BULGE);
      expect(BOARD_BULGE).toBe(0.05);
      expect(pose.shape).toBe(GLOBE_SHAPE);
      for (const key of keys) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        const flat = latticeCentre(q, r), drawn = centerOf(key);
        const fd = Math.hypot(flat.x - pose.cx, flat.y - pose.cy), dd = Math.hypot(drawn.x - pose.cx, drawn.y - pose.cy);
        if (fd < 1e-6) { expect(dd).toBeLessThan(1e-6); continue; }
        expect(dd).toBeLessThan(fd);
        expect(dd / fd).toBeGreaterThan(1 - BOARD_BULGE);
      }
    });

    it(`radius ${radius}: one seamless surface — every neighbour shares its two corners exactly`, () => {
      setBoardBulge(keys);
      const set = new Set(keys);
      for (const key of keys) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        const mine = cornerPts(key, S);
        for (const [dq, dr] of NEIGHBOURS) {
          const other = coordKey({ q: q + dq, r: r + dr });
          if (!set.has(other)) continue;
          const theirs = cornerPts(other, S);
          const shared = mine.filter((a) => theirs.some((b) => close(a, b)));
          expect(shared.length, `${key} / ${other}`).toBe(2);
        }
      }
    });

    it(`radius ${radius}: a tap anywhere on a tile as drawn finds that tile, at the edges too`, () => {
      setBoardBulge(keys);
      const set = new Set(keys);
      for (const key of keys) {
        const c = centerOf(key), pts = cornerPts(key, S);
        const probes: { x: number; y: number }[] = [{ x: c.x, y: c.y }];
        for (let i = 0; i < 6; i++) {
          const a = pts[i]!, b = pts[(i + 1) % 6]!;
          // 85% of the way to a corner, and 88% of the way to the middle of a side.
          probes.push({ x: c.x + (a[0] - c.x) * 0.85, y: c.y + (a[1] - c.y) * 0.85 });
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          probes.push({ x: c.x + (mx - c.x) * 0.88, y: c.y + (my - c.y) * 0.88 });
        }
        for (const p of probes) expect(hexAtPoint(p.x, p.y, set), `${key} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`).toBe(key);
      }
    });
  }

  it('off, the board is exactly the flat lattice (other channels, other boards)', () => {
    setBoardBulge(null);
    for (const key of board(3)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      expect(centerOf(key)).toEqual(latticeCentre(q, r));
    }
  });
});
