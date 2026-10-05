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
  /** a whole painted link (picked for this pair), laid once from plate to plate */
  art?: { url: string; aspect: number } | null;
};

/** Draws one link into `g`; returns the elements (for the sever animation). */
/** Small deterministic number 0..1 from a string. */
const h01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/**
 * The link as a gentle S-curve (the same for a pair every time): it leaves each plate along the
 * straight line, bows to one side and back, and passes the shared edge's midpoint. Returned as
 * points along the curve with the distance travelled, for laying the strip on it in short pieces.
 */
const curvePoints = (p: ReturnType<typeof linkPath>, seed: string, n: number) => {
  const dx = p.end.x - p.start.x;
  const dy = p.end.y - p.start.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const amp = (1.6 + h01(seed) * 1.6) * (h01(`${seed}:s`) > 0.5 ? 1 : -1);
  const c1 = { x: p.start.x + ux * L * 0.33 - uy * amp, y: p.start.y + uy * L * 0.33 + ux * amp };
  const c2 = { x: p.end.x - ux * L * 0.33 + uy * amp, y: p.end.y - uy * L * 0.33 - ux * amp };
  const pts: { x: number; y: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    const x = m ** 3 * p.start.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t ** 3 * p.end.x;
    const y = m ** 3 * p.start.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t ** 3 * p.end.y;
    if (i) s += Math.hypot(x - pts[i - 1]!.x, y - pts[i - 1]!.y);
    pts.push({ x, y, s });
  }
  const d = `M${p.start.x.toFixed(2)},${p.start.y.toFixed(2)}C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p.end.x.toFixed(2)},${p.end.y.toFixed(2)}`;
  return { pts, d };
};

export const drawLink = (g: SVGGElement, p: ReturnType<typeof linkPath>, o: LinkOpts): SVGElement[] => {
  const L = o.look;
  if (o.art) return drawArtLink(g, p, o, o.art);
  // a painted strip fades at its edges (no outline under it), so it is drawn wider than a plain stroke
  const w = L.widths[o.width] * (o.strip && !o.loose ? 1.55 : 1);
  const out: SVGElement[] = [];
  const cls = `skin-link${o.grow ? ' grow-in' : ''}${o.loose ? ' loose' : ''}${o.fragile ? ' fragile' : ''}`;
  const N = 6;
  const curve = curvePoints(p, o.id, N);
  const stroke = (d: string, color: string, width: number, extra: Record<string, string | number> = {}) => {
    const e = el('path', { d, pathLength: 1, class: cls, stroke: color, 'stroke-width': width.toFixed(2), fill: 'none', 'stroke-linecap': 'round', ...extra }, g);
    out.push(e);
    return e;
  };
  // no outline, no hard shadow: the link is painted into the ground, not laid on it
  if (L.glow && o.tilePx >= 80 && !o.loose) stroke(curve.d, L.glow, w + 2.5, { 'stroke-opacity': 0.14 });
  if (o.strip && !o.loose) {
    // the painted strip laid along the curve in short straight pieces, each continuing the strip
    // where the last one stopped (round ends overlap, so the bends close)
    const tw = (o.strip.w / o.strip.h) * w;
    for (let i = 0; i < N; i++) {
      const a = curve.pts[i]!;
      const b = curve.pts[i + 1]!;
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const pid = `${o.id}-s${i}`;
      const pat = el('pattern', { id: pid, patternUnits: 'userSpaceOnUse', width: tw.toFixed(3), height: w.toFixed(3), patternTransform: `translate(${a.x.toFixed(2)},${a.y.toFixed(2)}) rotate(${ang.toFixed(2)}) translate(${(-a.s % tw).toFixed(3)},${(-w / 2).toFixed(3)})` }, o.defs);
      el('image', { href: o.strip.url, x: 0, y: 0, width: tw.toFixed(3), height: w.toFixed(3), preserveAspectRatio: 'none' }, pat);
      if (L.scroll && o.motion) el('animateTransform', { attributeName: 'patternTransform', type: 'translate', additive: 'sum', from: '0 0', to: `${tw.toFixed(3)} 0`, dur: '2.4s', repeatCount: 'indefinite' }, pat);
      stroke(`M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`, `url(#${pid})`, w, { 'stroke-linecap': i === 0 || i === N - 1 ? 'butt' : 'round' });
    }
  } else {
    // no strip (or a cut-off link): the body colour along the curve, and the hot core or a highlight
    stroke(curve.d, L.body, w * (o.loose ? 0.6 : 0.85), { 'stroke-opacity': o.loose ? 0.5 : 0.9 });
    if (L.hot_core) {
      const core = stroke(curve.d, L.hot_core, Math.max(0.6, w * 0.3), { 'stroke-opacity': o.loose ? 0.25 : 0.9 });
      if (L.scroll && o.motion && !o.loose && o.tilePx >= 64) core.classList.add('skin-flow');
    } else if (L.highlight) stroke(curve.d, L.highlight, Math.max(0.5, w * 0.22), { 'stroke-opacity': 0.6 });
  }
  return out;
};

/**
 * A whole painted link: one picture, tucked a little under each number plate and stretched to the
 * gap (its own waves and leaves make it organic), as thick as the link's load. It lives: a vine
 * breathes a touch, lava glows brighter and back, each link at its own pace. One or two images
 * per link, nothing per frame in script.
 */
const drawArtLink = (g: SVGGElement, p: ReturnType<typeof linkPath>, o: LinkOpts, art: { url: string; aspect: number }): SVGElement[] => {
  const len = p.length + 6;
  const h = Math.min(16, Math.max(7, (len / art.aspect) * (o.width === 'heavy' ? 1.9 : o.width === 'thin' ? 1.3 : 1.6)));
  const cx = (p.start.x + p.end.x) / 2;
  const cy = (p.start.y + p.end.y) / 2;
  const lava = !!o.look.hot_core;
  const cls = `skin-link skin-art-link${o.grow ? ' grow-in' : ''}${o.loose ? ' loose' : ''}${o.fragile ? ' fragile' : ''}`;
  const wrap = el('g', { transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)}) rotate(${p.angle.toFixed(2)})` }, g);
  const pace = h01(o.id);
  const anim = o.motion && !o.loose && o.tilePx >= 40;
  const box = { x: (-len / 2).toFixed(2), y: (-h / 2).toFixed(2), width: len.toFixed(2), height: h.toFixed(2), preserveAspectRatio: 'none' };
  const out: SVGElement[] = [el('image', { href: art.url, ...box, class: `${cls}${anim && !lava ? ' skin-vine' : ''}`, style: `animation-delay:${(-pace * 6).toFixed(2)}s` }, wrap)];
  if (lava && anim) out.push(el('image', { href: art.url, ...box, class: 'skin-link skin-lava-flow', style: `animation-delay:${(-pace * 4).toFixed(2)}s` }, wrap));
  return out;
};
