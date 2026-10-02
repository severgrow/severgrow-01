// Material pass 2: a tile's strength shows in its material. One continuous "vigour" value
// t per tile (0 = strength 1, the barest look; 1 = the top rank, the fullest look) drives
// every look parameter, smoothly. Pure and deterministic; the drawing is in ui/worldpaint.ts.
//
// The texture is drawn from WORLD coordinates (board units, the same as the SVG board), so
// grass, soil, cracks and crust plates carry on from one tile into the next. Where two
// neighbouring tiles of the same owner have different strengths, t blends across the shared
// border (a band about a third of a tile wide), so there is no seam.
import type { ThemeId } from './themes.js';
import { materialsOf } from './materials.js';

/** t = (strength - 1) / (maxRank - 1), clamped to 0..1. */
export const vigour = (strength: number, maxRank: number): number =>
  maxRank <= 1 ? 1 : Math.min(1, Math.max(0, (strength - 1) / (maxRank - 1)));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

export type MossLook = {
  /** blade height, tile units */
  blade: number;
  /** blades per unit area, 0..1 of the fullest */
  density: number;
  /** share of bare soil showing */
  soil: number;
  /** small flowers per tile */
  flowers: number;
  /** exposed roots, 0..1 (mostly after t = 0.6) */
  roots: number;
  /** colour richness: pale dry green (0) to deep rich green with highlights (1) */
  colour: number;
};

export const mossLook = (t: number): MossLook => ({
  blade: lerp(0.07, 0.26, t),
  density: lerp(0.32, 1, Math.pow(t, 0.8)),
  soil: lerp(0.62, 0.02, smooth(0, 0.7, t)),
  flowers: 9 * smooth(0.25, 1, t),
  roots: smooth(0.6, 1, t),
  colour: lerp(0.25, 1, t),
});

export type LavaLook = {
  /** share of the surface that is molten */
  molten: number;
  /** crust plate size, tile units (large to small) */
  plate: number;
  /** crack width, tile units (thin to wide) */
  crack: number;
  /** glow strength 0..1 */
  glow: number;
};

export const lavaLook = (t: number): LavaLook => ({
  molten: 0.03 + 0.92 * t,
  plate: lerp(0.9, 0.16, t),
  crack: lerp(0.012, 0.12, t),
  glow: lerp(0.08, 1, Math.pow(t, 0.9)),
});

/** A single "how rich does it look" score; rises with strength for both materials. */
export const richness = (m: 'moss' | 'lava', t: number): number => {
  if (m === 'moss') {
    const l = mossLook(t);
    return l.blade * 4 + l.density + (1 - l.soil) + l.flowers / 9 + l.roots + l.colour;
  }
  const l = lavaLook(t);
  return l.molten * 2 + l.glow + l.crack * 4 + (1 - l.plate);
};

/** The top-rank finish (contour, outer glow, shimmer): 0 below t = 0.85, 1 at the top. */
export const CONTOUR_START = 0.85;
export const contour = (t: number): number => (t < CONTOUR_START ? 0 : smooth(CONTOUR_START, 1, t));

// ---------- world-position noise (stable: a hash of the position, never random) ----------

const hash2 = (ix: number, iy: number): number => {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise at a world position, 0..1. Same position, same value, always. */
export const wnoise = (x: number, y: number, scale = 12): number => {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  // quintic easing: no visible grid creases
  const tx = fx - ix;
  const ty = fy - iy;
  const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const uy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** A few octaves of wnoise (finer detail on top of broad shapes). */
export const wfbm = (x: number, y: number, scale = 24, octaves = 4): number => {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // each octave turned by a different angle, so no grid lines up from one to the next
    const a = 0.7 + o * 1.13;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    s += wnoise(x * ca - y * sa + o * 37.1, x * sa + y * ca - o * 19.7, scale / 2 ** o) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return s / norm;
};

// ---------- the t field: each tile's own t, blended across same-owner borders ----------

export const S = 30; // hex radius in board units (as the SVG board)
const SQ3 = Math.sqrt(3);
export type FieldTile = { owner: number; t: number };

/** The hex (axial q, r) whose cell contains a world point (pointy-top hexes). */
export const hexAt = (x: number, y: number): { q: number; r: number } => {
  const qf = (SQ3 / 3 * x - y / 3) / S;
  const rf = ((2 / 3) * y) / S;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(-qf - rf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - (-qf - rf));
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
};
export const centreOf = (q: number, r: number) => ({ x: S * SQ3 * (q + r / 2), y: S * 1.5 * r });
const NB: readonly [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** Width of the blend band across a shared border, board units (about a third of a tile). */
export const BLEND = S * SQ3 / 3;

/**
 * The t to draw at a world point: the tile's own t, blended towards each same-owner
 * neighbour near their shared border. At the border itself both tiles give the same value,
 * so the texture has no seam; a third of a tile in, the tile's own t holds.
 */
export const fieldT = (x: number, y: number, tiles: ReadonlyMap<string, FieldTile>): number => {
  const h = hexAt(x, y);
  const me = tiles.get(`${h.q},${h.r}`);
  if (!me) return 0;
  const c = centreOf(h.q, h.r);
  let wSum = 1;
  let tSum = me.t;
  for (const [dq, dr] of NB) {
    const n = tiles.get(`${h.q + dq},${h.r + dr}`);
    if (!n || n.owner !== me.owner) continue;
    const nc = centreOf(h.q + dq, h.r + dr);
    // distance from the point to the shared border, along the line between the centres
    const ux = (nc.x - c.x) / (S * SQ3);
    const uy = (nc.y - c.y) / (S * SQ3);
    const along = (x - c.x) * ux + (y - c.y) * uy;
    const d = (S * SQ3) / 2 - along; // 0 on the border, growing inwards
    if (d >= BLEND / 2) continue;
    const w = 1 - smooth(0, BLEND / 2, Math.max(0, d)); // 1 on the border, 0 a band inwards
    wSum += w;
    tSum += w * n.t;
  }
  return tSum / wSum;
};

// ---------- colours: the texture's colours at t, and the number style ----------

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (v: number[]) => '#' + v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};

/**
 * The colours the moss texture uses at t (soil, deep shade, the grass body, sunlit tips):
 * pale and dry at t = 0, deep and rich with lighter highlights at t = 1. Flowers are kept
 * off the number's spot, so they are not listed.
 */
export const mossPalette = (t: number, id: ThemeId): string[] => {
  const m = materialsOf(id).colors;
  const dry = '#9aa86a';
  return [
    mix('#5b4632', '#3e2f22', t), // soil
    mix(mix(m.mossDeep, dry, 0.45), m.mossDeep, t), // shade between blades
    mix(mix(m.moss, dry, 0.55), m.moss, t), // grass body
    mix(mix(m.mossTop, dry, 0.5), m.mossTuft, t), // sunlit tips
  ];
};

/**
 * The colours the lava texture uses at t: dull cooled crust at t = 0, glowing molten rock
 * at t = 1. Red-orange family only; the hottest parts are a bright red-orange, never yellow.
 */
export const lavaPalette = (t: number, id: ThemeId): string[] => {
  const m = materialsOf(id).colors;
  return [
    mix('#2a2523', m.fireCrust, t), // crust, dark
    mix('#4a4140', '#3c2a26', t), // crust, lit side
    mix('#5a2018', m.fireDeep, t), // a dull glow deep in the cracks / the cooler molten
    mix('#7a2a1c', m.fire, t), // molten
    mix('#8a3424', '#ff7f4f', t), // the hottest highlight (bright red-orange)
  ];
};

export type NumberStyle = { ink: string; plate: string; plateAlpha: number };

/** The digit colour and the soft plate behind it, per material and t (WCAG AA over the worst pixel). */
export const numberStyle = (mat: 'moss' | 'lava', t: number, id: ThemeId): NumberStyle => {
  if (mat === 'moss') {
    // dark ink on a soft light plate; the plate grows a little stronger where soil shows
    return { ink: '#0b1a14', plate: '#eef6dc', plateAlpha: 0.8 - 0.1 * t };
  }
  // light ink on a soft dark plate; stronger where the lava is brightest
  void id;
  return { ink: '#fff4ee', plate: '#1a0f0c', plateAlpha: 0.62 + 0.2 * t };
};
