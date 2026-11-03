// THE MAP LAID ON THE FRONT OF A SPHERE (owner brief, 2026-11-02).
//
// "more like inspired by geometry in picture attached, but obvs not that strong at all": a wireframe
// globe, where the laths bow and converge toward the rim. So the LATTICE ITSELF bends — no ring, no
// vignette, no extra line anywhere. The tiles are the only lines there are, and they curve.
//
// THE PROJECTION, and why it is the honest one. Put the flat lattice on a sphere of radius `sphere`
// and look at it straight down the axis: a point at flat distance `d` from the middle lies at arc
// angle `theta = d / sphere`, and is DRAWN at `sphere * sin(theta)` from the middle. Every straight
// line in the plane becomes an arc on the sphere, which is the bow the reference shows.
//
// WHAT THAT DOES TO A HEX, and why it is not "each tile just shrinking". The drawn map is
// `p -> k(d) * p` with `k(d) = sphere * sin(d/sphere) / d`. Its Jacobian is NOT a scalar:
//
//     across the radius:  cos(theta)        (the row closes up: 1 - theta^2/2)
//     along the rim:      sin(theta)/theta  (the row narrows:   1 - theta^2/6)
//
// so a tile near the rim is squashed RADIALLY about three times as much as it narrows tangentially.
// That is the "tilt/compress like a meridional grid" read: the lattice rows bow and the cells turn
// their faces away, instead of the whole board shrinking uniformly. `GLOBE_FALLOFF` is the one knob,
// and it means exactly one thing: the rim is drawn this much smaller than the middle.
//
// STATIC, AND IDENTICAL ON BOTH SURFACES. The pose comes from the FROZEN world table alone — never
// from the camera, the window, the seen cells or a clock — so the menu backdrop and the Territory
// panel bend the same tiles into the same pixels (`anchoredView` then measures 0.000px as before).
// It also means the bend cannot drift when the map grows: newly uncovered land outside the frozen
// rim simply sits a little further round the sphere. The numbers are computed once, per paint at
// most, never per frame.
import { WORLD_CELLS } from '../../../server/src/world.js';

const R = 10;
const X = Math.sqrt(3);
/** The lattice's own centre for a cell, in flat map units. Exactly `coords` in `world-view`. */
export const flatCell = (q: number, r: number): { x: number; y: number } => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });

/**
 * HOW MUCH SMALLER THE RIM IS DRAWN THAN THE MIDDLE. 0.05 = 5%: at the coast a tile is 5% narrower
 * and 15% flatter along the radius (see the Jacobian above). This is the MODERATE rung of the ladder —
 * the strongest bend that still keeps a tile inside the hexagon bar in `map-globe.test.ts` (no edge
 * more than 10% away from the tile's longest). 0.08 is past that bar; it is kept as a screenshot
 * only. 0 is a flat map.
 *
 * THE LADDER, all off this one number: 0.03 (barely there), 0.04 (the recommended one, on
 * `globe-subtle`), 0.05 (this, the ceiling), 0.08 (too strong — the tiles stop reading as hexes).
 */
export const GLOBE_FALLOFF = 0.05;
/** The drawn size of the rim relative to the middle: the smallest a tile is ever drawn. */
export const GLOBE_RIM = 1 - GLOBE_FALLOFF;

/** Past this arc the sphere would start to fold back on itself. Never reached by the real map; a
 *  guard so a cell grown absurdly far out is drawn receding, never inverted. */
const MAX_ARC = 1.4;

export type GlobePose = Readonly<{
  cx: number;
  cy: number;
  /** Flat distance from the middle to the furthest CORNER of the map. */
  radius: number;
  /** The sphere the lattice is bent onto. */
  sphere: number;
  /** The arc the rim subtends, in radians. */
  arc: number;
}>;

/** `theta` for which `sin(theta)/theta = 1 - falloff`. Newton from the series' leading term. */
export const arcFor = (falloff: number): number => {
  const target = 1 - Math.min(0.45, Math.max(0, falloff));
  let theta = Math.sqrt(6 * (1 - target));
  for (let i = 0; i < 24; i++) {
    const f = Math.sin(theta) / theta - target;
    const slope = (theta * Math.cos(theta) - Math.sin(theta)) / (theta * theta);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
    const next = theta - f / slope;
    if (!Number.isFinite(next) || next <= 0) break;
    if (Math.abs(next - theta) < 1e-12) { theta = next; break; }
    theta = next;
  }
  return theta;
};

/** The pose for a set of cells: their bounding-box middle, and the sphere that bends the rim by `falloff`. */
export const globePose = (cells: readonly { q: number; r: number }[], falloff = GLOBE_FALLOFF): GlobePose | null => {
  if (!cells.length || !(falloff > 0)) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const at = flatCell(cell.q, cell.r);
    minX = Math.min(minX, at.x); maxX = Math.max(maxX, at.x);
    minY = Math.min(minY, at.y); maxY = Math.max(maxY, at.y);
  }
  if (!(minX <= maxX) || !(minY <= maxY)) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // The rim means the outer CORNER of the last tile, not only its centre: a hex reaches R further.
  let radius = 0;
  for (const cell of cells) {
    const at = flatCell(cell.q, cell.r);
    radius = Math.max(radius, Math.hypot(at.x - cx, at.y - cy));
  }
  radius += R;
  if (!(radius > 0)) return null;
  const arc = arcFor(falloff);
  if (!(arc > 0)) return null;
  return { cx, cy, radius, sphere: radius / arc, arc };
};

/** Where a flat map point is DRAWN. The middle is untouched; the rim closes in and turns away. */
export const globePoint = (pose: GlobePose, x: number, y: number): { x: number; y: number } => {
  const dx = x - pose.cx, dy = y - pose.cy;
  const d = Math.hypot(dx, dy);
  if (!(d > 1e-9)) return { x: pose.cx, y: pose.cy };
  const k = drawnOver(d, pose.sphere) / d;
  return { x: pose.cx + dx * k, y: pose.cy + dy * k };
};

/**
 * The DRAWN radius for a flat radius. `sphere * sin(d / sphere)` up to `MAX_ARC`; past it (never
 * reached by the real map) the tangent is continued, so a cell grown absurdly far out recedes
 * instead of folding back over the map it came from.
 */
const drawnOver = (d: number, sphere: number): number => {
  const limit = MAX_ARC * sphere;
  if (d <= limit) return sphere * Math.sin(d / sphere);
  return sphere * Math.sin(MAX_ARC) + (d - limit) * Math.cos(MAX_ARC);
};

/**
 * The local size factor at a flat map point — the TANGENTIAL one, i.e. how much a mark on a tile
 * (the crossed swords) narrows with it. The radial factor is a little smaller still; a glyph is not
 * worth a second matrix, and `cos` would only make it hairline-thinner.
 */
export const globeScale = (pose: GlobePose, x: number, y: number): number => {
  const d = Math.hypot(x - pose.cx, y - pose.cy);
  if (!(d > 1e-9)) return 1;
  return drawnOver(d, pose.sphere) / d;
};

/** The sphere the FROZEN world is bent onto. One pose for every surface, for the whole session. */
export const worldGlobe = (falloff = GLOBE_FALLOFF): GlobePose | null => globePose(WORLD_CELLS, falloff);

const POSE = worldGlobe();

/** A flat map point in drawing coordinates. */
export const mapPoint = (x: number, y: number): { x: number; y: number } => (POSE ? globePoint(POSE, x, y) : { x, y });
/** A cell's centre in drawing coordinates. */
export const mapCell = (q: number, r: number): { x: number; y: number } => {
  const at = flatCell(q, r);
  return mapPoint(at.x, at.y);
};
/** A mark's scale on its tile. */
export const mapScale = (x: number, y: number): number => (POSE ? globeScale(POSE, x, y) : 1);
/**
 * ONE HEXAGON WITH ITS CORNERS BENT. Warping the shared CORNERS (not each tile about its own centre)
 * is what keeps neighbours touching exactly: two cells share a corner, so both draw that corner at
 * the same bent point and the shared edge cannot open a seam. The deviation from a regular hexagon
 * is second order in the arc — under 0.05 map units at 4%, a third of a pixel at 46px cells — so a
 * tile still reads as the same hexagon everywhere.
 */
export const mapHex = (x: number, y: number): string => {
  const points = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]] as const;
  return points.map(([dx, dy], index) => {
    const at = mapPoint(x + dx * R, y + dy * R);
    return `${index ? 'L' : 'M'}${at.x.toFixed(2)},${at.y.toFixed(2)}`;
  }).join(' ') + 'Z';
};
