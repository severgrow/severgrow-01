// THE MAP LIT LIKE A GLOBE (experiment, owner brief 2026-11-02: "a slight fish eye effect on
// territory, making the territory look a bit more like a big island on a globe ... nothing crazy").
//
// NO GEOMETRY MOVES. The tiles stay exactly where they are, so adjacency cannot lie, text cannot
// tilt, and there is nothing that can open a seam. The globe is painted instead: a warm light sits
// behind the middle of the map and the rim falls away into the sea, which is the same cue a sphere
// gives — the eye reads the lit middle as closer and the dark edge as turning away.
//
// WORLD UNITS, NOT SCREEN PERCENTAGES. The gradient is anchored to the map's own middle and radius
// (`gradientUnits="userSpaceOnUse"`), so the menu's full-bleed backdrop and the Territory panel's
// crop are the SAME light on the same land — the owner's "both should always exactly match". A
// gradient sized to the element would move with the window instead.
//
// COST: one `<defs>` and two rectangles, painted once with the map. No filter, no animation, no
// per-frame work, nothing to re-rasterise on the menu's opacity beat.
type Cell = { id: string; q: number; r: number };

const NS = 'http://www.w3.org/2000/svg';
const R = 10;
const X = Math.sqrt(3);
const at = (q: number, r: number) => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });

/** The map's middle and the radius that reaches its outer CORNER, in map units. */
export type GlobePose = Readonly<{ cx: number; cy: number; radius: number }>;

export const globePose = (cells: readonly Cell[]): GlobePose | null => {
  if (!cells.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const p = at(cell.q, cell.r);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let radius = 0;
  for (const cell of cells) {
    const p = at(cell.q, cell.r);
    radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
  }
  radius += R;
  return radius > 0 ? { cx, cy, radius } : null;
};

/** The light's strength. The middle gains a little warmth; the rim loses more. */
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
 * THE GLOBE'S LIGHT, as one group: a warm bloom behind the middle and a fall-off toward the rim.
 * `box` is the map's navigable box, so the vignette covers every point the camera can show.
 * The group is pointer-transparent: it is paint, not a control.
 */
export const globeShade = (pose: GlobePose, box: readonly [number, number, number, number]): SVGGElement => {
  const group = document.createElementNS(NS, 'g');
  group.classList.add('world-globe-shade');
  group.setAttribute('aria-hidden', 'true');
  group.setAttribute('pointer-events', 'none');
  const defs = document.createElementNS(NS, 'defs');
  // A. THE LIGHT: slightly up and left of the middle, the direction every tile is already lit from.
  const lx = pose.cx - pose.radius * 0.10, ly = pose.cy - pose.radius * 0.14;
  const light = radial('world-globe-light', lx, ly, pose.radius * 0.72);
  stop(light, 0, '#fff7e2', HIGHLIGHT);
  stop(light, 0.55, '#fff7e2', HIGHLIGHT * 0.32);
  stop(light, 1, '#fff7e2', 0);
  defs.append(light);
  // B. THE TURN: the rim loses light toward the sea's own dark, so the island sits in a sphere
  //    rather than on a sheet.
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
    return rect;
  };
  cover('url(#world-globe-rim)');
  cover('url(#world-globe-light)');
  return group;
};
