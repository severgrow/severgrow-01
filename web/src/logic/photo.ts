// Photo-like materials, painted in code (no downloaded images): a dense, fluffy grass ball
// for my tiles and lumpy lava rock with molten cracks for the bot's. Each is painted once,
// pixel by pixel, as a small square image of one tile; the board then shows it per tile.
// Pure and deterministic (seeded noise, no randomness): the same variant always gives the
// same pixels. Tested in web/tests/photo.test.ts.
//
// Image space: the square covers -PHOTO_SPAN..PHOTO_SPAN tile units on both axes (tile
// radius 1, pointy-top hex, y down), so the grass fringe can poke out past the edge.
import { CLEAR_ZONE, inClearZone } from './materials.js';
import type { MaterialToken } from './materials.js';

export const PHOTO_SPAN = 1.2;
export const GRASS_VARIANTS = 6;
export const LAVA_VARIANTS = 4;
export const LAVA_LEVELS = 3;
/** Glow level for a strength: 1-3 low, 4-6 middle, 7-9 high. */
export const lavaLevel = (strength: number) => Math.min(LAVA_LEVELS - 1, Math.max(0, Math.floor((strength - 1) / 3)));

type Colors = Record<MaterialToken, string>;
type RGB = [number, number, number];

/** 1 on the edge of a pointy-top hex of radius 1, less inside. */
export const hexDist = (x: number, y: number) => {
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
  const crackW = [0.12, 0.15, 0.18];
  const poolT = [0.57, 0.54, 0.51];
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
    const fade = smooth(0.02, 0.14, zoneDist(x, y));
    const low = smooth(0.75, 0.4, cavity * 0.5 + 0.5 * smooth(0.05, 0.4, h));
    const spot = 0.4 + wobble(x * 3 + 9, y * 3) * 0.9;
    for (let lv = 0; lv < LAVA_LEVELS; lv++) {
      const cw = crackW[lv]!;
      const pt = poolT[lv]!;
      const crack = smooth(1 - cw, 1 - cw * 0.25, ridge);
      const pl = smooth(pt, pt + 0.08, pv);
      let glow = Math.max(crack, pl) * edge * low * fade;
      // a broken, patchy glow seeping up along the very edge
      glow = Math.max(glow, smooth(0.93, 1.0, hd) * smooth(0.55, 0.95, spot) * (0.45 + 0.15 * lv) * fade);
      // heat tints the crust around the molten parts
      const warm = Math.max(smooth(1 - cw * 3, 1, ridge), smooth(pt - 0.1, pt + 0.05, pv)) * edge * fade;
      let col = mix(base, deepC, warm * 0.35);
      if (glow > 0.02) col = mix(col, hot(clamp01(glow * 1.1)), smooth(0.02, 0.45, glow));
      const o = outs[lv]!;
      o[k] = col[0];
      o[k + 1] = col[1];
      o[k + 2] = col[2];
      o[k + 3] = Math.round(alpha * 255);
    }
  });
  return outs;
};
/** One glow level of a lava variant (see lavaImages). */
export const lavaImage = (size: number, variant: number, level: number, c: Colors) => lavaImages(size, variant, c)[level]!;

// ---------- grass ----------

/**
 * A dense, fluffy ball of grass: a dark under-layer, thousands of fine blades drawn back to
 * front (darker at the base, sunlit at the tips), leaning outward at the edge so the outline
 * is soft, a few tiny dandelions and seed puffs, all shaded as a dome lit from the top-left.
 * Over the number the blades are shorter and calmer (the number also has a light halo).
 */
export const grassImage = (size: number, variant: number, c: Colors): Uint8ClampedArray => {
  const n = size * size;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const A = new Float32Array(n);
  const seed = 5000 + variant * 131;
  const rnd = stream(seed);
  const clumps = fbm(seed + 1, 4);
  const deep = rgb(c.mossDeep);
  const base = rgb(c.moss);
  const top = rgb(c.mossTop);
  const tip = rgb(c.mossTuft);
  const px = size / (2 * PHOTO_SPAN); // pixels per tile unit
  const toPx = (u: number) => (u + PHOTO_SPAN) * px - 0.5;
  const dome = (x: number, y: number) => {
    const r2 = Math.min(0.98, x * x + y * y);
    const nz = Math.sqrt(1 - r2);
    return Math.max(0, x * LIGHT[0] + y * LIGHT[1] + nz * LIGHT[2]);
  };
  // the sunlit top of the dome, where the number sits: a soft oval, a little lighter and calmer
  const calm = (x: number, y: number) => 1 - smooth(0.55, 1.05, Math.hypot(x / 0.5, (y - 0.08) / 0.72));
  // the under-layer: shadowy grass between the blades
  pixelLoop(size, (x, y, k) => {
    const hd = hexDist(x, y);
    const a = smooth(1.0, 0.96, hd);
    if (a <= 0) return;
    const i = k / 4;
    const col = scale(mix(deep, base, 0.1 + 0.35 * clumps(x * 4 + 3, y * 4 + 8) + 0.5 * calm(x, y)), 0.4 + 0.55 * dome(x, y) + 0.25 * calm(x, y));
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
  // blades: placed all over the hex, sorted top to bottom so nearer blades overlap
  const count = Math.round(size * size * 0.27);
  const blades: { x: number; y: number; len: number; ang: number; bend: number; hue: number }[] = [];
  for (let b = 0; b < count; b++) {
    const x = (rnd() * 2 - 1) * 0.98;
    const y = (rnd() * 2 - 1) * 1.0;
    const hd = hexDist(x, y);
    if (hd > 0.99) continue;
    const outward = Math.atan2(x, -y); // 0 = straight up
    // upright in the middle, leaning out at the edge (the fluffy outline)
    const lean = smooth(0.45, 1, hd);
    const ang = outward * lean * 0.75 + (rnd() - 0.5) * 0.8 * (1 - lean * 0.4);
    let len = 0.07 + 0.09 * rnd() + 0.08 * lean;
    if (inClearZone(x, y) || zoneDist(x, y) < 0.08) len *= 0.55;
    blades.push({ x, y, len, ang, bend: (rnd() - 0.5) * 0.6, hue: rnd() });
  }
  blades.sort((a, b) => a.y - b.y);
  for (const bl of blades) {
    const sx = Math.sin(bl.ang);
    const cy = -Math.cos(bl.ang);
    const cl = calm(bl.x, bl.y);
    const light = 0.42 + 0.68 * dome(bl.x, bl.y) + 0.22 * cl;
    const tipCol = bl.hue > 0.85 ? mix(top, tip, (bl.hue - 0.85) * 4) : mix(base, top, bl.hue * 1.1);
    const steps = Math.max(3, Math.ceil(bl.len * px * 1.4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // a gentle curve, the bend growing toward the tip
      const bx = bl.x + sx * bl.len * t - cy * bl.bend * bl.len * t * t;
      const by = bl.y + cy * bl.len * t + sx * bl.bend * bl.len * t * t;
      if (hexDist(bx, by) > 1.14) break;
      const col = scale(mix(mix(deep, base, 0.35 + 0.55 * cl), tipCol, t ** 0.7), light);
      dot(toPx(bx), toPx(by), col, (1 - t * 0.35) * 0.9);
    }
  }
  // a few tiny dandelions and seed puffs (some tiles have none), never on the number
  const flowers = Math.floor(rnd() * 4);
  for (let f = 0; f < flowers; f++) {
    let fx = 0;
    let fy = 0;
    for (let t = 0; t < 20; t++) {
      fx = (rnd() * 2 - 1) * 0.75;
      fy = (rnd() * 2 - 1) * 0.75;
      if (hexDist(fx, fy) < 0.8 && zoneDist(fx, fy) > 0.12) break;
    }
    if (zoneDist(fx, fy) <= 0.12) continue;
    const bloom = rnd() < 0.5;
    const col: RGB = bloom ? [238, 206, 72] : [246, 244, 236];
    const rad = (bloom ? 0.035 : 0.045) * px;
    for (let a = 0; a < 18; a++) {
      const ang = (a / 18) * Math.PI * 2;
      for (let rr = 0; rr <= rad; rr += 0.5) dot(toPx(fx) + Math.cos(ang) * rr, toPx(fy) + Math.sin(ang) * rr, col, bloom ? 0.9 : 0.55);
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  pixelLoop(size, (x, y, k) => {
    const i = k / 4;
    const col: RGB = [R[i]!, G[i]!, B[i]!];
    const a = A[i]!;
    out[k] = col[0];
    out[k + 1] = col[1];
    out[k + 2] = col[2];
    out[k + 3] = a < 0.02 || hexDist(x, y) > 1.16 ? 0 : Math.round(Math.min(1, a) * 255);
  });
  return out;
};
