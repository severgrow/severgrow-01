// THE PLANET'S TILES SIT FLAT SIDE UP, AND EVERY TILE WEARS ITS PICTURE THE SAME WAY UP (owner,
// 2026-11-14: "always show tiles flat side up"; 2026-11-16: "some of the skins tiles are rotated —
// use the og rotation"). Every tile is turned by the same half hex step, so a flat-top picture lands
// on one of the lattice's edges; the view reports that turn so it can level the tile at the centre.
// The on-screen result (a level top edge, and the art the same way up on every tile) is measured with
// the real sphere in planet-skin.test.ts.
import { describe, expect, it } from 'vitest';
import { HALF_STEP, tileFace, tileVariants } from '../src/sphere/tile-face.js';
import { stampCoordinates } from '../src/sphere/challenge-stamp.js';
import { buildSphere } from '../src/sphere/geometry.js';
import type { V3 } from '../src/sphere/geometry.js';

const hexAround = (turnDeg: number, r = .02): V3[] => Array.from({ length: 6 }, (_, i) => {
  const a = ((turnDeg + 60 * i) * Math.PI) / 180;
  const p: V3 = [r * Math.cos(a), r * Math.sin(a), 1];
  const n = Math.hypot(...p);
  return [p[0] / n, p[1] / n, p[2] / n];
});

describe('a planet tile is turned by the same half hex step, whatever its angle', () => {
  for (const turn of [0, 10, -20, 29, 45, 75]) {
    it(`a hex turned ${turn} degrees: one constant turn, corners on the unit circle`, () => {
      const face = tileFace([0, 0, 1], hexAround(turn), [0, 1, 0]);
      // THE SAME TURN ON EVERY TILE: a constant cannot make one tile disagree with its neighbour.
      // The old rule asked which of six edges was nearest north, and the lattice's answers drifted
      // 60 degrees apart (planet-skin.test.ts keeps that measurement).
      expect(face.angle).toBeCloseTo(HALF_STEP, 12);
      for (const [x, y] of face.coords) expect(Math.hypot(x, y)).toBeCloseTo(1, 4);
    });
  }
  it('keeps the picture square on the lattice: the frame is the stamp frame, turned a half step', () => {
    const sphere = buildSphere();
    const north: V3 = [0, 1, 0];
    const c = Math.cos(-HALF_STEP), s = Math.sin(-HALF_STEP);
    for (const cell of sphere.cells.slice(0, 40)) {
      const corners = cell.corners.map((i) => sphere.corners[i]!);
      const stamp = stampCoordinates(cell.centre, corners, north);
      const face = tileFace(cell.centre, corners, north);
      expect(face.angle).toBeCloseTo(HALF_STEP, 12);
      for (let i = 0; i < stamp.length; i++) {
        expect(face.coords[i]![0]).toBeCloseTo(stamp[i]![0] * c - stamp[i]![1] * s, 4);
        expect(face.coords[i]![1]).toBeCloseTo(stamp[i]![0] * s + stamp[i]![1] * c, 4);
      }
    }
  });
});

describe('every planet tile has its own tone', () => {
  it('no two neighbours share a variant index, and all nine are used (the tone it feeds)', () => {
    const sphere = buildSphere(32);
    const v = tileVariants(sphere.cells);
    for (const c of sphere.cells) for (const n of c.neighbours) expect(v[n]).not.toBe(v[c.index]);
    expect(new Set(v).size).toBe(9);
  });
});
