// THE GOLD FRAME'S PAINT MUST STAY INSIDE ITS OWN HEX, WHATEVER LOOK IT WEARS (owner, 2026-11-15:
// "before pushing test every gold tile rotation option - some of them are landing literally outside
// the board"). A look is (design, 60-degree turn, mirror) = 24 of them, and because a frame is a
// RIM that only ever sits on the board's outer ring, anything that leaves its hex also leaves the
// board — that is what he saw.
//
// This is the guard for the GEOMETRY, measured the way the browser paints it: the frame's painted
// outline (its atlas hexagon, plus the hand-painted art's measured overhang) is mapped through the
// very transform `drawGoldFrame` writes, about the cell centre, and every one of its points is held
// inside the hexagon the BOARD draws for that cell (`cornerPts(key, S)`) — not a paper hexagon.
//
// Both boards are covered, because they are different shapes: the 0.4 product draws a flat lattice,
// while the 0.5 line (FEATURES.space, the /test/ build the owner plays) bends every cell on the
// Territory globe's curve, which moves a cell's six corners by up to two degrees and two per cent.
// That bend is what made a frame sized to the mean of those corners sit a shade too big.
import { describe, expect, it } from 'vitest';
import { boardCoords, coordKey } from '../../src/engine/index.js';
import { DEFAULT_CONFIG } from '../../src/engine/config.js';
import { cornerPts, setBoardBulge } from '../src/ui/geom.js';
import { setOrient, setRotation } from '../src/logic/orient.js';
import { cellScale } from '../src/ui/geom.js';
import { goldFrameFit, goldFrameSize, goldPaintedReach } from '../src/ui/goldframe-geometry.js';
import { goldFrameCrop, goldLookMatrix, ringOf } from '../src/ui/goldframes.js';
import { GOLD_LOOK_COUNT, goldLookOfId } from '../src/ui/forestAsh.js';
import type { GoldLook } from '../src/ui/forestAsh.js';

const KEYS = boardCoords(DEFAULT_CONFIG).map(coordKey);
/** The outer ring of the product board: the ONLY cells a frame may sit on (`goldFrameKeys`). */
const OUTER = KEYS.filter((k) => ringOf(k) === 3);
/** The frame's padded crop holds the art's hexagon at this fraction of its box (`drawGoldFrame`). */
const PAD = 6;

type Point = readonly [number, number];

/** The transform as numbers, exactly as `drawGoldFrame` writes it. */
const map = (m: ReturnType<typeof goldLookMatrix>, p: Point): Point => [
  m.a * p[0] + m.c * p[1] + m.e,
  m.b * p[0] + m.d * p[1] + m.f,
];

/** Signed distance past a convex polygon's boundary, positive = outside (board units). */
const outside = (p: Point, poly: readonly Point[]): number => {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  const flip = area > 0 ? 1 : -1;
  let worst = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const nx = b[1] - a[1], ny = -(b[0] - a[0]);
    worst = Math.max(worst, (((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) / Math.hypot(nx, ny)) * flip);
  }
  return worst;
};

/** The frame's painted hexagon radius for one cell, in board units: `drawGoldFrame`'s own box. */
const paintedRadius = (key: string, cropW: number): number =>
  (goldFrameSize(cellScale(key)).width / 2) * (cropW / (cropW + PAD * 2));

/** Where one look's frame paints, in board units, as a polygon around the cell centre. */
const paintedOutline = (look: GoldLook, key: string, x: number, y: number, pointy: boolean): Point[] => {
  const crop = goldFrameCrop(new Map([[key, look]]), key);
  const cell = cornerPts(key, 30) as Point[];
  const fit = goldFrameFit(cell, x, y, paintedRadius(key, crop.w));
  const radius = paintedRadius(key, crop.w) * fit;
  const m = goldLookMatrix(look, x, y, pointy);
  const pts: Point[] = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    // the frame's own outline at this angle, not a circle: a hexagon ALREADY carries the art's
    // overhang, so this is exactly what the art can paint
    const r = radius * goldPaintedReach(a);
    pts.push(map(m, [x + r * Math.cos(a), y + r * Math.sin(a)]));
  }
  return pts;
};

/** The worst escape over all 24 looks, as a fraction of that cell's hex radius. */
const worstEscape = (pointy: boolean): { over: number; key: string; look: number } => {
  let over = -Infinity, worstKey = '', worstLook = -1;
  for (const key of OUTER) {
    const cell = cornerPts(key, 30) as Point[];
    const centre = cell.reduce((a, p) => [a[0] + p[0] / cell.length, a[1] + p[1] / cell.length] as Point, [0, 0] as Point);
    const radius = Math.max(...cell.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1])));
    for (let id = 0; id < GOLD_LOOK_COUNT; id++) {
      const look = goldLookOfId(id);
      for (const p of paintedOutline(look, key, centre[0], centre[1], pointy)) {
        const out = outside(p, cell) / radius;
        if (out > over) { over = out; worstKey = key; worstLook = id; }
      }
    }
  }
  return { over, key: worstKey, look: worstLook };
};

describe('a gold frame\'s paint, every look, every outer-ring cell', () => {
  it('stays inside the cell on the flat board the 0.4 product draws', () => {
    setBoardBulge(null);
    setOrient('flat');
    setRotation(0);
    const { over, key, look } = worstEscape(false);
    expect({ key, look }).toBeTruthy();
    expect(over, `${key} look ${look} paints ${(over * 100).toFixed(2)}% past its hex`).toBeLessThanOrEqual(1e-9);
  });

  it('stays inside the cell on the BENT board the 0.5 line (/test/) draws', () => {
    // The board the owner actually sees on /test/: every cell bent on the globe's curve
    // (`FEATURES.space`), which is where a frame sized to the MEAN of its six bent corners was a
    // shade too big and crossed the seam for most looks.
    setBoardBulge(KEYS);
    setOrient('flat');
    for (let rot = 0; rot < 6; rot++) {
      setRotation(rot);
      const { over, key, look } = worstEscape(false);
      expect(over, `board turn ${rot}: ${key} look ${look} paints ${(over * 100).toFixed(2)}% past its hex`).toBeLessThanOrEqual(1e-9);
    }
    setBoardBulge(null);
  });

  it('holds on a pointy board too, where the frame is turned -30 degrees onto the cell', () => {
    setBoardBulge(null);
    setOrient('pointy');
    setRotation(0);
    expect(worstEscape(true).over).toBeLessThanOrEqual(1e-9);
    setOrient('flat');
  });

  it('keeps the plain upright frame on the flat product board exactly as big as it was', () => {
    setBoardBulge(null);
    setOrient('flat');
    setRotation(0);
    // The fit may only ever TRIM: on the flat product board the frame already fits (its paint
    // reaches ~84% of the hex radius along an edge against the cell's 87%), so nothing shrinks.
    for (const key of OUTER) {
      const cell = cornerPts(key, 30) as Point[];
      const centre = cell.reduce((a, p) => [a[0] + p[0] / cell.length, a[1] + p[1] / cell.length] as Point, [0, 0] as Point);
      expect(goldFrameFit(cell, centre[0], centre[1], paintedRadius(key, 600))).toBe(1);
    }
  });
});
