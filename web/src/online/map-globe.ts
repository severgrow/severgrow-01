// THE MAP ON A LIT SPHERE (experiment, owner brief 2026-11-02: "a slight fish eye effect on
// territory, making the territory look a bit more like a big island on a globe ... nothing crazy").
//
// TWO HALVES OF ONE READ, both from the map's own geometry:
//
//  1. THE CURVE (`globePoint`). The flat map is an arc of a sphere seen from above: a point at
//     distance `d` from the middle lies at arc angle `d / sphere` and is drawn `sphere·sin(θ)`
//     from the middle. The middle is lifted, the rim foreshortens, and — because every hexagon's
//     CORNERS go through the same map — two neighbours share both endpoints of their edge, so no
//     seam can open. The silhouette is normalised to the size it has today, so the middle grows
//     rather than the island shrinking.
//
//  2. THE LIGHT (`globeShade`). A warm bloom behind the middle and a fall-off toward the rim,
//     painted in WORLD units (`gradientUnits="userSpaceOnUse"`) so the menu's full-bleed backdrop
//     and the Territory panel's crop are the same light on the same land.
//
// ONE POSE, FROM THE WORLD ALONE. Nothing here reads a window, a camera or a clock: the menu and the
// Territory inherit identical pixels, which is what keeps the owner's 0.000px anchor.
//
// COST: corners are recomputed once per paint (183 tiles), and the light is two static rectangles.
// No filter, no animation, no per-frame work.
import { cellXY } from './world-growth.js';

type Cell = { id: string; q: number; r: number };

const NS = 'http://www.w3.org/2000/svg';
const R = 10;

/**
 * HOW FAR THE MAP'S EDGE TILTS AWAY, in radians. 0.72 rad ≈ 41°: the middle is drawn ~7% larger
 * than today, the silhouette keeps exactly the size it has now, and the outer row foreshortens
 * along the radius (the far side of a globe). 0 is a flat map. This is the one number to turn.
 */
export const GLOBE_ARC = 0.72;
/** The cross-radius shrink at the arc's end; dividing by it keeps the map's OUTLINE the same size. */
const RIM_SCALE = Math.sin(GLOBE_ARC) / GLOBE_ARC;

/** The map's middle and the sphere it is bent onto, in map units. */
export type GlobePose = Readonly<{ cx: number; cy: number; radius: number; sphere: number }>;

export const globePose = (cells: readonly Cell[]): GlobePose | null => {
  if (!cells.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const p = cellXY(cell.q, cell.r);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // The rim means the outer CORNER of the last tile, not only its centre: a hex reaches 10 units
  // further out, and that point is what must land on `GLOBE_ARC`.
  let radius = 0;
  for (const cell of cells) {
    const p = cellXY(cell.q, cell.r);
    radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
  }
  radius += R;
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

/** The local cross-radius size factor, for marks that sit on a tile. */
export const globeScale = (pose: GlobePose, x: number, y: number): number => {
  const d = Math.hypot(x - pose.cx, y - pose.cy);
  if (!(d > 1e-9)) return 1;
  const theta = d / pose.sphere;
  return Math.sin(theta) / theta / RIM_SCALE;
};

// ---- THE LIGHT ---------------------------------------------------------------------------------
const HIGHLIGHT = 0.085;
const RIM_DARK = 0.38;
const RIM_START = 0.58;

const stop = (parent: SVGElement, offset: number, colour: string, opacity: number) => {
  const node = document.createElementNS(NS, 'stop');
  node.setAttribute('offset', String(offset));
  node.setAttribute('stop-color', colour);
  node.setAttribute('stop-opacity', String(opacity));
  parent.append(node);
};

const radial = (id: string, cx: number, cy: number, r: number) => {
  const g = document.createElementNS(NS, 'radialGradient');
  g.setAttribute('id', id);
  g.setAttribute('gradientUnits', 'userSpaceOnUse');
  g.setAttribute('cx', String(cx)); g.setAttribute('cy', String(cy)); g.setAttribute('r', String(r));
  return g;
};

/**
 * THE GLOBE'S LIGHT: a warm bloom behind the middle and a fall-off toward the rim. `box` is the
 * map's navigable box, so the vignette covers every point the camera can show. Pointer-transparent:
 * this is paint, not a control.
 */
export const globeShade = (pose: GlobePose, box: readonly [number, number, number, number]): SVGGElement => {
  const group = document.createElementNS(NS, 'g');
  group.classList.add('world-globe-shade');
  group.setAttribute('aria-hidden', 'true');
  group.setAttribute('pointer-events', 'none');
  const defs = document.createElementNS(NS, 'defs');
  const lx = pose.cx - pose.radius * 0.10, ly = pose.cy - pose.radius * 0.14;
  const light = radial('world-globe-light', lx, ly, pose.radius * 0.72);
  stop(light, 0, '#fff7e2', HIGHLIGHT);
  stop(light, 0.55, '#fff7e2', HIGHLIGHT * 0.32);
  stop(light, 1, '#fff7e2', 0);
  defs.append(light);
  const rim = radial('world-globe-rim', pose.cx, pose.cy, pose.radius * 1.02);
  stop(rim, 0, '#040605', 0);
  stop(rim, RIM_START, '#040605', 0);
  stop(rim, 0.82, '#040605', RIM_DARK * 0.45);
  stop(rim, 1, '#040605', RIM_DARK);
  defs.append(rim);
  group.append(defs);
  const cover = (fill: string) => {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(box[0])); rect.setAttribute('y', String(box[1]));
    rect.setAttribute('width', String(box[2])); rect.setAttribute('height', String(box[3]));
    rect.setAttribute('fill', fill);
    rect.setAttribute('pointer-events', 'none');
    group.append(rect);
  };
  cover('url(#world-globe-rim)');
  cover('url(#world-globe-light)');
  return group;
};
