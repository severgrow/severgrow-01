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
// STRENGTH, 2026-11-03. The owner chose 8% after seeing the whole ladder, knowing it is past the 10%
// edge-length bar (the old static pose's worst tile was 1.1499; the view-centred pose is measured in
// `web/tests/map-globe.test.ts`): rim tiles are knowingly compressed. `docs/DECISIONS.md` records it.
// The hexagon tests pin the HARD floor (1.20, the last rung before the tiles shear) instead of the
// product bar, and they still count what the product bar would reject, so the cost stays a number.

export const X = Math.sqrt(3);
export const R = 10;

/** The lattice's own centre for a cell, in flat map units. */
export const flatCell = (q: number, r: number): { x: number; y: number } => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });

/**
 * HOW MUCH SMALLER THE RIM IS DRAWN THAN THE MIDDLE. 0.08 = 8%: at the rim a tile is 8% narrower
 * and 23.6% flatter along the radius (`cos(theta) = 0.764`; see the Jacobian above). THIS IS THE
 * OWNER'S CHOSEN STRENGTH, set 2026-11-03 after he was shown the whole ladder and told plainly what
 * 8% costs: at the OLD static pose it was past the 10% edge-length bar in `map-globe.test.ts`, so
 * the rim tiles read as visibly compressed rather than as regular hexagons. He accepted that trade
 * knowingly, over the recommended 0.04/0.05, because the bend must be visible. Recorded in
 * `docs/DECISIONS.md`.
 *
 * THE LADDER, all off this one number: 0.03 (barely there), 0.04 (the recommended rung, on
 * `globe-subtle`), 0.05 (MODERATE — the strongest that stayed inside the hexagon bar on the old
 * pose), 0.08 (THIS, the owner's choice), 0.12 and up (rejected — the tiles shear). 0 is flat.
 */
export const GLOBE_FALLOFF = 0.08;
/** The drawn size of the rim relative to the middle: the smallest a tile is ever drawn. */
export const GLOBE_RIM = 1 - GLOBE_FALLOFF;

/** Past this arc the sphere would start to fold back on itself. Never reached by the real map; a
 *  guard so a cell grown absurdly far out is drawn receding, never inverted. */
const MAX_ARC = 1.4;

export type GlobePose = Readonly<{
  cx: number;
  cy: number;
  /** Flat distance from the middle to the furthest CORNER of the warped area. */
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
  const arc = arcFor(falloff);
  if (!(arc > 0)) return null;
  const radius = Math.hypot(width, height) / 2;
  if (!(radius > 0)) return null;
  return { cx: box[0] + width / 2, cy: box[1] + height / 2, radius, sphere: radius / arc, arc };
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
  if (!(radius > 0)) return null;
  const arc = arcFor(falloff);
  if (!(arc > 0)) return null;
  return { cx, cy, radius, sphere: radius / arc, arc };
};

/** Two poses that would draw the same pixels (used to skip a pointless re-warp on a sub-pixel
 *  camera nudge). */
export const sameGlobePose = (a: GlobePose | null, b: GlobePose | null): boolean =>
  a === b || (!!a && !!b &&
    Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.cy - b.cy) < 1e-6 &&
    Math.abs(a.sphere - b.sphere) < 1e-6 && Math.abs(a.arc - b.arc) < 1e-12);

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
