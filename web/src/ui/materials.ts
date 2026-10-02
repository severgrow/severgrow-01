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
import { grassBlades, grassFlowers, lavaCracks, rockPebbles, strengthLift, tileVariant } from '../logic/materials.js';
import { GRASS_VARIANTS, LAVA_VARIANTS, PHOTO_SPAN, lavaLevel } from '../logic/photo.js';
import type { ThemeStyle } from '../logic/themes.js';
import { photoUrl } from './photo.js';
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
  // lava: dark crust, a little lighter top-left; molten glow seeping up around the edge
  rad('lava-crust', [[0, 'st-crust-light', 1], [1, 'st-crust', 1]], { cx: 0.38, cy: 0.32, r: 0.8 });
  rad('lava-rim', [[0, 'st-fire-deep', 0], [0.7, 'st-fire-deep', 0], [0.9, 'st-fire', 0.4], [1, 'st-fire-hot', 0.9]], { cx: 0.5, cy: 0.5, r: 0.5 });
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

/**
 * The photo-like image for a tile (Normal detail, once painted), centred on the hex and
 * scaled to its radius; returns false when there is none yet (then the vector look draws).
 */
const photo = (c: DrawCtx, kind: 'grass' | 'lava', R: number, level = 0) => {
  if (!c.look.textures) return false;
  const n = kind === 'grass' ? GRASS_VARIANTS : LAVA_VARIANTS;
  const url = photoUrl(kind, Math.floor(hash(`${c.key}:photo`) * n), level);
  if (!url) return false;
  const { x, y } = centerOf(c.key);
  const w = 2 * PHOTO_SPAN * R;
  el('image', { href: url, x: f(x - w / 2), y: f(y - w / 2), width: f(w), height: f(w), class: `mat-photo ${kind}` }, c.parent);
  return true;
};

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

/** Grass (textured detail only): a dense lawn of fine blades, a fuzzy fringe, a few tiny flowers. */
const grassDetail = (c: DrawCtx, R: number) => {
  const { x, y } = centerOf(c.key);
  const g = el('g', { class: 'moss-detail' }, c.parent);
  const tones = ['', '', ''];
  for (const b of grassBlades(c.key)) {
    const bx = x + b.x * R;
    const by = y + b.y * R;
    const L = b.len * R;
    const tx = bx + Math.sin(b.angle) * L;
    const ty = by - Math.cos(b.angle) * L;
    const bend = b.angle * L * 0.35;
    tones[b.tone] += `M${f(bx)},${f(by)}Q${f((bx + tx) / 2 - bend)},${f((by + ty) / 2)} ${f(tx)},${f(ty)}`;
  }
  tones.forEach((d, i) => el('path', { d, class: `grass-blade t${i}` }, g));
  for (const fl of grassFlowers(c.key)) {
    el('circle', { cx: f(x + fl.x * R), cy: f(y + fl.y * R), r: fl.kind === 'bloom' ? 1.1 : 1.3, class: `grass-flower ${fl.kind}` }, g);
  }
  if (c.look.textures) el('path', { d: hexPath(c.key, R, c.shape), class: 'mat-grain', fill: c.url('noise') }, c.parent);
};

registerMaterial('moss', {
  tile: (c) => {
    const s = strengthLift(c.strength, c.maxRank);
    const v = tileVariant(c.key);
    const d = hexPath(c.key, c.radius, c.shape);
    contact(c, d, s.lift, c.look.shadow * (s.shadow / 0.55));
    if (photo(c, 'grass', c.radius)) return;
    el('path', { d, class: 'moss-body', fill: c.url('moss-dome'), style: `opacity:${Math.min(1, s.bright + v.shade).toFixed(2)}` }, c.parent);
    if (c.look.textures) grassDetail(c, c.radius);
    else el('path', { d, class: 'moss-fuzz' }, c.parent);
    lit(c, d, c.look.rim * (s.rim / 0.45));
  },
  // a bigger raised moss mound with a soft inner glow; it breathes slowly
  root: (c) => {
    const { x, y } = centerOf(c.key);
    const R = S * 0.88;
    const g = el('g', { class: `moss-root${c.look.motion ? ' breathing' : ''}` }, c.parent);
    const ctx = { ...c, parent: g };
    el('circle', { cx: f(x + c.look.depth * 0.7), cy: f(y + c.look.depth * 1.5), r: f(R), class: 'contact', style: `opacity:${c.look.shadow.toFixed(2)}` }, g);
    const pic = photo(ctx, 'grass', R);
    if (!pic) {
      el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'moss-body', fill: c.url('moss-dome') }, g);
      if (c.look.textures) grassDetail(ctx, R);
    }
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.55), class: 'root-glow', fill: c.url('moss-glow') }, g);
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.3), class: 'root-core moss' }, g);
    if (!pic) el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lit', fill: c.url('lit'), stroke: c.url('rim') }, g);
  },
  // cut off: the moss dries out, grey-brown and flat
  scar: (c) => {
    el('path', { d: hexPath(c.key, S * 0.66, c.shape), class: 'scar dried', 'data-key': c.key }, c.parent);
  },
});

// ---------- lava: the bot's tiles ----------

/** The glowing cracks: a soft glow (textured detail only), the molten line and its bright thread. */
const cracks = (c: DrawCtx, R: number, strength: number) => {
  const { x, y } = centerOf(c.key);
  const list = lavaCracks(c.key, strength);
  const line = (pts: { x: number; y: number }[]) => (pts.length < 2 ? '' : 'M' + pts.map((p) => `${f(x + p.x * R)},${f(y + p.y * R)}`).join('L'));
  // wide where the molten rock wells up at the edge, narrowing as it runs inward
  const wide = list.map((k) => line(k.points.slice(0, 3))).join('');
  const thin = list.map((k) => line(k.points.slice(2))).join('');
  const w = (list.reduce((n, k) => n + k.width, 0) / list.length) * R;
  const g = el('g', { class: `lava-cracks${c.look.motion ? ' glowing' : ''}`, style: `animation-delay:${(-hash(c.key) * 4).toFixed(2)}s` }, c.parent);
  for (const [d, k] of [[wide, 1], [thin, 0.5]] as const) {
    if (!d) continue;
    if (c.look.textures) el('path', { d, class: 'lava-glow', 'stroke-width': f(w * k * 2.4) }, g);
    el('path', { d, class: 'lava-melt', 'stroke-width': f(w * k) }, g);
    el('path', { d, class: 'lava-thread', 'stroke-width': f(Math.max(0.5, w * k * 0.4)) }, g);
  }
};

registerMaterial('fire', {
  // lava: a dark rough crust split by glowing cracks, molten light seeping up around the edge
  tile: (c) => {
    const s = strengthLift(c.strength, c.maxRank);
    const d = hexPath(c.key, c.radius, c.shape);
    contact(c, d, s.lift, c.look.shadow * (s.shadow / 0.55));
    if (photo(c, 'lava', c.radius, lavaLevel(c.strength))) return;
    el('path', { d, class: 'lava-crust', fill: c.url('lava-crust') }, c.parent);
    if (c.look.textures) el('path', { d, class: 'mat-grain lava-grain', fill: c.url('noise') }, c.parent);
    el('path', { d, class: 'lava-rim', fill: c.url('lava-rim'), style: `opacity:${(0.55 + 0.45 * s.bright * (c.strength / Math.max(1, c.maxRank))).toFixed(2)}` }, c.parent);
    cracks(c, c.radius, c.strength);
    lit(c, d, c.look.rim * (s.rim / 0.45));
  },
  // a bigger raised mound of crust, cracked all round, with a molten core
  root: (c) => {
    const { x, y } = centerOf(c.key);
    const R = S * 0.88;
    el('circle', { cx: f(x + c.look.depth * 0.7), cy: f(y + c.look.depth * 1.5), r: f(R), class: 'contact', style: `opacity:${c.look.shadow.toFixed(2)}` }, c.parent);
    const pic = photo(c, 'lava', R, 2);
    if (!pic) {
      el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lava-crust', fill: c.url('lava-crust') }, c.parent);
      if (c.look.textures) el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'mat-grain lava-grain', fill: c.url('noise') }, c.parent);
      el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lava-rim', fill: c.url('lava-rim') }, c.parent);
      cracks(c, R, c.maxRank);
    }
    el('circle', { cx: f(x), cy: f(y), r: f(R * 0.3), class: 'root-core fire' }, c.parent);
    if (!pic) el('circle', { cx: f(x), cy: f(y), r: f(R), class: 'lit', fill: c.url('lit'), stroke: c.url('rim') }, c.parent);
  },
  // cut off: the fire burns out to dark grey ash
  scar: (c) => {
    const d = hexPath(c.key, S * 0.66, c.shape);
    el('path', { d, class: 'scar cooled', 'data-key': c.key }, c.parent);
    const { x, y } = centerOf(c.key);
    el('path', { d: `M${f(x - S * 0.3)},${f(y - S * 0.1)}L${f(x)},${f(y + S * 0.05)}L${f(x + S * 0.28)},${f(y - S * 0.15)}`, class: 'scar-crack' }, c.parent);
  },
});
