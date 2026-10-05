// The skinned network: ONE continuous mathematical path per linked pair (never two half-pieces
// meeting at an edge), drawn by code so it is sharp at any size, then skinned with the skin's
// network look: layered strokes (shadow, outline, body, highlight / hot core, glow) and, when the
// skin has one, a strip texture laid along the path. Detail follows the tile size (LOD).
import { el } from '../geom.js';
import type { NetworkLook } from './types.js';

export type Pt = { x: number; y: number };
export type Width = 'thin' | 'normal' | 'heavy';

/** Board units from a tile centre to where a link starts: just outside the number plate. */
const PLATE = { dy: -1.8, r: 10.6 };

/** How far along the ray from a tile centre (direction u) the link leaves the number plate. */
export const exitDistance = (u: Pt) => {
  // |t*u - (0, dy)| = r  ->  t^2 - 2 t (u.y * dy) + dy^2 - r^2 = 0
  const b = u.y * PLATE.dy;
  return b + Math.sqrt(b * b - (PLATE.dy * PLATE.dy - PLATE.r * PLATE.r));
};

/** The path for one linked pair: straight, from A's plate edge to B's, through the shared edge's midpoint. */
export const linkPath = (A: Pt, B: Pt) => {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  const ta = exitDistance(u);
  const tb = exitDistance({ x: -u.x, y: -u.y });
  const start = { x: A.x + u.x * ta, y: A.y + u.y * ta };
  const end = { x: B.x - u.x * tb, y: B.y - u.y * tb };
  const d = `M${start.x.toFixed(2)},${start.y.toFixed(2)}L${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  return { d, start, end, angle: (Math.atan2(u.y, u.x) * 180) / Math.PI, length: Math.hypot(end.x - start.x, end.y - start.y) };
};

/** A link's width class from how many tiles reach home through it (the same for both ends). */
export const widthFor = (load: number): Width => (load >= 6 ? 'heavy' : load >= 2 ? 'normal' : 'thin');

export type LinkOpts = {
  look: NetworkLook;
  width: Width;
  /** rendered tile size, CSS px (LOD) */
  tilePx: number;
  /** a strip image url for this tier (null: strokes only), with its pixel size */
  strip: { url: string; w: number; h: number } | null;
  motion: boolean;
  grow: boolean;
  loose: boolean;
  fragile: boolean;
  id: string;
  defs: SVGDefsElement;
};

/** Draws one link into `g`; returns the elements (for the sever animation). */
export const drawLink = (g: SVGGElement, p: ReturnType<typeof linkPath>, o: LinkOpts): SVGElement[] => {
  const L = o.look;
  const w = L.widths[o.width];
  const out: SVGElement[] = [];
  const cls = `skin-link${o.grow ? ' grow-in' : ''}${o.loose ? ' loose' : ''}${o.fragile ? ' fragile' : ''}`;
  const stroke = (color: string | undefined, width: number, extra: Record<string, string | number> = {}) => {
    if (!color) return null;
    const e = el('path', { d: p.d, pathLength: 1, class: cls, stroke: color, 'stroke-width': width.toFixed(2), fill: 'none', 'stroke-linecap': 'round', ...extra }, g);
    out.push(e);
    return e;
  };
  const lod = o.tilePx;
  // under everything: a soft glow (only big tiles), then a short down-right shadow (light from the top left)
  if (L.glow && lod >= 80 && !o.loose) stroke(L.glow, w + 3, { 'stroke-opacity': 0.2 });
  if (L.shadow && lod >= 40) stroke(L.shadow, w + 1.2, { 'stroke-opacity': 0.45, transform: 'translate(0.6,0.8)' });
  stroke(L.outline, w + 1.5);
  stroke(L.body, w);
  if (o.strip && !o.loose) {
    // the strip laid along the path: its length runs with the link, its height fills the body
    const pid = `${o.id}-strip`;
    const tw = (o.strip.w / o.strip.h) * w;
    const pat = el('pattern', { id: pid, patternUnits: 'userSpaceOnUse', width: tw.toFixed(3), height: w.toFixed(3), patternTransform: `translate(${p.start.x.toFixed(2)},${p.start.y.toFixed(2)}) rotate(${p.angle.toFixed(2)}) translate(0,${(-w / 2).toFixed(3)})` }, o.defs);
    el('image', { href: o.strip.url, x: 0, y: 0, width: tw.toFixed(3), height: w.toFixed(3), preserveAspectRatio: 'none' }, pat);
    if (L.scroll && o.motion) el('animateTransform', { attributeName: 'patternTransform', type: 'translate', additive: 'sum', from: '0 0', to: `${tw.toFixed(3)} 0`, dur: '2.4s', repeatCount: 'indefinite' }, pat);
    stroke(`url(#${pid})`, w, { 'stroke-linecap': 'butt' });
  } else if (lod >= 40 || o.loose) {
    // no strip: one highlight line (forest) or the hot core (volcano), flowing when the skin scrolls
    if (L.hot_core) {
      const core = stroke(L.hot_core, Math.max(0.6, w * 0.34), { 'stroke-opacity': o.loose ? 0.25 : 0.95 });
      if (core && L.scroll && o.motion && !o.loose && lod >= 64) core.classList.add('skin-flow');
    } else if (L.highlight) stroke(L.highlight, Math.max(0.5, w * 0.26), { 'stroke-opacity': 0.75, transform: 'translate(-0.35,-0.45)' });
  }
  return out;
};
