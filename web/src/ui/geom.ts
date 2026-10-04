// Shared hex geometry and SVG helpers for the board, the materials and the lab.
import { parseKey } from '../../../src/engine/index.js';
import { toScreen } from '../logic/orient.js';
import type { ThemeStyle } from '../logic/themes.js';
import type { MaterialLook } from '../logic/materials.js';

/** Used when no look is given (tests, the lab): full material detail. */
export const FULL_LOOK: MaterialLook = { intensity: 1, textures: true, facets: true, cracks: true, motion: true, depth: 3, rim: 0.4, shadow: 0.5 };

let noiseUrl: string | null = null;
/**
 * A small grey noise tile (64x64), drawn once on a canvas and reused by every textured
 * thing (rock grain, moss and fire). Deterministic: the same specks every time.
 */
export const noiseTile = (): string => {
  if (noiseUrl !== null) return noiseUrl;
  noiseUrl = '';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    if (!x) return noiseUrl;
    const img = x.createImageData(64, 64);
    let seed = 20261002;
    for (let i = 0; i < 64 * 64; i++) {
      seed = (seed * 16807) % 2147483647;
      const v = seed / 2147483647;
      const light = v > 0.5;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = light ? 255 : 0;
      img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 110);
    }
    x.putImageData(img, 0, 0);
    noiseUrl = c.toDataURL();
  } catch {
    /* no canvas (tests): no grain */
  }
  return noiseUrl;
};

export const NS = 'http://www.w3.org/2000/svg';
export const S = 30; // hex radius in board units
export const SQ3 = Math.sqrt(3);

export type Attrs = Record<string, string | number>;
export const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

/** A hex's centre on screen (board orientation applied: logic/orient.ts). */
export const centerOf = (key: string) => {
  const c = parseKey(key);
  return toScreen(S * SQ3 * (c.q + c.r / 2), S * 1.5 * c.r);
};

export const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

export const cornerPts = (key: string, size: number, jitter = 0) => {
  const { x, y } = centerOf(key);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    const r = size * (1 + (jitter ? (hash(`${key}:${i}`) - 0.5) * jitter : 0));
    const o = toScreen(r * Math.cos(a), r * Math.sin(a));
    return [x + o.x, y + o.y] as const;
  });
};
export const polyPoints = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** A hex outline as a path: straight (flat, chunky) or soft and slightly uneven (organic). */
export const hexPath = (key: string, size: number, shape: ThemeStyle['tileShape']) => {
  if (shape !== 'organic') return `M${polyPoints(cornerPts(key, size)).replace(/ /g, 'L')}Z`;
  const pts = cornerPts(key, size, 0.12);
  const mid = (a: readonly [number, number], b: readonly [number, number], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = '';
  for (let i = 0; i < 6; i++) {
    const p = pts[i]!;
    const prev = pts[(i + 5) % 6]!;
    const next = pts[(i + 1) % 6]!;
    const [ax, ay] = mid(prev, p, 0.78);
    const [bx, by] = mid(p, next, 0.22);
    d += `${i === 0 ? 'M' : 'L'}${ax!.toFixed(1)},${ay!.toFixed(1)}Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${bx!.toFixed(1)},${by!.toFixed(1)}`;
  }
  return `${d}Z`;
};


/** A small four-point spark. */
export const star = (x: number, y: number, r: number) =>
  `M${x},${y - r}L${x + r * 0.28},${y - r * 0.28}L${x + r},${y}L${x + r * 0.28},${y + r * 0.28}L${x},${y + r}L${x - r * 0.28},${y + r * 0.28}L${x - r},${y}L${x - r * 0.28},${y - r * 0.28}Z`;
