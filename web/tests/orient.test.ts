// Step 3 item 1: the board is drawn with its points left-right ("pointy" hexes, as before) or
// rotated 90 degrees (points up-down: "flat" hexes), whichever gives bigger tiles. A rendering
// mapping only. Pixel-to-hex round trips, neighbour order and hex shapes in both.
import { afterEach, describe, expect, it } from 'vitest';
import { DIRECTIONS, allCoords, coordKey } from '../../src/engine/index.js';
import { getOrient, setOrient, toBoard, toScreen } from '../src/logic/orient.js';
import { centerOf, cornerPts } from '../src/ui/geom.js';
import { hexAtPoint, hexesAlong } from '../src/logic/draw.js';
import { centreOf, hexAt } from '../src/logic/vigour.js';

afterEach(() => setOrient('pointy'));
const keys = new Set(allCoords(3).map(coordKey));

for (const o of ['pointy', 'flat'] as const) {
  describe(`orientation: ${o}`, () => {
    it('screen and board units map back and forth exactly (a pure rotation)', () => {
      setOrient(o);
      expect(getOrient()).toBe(o);
      for (const [x, y] of [[0, 0], [10, -3], [-7.5, 22]] as const) {
        const s = toScreen(x, y);
        const b = toBoard(s.x, s.y);
        expect(b.x).toBeCloseTo(x, 9);
        expect(b.y).toBeCloseTo(y, 9);
        expect(Math.hypot(s.x, s.y)).toBeCloseTo(Math.hypot(x, y), 9);
      }
    });
    it('pixel to hex: every hex centre (and a point a little off it) maps to its own hex', () => {
      setOrient(o);
      for (const k of keys) {
        const c = centerOf(k);
        expect(hexAtPoint(c.x, c.y, keys)).toBe(k);
        expect(hexAtPoint(c.x + 6, c.y - 5, keys)).toBe(k);
        const v = centreOf(...(k.split(',').map(Number) as [number, number]));
        expect(v.x).toBeCloseTo(c.x, 9);
        expect(v.y).toBeCloseTo(c.y, 9);
        expect(coordKey(hexAt(c.x + 3, c.y + 4))).toBe(k);
      }
    });
    it('neighbours: the six directions keep their order around the hex, 60 degrees apart, one step away', () => {
      setOrient(o);
      const c = centerOf('0,0');
      const ang = DIRECTIONS.map((d) => {
        const n = centerOf(coordKey(d));
        expect(Math.hypot(n.x - c.x, n.y - c.y)).toBeCloseTo(30 * Math.sqrt(3), 6);
        return (Math.atan2(n.y - c.y, n.x - c.x) * 180) / Math.PI;
      });
      for (let i = 1; i < 6; i++) {
        const step = (((ang[i]! - ang[i - 1]!) % 360) + 360) % 360;
        expect(Math.min(step, 360 - step)).toBeCloseTo(60, 6);
      }
    });
    it('hex shape: pointy hexes have a corner straight up; flat ones a corner straight right', () => {
      setOrient(o);
      const pts = cornerPts('0,0', 30);
      const up = pts.some(([x, y]) => Math.abs(x) < 1e-6 && y < -29.9);
      const right = pts.some(([x, y]) => x > 29.9 && Math.abs(y) < 1e-6);
      expect(up).toBe(o === 'pointy');
      expect(right).toBe(o === 'flat');
    });
    it('a fast swipe across 4 hexes still finds all 4, in order', () => {
      setOrient(o);
      const a = centerOf('-1,1');
      const b = centerOf('2,1');
      expect(hexesAlong(a, b, keys)).toEqual(['-1,1', '0,1', '1,1', '2,1']);
    });
  });
}
