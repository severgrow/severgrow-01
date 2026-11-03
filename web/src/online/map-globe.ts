// THE MAP LAID ON THE FRONT OF A SPHERE (owner brief, 2026-11-02), NOW CENTRED ON THE VIEW.
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
// THE CENTRE IS THE VIEW, NOT THE WORLD (owner, 2026-11-03). "position still jumps, map still isnt
// the same on main menu and in territory — we need a diffrent approach"; "so always the middle of
// the view - whats currently in the centre of the view is 'larger'". So the sphere is posed from
// the CAMERA's own world rectangle (`viewGlobePose`): its centre is the point under the middle of
// the screen, and its radius is the view's half-diagonal in world units. Because the radius is
// measured in WORLD units from the same box, zooming keeps the effect the same size on screen, and
// panning carries the fat middle of the globe with the finger. The menu and the Territory share one
// camera (the panel is a crop of the same canvas — see `world-view.ts`), so they necessarily share
// this pose too; there is no second calculation to disagree with.
//
// STRENGTH, 2026-11-03 (first pass). The owner chose 8% after seeing the whole ladder, knowing it is past the 10%
// edge-length bar (the old static pose's worst tile was 1.1499; the view-centred pose is measured in
// `web/tests/map-globe.test.ts`): rim tiles are knowingly compressed. `docs/DECISIONS.md` records it.
// The hexagon tests pin the HARD floor (1.20, the last rung before the tiles shear) instead of the
// product bar, and they still count what the product bar would reject, so the cost stays a number.

// THE CURVE, 2026-11-03 (owner: "I want a more expressive globe effect, ideally around 0.15 ... if
// necessary, improve the projection/falloff curve rather than allowing outer tiles to become ugly
// slivers"). The sphere's own curve (`sin`) concentrates its squeeze at the rim: its radial factor is
// `cos(theta)`, so at 15% the tiles near a corner of the panel were drawn at 46% of their area with a
// 1.42-1.65 edge ratio — slivers. The drawn radius is now `d * (1 - falloff * u^GLOBE_SHAPE)` with
// `u = d / radius`: the SAME rim (the corner is drawn exactly `falloff` smaller), but the squeeze
// spread from the middle outward, so the centre reads as gently enlarged and the rim as turning away
// without collapsing. Measured on a 390 x 844 phone over the tiles the panel shows: worst edge ratio
// 1.24-1.27 and smallest tile 53-55% at 15% (sine: 1.42-1.65, 34-46%). Radially a tile is still
// squeezed `1 + GLOBE_SHAPE` = 2.25 times as much as it narrows — the meridional "turning away" read.
// Past the point where the radial factor would fall below `MIN_RADIAL` the curve continues as a
// straight line of that slope, so ground grown absurdly far out recedes and never folds back.
//
export const X = Math.sqrt(3);
export const R = 10;

/** The lattice's own centre for a cell, in flat map units. */
export const flatCell = (q: number, r: number): { x: number; y: number } => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });

/**
 * HOW MUCH SMALLER THE RIM IS DRAWN THAN THE MIDDLE. 0.15 = 15%: at the view's corner a tile is 15%
 * narrower and, on the spread curve, 33.75% flatter along the radius (`1 - (1 + shape) * falloff`).
 * THE OWNER'S STRENGTH, 2026-11-03: "I want a more expressive globe effect, ideally around 0.15".
 * Chosen after rendering 0.12, 0.135 and 0.15 on the real page (all three pass the camera, fog and
 * seam proofs in `web/e2e/globe-camera.ts`); 0.15 is used on the spread curve because the sphere's own
 * curve at 0.15 turned the panel's outer tiles into slivers. Measured on the reference phone panel:
 * worst edge ratio 1.2406, no visible tile below half its flat area (`map-globe.test.ts`). The first
 * pass (8% on the sphere's curve) and its ladder are recorded in `docs/DECISIONS.md`.
 */
export const GLOBE_FALLOFF = 0.15;
/**
 * THE CURVE'S SHAPE: the exponent of the falloff, `k(u) = 1 - GLOBE_FALLOFF * u^GLOBE_SHAPE`. 2 is the
 * sphere's own shape to first order (all the squeeze at the rim); 1.25 spreads it inward, which is
 * what keeps 15% readable (see the header). 2026-11-03.
 */
export const GLOBE_SHAPE = 1.25;
/** The smallest radial factor the curve ever draws; beyond it the rim continues as a straight line. */
const MIN_RADIAL = 0.25;
/** The drawn size of the rim relative to the middle: the smallest a tile is ever drawn. */
export const GLOBE_RIM = 1 - GLOBE_FALLOFF;

export type GlobePose = Readonly<{
  cx: number;
  cy: number;
  /** Flat distance from the middle to the furthest CORNER of the warped area: where `falloff` applies. */
  radius: number;
  /** How much smaller the rim is drawn than the middle. */
  falloff: number;
  /** The curve's exponent (`GLOBE_SHAPE`). */
  shape: number;
  /** Where the curve hands over to its straight continuation, as a flat distance (`MIN_RADIAL`). */
  knee: number;
}>;

/** The flat distance at which the radial factor `1 - f(1+p)u^p` reaches `MIN_RADIAL`. */
const kneeFor = (radius: number, falloff: number, shape: number): number =>
  radius * Math.pow((1 - MIN_RADIAL) / (falloff * (1 + shape)), 1 / shape);

/** The pose for a centre and a rim radius, or null when there is nothing to bend. */
const poseAt = (cx: number, cy: number, radius: number, falloff: number, shape = GLOBE_SHAPE): GlobePose | null => {
  if (!(radius > 0) || !(falloff > 0) || !(shape > 0) || ![cx, cy].every(Number.isFinite)) return null;
  const f = Math.min(0.45, falloff);
  return { cx, cy, radius, falloff: f, shape, knee: kneeFor(radius, f, shape) };
};

/**
 * THE POSE OF THE VIEW ITSELF (owner, 2026-11-03). `box` is the camera in world units — the four
 * numbers of the SVG's viewBox, which the menu and the Territory share. The centre is the world
 * point under the middle of the view; the radius is the view's half-diagonal, so the corners of the
 * screen are exactly where `GLOBE_FALLOFF` applies and the fat middle is what the player is looking
 * at. The radius is derived from the box, so zooming in shrinks the sphere with the window and the
 * effect stays the same size on screen; panning carries it along.
 */
export const viewGlobePose = (
  box: readonly [number, number, number, number],
  falloff = GLOBE_FALLOFF,
): GlobePose | null => {
  const width = box[2];
  const height = box[3];
  if (!(width > 0) || !(height > 0) || !(falloff > 0)) return null;
  return poseAt(box[0] + width / 2, box[1] + height / 2, Math.hypot(width, height) / 2, falloff);
};

/** The static pose for a set of cells, kept for the projection tests and for any one-off question
 *  about the frozen world. The product no longer draws this: the view pose above does. */
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
  return poseAt(cx, cy, radius, falloff);
};

/** Two poses that would draw the same pixels (used to skip a pointless re-warp on a sub-pixel
 *  camera nudge). */
export const sameGlobePose = (a: GlobePose | null, b: GlobePose | null): boolean =>
  a === b || (!!a && !!b &&
    Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.cy - b.cy) < 1e-6 &&
    Math.abs(a.radius - b.radius) < 1e-6 && a.falloff === b.falloff && a.shape === b.shape);

/** Where a flat map point is DRAWN. The middle is untouched; the rim closes in and turns away. */
export const globePoint = (pose: GlobePose, x: number, y: number): { x: number; y: number } => {
  const dx = x - pose.cx, dy = y - pose.cy;
  const d = Math.hypot(dx, dy);
  if (!(d > 1e-9)) return { x: pose.cx, y: pose.cy };
  const k = drawnOver(d, pose) / d;
  return { x: pose.cx + dx * k, y: pose.cy + dy * k };
};

/**
 * The DRAWN radius for a flat radius: `d * (1 - falloff * (d/radius)^shape)` up to the knee, and past
 * it the straight line the curve is heading along there (slope `MIN_RADIAL`), so a cell grown
 * absurdly far out recedes instead of folding back over the map it came from.
 */
const drawnOver = (d: number, pose: GlobePose): number => {
  const curve = (x: number) => x * (1 - pose.falloff * Math.pow(x / pose.radius, pose.shape));
  if (d <= pose.knee) return curve(d);
  return curve(pose.knee) + (d - pose.knee) * MIN_RADIAL;
};

/**
 * The local size factor at a flat map point — the TANGENTIAL one, i.e. how much a mark on a tile
 * (the crossed swords) narrows with it. The radial factor is a little smaller still; a glyph is not
 * worth a second matrix, and `cos` would only make it hairline-thinner.
 */
export const globeScale = (pose: GlobePose, x: number, y: number): number => {
  const d = Math.hypot(x - pose.cx, y - pose.cy);
  if (!(d > 1e-9)) return 1;
  return drawnOver(d, pose) / d;
};

/**
 * ONE HEXAGON WITH ITS CORNERS BENT. Warping the shared CORNERS (not each tile about its own centre)
 * is what keeps neighbours touching exactly: two cells share a corner, so both draw that corner at
 * the same bent point and the shared edge cannot open a seam. The deviation from a regular hexagon
 * is second order in the arc; the tests measure the worst tile at the shipped strength and pin the
 * hard floor. It still closes on every neighbour exactly.
 */
export const globeHex = (pose: GlobePose | null, x: number, y: number): string => {
  const points = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]] as const;
  return points.map(([dx, dy], index) => {
    const px = x + dx * R, py = y + dy * R;
    const at = pose ? globePoint(pose, px, py) : { x: px, y: py };
    return `${index ? 'L' : 'M'}${at.x.toFixed(2)},${at.y.toFixed(2)}`;
  }).join(' ') + 'Z';
};

/**
 * CAN A CELL BE SEEN FROM HERE? The honest test for the live warp, which may only spend a frame on
 * ground the eye can actually reach. It is the DRAWN centre that decides: the bend pulls every cell
 * toward the middle of the view, so a cell whose flat centre is outside the box can still be drawn
 * inside it (and a flat test would drop it, leaving it un-posed while it is on screen). `pad` is the
 * cell's own reach — `R` for a hexagon, plus the hairline of its stroke — so a tile that merely
 * touches the edge is included. Off-screen ground is not lost: the frame that brings it in includes
 * it, and the settle after the gesture re-poses the whole margin.
 */
export const drawnInView = (
  pose: GlobePose | null,
  box: readonly [number, number, number, number],
  x: number,
  y: number,
  pad = 0,
): boolean => {
  const at = pose ? globePoint(pose, x, y) : { x, y };
  return at.x >= box[0] - pad && at.x <= box[0] + box[2] + pad &&
    at.y >= box[1] - pad && at.y <= box[1] + box[3] + pad;
};

/**
 * THE TILE UNDER A POINT: the nearest DRAWN centre. The hit test and the paint must use the same
 * pose — the menu and the Territory do, and a tap uses the pose the geometry standing under it was
 * drawn with. `pose === null` is the flat map.
 */
export const nearestCell = <T extends { readonly id: string; readonly q: number; readonly r: number }>(
  cells: readonly T[],
  pose: GlobePose | null,
  x: number,
  y: number,
): T | null => {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const flat = flatCell(cell.q, cell.r);
    const at = pose ? globePoint(pose, flat.x, flat.y) : flat;
    const distance = (at.x - x) ** 2 + (at.y - y) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = cell; }
  }
  return best;
};
