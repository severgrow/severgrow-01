// Photo-like materials, painted in code (no downloaded images): a dense, flat lawn
// for my tiles and lumpy lava rock with molten cracks for the bot's. Each is painted once,
// pixel by pixel, as a small square image of one tile; the board then shows it per tile.
// Pure and deterministic (seeded noise, no randomness): the same variant always gives the
// same pixels. Tested in web/tests/photo.test.ts.
//
// Image space: the square covers -PHOTO_SPAN..PHOTO_SPAN tile units on both axes (tile
// radius 1, pointy-top hex, y down), so the grass fringe can poke out past the edge.
import { CLEAR_ZONE, inClearZone } from './materials.js';
import type { MaterialToken } from './materials.js';
import { toBoard } from './orient.js';

export const PHOTO_SPAN = 1.2;
export const GRASS_VARIANTS = 4;
export const GRASS_LEVELS = 3;
export const LAVA_VARIANTS = 4;
export const LAVA_LEVELS = 3;
/** Look level for a strength: 1-3 low, 4-6 middle, 7-9 high. */
export const lavaLevel = (strength: number) => Math.min(LAVA_LEVELS - 1, Math.max(0, Math.floor((strength - 1) / 3)));
export const grassLevel = lavaLevel;

type Colors = Record<MaterialToken, string>;
type RGB = [number, number, number];

/** 1 on the edge of a hex of radius 1 (pointy-top, or flat-top when the board is turned), less inside. */
export const hexDist = (sx: number, sy: number) => {
  const { x, y } = toBoard(sx, sy);
  const ax = Math.abs(x);
  return Math.max(ax / (Math.sqrt(3) / 2), Math.abs(y) + ax / Math.sqrt(3));
};

// ---------- small helpers ----------

const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** A seeded pseudo-random stream (mulberry32). */
const stream = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Smooth value noise, 0..1, from a seed. */
const valueNoise = (seed: number) => {
  const h = (ix: number, iy: number) => {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
};
const fbm = (seed: number, octaves: number) => {
  const ns = Array.from({ length: octaves }, (_, i) => valueNoise(seed * 31 + i * 7919));
  return (x: number, y: number) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (const n of ns) {
      s += n(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  };
};

/** How far a point is outside the clear zone (0 inside it). */
const zoneDist = (x: number, y: number) => {
  const dx = Math.max(0, Math.abs(x) - CLEAR_ZONE.halfWidth);
  const dy = Math.max(0, CLEAR_ZONE.top - y, y - CLEAR_ZONE.bottom);
  return Math.hypot(dx, dy);
};

const LIGHT = (() => {
  const v = [-0.5, -0.62, 0.6];
  const n = Math.hypot(...v);
  return v.map((c) => c / n) as RGB;
})();

const pixelLoop = (size: number, fn: (x: number, y: number, k: number) => void) => {
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) fn(((i + 0.5) / size) * 2 * PHOTO_SPAN - PHOTO_SPAN, ((j + 0.5) / size) * 2 * PHOTO_SPAN - PHOTO_SPAN, (j * size + i) * 4);
};

// ---------- lava ----------

/**
 * Lava rock: a lumpy dark crust lit from the top-left (a slight dome, so it reads as 3D),
 * split by molten cracks and pools that glow brighter toward the edge. Returns one image
 * per glow level (0-2, more molten each time); the costly noise is worked out once and
 * shared by all levels. Nothing molten ever reaches the number or the marker.
 */
export const lavaImages = (size: number, variant: number, c: Colors): Uint8ClampedArray[] => {
  const outs = Array.from({ length: LAVA_LEVELS }, () => new Uint8ClampedArray(size * size * 4));
  const seed = 1000 + variant * 97;
  const rock = fbm(seed, 5);
  const fine = fbm(seed + 1, 3);
  const vein = fbm(seed + 2, 4);
  const pool = fbm(seed + 3, 4);
  const wobble = valueNoise(seed + 4);
  const crust = rgb(c.fireCrust);
  const deepC = rgb(c.fireDeep);
  const grey: RGB = [118, 112, 108];
  const ramp: [number, RGB][] = [
    [0, deepC],
    [0.45, rgb(c.fire)],
    [0.8, rgb(c.fireHot)],
    [1, rgb(c.fireTip)],
  ];
  const hot = (t: number): RGB => {
    for (let i = 1; i < ramp.length; i++) {
      const [t1, c1] = ramp[i]!;
      const [t0, c0] = ramp[i - 1]!;
      if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
    }
    return ramp[ramp.length - 1]![1];
  };
  // the height field, once, on a grid one pixel larger all round (for the slopes)
  const W = size + 2;
  const H = new Float32Array(W * W);
  const step = (2 * PHOTO_SPAN) / size;
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) {
      const x = (i - 0.5) * step - PHOTO_SPAN;
      const y = (j - 0.5) * step - PHOTO_SPAN;
      const r = Math.min(1, Math.hypot(x, y));
      H[j * W + i] = 0.28 * (1 - r * r) + 0.16 * rock(x * 2.6 + 11, y * 2.6 + 5) + 0.05 * fine(x * 9 + 3, y * 9 + 7);
    }
  // 1-3: dried, cooled lava with faint embers; 4-6: glowing cracks; 7-9: burning
  const crackW = [0.08, 0.15, 0.24];
  const poolT = [0.62, 0.54, 0.44];
  const glowCap = [0.13, 1, 1];
  const cooled = [0.22, 0, 0];
  const glows = Array.from({ length: LAVA_LEVELS }, () => new Float32Array(size * size));
  pixelLoop(size, (x, y, k) => {
    const hd = hexDist(x, y) + (wobble(x * 5, y * 5) - 0.5) * 0.03;
    const alpha = smooth(1.0, 0.975, hd);
    if (alpha <= 0) return;
    const pi = k / 4;
    const gi = (Math.floor(pi / size) + 1) * W + (pi % size) + 1;
    // the crust: lit like a lumpy 3D surface
    const h = H[gi]!;
    const nx = -(H[gi + 1]! - H[gi - 1]!) / (2 * step);
    const ny = -(H[gi + W]! - H[gi - W]!) / (2 * step);
    const nl = Math.hypot(nx, ny, 1);
    const diffuse = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / nl);
    const cavity = smooth(0.1, 0.32, h);
    let base = mix(scale(crust, 0.55 + 0.55 * diffuse), scale(grey, 0.35 + 0.65 * diffuse), 0.18 + 0.2 * diffuse);
    base = scale(base, 0.6 + 0.4 * cavity);
    // the edge of the tile falls away into shadow on the bottom-right
    const rim = smooth(0.82, 1, hd);
    base = scale(base, 1 - rim * (0.25 + 0.35 * clamp01((x + y) * 0.7 + 0.5)));
    // molten cracks (ridges of a noise field) and pools, hotter toward the edge, in the low spots
    const ridge = 1 - Math.abs(2 * vein(x * 1.7 + 2, y * 1.7 + 9) - 1);
    const pv = pool(x * 2.2 + 4, y * 2.2 + 1);
    const edge = 0.45 + 0.55 * smooth(0.3, 0.92, hd);
    // keep the number's area clear, with a ragged natural edge (never inside the zone itself)
    const fade = smooth(0.06, 0.26, zoneDist(x, y) + 0.1 * (wobble(x * 6 + 2, y * 6 + 5) - 0.5));
    const low = smooth(0.75, 0.4, cavity * 0.5 + 0.5 * smooth(0.05, 0.4, h));
    const spot = 0.4 + wobble(x * 3 + 9, y * 3) * 0.9;
    for (let lv = 0; lv < LAVA_LEVELS; lv++) {
      const cw = crackW[lv]!;
      const pt = poolT[lv]!;
      const crack = smooth(1 - cw, 1 - cw * 0.25, ridge);
      const pl = smooth(pt, pt + 0.08, pv);
      // burning lava (7-9) spills further in and over the lumps too
      let glow = Math.max(crack, pl) * (lv === 2 ? Math.max(edge, 0.75) : edge) * (lv === 2 ? Math.max(low, 0.55) : low) * fade;
      // a broken, patchy glow seeping up along the very edge
      glow = Math.max(glow, smooth(0.93, 1.0, hd) * smooth(0.55, 0.95, spot) * [0.08, 0.6, 0.75][lv]! * fade);
      glow = Math.min(glow, glowCap[lv]!);
      glows[lv]![pi] = glow;
      // heat tints the crust around the molten parts (barely, once it has cooled)
      const warm = Math.max(smooth(1 - cw * 3, 1, ridge), smooth(pt - 0.1, pt + 0.05, pv)) * edge * fade * (lv === 0 ? 0.4 : 1);
      // cooled lava is greyer and dustier
      let col = mix(mix(base, scale(grey, 0.3 + 0.6 * diffuse), cooled[lv]!), deepC, warm * 0.35);
      if (glow > 0.02) col = mix(col, hot(clamp01(glow * 1.1)), lv === 0 ? smooth(0.03, 0.13, glow) * 0.5 : smooth(0.02, 0.45, glow));
      const o = outs[lv]!;
      o[k] = col[0];
      o[k + 1] = col[1];
      o[k + 2] = col[2];
      o[k + 3] = Math.round(alpha * 255);
    }
  });
  // 7-9 burns: small flames licking up from the hottest spots near the edge
  const rnd = stream(seed + 9);
  const big = LAVA_LEVELS - 1;
  const o = outs[big]!;
  const g = glows[big]!;
  const tipC = rgb(c.fireTip);
  const hotC = rgb(c.fireHot);
  let lit = 0;
  for (let t = 0; t < 600 && lit < 12; t++) {
    const fx = (rnd() * 2 - 1) * 0.9;
    const fy = (rnd() * 2 - 1) * 0.9;
    const hd = hexDist(fx, fy);
    const fh = 0.2 + 0.14 * rnd(); // flame height, tile units
    const fw = 0.06 + 0.04 * rnd();
    // only on molten spots, and never reaching the number (flames rise up, so check the top too)
    if (hd < 0.55 || hd > 0.95 || zoneDist(fx, fy) < 0.16 || zoneDist(fx, fy - fh) < 0.16) continue;
    const gi = Math.floor((fy + PHOTO_SPAN) / step) * size + Math.floor((fx + PHOTO_SPAN) / step);
    if ((g[gi] ?? 0) < 0.6) continue;
    lit++;
    const lean = (rnd() - 0.5) * 0.06;
    const i0 = Math.floor((fx - fw - 0.05 + PHOTO_SPAN) / step);
    const i1 = Math.ceil((fx + fw + 0.05 + PHOTO_SPAN) / step);
    const j0 = Math.floor((fy - fh + PHOTO_SPAN) / step);
    const j1 = Math.ceil((fy + 0.02 + PHOTO_SPAN) / step);
    for (let j = Math.max(0, j0); j <= Math.min(size - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(size - 1, i1); i++) {
        const x = (i + 0.5) * step - PHOTO_SPAN;
        const y = (j + 0.5) * step - PHOTO_SPAN;
        const v = clamp01((fy - y) / fh); // 0 at the base, 1 at the tip
        if (y > fy + 0.01 || v >= 1) continue;
        // a teardrop: widest low down, tapering to a point that leans a little
        const half = fw * Math.sin(Math.PI * Math.min(1, 0.25 + v)) * (1 - v * 0.85);
        const dx = Math.abs(x - fx - lean * v);
        if (dx > half) continue;
        const a = smooth(half, half * 0.4, dx) * (1 - v * 0.3);
        const col = mix(hotC, tipC, smooth(0.1, 0.9, 1 - dx / Math.max(half, 1e-6)) * (1 - v * 0.5));
        const k = (j * size + i) * 4;
        const old: RGB = [o[k]!, o[k + 1]!, o[k + 2]!];
        const m = mix(old, col, a);
        o[k] = m[0];
        o[k + 1] = m[1];
        o[k + 2] = m[2];
        o[k + 3] = Math.max(o[k + 3]!, Math.round(a * 255));
      }
  }
  return outs;
};
/** One glow level of a lava variant (see lavaImages). */
export const lavaImage = (size: number, variant: number, level: number, c: Colors) => lavaImages(size, variant, c)[level]!;

// ---------- grass ----------

/**
 * A flat, dense lawn seen from above, like a close photo of grass: a shadowy under-layer,
 * thousands of fine blades pointing every which way (darker at the base, sunlit yellow-green
 * at the tips), lighter and darker patches instead of one big highlight, and blades spilling
 * out past the edge so neighbouring tiles overlap into one lawn. Now and then a tiny yellow
 * or red flower or a seed puff, never on the number (which also gets a light halo).
 */
export const grassImage = (size: number, variant: number, level: number, c: Colors): Uint8ClampedArray => {
  const n = size * size;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const A = new Float32Array(n);
  const seed = 5000 + variant * 131;
  const rnd = stream(seed);
  const extra = stream(seed + 17 + level * 7);
  const patches = fbm(seed + 1, 4);
  // 1-3: short, plain lawn; 4-6: fuller, a few flowers and clover; 7-9: bushy, flowers and plants
  const bushy = [0.75, 1, 1.3][level] ?? 1;
  const deep = rgb(c.mossDeep);
  const base = rgb(c.moss);
  const top = rgb(c.mossTop);
  const tip = rgb(c.mossTuft);
  const px = size / (2 * PHOTO_SPAN); // pixels per tile unit
  const toPx = (u: number) => (u + PHOTO_SPAN) * px - 0.5;
  // lighter and darker patches across the lawn (no single highlight, so no bump)
  const patch = (x: number, y: number) => patches(x * 2.2 + 3, y * 2.2 + 8) - 0.5;
  // the under-layer: shadowy grass between the blades
  pixelLoop(size, (x, y, k) => {
    const a = smooth(1.0, 0.95, hexDist(x, y));
    if (a <= 0) return;
    const i = k / 4;
    const col = scale(mix(deep, base, 0.3 + 0.5 * patch(x, y) + 0.25 * patches(x * 7 + 1, y * 7 + 2)), 0.88);
    R[i] = col[0];
    G[i] = col[1];
    B[i] = col[2];
    A[i] = a;
  });
  // a soft dot of colour `col` at pixel (fx, fy), blended over what is there
  const put = (X: number, Y: number, w: number, col: RGB) => {
    if (X < 0 || Y < 0 || X >= size || Y >= size) return;
    const i = Y * size + X;
    const t = w > 1 ? 1 : w;
    R[i] = R[i]! + (col[0] - R[i]!) * t;
    G[i] = G[i]! + (col[1] - G[i]!) * t;
    B[i] = B[i]! + (col[2] - B[i]!) * t;
    A[i] = A[i]! + (1 - A[i]!) * t;
  };
  const dot = (fx: number, fy: number, col: RGB, alpha: number) => {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const a = alpha * 1.6;
    put(ix, iy, (1 - tx) * (1 - ty) * a, col);
    put(ix + 1, iy, tx * (1 - ty) * a, col);
    put(ix, iy + 1, (1 - tx) * ty * a, col);
    put(ix + 1, iy + 1, tx * ty * a, col);
  };
  // blades all over the hex, pointing every which way (a lawn seen from above); at the edge
  // they lean outward and run longer, spilling over onto the neighbours
  const count = Math.round(size * size * 0.3);
  const blades: { x: number; y: number; len: number; ang: number; bend: number; hue: number; shade: number }[] = [];
  for (let b = 0; b < count; b++) {
    const x = (rnd() * 2 - 1) * 0.98;
    const y = (rnd() * 2 - 1) * 1.0;
    const hd = hexDist(x, y);
    if (hd > 0.99) continue;
    const outward = Math.atan2(x, -y); // 0 = straight up
    const edge = smooth(0.6, 1, hd);
    const any = (rnd() - 0.5) * Math.PI * 2;
    const ang = any * (1 - edge) + (outward + (rnd() - 0.5) * 1.1) * edge;
    let len = (0.06 + 0.08 * rnd() + 0.12 * edge * rnd()) * bushy;
    if (inClearZone(x, y) || zoneDist(x, y) < 0.08) len *= 0.6;
    blades.push({ x, y, len, ang, bend: (rnd() - 0.5) * 0.7, hue: rnd(), shade: rnd() });
  }
  // lower blades over higher ones: a little depth, like a photo taken from slightly above
  blades.sort((a, b) => a.y - b.y);
  for (const bl of blades) {
    const sx = Math.sin(bl.ang);
    const cy = -Math.cos(bl.ang);
    const light = 0.88 + 0.35 * patch(bl.x, bl.y) + (bl.shade - 0.5) * 0.22;
    // most tips fresh green, some yellow-green (sunlit), a few pale
    const tipCol = bl.hue > 0.82 ? mix(top, tip, (bl.hue - 0.82) * 5) : mix(base, top, 0.35 + bl.hue * 0.8);
    const steps = Math.max(3, Math.ceil(bl.len * px * 1.4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // a gentle curve, the bend growing toward the tip
      const bx = bl.x + sx * bl.len * t - cy * bl.bend * bl.len * t * t;
      const by = bl.y + cy * bl.len * t + sx * bl.bend * bl.len * t * t;
      if (hexDist(bx, by) > 1.14) break;
      const col = scale(mix(mix(deep, base, 0.55), tipCol, t ** 0.7), light);
      dot(toPx(bx), toPx(by), col, (1 - t * 0.3) * 0.9);
    }
  }
  // a spot for a flower or plant: inside the hex, never on the number
  const spot = () => {
    for (let t = 0; t < 30; t++) {
      const x = (extra() * 2 - 1) * 0.82;
      const y = (extra() * 2 - 1) * 0.82;
      if (hexDist(x, y) < 0.85 && zoneDist(x, y) > 0.15) return { x, y };
    }
    return null;
  };
  // clover and small broad-leaved plants (more on stronger tiles): a deep, bluer green
  // clover is a cooler, bluer green than grass
  const leafC: RGB = [28, 108, 80];
  const leafLight: RGB = [52, 142, 104];
  const plants = [0, 2, 5][level] ?? 0;
  for (let q = 0; q < plants; q++) {
    const sp = spot();
    if (!sp) continue;
    const clover = extra() < 0.6;
    const leaves = clover ? 3 : 5 + Math.floor(extra() * 3);
    const turn = extra() * Math.PI * 2;
    for (let l = 0; l < leaves; l++) {
      const a = turn + (l / leaves) * Math.PI * 2;
      const len = clover ? 0.055 : 0.08 + 0.04 * extra();
      const wide = clover ? 0.038 : 0.026;
      for (let t = 0; t <= 1; t += 0.12) {
        const cx = sp.x + Math.sin(a) * len * (clover ? 0.9 : t);
        const cy = sp.y - Math.cos(a) * len * (clover ? 0.9 : t);
        const r = clover ? wide * px : wide * px * Math.sin(Math.PI * Math.max(0.15, t));
        for (let rr = 0; rr <= r; rr += 0.5)
          for (let k = 0; k < 10; k++) dot(toPx(cx) + Math.cos(k * 0.63) * rr, toPx(cy) + Math.sin(k * 0.63) * rr, rr > r * 0.6 ? leafLight : leafC, 0.6);
        if (clover) break;
      }
    }
  }
  // now and then a tiny flower: yellow, red or a white seed puff; more on stronger tiles
  const flowers = Math.max(0, Math.floor(rnd() * 3) - 1 + [0, 1, 4][level]!);
  for (let f = 0; f < flowers; f++) {
    let fx = 0;
    let fy = 0;
    for (let t = 0; t < 20; t++) {
      fx = (extra() * 2 - 1) * 0.8;
      fy = (extra() * 2 - 1) * 0.8;
      if (hexDist(fx, fy) < 0.85 && zoneDist(fx, fy) > 0.12) break;
    }
    if (zoneDist(fx, fy) <= 0.12) continue;
    const kind = (variant + f) % 3;
    const col: RGB = kind === 0 ? [240, 204, 64] : kind === 1 ? [205, 38, 34] : [246, 244, 236];
    const rad = (kind === 2 ? 0.04 : 0.03) * px;
    for (let a = 0; a < 18; a++) {
      const ang = (a / 18) * Math.PI * 2;
      for (let rr = 0; rr <= rad; rr += 0.5) dot(toPx(fx) + Math.cos(ang) * rr, toPx(fy) + Math.sin(ang) * rr, col, kind === 2 ? 0.55 : 0.9);
    }
    // a dark eye in the middle of the petals
    if (kind < 2) dot(toPx(fx), toPx(fy), kind === 0 ? [150, 110, 20] : [40, 16, 14], 0.8);
  }
  const out = new Uint8ClampedArray(n * 4);
  pixelLoop(size, (x, y, k) => {
    const i = k / 4;
    const a = A[i]!;
    out[k] = R[i]!;
    out[k + 1] = G[i]!;
    out[k + 2] = B[i]!;
    out[k + 3] = a < 0.02 || hexDist(x, y) > 1.16 ? 0 : Math.round(Math.min(1, a) * 255);
  });
  return out;
};
