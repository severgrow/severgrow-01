// THE BOARD AS A SMALL PLANET (0.75, owner 2026-11-04: "A 5% bulge on the board, using the spread
// curve from the flat Territory globe ... Must never make the board harder to read or to tap: test
// tap accuracy at the edges").
import { afterEach, describe, expect, it } from 'vitest';
import { coordKey } from '../../src/engine/index.js';
import { BOARD_BULGE, S, boardBulge, centerOf, latticeCentre, setBoardBulge, tileBulge } from '../src/ui/geom.js';
import { hexAtPoint, HIT } from '../src/logic/draw.js';
import { GLOBE_SHAPE } from '../src/online/map-globe.js';

const board = (radius: number) => {
  const keys: string[] = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) if (Math.abs(q + r) <= radius) keys.push(coordKey({ q, r }));
  return keys;
};
const INRADIUS = (S * Math.sqrt(3)) / 2;
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;

afterEach(() => setBoardBulge(null));

describe('the board bends like a small planet', () => {
  for (const radius of [2, 3]) {
    const keys = board(radius);
    it(`radius ${radius}: the rim is drawn 5% in on the Territory globe's own spread curve`, () => {
      setBoardBulge(keys);
      const pose = boardBulge()!;
      expect(pose.falloff).toBe(BOARD_BULGE);
      expect(BOARD_BULGE).toBe(0.05);
      expect(pose.shape).toBe(GLOBE_SHAPE);
      // The middle tile does not move; every other tile is drawn closer in, and smaller.
      for (const key of keys) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        const flat = latticeCentre(q, r), drawn = centerOf(key);
        const fd = Math.hypot(flat.x - pose.cx, flat.y - pose.cy), dd = Math.hypot(drawn.x - pose.cx, drawn.y - pose.cy);
        if (fd < 1e-6) { expect(dd).toBeLessThan(1e-6); expect(tileBulge(key)).toBe(1); continue; }
        expect(dd).toBeLessThan(fd);
        expect(dd / fd).toBeGreaterThan(1 - BOARD_BULGE);
        expect(tileBulge(key)).toBeLessThan(1);
        expect(tileBulge(key)).toBeGreaterThan(0.85);
      }
    });

    it(`radius ${radius}: neighbouring tiles never overlap (the grout only opens)`, () => {
      setBoardBulge(keys);
      const set = new Set(keys);
      for (const key of keys) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        for (const [dq, dr] of NEIGHBOURS) {
          const other = coordKey({ q: q + dq, r: r + dr });
          if (!set.has(other)) continue;
          const a = centerOf(key), b = centerOf(other);
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - INRADIUS * (tileBulge(key) + tileBulge(other));
          expect(gap, `${key} / ${other}`).toBeGreaterThanOrEqual(-1e-6);
          // ...and only by a hair: never more than a tenth of a tile.
          expect(gap, `${key} / ${other}`).toBeLessThan(INRADIUS * 0.1);
        }
      }
    });

    it(`radius ${radius}: a tap anywhere on a tile as drawn finds that tile, at the edges too`, () => {
      setBoardBulge(keys);
      const set = new Set(keys);
      for (const key of keys) {
        const c = centerOf(key), k = tileBulge(key);
        // The centre, toward each side (95% of the way to the hit edge) and toward each corner.
        const probes = [{ x: c.x, y: c.y }];
        for (let i = 0; i < 6; i++) {
          const side = (Math.PI / 3) * i, corner = side + Math.PI / 6;
          probes.push({ x: c.x + Math.cos(side) * INRADIUS * k * HIT * 0.95, y: c.y + Math.sin(side) * INRADIUS * k * HIT * 0.95 });
          probes.push({ x: c.x + Math.cos(corner) * S * k * 0.75, y: c.y + Math.sin(corner) * S * k * 0.75 });
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
      expect(tileBulge(key)).toBe(1);
    }
  });
});
