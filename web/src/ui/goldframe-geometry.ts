// THE GOLD FRAME'S BOX, in board units: pure numbers only, so the live board, the replay's canvas
// painter and the browser suites can share them without loading a picture.
import { S, SQ3 } from './geom.js';

/**
 * THE FRAME SITS INSIDE ITS HEX (owner, 2026-11-14: "gold frames and rock tiles are too big, they
 * should be a bit smaller a bit more contained in their hex"). The supplied frame's outer edge is
 * exactly the hex box, so the metal reads as a rim over the seams; the board's physical pieces
 * (rocks) already carry the same 5% trim. Centred, so the frame stays symmetric on every side.
 */
export const GOLD_FRAME_SCALE = 0.95;

/**
 * The frame's box around its hex centre (2.02S by 1.01√3S, trimmed and kept centred).
 *
 * `cellScale` is the cell's own scale on a bent board (`BOARD_BULGE`, ui/geom.ts): an outer hex is
 * drawn smaller than S, so per-cell art is drawn through `cellScale(key)`. The rim was the one piece
 * that did not, so on a bent board its outer edge sat outside the hex it belongs to — where the cell
 * in front of it, drawn later, sliced that overhang away and left a bright arc that started, ran
 * along part of the hex and stopped. On the flat product board this scale is exactly 1, so nothing
 * moves there.
 */
export const goldFrameSize = (cellScale = 1) => ({
  width: S * 2.02 * GOLD_FRAME_SCALE * cellScale,
  height: S * SQ3 * 1.01 * GOLD_FRAME_SCALE * cellScale,
});

/**
 * HOW FAR THE SUPPLIED FRAME'S PAINT REACHES past its own atlas hexagon, as a factor of it.
 *
 * Both designs are hand painted onto a hexagon, so their outer edge is not a clean hexagon: read off
 * the atlas alpha channel (1-degree bins, alpha > 8/255) the outermost pixel is 1.0004 of the
 * hexagon radius at a vertex, while a bevelled edge bulges up to 5.9 px past the flat side of a
 * 300 px hexagon (2.3% of its apothem). The ruler below is the hexagon itself, not a circle, so
 * this one factor covers both: a hexagon grown by it contains every painted pixel of both designs,
 * at every turn and mirror.
 */
export const GOLD_ART_REACH = 1.025;

/** A regular hexagon's distance from its centre at the angle `a`, for circumradius 1 (1 at a
 *  vertex, cos 30 at an edge's middle). The frame's art is a flat-top hexagon, and every look is a
 *  turn in steps of 60 degrees or a reflection, which maps it onto itself. */
const hexReach = (a: number): number => {
  const step = Math.PI / 3;
  const off = Math.abs((((a % step) + step) % step) - step / 2);
  return Math.cos(step / 2) / Math.cos(off);
};

/**
 * The frame's painted outline as a radius at the angle `a`, in units of its hexagon radius: the
 * atlas hexagon, grown by the art's measured overhang. This is the ruler `goldFrameFit` holds inside
 * the cell, and the guard test walks the same outline.
 */
export const goldPaintedReach = (a: number): number => hexReach(a) * GOLD_ART_REACH;

/** How far a ray from (cx, cy) along the unit vector (ux, uy) travels before leaving the cell. */
const rayHit = (
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  cell: readonly (readonly [number, number])[],
): number => {
  let best = Infinity;
  for (let i = 0; i < cell.length; i++) {
    const a = cell[i]!, b = cell[(i + 1) % cell.length]!;
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - cx, wy = a[1] - cy;
    const t = (wx * ey - wy * ex) / den;
    const s = (wx * uy - wy * ux) / den;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
};

/**
 * THE LARGEST FACTOR (≤ 1) THAT KEEPS A FRAME'S PAINT INSIDE ITS OWN CELL — for every one of the
 * 24 looks.
 *
 * `cell` is the hexagon the BOARD draws for that cell (`cornerPts(key, S)`, ui/geom.ts), and
 * `painted` the frame's painted hexagon radius (`goldFrameSize`'s half-width, less the atlas crop's
 * padding). The ruler is a ray cast from the cell's centre: a look can only turn or mirror the
 * frame about THAT point (ui/goldframes.ts `goldLookMatrix`), and neither moves a point of it to
 * another distance, so the smallest cell boundary over the frame's whole outline is what it has to
 * fit; because the outline is a hexagon and every look maps a hexagon onto itself, fitting it once
 * fits all 24.
 *
 * Without this the frame is sized by `cellScale`, the MEAN of the cell's six corners. That is right
 * for the flat product board — there the six are equal and the fit returns exactly 1, so nothing
 * moves — but the 0.5 line (FEATURES.space) bends every cell on the globe's curve, which moves a
 * cell's corners by up to two degrees and two per cent. Measured on that board (Chromium and
 * WebKit agree) the art's outer bevel crossed its own seam for 12 of the 24 looks, worst 0.40% of
 * the hex radius, so those frames were painted over the seam — and every frame on the board's outer
 * ring was therefore painted over the board's edge. The fit is the size half of the answer;
 * `drawGoldFrame`'s clip-path is the guarantee. Both hold for EVERY bonus hex (owner, 2026-11-16),
 * on the rim and inside the board alike.
 */
export const goldFrameFit = (
  cell: readonly (readonly [number, number])[],
  cx: number,
  cy: number,
  painted: number,
): number => {
  const reach = painted * GOLD_ART_REACH;
  if (!(reach > 0) || cell.length < 3) return 1;
  let fit = 1;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const hit = rayHit(cx, cy, Math.cos(a), Math.sin(a), cell);
    if (!Number.isFinite(hit)) continue;
    fit = Math.min(fit, hit / (reach * hexReach(a)));
  }
  return Math.max(0, Math.min(1, fit));
};
