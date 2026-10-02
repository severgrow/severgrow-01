// The material registry: how each board material is drawn, in "lowkey 3D". One light
// from the top-left: a thin bright rim on the top-left edge, a soft darker edge on the
// bottom-right, a soft contact shadow, a slight inner shade. Matte; only fire glows.
//
// Each material registers up to four parts: `cell` (terrain under everything), `tile`
// (a player's tile), `root` and `scar` (what a cut-off tile leaves). The board asks the
// registry by name (see materialFor in logic/materials.ts), so a new material, e.g.
// "wild" for a world map, is one registerMaterial call and no change to the board.
//
// Everything costly is built once: gradients and the noise pattern live in the board's
// <defs>; per tile there are only a few plain shapes (no per-tile filters).
import type { MaterialLook, MaterialName } from '../logic/materials.js';
import { flameTongues, mossTufts, rockPebbles, strengthLift, tileVariant } from '../logic/materials.js';
import type { Flame } from '../logic/materials.js';
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
  // fire: burning all over, hottest low in the middle, deep red at the edges
  rad('fire-body', [[0, 'st-fire-hot', 1], [0.55, 'st-fire', 1], [1, 'st-fire-deep', 1]], { cx: 0.5, cy: 0.6, r: 0.62 });
  rad('fire-core', [[0, 'st-fire-tip', 1], [0.4, 'st-fire-hot', 1], [1, 'st-fire', 1]], { cx: 0.5, cy: 0.55, r: 0.6 });
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
    if (L.cracks) {
      // smaller stones lying on the rock: each with a dark shadow, a body and a light top-left edge
      const R = size;
      for (const [i, p] of rockPebbles(c.key).entries()) {
        const px = x + p.x * R;
        const py = y + p.y * R;
        const pts = Array.from({ length: p.sides }, (_, j) => {
          const a = ((p.turn + (j * 360) / p.sides) * Math.PI) / 180;
          const rr = p.size * R * (0.78 + 0.22 * h(20 + i * 7 + j));
          return [px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.82] as const;
        });
        const dd = `M${pts.map(([a, b]) => `${f(a)},${f(b)}`).join('L')}Z`;
        el('path', { d: dd, class: 'pebble-shadow', transform: 'translate(0.9 1.3)' }, c.parent);
        el('path', { d: dd, class: `pebble ${i % 3 === 0 ? 'light' : i % 3 === 1 ? 'mid' : 'dark'}` }, c.parent);
        // the light catches the top-left edges
        const top = pts.filter(([a, b]) => a - px + (b - py) < 0);
        if (top.length > 1) el('path', { d: `M${top.map(([a, b]) => `${f(a)},${f(b)}`).join('L')}`, class: 'pebble-rim' }, c.parent);
      }
    }
    lit(c, d, L.rim + 0.1);
  },
});

// ---------- moss: my tiles ----------

/** Fluffy grass-like moss: little tufts of soft blades around the cushion (textured detail only). */
const mossDetail = (c: DrawCtx, R: number, turn: number) => {
  const { x, y } = centerOf(c.key);
  const g = el('g', { class: 'moss-detail', transform: `rotate(${turn} ${f(x)} ${f(y)})` }, c.parent);
  let dark = '';
  let light = '';
  let shade = '';
  // the middle stays calm for the number; tufts sit around it
  for (const [i, t] of mossTufts(c.key).entries()) {
    const bx = x + t.x * R * 0.74;
    const by = y + t.y * R * 0.74;
    const len = R * (0.24 + t.size * 1.5);
    shade += `M${f(bx - len * 0.35)},${f(by + 0.6)}a${f(len * 0.35)},${f(len * 0.14)} 0 1 0 ${f(len * 0.7)},0a${f(len * 0.35)},${f(len * 0.14)} 0 1 0 ${f(-len * 0.7)},0`;
    // seven soft blades fanning upward, alternately darker and lighter, of uneven length
    for (let b = 0; b < 7; b++) {
      const spread = (b - 3) * 0.24 + (((i * 7 + b * 3) % 5) - 2) * 0.05;
      const blade = len * (0.75 + 0.25 * (((i + b) * 37) % 7) / 6);
      const tipX = bx + Math.sin(spread) * blade;
      const tipY = by - Math.cos(spread) * blade;
      const bend = (b % 2 ? 1 : -1) * blade * 0.18;
      const seg = `M${f(bx + (b - 3) * 0.45)},${f(by)}Q${f((bx + tipX) / 2 + bend)},${f((by + tipY) / 2)} ${f(tipX)},${f(tipY)}`;
      if (b % 2) dark += seg;
      else light += seg;
    }
  }
  el('path', { d: shade, class: 'moss-gap' }, g);
  el('path', { d: dark, class: 'grass-blade dark' }, g);
  el('path', { d: light, class: 'grass-blade' }, g);
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

// ---------- fire: the bot's tiles ----------

/** One flame tongue (and its bright inner tip) as path data, base at (bx, by). */
const flamePath = (bx: number, by: number, w: number, h: number, lean: number) =>
  `M${f(bx - w / 2)},${f(by)}Q${f(bx - w / 2)},${f(by - h * 0.55)} ${f(bx + lean * w)},${f(by - h)}Q${f(bx + w / 2)},${f(by - h * 0.55)} ${f(bx + w / 2)},${f(by)}Z`;

const flames = (c: DrawCtx, list: Flame[], R: number, cls = '') => {
  const { x, y } = centerOf(c.key);
  let outer = '';
  let inner = '';
  for (const fl of list) {
    const bx = x + fl.x * R;
    const by = y + fl.y * R;
    const w = fl.size * R;
    outer += flamePath(bx, by, w, w * 1.8, fl.lean);
    inner += flamePath(bx, by - w * 0.1, w * 0.5, w * 1.1, fl.lean);
  }
  const g = el('g', { class: `flames${cls}${c.look.motion ? ' flicker' : ''}`, style: `animation-delay:${(-hash(c.key) * 3).toFixed(2)}s` }, c.parent);
  el('path', { d: outer, class: 'flame' }, g);
  el('path', { d: inner, class: 'flame-tip' }, g);
};

registerMaterial('fire', {
  // burning all over: a hot body, deep red at the edges, flame tongues licking up around it
  tile: (c) => {
    const s = strengthLift(c.strength, c.maxRank);
    const d = hexPath(c.key, c.radius, c.shape);
    contact(c, d, s.lift, c.look.shadow * (s.shadow / 0.55));
    // a back row of tall flames rising above the tile: it is burning, not glowing
    const back: Flame[] = [-0.42, -0.08, 0.3].map((bx, i) => ({
      x: bx + (hash(`${c.key}:bk${i}`) - 0.5) * 0.12,
      y: -0.45,
      size: 0.34 + 0.14 * hash(`${c.key}:bs${i}`) + 0.02 * c.strength,
      lean: (hash(`${c.key}:bl${i}`) - 0.5) * 0.6,
    }));
    flames(c, back, c.radius, ' back');
    el('path', { d, class: 'fire-body', fill: c.url('fire-body'), style: `opacity:${(0.85 + 0.15 * s.bright).toFixed(2)}` }, c.parent);
    if (c.look.textures) el('path', { d, class: 'mat-grain fire-grain', fill: c.url('noise') }, c.parent);
    flames(c, flameTongues(c.key, c.strength), c.radius);
    lit(c, d, c.look.rim * (s.rim / 0.45));
  },
  // a bigger raised fire core, burning brighter
  root: (c) => {
    const { x, y } = centerOf(c.key);
    const R = S * 0.88;
    el('circle', { cx: f(x + c.look.depth * 0.7), cy: f(y + c.look.depth * 1.5), r: f(R), class: 'contact', style: `opacity:${c.look.shadow.toFixed(2)}` }, c.parent);
    // the root burns hardest: a crown of tall flames behind the core
    const crown: Flame[] = [-0.55, -0.2, 0.15, 0.5].map((bx, i) => ({ x: bx, y: -0.62 + Math.abs(bx) * 0.35, size: 0.55 + 0.15 * hash(`${c.key}:cr${i}`), lean: (hash(`${c.key}:cl${i}`) - 0.5) * 0.5 }));
    flames(c, crown, R, ' back');
    el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'fire-body', fill: c.url('fire-core') }, c.parent);
    const ring: Flame[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + hash(`${c.key}:rf${i}`) * 0.4;
      return { x: Math.cos(a) * 0.62, y: Math.sin(a) * 0.62 + 0.15, size: 0.2, lean: 0 };
    });
    flames(c, ring, R, ' root');
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.3), class: 'root-core fire' }, c.parent);
    el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lit', fill: c.url('lit'), stroke: c.url('rim') }, c.parent);
  },
  // cut off: the fire burns out to dark grey ash
  scar: (c) => {
    const d = hexPath(c.key, S * 0.66, c.shape);
    el('path', { d, class: 'scar cooled', 'data-key': c.key }, c.parent);
    const { x, y } = centerOf(c.key);
    el('path', { d: `M${f(x - S * 0.3)},${f(y - S * 0.1)}L${f(x)},${f(y + S * 0.05)}L${f(x + S * 0.28)},${f(y - S * 0.15)}`, class: 'scar-crack' }, c.parent);
  },
});
