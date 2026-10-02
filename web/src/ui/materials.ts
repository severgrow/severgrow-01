// The material registry: how each board material is drawn, in "lowkey 3D". One light
// from the top-left: a thin bright rim on the top-left edge, a soft darker edge on the
// bottom-right, a soft contact shadow, a slight inner shade. Matte; only lava glows.
//
// Each material registers up to four parts: `cell` (terrain under everything), `tile`
// (a player's tile), `root` and `scar` (what a cut-off tile leaves). The board asks the
// registry by name (see materialFor in logic/materials.ts), so a new material, e.g.
// "wild" for a world map, is one registerMaterial call and no change to the board.
//
// Everything costly is built once: gradients and the noise pattern live in the board's
// <defs>; per tile there are only a few plain shapes (no per-tile filters).
import type { MaterialLook, MaterialName } from '../logic/materials.js';
import { lavaSeams, mossTufts, strengthLift, tileVariant } from '../logic/materials.js';
import type { ThemeStyle } from '../logic/themes.js';
import { S, centerOf, cornerPts, el, hash, hexPath, noiseTile } from './geom.js';
import type { Attrs } from './geom.js';

export type DrawCtx = {
  parent: SVGGElement;
  key: string;
  look: MaterialLook;
  shape: ThemeStyle['tileShape'];
  /** url(#id) of a shared definition on this board. */
  url: (name: string) => string;
  /** Tile radius in board units (tiles grow with strength). */
  radius: number;
  strength: number;
  maxRank: number;
};
type Drawer = (c: DrawCtx) => void;
type Parts = Partial<Record<'cell' | 'tile' | 'root' | 'scar', Drawer>>;

const REGISTRY = new Map<string, Parts>();

/** Adds (or replaces) a material. */
export const registerMaterial = (name: string, parts: Parts) => REGISTRY.set(name, parts);
/** Draws one part of a material; quietly does nothing if that material has no such part. */
export const drawMaterial = (name: MaterialName | string, part: keyof Parts, c: DrawCtx) => REGISTRY.get(name)?.[part]?.(c);
export const registeredMaterials = () => [...REGISTRY.keys()];

// ---------- shared definitions (built once per board) ----------

/** The gradients and patterns every material uses, added to a board's <defs>. */
export const materialDefs = (defs: SVGDefsElement, id: (name: string) => string, look: MaterialLook) => {
  const L = look;
  const lin = (name: string, stops: [number, string, number][]) => {
    const g = el('linearGradient', { id: id(name), x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    for (const [offset, cls, op] of stops) el('stop', { offset, class: cls, 'stop-opacity': op }, g);
  };
  const rad = (name: string, stops: [number, string, number][], attrs: Attrs = { cx: 0.4, cy: 0.36, r: 0.7 }) => {
    const g = el('radialGradient', { id: id(name), ...attrs }, defs);
    for (const [offset, cls, op] of stops) el('stop', { offset, class: cls, 'stop-opacity': op }, g);
  };
  // the light: a soft overlay for raised things, its rim stroke, and the reverse for insets
  lin('lit', [[0, 'st-light', 0.16 * L.intensity + 0.04], [0.5, 'st-light', 0], [1, 'st-dark', 0.22 * L.intensity + 0.06]]);
  lin('rim', [[0, 'st-light', L.rim + 0.25], [0.45, 'st-light', 0], [0.55, 'st-dark', 0], [1, 'st-dark', L.rim]]);
  lin('inset', [[0, 'st-dark', 0.3 * L.intensity + 0.1], [0.55, 'st-dark', 0], [1, 'st-light', 0.06 * L.intensity]]);
  lin('sheen', [[0, 'st-sheen', 0], [0.42, 'st-sheen', 0], [0.5, 'st-sheen', 0.22 * L.intensity + 0.05], [0.58, 'st-sheen', 0], [1, 'st-sheen', 0]]);
  // moss: a soft cushion, lighter on top, darker at the edges
  rad('moss-dome', [[0, 'st-moss-top', 1], [0.6, 'st-moss', 1], [1, 'st-moss-deep', 1]], { cx: 0.42, cy: 0.38, r: 0.72 });
  // lava: the glow under a root, hottest in the middle
  rad('lava-core', [[0, 'st-lava-hot', 0.9], [0.45, 'st-lava-seam', 0.45], [1, 'st-lava-seam', 0]], { cx: 0.5, cy: 0.5, r: 0.5 });
  rad('moss-glow', [[0, 'st-moss-top', 0.85], [1, 'st-moss-top', 0]], { cx: 0.5, cy: 0.5, r: 0.5 });
  if (L.textures && noiseTile()) {
    const n = el('pattern', { id: id('noise'), width: 32, height: 32, patternUnits: 'userSpaceOnUse' }, defs);
    el('image', { href: noiseTile(), width: 32, height: 32, preserveAspectRatio: 'none' }, n);
  }
};

const f = (n: number) => n.toFixed(1);

/** The top-left light and rim over a raised shape (rim stronger on stronger tiles). */
const lit = (c: DrawCtx, d: string, rim = c.look.rim) =>
  el('path', { d, class: 'lit', fill: c.url('lit'), stroke: c.url('rim'), 'stroke-opacity': Math.min(1, rim / Math.max(c.look.rim, 0.01)).toFixed(2) }, c.parent);

/** A soft contact shadow, offset down-right by the lift. */
const contact = (c: DrawCtx, d: string, lift: number, opacity: number) =>
  el('path', { d, class: 'contact', transform: `translate(${f(lift * 0.5)} ${f(lift)})`, style: `opacity:${opacity.toFixed(2)}` }, c.parent);

// ---------- empty and gold cells ----------

registerMaterial('empty', {
  // a shallow soil pocket: the inner shadow sits on the top-left, a faint light bottom-right
  cell: (c) => {
    el('path', { d: hexPath(c.key, S - 2.6, c.shape), class: 'inset', fill: c.url('inset') }, c.parent);
  },
});

registerMaterial('gold', {
  // warm amber with a fine weave (so gold isn't colour alone) and a faint metallic sheen;
  // the "2" badge is drawn by the board above the tiles
  cell: (c) => {
    el('path', { d: hexPath(c.key, S - 1.2, c.shape), class: 'gold-weave-fill', fill: c.url('pat-gold') }, c.parent);
    el('path', { d: hexPath(c.key, S - 2.6, c.shape), class: 'gold-metal', fill: c.url('sheen') }, c.parent);
    el('path', { d: hexPath(c.key, S * 0.8, c.shape), class: 'gold-sheen', style: `animation-delay:${(-hash(c.key) * 4).toFixed(2)}s` }, c.parent);
  },
});

// ---------- rock: the heaviest thing on the board ----------

registerMaterial('rock', {
  cell: (c) => {
    const L = c.look;
    const size = S * 0.88;
    const d = hexPath(c.key, size, c.shape);
    const h = (n: number) => hash(`${c.key}:rock:${n}`);
    const { x, y } = centerOf(c.key);
    el('path', { d, class: 'rock-shadow', transform: `translate(${f(L.depth * 0.9)} ${f(L.depth * 1.9)})` }, c.parent);
    el('path', { d, class: 'rock-edge', transform: `translate(0 ${f(L.depth * 1.3)})` }, c.parent);
    el('path', { d, class: 'rock-body' }, c.parent);
    if (L.facets) {
      // two or three flat, uneven planes meeting at a ridge point up and left of centre
      const pts = cornerPts(c.key, size * 0.9, 0.08);
      const px = x - S * (0.08 + 0.1 * h(1));
      const py = y - S * (0.06 + 0.1 * h(2));
      const plane = (ids: number[], cls: string) =>
        el('path', { d: `M${f(px)},${f(py)}${ids.map((i) => `L${f(pts[i]![0])},${f(pts[i]![1])}`).join('')}Z`, class: `rock-facet ${cls}` }, c.parent);
      plane([3, 4, 5], 'hi');
      plane([5, 0, 1], 'mid');
      plane([1, 2, 3], 'lo');
    }
    if (L.textures) el('path', { d, class: 'rock-grain', fill: c.url('noise') }, c.parent);
    if (L.cracks) {
      const pts = cornerPts(c.key, size * 0.85);
      const a = Math.floor(h(3) * 6);
      const [p, q] = [pts[a]!, pts[(a + 3) % 6]!];
      const mx = x + (h(4) - 0.5) * S * 0.3;
      const my = y + (h(5) - 0.5) * S * 0.3;
      el('path', { d: `M${f(p[0])},${f(p[1])}L${f((p[0] + mx) / 2 + 2)},${f((p[1] + my) / 2)}L${f(mx)},${f(my)}`, class: 'rock-crack' }, c.parent);
      el('path', { d: `M${f(mx)},${f(my)}L${f((q[0] + mx) / 2)},${f((q[1] + my) / 2 - 2)}`, class: 'rock-crack thin' }, c.parent);
      for (const k of [Math.floor(h(6) * 6), Math.floor(h(7) * 6)]) {
        const c0 = pts[k]!;
        const c1 = pts[(k + 1) % 6]!;
        const t = 0.35 + 0.3 * h(8 + k);
        const cx = c0[0] + (c1[0] - c0[0]) * t;
        const cy = c0[1] + (c1[1] - c0[1]) * t;
        el('path', { d: `M${f(cx - 2.2)},${f(cy)}L${f(cx + 2.2)},${f(cy + 0.6)}L${f(cx + (x - cx) * 0.12)},${f(cy + (y - cy) * 0.12)}Z`, class: 'rock-chip' }, c.parent);
      }
    }
    lit(c, d, L.rim + 0.1);
  },
});

// ---------- moss: my tiles ----------

/** Clumps and tufts on a moss cushion of radius R (textured detail only). */
const mossDetail = (c: DrawCtx, R: number, turn: number) => {
  const { x, y } = centerOf(c.key);
  const g = el('g', { class: 'moss-detail', transform: `rotate(${turn} ${f(x)} ${f(y)})` }, c.parent);
  // soft clumps around the rim, lighter on top; the middle stays calm for the number
  for (const [i, t] of mossTufts(c.key).entries()) {
    // kept inside the hex: centres at most ~0.62 R out, radius at most ~0.23 R
    const cx = x + t.x * R * 0.72;
    const cy = y + t.y * R * 0.72;
    const r = R * (0.12 + t.size);
    el('circle', { cx: f(cx + 0.6), cy: f(cy + 0.9), r: f(r), class: 'moss-gap' }, g);
    el('circle', { cx: f(cx), cy: f(cy), r: f(r), class: 'moss-clump' }, g);
    // tiny tufts: two soft light specks on the top-left of every other clump (fuzz, not marks)
    if (i % 2 === 0) {
      el('circle', { cx: f(cx - r * 0.3), cy: f(cy - r * 0.35), r: f(r * 0.16), class: 'moss-tuft' }, g);
      el('circle', { cx: f(cx + r * 0.05), cy: f(cy - r * 0.5), r: f(r * 0.11), class: 'moss-tuft' }, g);
    }
  }
  if (c.look.textures) el('path', { d: hexPath(c.key, R, c.shape), class: 'mat-grain', fill: c.url('noise') }, c.parent);
};

registerMaterial('moss', {
  tile: (c) => {
    const s = strengthLift(c.strength, c.maxRank);
    const v = tileVariant(c.key);
    const d = hexPath(c.key, c.radius, c.shape);
    contact(c, d, s.lift, c.look.shadow * (s.shadow / 0.55));
    el('path', { d, class: 'moss-body', fill: c.url('moss-dome'), style: `opacity:${Math.min(1, s.bright + v.shade).toFixed(2)}` }, c.parent);
    if (c.look.textures) mossDetail(c, c.radius, v.turn);
    el('path', { d, class: 'moss-fuzz' }, c.parent);
    lit(c, d, c.look.rim * (s.rim / 0.45));
  },
  // a bigger raised moss mound with a soft inner glow; it breathes slowly
  root: (c) => {
    const { x, y } = centerOf(c.key);
    const R = S * 0.88;
    const g = el('g', { class: `moss-root${c.look.motion ? ' breathing' : ''}` }, c.parent);
    const ctx = { ...c, parent: g };
    el('circle', { cx: f(x + c.look.depth * 0.7), cy: f(y + c.look.depth * 1.5), r: f(R), class: 'contact', style: `opacity:${c.look.shadow.toFixed(2)}` }, g);
    el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'moss-body', fill: c.url('moss-dome') }, g);
    if (c.look.textures) mossDetail(ctx, R, tileVariant(c.key).turn);
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.55), class: 'root-glow', fill: c.url('moss-glow') }, g);
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.3), class: 'root-core moss' }, g);
    el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lit', fill: c.url('lit'), stroke: c.url('rim') }, g);
  },
  // cut off: the moss dries out, grey-brown and flat
  scar: (c) => {
    el('path', { d: hexPath(c.key, S * 0.66, c.shape), class: 'scar dried', 'data-key': c.key }, c.parent);
  },
});

// ---------- lava: the bot's tiles ----------

/** The tile's seams as SVG paths (not turned: their places already vary per tile, and the number area stays clear). */
const seamPaths = (c: DrawCtx, R: number) => {
  const { x, y } = centerOf(c.key);
  return lavaSeams(c.key, c.strength).map((line) => line.map((p, i) => `${i ? 'L' : 'M'}${f(x + p.x * R)},${f(y + p.y * R)}`).join(''));
};

registerMaterial('lava', {
  tile: (c) => {
    const s = strengthLift(c.strength, c.maxRank);
    const v = tileVariant(c.key);
    const d = hexPath(c.key, c.radius, c.shape);
    contact(c, d, s.lift, c.look.shadow * (s.shadow / 0.55));
    el('path', { d, class: 'lava-crust' }, c.parent);
    if (c.look.textures) {
      el('path', { d, class: 'mat-grain', fill: c.url('noise') }, c.parent);
      // lighter crust plates on the top-left
      const { x, y } = centerOf(c.key);
      const R = c.radius;
      el('path', { d: `M${f(x - R * 0.7)},${f(y - R * 0.1)}L${f(x - R * 0.35)},${f(y - R * 0.62)}L${f(x + R * 0.1)},${f(y - R * 0.7)}L${f(x - R * 0.2)},${f(y - R * 0.45)}Z`, class: 'lava-plate', style: `opacity:${(0.55 + v.shade * 4).toFixed(2)}` }, c.parent);
    }
    const g = el('g', { class: `lava-seams${c.look.motion ? ' pulsing' : ''}`, style: `animation-delay:${(-hash(c.key) * 5).toFixed(2)}s;opacity:${(0.75 + 0.25 * s.bright).toFixed(2)}` }, c.parent);
    for (const p of seamPaths(c, c.radius)) {
      el('path', { d: p, class: 'seam-glow' }, g);
      el('path', { d: p, class: 'seam' }, g);
    }
    lit(c, d, c.look.rim * (s.rim / 0.45));
  },
  // a bigger raised lava core with a brighter seam glow
  root: (c) => {
    const { x, y } = centerOf(c.key);
    const R = S * 0.88;
    el('circle', { cx: f(x + c.look.depth * 0.7), cy: f(y + c.look.depth * 1.5), r: f(R), class: 'contact', style: `opacity:${c.look.shadow.toFixed(2)}` }, c.parent);
    el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lava-crust' }, c.parent);
    if (c.look.textures) el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'mat-grain', fill: c.url('noise') }, c.parent);
    const g = el('g', { class: `lava-seams root${c.look.motion ? ' pulsing' : ''}` }, c.parent);
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.62), class: 'root-glow', fill: c.url('lava-core') }, g);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + hash(`${c.key}:rs${i}`) * 0.5;
      const p = `M${f(x + Math.cos(a) * R * 0.35)},${f(y + Math.sin(a) * R * 0.35)}L${f(x + Math.cos(a + 0.15) * R * 0.65)},${f(y + Math.sin(a + 0.15) * R * 0.65)}L${f(x + Math.cos(a) * R * 0.9)},${f(y + Math.sin(a) * R * 0.9)}`;
      el('path', { d: p, class: 'seam-glow' }, g);
      el('path', { d: p, class: 'seam' }, g);
    }
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.3), class: 'root-core lava' }, c.parent);
    el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lit', fill: c.url('lit'), stroke: c.url('rim') }, c.parent);
  },
  // cut off: the lava cools, the glow fades and the crust turns dark grey ash
  scar: (c) => {
    const d = hexPath(c.key, S * 0.66, c.shape);
    el('path', { d, class: 'scar cooled', 'data-key': c.key }, c.parent);
    const { x, y } = centerOf(c.key);
    el('path', { d: `M${f(x - S * 0.3)},${f(y - S * 0.1)}L${f(x)},${f(y + S * 0.05)}L${f(x + S * 0.28)},${f(y - S * 0.15)}`, class: 'scar-crack' }, c.parent);
  },
});
