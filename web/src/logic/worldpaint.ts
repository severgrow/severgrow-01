// Material pass 2: the material layer, painted from WORLD coordinates (board units), pixel by
// pixel, so the texture is one continuous landscape: grass, soil, flowers and roots for my
// tiles, crust plates, cracks and molten lava for the bot's. Each tile's look follows its
// vigour t (blended across same-owner borders, see vigour.ts). Pure and deterministic: the
// same board always gives the same pixels, and painting any rectangle on its own gives
// exactly the pixels of that rectangle in a full repaint (so partial redraws are safe).
import { CLEAR_ZONE, inClearZone } from './materials.js';
import type { ThemeId } from './themes.js';
import { S, centreOf, fieldT, hexAt, lavaLook, lavaPalette, mossLook, mossPalette, wfbm, wnoise } from './vigour.js';
import type { FieldTile } from './vigour.js';

export type PaintTile = FieldTile & { owner: 0 | 1; dead?: boolean; root?: boolean };
export type PaintInput = { tiles: ReadonlyMap<string, PaintTile>; palette: ThemeId; detail: 'low' | 'normal' };
/** A rectangle in world units and its pixel size. */
export type Rect = { x0: number; y0: number; w: number; h: number; scale: number };

type RGB = [number, number, number];
const SQ3 = Math.sqrt(3);
const rgb = (c: string): RGB => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (e0: number, e1: number, x: number) => {
  const u = clamp01((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};
const hash = (a: number, b: number, salt: number) => {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(salt, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Distance from the hex centre in "hex radius" units (1 on the edge), pointy-top. */
const hexDist = (dx: number, dy: number) => {
  const ax = Math.abs(dx);
  return Math.max(ax / ((S * SQ3) / 2), Math.abs(dy) / S + ax / (S * SQ3));
};
/** Cut off: the dried / cooled colours keep the structure but lose the life. */
const deaden = (c: RGB, mat: 'moss' | 'lava'): RGB => {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return mat === 'moss' ? mix([l, l, l], [l * 1.05, l * 0.92, l * 0.72], 0.6).map((v) => v * 0.82) as RGB : mix([l, l, l], [l * 0.95, l * 0.94, l * 0.96], 0.5).map((v) => v * 0.7 + 18) as RGB;
};
/** An approximate inverse of the normal cumulative distribution (for coverage thresholds). */
const probit = (p: number) => {
  const q = Math.min(0.999, Math.max(0.001, p));
  const t = Math.sqrt(-2 * Math.log(q < 0.5 ? q : 1 - q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return q < 0.5 ? -z : z;
};
/** fbm values cluster round 0.5; this spread turns a wanted coverage into a threshold. */
const FBM_SD = 0.105;

// ---------- palettes, cached by quantised t (parsing colours per pixel is slow) ----------

const Q = 64;
const mossPalCache = new Map<string, RGB[]>();
const lavaPalCache = new Map<string, RGB[]>();
const mossPal = (t: number, id: ThemeId): RGB[] => {
  const k = `${id}:${Math.round(t * Q)}`;
  let p = mossPalCache.get(k);
  if (!p) mossPalCache.set(k, (p = mossPalette(Math.round(t * Q) / Q, id).map(rgb)));
  return p;
};
const lavaPal = (t: number, id: ThemeId): RGB[] => {
  const k = `${id}:${Math.round(t * Q)}`;
  let p = lavaPalCache.get(k);
  if (!p) lavaPalCache.set(k, (p = lavaPalette(Math.round(t * Q) / Q, id).map(rgb)));
  return p;
};
const probitCache = new Map<number, number>();
const threshold = (cover: number) => {
  const k = Math.round(cover * 512);
  let v = probitCache.get(k);
  if (v === undefined) probitCache.set(k, (v = 0.5 + FBM_SD * probit(k / 512)));
  return v;
};

// ---------- the base layer, per pixel ----------

/** Small, patchy soil (a fine scale plus a little broad variation). */
const soilNoise = (x: number, y: number) => 0.65 * wfbm(x + 101, y - 57, 9, 3) + 0.35 * wnoise(x - 17, y + 29, 30);

const mossBase = (x: number, y: number, t: number, id: ThemeId): RGB => {
  const look = mossLook(t);
  const pal = mossPal(t, id);
  const soilN = soilNoise(x, y);
  const soilTh = threshold(look.soil);
  if (soilN < soilTh) {
    const g = wnoise(x * 3.1, y * 3.1, 3);
    return mix(pal[0]!, mix(pal[0]!, [150, 120, 90], 0.25), g); // soil with grain
  }
  const p = wfbm(x - 33, y + 71, 20, 3);
  return mix(pal[1]!, pal[2]!, 0.25 + 0.6 * p); // the shadowy grass under the blades
};

const lavaBase = (x: number, y: number, t: number, id: ThemeId): RGB => {
  const look = lavaLook(t);
  const pal = lavaPal(t, id);
  // plates: large shapes at low t, small at high t - a blend of two FIXED scales, so a change
  // of t across a border never stretches the pattern (no seam)
  const big = wfbm(x + 57, y + 13, S * 0.8, 3);
  const small = wfbm(x - 91, y + 44, S * 0.28, 3);
  const n = big + (small - big) * t;
  const scale = S * 0.5;
  const th = threshold(look.molten);
  // cracks: thin ridges of a second noise, widening with t
  const ridge = 1 - Math.abs(2 * wnoise(x - 211, y + 97, scale * 0.55) - 1);
  const crack = smooth(1 - look.crack * 2.2, 1 - look.crack * 0.6, ridge);
  if (n < th) {
    // molten: hottest in the middle of a pool, slowly flowing bands
    // red-orange molten; the pale pink-orange only in the hottest cores
    const depth = clamp01((th - n) / 0.14);
    const band = wnoise(x * 0.9 + y * 0.35, y * 0.9 - x * 0.2, 7);
    const heat = clamp01(0.25 + depth * 0.6 + (band - 0.5) * 0.35);
    if (heat < 0.75) return mix(pal[2]!, pal[3]!, heat / 0.75);
    return mix(pal[3]!, pal[4]!, ((heat - 0.75) / 0.25) * look.glow * 0.85);
  }
  // crust plates, lit a little on their top-left, with a glow near the molten edge and in cracks
  const lit = wnoise(x + 7, y + 3, scale * 0.35);
  let c = mix(pal[0]!, pal[1]!, lit * 0.8);
  const near = clamp01(1 - (n - th) / (0.05 + 0.05 * look.glow));
  c = mix(c, pal[2]!, near * 0.7 * look.glow);
  c = mix(c, mix(pal[2]!, pal[3]!, look.glow), crack * (0.25 + 0.75 * look.glow));
  return c;
};

// ---------- detail splats (blades, flowers, roots) over the base ----------

type Canvas = { data: Float32Array; w: number; h: number; r: Rect };
const put = (cv: Canvas, wx: number, wy: number, col: RGB, a: number) => {
  const px = (wx - cv.r.x0) * cv.r.scale - 0.5;
  const py = (wy - cv.r.y0) * cv.r.scale - 0.5;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const w4: [number, number, number][] = [[ix, iy, (1 - fx) * (1 - fy)], [ix + 1, iy, fx * (1 - fy)], [ix, iy + 1, (1 - fx) * fy], [ix + 1, iy + 1, fx * fy]];
  for (const [X, Y, w] of w4) {
    if (X < 0 || Y < 0 || X >= cv.w || Y >= cv.h) continue;
    const k = (Y * cv.w + X) * 4;
    if (cv.data[k + 3]! <= 0) continue; // only over material pixels
    const t = Math.min(1, w * a * 1.7);
    cv.data[k] = cv.data[k]! + (col[0] - cv.data[k]!) * t;
    cv.data[k + 1] = cv.data[k + 1]! + (col[1] - cv.data[k + 1]!) * t;
    cv.data[k + 2] = cv.data[k + 2]! + (col[2] - cv.data[k + 2]!) * t;
  }
};

/** Which moss tile owns a world point (null if none): splats only land on moss of the same owner. */
const tileAt = (inp: PaintInput, x: number, y: number) => {
  const h = hexAt(x, y);
  const key = `${h.q},${h.r}`;
  const t = inp.tiles.get(key);
  return t ? { key, tile: t, h } : null;
};

const BLADE_GRID = 2.4;
const FLOWER_GRID = 9;
const ROOT_GRID = 13;

const mossDetails = (inp: PaintInput, cv: Canvas) => {
  const { x0, y0, w, h, scale } = cv.r;
  const m = S * 0.4; // margin: blades from outside the rectangle may reach in
  const x1 = x0 + w / scale;
  const y1 = y0 + h / scale;
  const id = inp.palette;
  const lowDetail = inp.detail === 'low';
  // blades: anchored on a world grid, drawn bottom row last (nearer blades on top)
  const g = lowDetail ? BLADE_GRID * 1.8 : BLADE_GRID;
  for (let j = Math.floor((y0 - m) / g); j <= Math.ceil((y1 + m) / g); j++) {
    for (let i = Math.floor((x0 - m) / g); i <= Math.ceil((x1 + m) / g); i++) {
      const ax = (i + hash(i, j, 1)) * g;
      const ay = (j + hash(i, j, 2)) * g;
      const at = tileAt(inp, ax, ay);
      if (!at || at.tile.owner !== 0) continue;
      const t = fieldT(ax, ay, inp.tiles);
      const look = mossLook(t);
      if (hash(i, j, 3) > look.density) continue;
      // soil patches stay mostly bare
      if (soilNoise(ax, ay) < threshold(look.soil) && hash(i, j, 4) > 0.15) continue;
      const pal = mossPal(t, id);
      const dead = !!at.tile.dead;
      const len = look.blade * S * (0.55 + 0.45 * hash(i, j, 5)) * (dead ? 0.6 : 1);
      const ang = (hash(i, j, 6) - 0.5) * 1.6 + (wnoise(ax, ay, 40) - 0.5) * 0.8; // a gentle common lean
      const tipCol = mix(pal[2]!, pal[3]!, 0.35 + 0.65 * hash(i, j, 7));
      const steps = Math.max(2, Math.ceil(len * scale * 1.3));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const bx = ax + Math.sin(ang) * len * u;
        const by = ay - Math.cos(ang) * len * u * 0.9;
        const here = tileAt(inp, bx, by);
        if (!here || here.tile.owner !== 0) break; // never onto lava or empty ground
        let col = mix(pal[1]!, tipCol, u ** 0.8);
        if (dead) col = deaden(col, 'moss');
        put(cv, bx, by, col, (1 - u * 0.3) * 0.9);
      }
    }
  }
  if (lowDetail) return;
  // small flowers (more as t rises), never on the number's spot
  for (let j = Math.floor((y0 - m) / FLOWER_GRID); j <= Math.ceil((y1 + m) / FLOWER_GRID); j++) {
    for (let i = Math.floor((x0 - m) / FLOWER_GRID); i <= Math.ceil((x1 + m) / FLOWER_GRID); i++) {
      const fx = (i + hash(i, j, 11)) * FLOWER_GRID;
      const fy = (j + hash(i, j, 12)) * FLOWER_GRID;
      const at = tileAt(inp, fx, fy);
      if (!at || at.tile.owner !== 0 || at.tile.dead) continue;
      const look = mossLook(fieldT(fx, fy, inp.tiles));
      const perTile = (S * S * 2.6) / (FLOWER_GRID * FLOWER_GRID); // grid cells per tile
      if (hash(i, j, 13) > look.flowers / perTile) continue;
      const c = centreOf(at.h.q, at.h.r);
      if (inClearZone((fx - c.x) / S, (fy - c.y) / S)) continue;
      const kind = hash(i, j, 14);
      const col: RGB = kind < 0.45 ? [240, 204, 72] : kind < 0.75 ? [212, 52, 46] : [246, 242, 232];
      const r = 0.9;
      for (let a = 0; a < 10; a++) for (let rr = 0; rr <= r; rr += 0.35) put(cv, fx + Math.cos(a * 0.63) * rr, fy + Math.sin(a * 0.63) * rr, col, 0.95);
      put(cv, fx, fy, kind < 0.75 ? [90, 50, 20] : [200, 196, 180], 0.8);
    }
  }
  // exposed roots curling over the edges and between clumps (mostly after t = 0.6)
  for (let j = Math.floor((y0 - m) / ROOT_GRID); j <= Math.ceil((y1 + m) / ROOT_GRID); j++) {
    for (let i = Math.floor((x0 - m) / ROOT_GRID); i <= Math.ceil((x1 + m) / ROOT_GRID); i++) {
      const rx = (i + hash(i, j, 21)) * ROOT_GRID;
      const ry = (j + hash(i, j, 22)) * ROOT_GRID;
      const at = tileAt(inp, rx, ry);
      if (!at || at.tile.owner !== 0) continue;
      const look = mossLook(fieldT(rx, ry, inp.tiles));
      if (hash(i, j, 23) > look.roots * 0.55) continue;
      const c = centreOf(at.h.q, at.h.r);
      if (hexDist(rx - c.x, ry - c.y) < 0.45) continue; // roots near the edges, off the number
      const a0 = hash(i, j, 24) * Math.PI * 2;
      const len = S * (0.22 + 0.18 * hash(i, j, 25));
      const dark: RGB = at.tile.dead ? [70, 62, 54] : [74, 50, 32];
      const light: RGB = at.tile.dead ? [110, 102, 92] : [138, 104, 70];
      for (let s = 0; s <= 30; s++) {
        const u = s / 30;
        const ang = a0 + Math.sin(u * 3.2) * 0.9;
        const px = rx + Math.cos(ang) * len * u;
        const py = ry + Math.sin(ang) * len * u;
        const here = tileAt(inp, px, py);
        if (!here || here.tile.owner !== 0) break;
        put(cv, px, py, dark, 0.9 - u * 0.4);
        put(cv, px + 0.35, py - 0.35, light, 0.35 - u * 0.2);
      }
    }
  }
};

/**
 * Paints the material layer for a rectangle of the world into RGBA (0 alpha where there is
 * no tile). Roots are left out (the board draws them). The same rectangle always gives the
 * same pixels; a sub-rectangle gives exactly the pixels of the larger paint.
 */
export const paintRect = (inp: PaintInput, r: Rect): Uint8ClampedArray => {
  const { w, h, x0, y0, scale } = r;
  const cv: Canvas = { data: new Float32Array(w * h * 4), w, h, r };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = x0 + (px + 0.5) / scale;
      const y = y0 + (py + 0.5) / scale;
      const at = tileAt(inp, x, y);
      if (!at || at.tile.root) continue;
      const t = fieldT(x, y, inp.tiles);
      const mat = at.tile.owner === 0 ? 'moss' : 'lava';
      let c = mat === 'moss' ? mossBase(x, y, t, inp.palette) : lavaBase(x, y, t, inp.palette);
      if (at.tile.dead) c = deaden(c, mat);
      const k = (py * w + px) * 4;
      cv.data[k] = c[0];
      cv.data[k + 1] = c[1];
      cv.data[k + 2] = c[2];
      cv.data[k + 3] = 255;
    }
  }
  mossDetails(inp, cv);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(cv.data[i]!);
  return out;
};

/** The world rectangle covering a set of hexes (plus a margin), for partial redraws. */
export const rectFor = (keys: readonly string[], scale: number, margin = S * 0.6): Rect => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const k of keys) {
    const [q, r] = k.split(',').map(Number) as [number, number];
    const c = centreOf(q, r);
    x0 = Math.min(x0, c.x - S - margin);
    y0 = Math.min(y0, c.y - S - margin);
    x1 = Math.max(x1, c.x + S + margin);
    y1 = Math.max(y1, c.y + S + margin);
  }
  // snap to whole pixels of the world grid so sub-rectangles line up with a full paint
  const sx0 = Math.floor(x0 * scale) / scale;
  const sy0 = Math.floor(y0 * scale) / scale;
  return { x0: sx0, y0: sy0, w: Math.ceil((x1 - sx0) * scale), h: Math.ceil((y1 - sy0) * scale), scale };
};

export { CLEAR_ZONE };
