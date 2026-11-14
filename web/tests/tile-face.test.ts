// THE PLANET'S TILES SIT FLAT SIDE UP (owner, 2026-11-14: "the planet orientation ... always show
// tiles flat side up"). Each tile's picture is turned so the hex edge nearest north is its top, and
// the turn is reported so the view can level the tile at the centre of the screen.
import { describe, expect, it } from 'vitest';
import { tileFace } from '../src/sphere/tile-face.js';
import type { V3 } from '../src/sphere/geometry.js';

const hexAround = (turnDeg: number, r = .02): V3[] => Array.from({ length: 6 }, (_, i) => {
  const a = ((turnDeg + 60 * i) * Math.PI) / 180;
  const p: V3 = [r * Math.cos(a), r * Math.sin(a), 1];
  const n = Math.hypot(...p);
  return [p[0] / n, p[1] / n, p[2] / n];
});

describe('a planet tile faces flat side up', () => {
  for (const turn of [0, 10, -20, 29, 45, 75]) {
    it(`a hex turned ${turn} degrees is levelled by its own turn`, () => {
      const face = tileFace([0, 0, 1], hexAround(turn), [0, 1, 0]);
      // The reported turn is the hex's own (counter-clockwise from flat-top-north), folded into
      // +-30 degrees (a hex repeats every 60); levelling turns it back by that much.
      const folded = ((((turn + 30) % 60) + 60) % 60) - 30;
      expect(face.angle * 180 / Math.PI).toBeCloseTo(folded, 3);
      // After levelling, one edge is exactly on top: its midpoint straight up at the flat-top apothem.
      const tops = face.coords.map((p, i) => { const q = face.coords[(i + 1) % 6]!; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
      const top = tops.reduce((a, b) => (b[1]! > a[1]! ? b : a));
      expect(top[0]).toBeCloseTo(0, 6);
      expect(top[1]).toBeCloseTo(Math.sqrt(3) / 2, 6);
      // ...and the corners sit on the flat-top hex of circumradius 1.
      for (const [x, y] of face.coords) expect(Math.hypot(x, y)).toBeCloseTo(1, 4);
    });
  }
});
