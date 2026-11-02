// THE MAP ON A SPHERE (experiment, owner brief 2026-11-02: "a slight fish eye effect on territory,
// making the territory look a bit more like a big island on a globe ... nothing crazy").
//
// ONE pose, computed from the WORLD's own geometry, so both surfaces are the same picture: the menu
// backdrop and the Territory panel already draw the same SVG through `anchoredView`, and this warp
// is a property of the map's coordinates, not of the window. Nothing here reads a screen, a clock or
// a camera; it is pure numbers, and it is applied ONCE per paint (never per frame).
//
// WHAT THE NUMBERS DO. The flat map is treated as an arc of a sphere seen from directly above: a
// point at map-distance `d` from the middle lies at arc angle `d / sphere`, so it is drawn at
// `sphere · sin(d / sphere)` from the middle. That is the orthographic foreshortening a real globe
// has — tiles near the rim are a little smaller, and slightly flattened along the radius, while the
// middle keeps its true size. `GLOBE_ARC` is the whole effect: 0 is a flat map.
import { cellXY } from './world-growth.js';

type Cell = { id: string; q: number; r: number };

/**
 * HOW FAR THE MAP'S EDGE TILTS AWAY, in radians. 0.72 rad ≈ 41°: the middle is drawn ~7% larger than
 * today, the silhouette keeps exactly the size it has now, and the outer row is foreshortened along
 * the radius (the far side of a globe). 0 is a flat map. This is the one number to turn.
 */
export const GLOBE_ARC = 0.72;
/** The cross-radius shrink at the arc's end; dividing by it keeps the map's OUTLINE the same size,
 *  so the effect lifts the middle instead of shrinking the island. */
const RIM_SCALE = Math.sin(GLOBE_ARC) / GLOBE_ARC;

/** The map's middle and the sphere it is bent onto, in map units. */
export type GlobePose = Readonly<{ cx: number; cy: number; radius: number; sphere: number }>;

/** The map's own bounding box and its furthest tile, so the pose is identical on every surface. */
export const globePose = (cells: readonly Cell[]): GlobePose | null => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const at = cellXY(cell.q, cell.r);
    minX = Math.min(minX, at.x); maxX = Math.max(maxX, at.x);
    minY = Math.min(minY, at.y); maxY = Math.max(maxY, at.y);
  }
  if (!(minX <= maxX) || !(minY <= maxY)) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // The rim means the outer CORNER of the last tile, not only its centre: a hex reaches 10 units
  // further out, and that point is what must land on `GLOBE_ARC`.
  let radius = 0;
  for (const cell of cells) {
    const at = cellXY(cell.q, cell.r);
    radius = Math.max(radius, Math.hypot(at.x - cx, at.y - cy));
  }
  radius += 10;
  if (!(radius > 0) || !(GLOBE_ARC > 0)) return null;
  return { cx, cy, radius, sphere: radius / GLOBE_ARC };
};

/** Where a map point is DRAWN. A point at the middle is untouched; the rim moves inward. */
export const globePoint = (pose: GlobePose, x: number, y: number): { x: number; y: number } => {
  const dx = x - pose.cx, dy = y - pose.cy;
  const d = Math.hypot(dx, dy);
  if (!(d > 1e-9)) return { x: pose.cx, y: pose.cy };
  const theta = d / pose.sphere;
  const k = pose.sphere * Math.sin(theta) / d / RIM_SCALE;
  return { x: pose.cx + dx * k, y: pose.cy + dy * k };
};

/**
 * The local size factor at a map point — how much a shape there shrinks ACROSS the radius. Marks
 * that live on a tile (swords, labels) can use it to shrink with their tile; the geometry itself
 * does not need it, because `globePoint` is applied to real corner points.
 */
export const globeScale = (pose: GlobePose, x: number, y: number): number => {
  const d = Math.hypot(x - pose.cx, y - pose.cy);
  if (!(d > 1e-9)) return 1;
  const theta = d / pose.sphere;
  return Math.sin(theta) / theta / RIM_SCALE;
};
