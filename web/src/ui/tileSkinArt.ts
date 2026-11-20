// THE SIX SKINS, PORTED FROM CSS TO THE BOARD'S OWN PAINT PATH (owner's design, 2026-11-20).
//
// The reference is docs/skins-preview.html in the design worktree: a contact sheet of CSS
// backgrounds on a hexagon-shaped div. The board does not paint divs — every cell is a `<path>`
// (its flat territory colour) plus a picture in an SVG — so the recipes are re-expressed as SVG
// paint servers and shapes, which is both cheaper and sharper than anything else available:
//
//   linear-gradient(...)            -> <linearGradient>, using CSS's own gradient-line geometry
//   radial-gradient(... at x y)     -> <radialGradient> + gradientTransform (an ellipse)
//   repeating-linear/radial-...     -> the same gradient with its stops written out N times
//   conic-gradient(from a, ...)     -> explicit sectors (a pointy-top hex is THREE rhombi at 120°,
//                                      so Console's "cube" is three polygons, not a gradient)
//   background-position/size         -> a rect of that size, a <pattern> for a dot field
//
// NO IMAGE FILES, NO FILTERS, NO CANVAS, NO PER-FRAME WORK. Each family is one <g> per variant,
// built once into the board's own <defs> and painted per cell with <use>. Vector, so it is exact
// at DPR 2-3. (A data-URI SVG drawn through <image> was measured first and rejected: Chromium
// rasterises an SVG image at its INTRINSIC size, so 1 px scanlines came out as grey mush.)
//
// THE ONE ADAPTATION THAT MATTERS. The preview's hexagon points up/down; the product board is fixed
// to the "flat" family, whose hexes point left/right (`setFixedBoardOrient('flat')`, main.ts). Every
// recipe is therefore AUTHORED in the preview's own frame — the board's hex at S = 30, points up,
// √3·30 by 60 — and turned a quarter when it is placed, so every angle and proportion survives.
// The cost: a recipe's "up" becomes screen-left, so Console's lit cube face lands on the left —
// which is the side the board's light comes from anyway.
import { el } from './geom.js';
import { TILE_SKIN_GROUNDS } from './tileSkins.js';
import type { TileSkinId } from './tileSkins.js';

/** The art frame: the board's hexagon at S = 30 in its pointy-top orientation. */
export const ART_W = Math.sqrt(3) * 30;
export const ART_H = 60;
const CX = ART_W / 2;
const CY = ART_H / 2;
/**
 * One CSS pixel at the board's tile: 46 px is the tile's SHORT axis, which in this frame is the
 * width — the same 46 the preview's `--u` is built from.
 */
const U = ART_W / 46;
const u = (px: number): number => px * U;
const W = (pct: number): number => (ART_W * pct) / 100;
const H = (pct: number): number => (ART_H * pct) / 100;

// ---- colour ------------------------------------------------------------------------------------

type RGBA = readonly [number, number, number, number];

const parseColour = (c: string): RGBA => {
  if (c === 'transparent') return [0, 0, 0, 0];
  // The helpers compose (a mixed colour can be mixed again, with alpha), so both forms parse.
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(c.trim());
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(c.trim());
  if (!m) throw new Error(`tile skin: unsupported colour "${c}"`);
  const h = m[1]!;
  const g = (i: number, len: number) => parseInt(h.slice(i, i + len), 16);
  if (h.length === 3) return [g(0, 1) * 17, g(1, 1) * 17, g(2, 1) * 17, 1];
  if (h.length === 6) return [g(0, 2), g(2, 2), g(4, 2), 1];
  return [g(0, 2), g(2, 2), g(4, 2), g(6, 2) / 255];
};
const css = (c: RGBA): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+c[3].toFixed(3)})`;

/** `color-mix(in srgb, a wa, b)`: premultiplied sRGB, exactly what CSS does. */
export const mix = (a: string, wa: number, b: string): string => {
  const A = parseColour(a);
  const B = parseColour(b);
  const aa = A[3] * wa;
  const ab = B[3] * (1 - wa);
  const total = aa + ab;
  if (total < 1e-6) return 'rgba(0,0,0,0)';
  return css([
    (A[0] * aa + B[0] * ab) / total, (A[1] * aa + B[1] * ab) / total, (A[2] * aa + B[2] * ab) / total, total,
  ]);
};

/** A colour at a given alpha (over whatever is under it). */
export const alpha = (c: string, a: number): string => {
  const C = parseColour(c);
  return css([C[0], C[1], C[2], a]);
};

/** `color-mix(in srgb, c p, transparent)`. */
const fade = (c: string, p: number): string => alpha(c, parseColour(c)[3] * p);

// ---- the spec ----------------------------------------------------------------------------------

type Pt = readonly [number, number];
type Stop = readonly [number, string];
export type Paint =
  | { readonly t: 'flat'; readonly c: string }
  | { readonly t: 'lin'; readonly a: number; readonly stops: readonly Stop[] }
  | { readonly t: 'rad'; readonly at: Pt; readonly r: Pt; readonly stops: readonly Stop[] };
export type Shape =
  | { readonly t: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly p: Paint }
  | { readonly t: 'poly'; readonly pts: readonly Pt[]; readonly p: Paint }
  | { readonly t: 'circle'; readonly at: Pt; readonly r: number; readonly p: Paint }
  /** A dot field: one dot per `pitch` square, offset by `at` (CSS background-position). */
  | { readonly t: 'dots'; readonly pitch: number; readonly r: number; readonly at: Pt; readonly c: string };

/**
 * One family's art for one variant. The four groups are the preview's four paint layers, in the
 * CSS's own z-order: `.f` (the rim), `.f::before` (the face), `.f::after` (the extra move) and
 * `.tx` (the vintage texture on top). `rim` is the face's inset, exactly like the preview's `--rim`.
 */
export type SkinArt = {
  readonly rim: number;
  readonly hex: readonly Shape[];
  readonly face: readonly Shape[];
  readonly above: readonly Shape[];
  readonly whole: readonly Shape[];
  /** Opacity of the `whole` group (the preview's `--vop`). */
  readonly wash?: number;
};

const flat = (c: string): Paint => ({ t: 'flat', c });
const lin = (a: number, stops: readonly Stop[]): Paint => ({ t: 'lin', a, stops });
const rad = (at: Pt, r: Pt, stops: readonly Stop[]): Paint => ({ t: 'rad', at, r, stops });
const rect = (x: number, y: number, w: number, h: number, p: Paint): Shape => ({ t: 'rect', x, y, w, h, p });
const full = (p: Paint): Shape => rect(0, 0, ART_W, ART_H, p);
const poly = (pts: readonly Pt[], p: Paint): Shape => ({ t: 'poly', pts, p });
const circle = (at: Pt, r: number, p: Paint): Shape => ({ t: 'circle', at, r, p });

/** CSS's gradient-line length for a box this size at `angle` degrees. */
const lineLength = (angle: number): number => {
  const a = (angle * Math.PI) / 180;
  return Math.abs(ART_W * Math.sin(a)) + Math.abs(ART_H * Math.cos(a));
};

/**
 * A repeating gradient, written out as explicit stops: `cells` is one period as
 * [fraction of the period, colour] pairs. This is how every `repeating-*` in the preview is ported
 * (an SVG gradient has no `repeating-` form), and it keeps every repeated layer one paint server —
 * no per-stripe elements.
 */
const bands = (angle: number, period: number, cells: readonly (readonly [number, string])[], phase = 0): Paint => {
  const length = lineLength(angle);
  const out: [number, string][] = [];
  const first = Math.floor((-phase) / period) - 1;
  const last = Math.ceil((length - phase) / period) + 1;
  for (let i = first; i <= last; i++) {
    for (const [f, c] of cells) out.push([(phase + i * period + f * period) / length, c]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const stops: Stop[] = [];
  for (const [o, c] of out) {
    const p = Math.min(1, Math.max(0, o));
    if (stops.length && stops[stops.length - 1]![0] === p) continue;
    stops.push([p, c]);
  }
  if (stops[0]![0] > 0) stops.unshift([0, cells[0]![1]]);
  if (stops[stops.length - 1]![0] < 1) stops.push([1, cells[0]![1]]);
  return lin(angle, stops);
};

/** The hexagon's six corners at a box inset, pointy-top (the board's own angles). */
const hexPts = (inset = 0): Pt[] => {
  const x0 = inset;
  const x1 = ART_W - inset;
  const y0 = inset;
  const y1 = ART_H - inset;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  return [
    [cx, y0], [x1, y0 + h / 4], [x1, y0 + (3 * h) / 4], [cx, y1], [x0, y0 + (3 * h) / 4], [x0, y0 + h / 4],
  ];
};
const fullHex = (p: Paint, inset = 0): Shape => poly(hexPts(inset), p);

/** Where a ray from `at` at a CSS conic angle (0 = up, clockwise) meets the hexagon's boundary. */
const rayHit = (pts: readonly Pt[], at: Pt, angleDeg: number): Pt => {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  let best = Infinity;
  let hit: Pt = at;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p[0] - at[0]) * ey - (p[1] - at[1]) * ex) / den;
    const s = ((p[0] - at[0]) * dy - (p[1] - at[1]) * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) {
      best = t;
      hit = [at[0] + dx * t, at[1] + dy * t];
    }
  }
  return hit;
};

/**
 * One conic sector as a polygon. `pad` widens it by that many degrees each side, so adjacent
 * sectors overlap instead of meeting on an anti-aliased edge: the only way to paint a CSS conic in
 * SVG without hairline seams. It is under half a degree — invisible at 46 px.
 */
const sectorPoly = (from: number, to: number, at: Pt = [CX, CY], inset = 0, pad = 0.35): Pt[] => {
  const hex = hexPts(inset);
  const pts: Pt[] = [at];
  const a0 = from - pad;
  const a1 = to + pad;
  for (let a = a0; a < a1 - 1e-9; a += 15) pts.push(rayHit(hex, at, a));
  pts.push(rayHit(hex, at, a1));
  return pts;
};

/** Hard-stopped 120° sectors covering the hexagon — the preview's isometric "cube". */
const cube = (from: number, cols: readonly [string, string, string], inset = 0): Shape[] => [
  fullHex(flat(cols[0]), inset),
  poly(sectorPoly(from + 120, from + 240, [CX, CY], inset), flat(cols[1])),
  poly(sectorPoly(from + 240, from + 360, [CX, CY], inset), flat(cols[2])),
];

/** A conic split into equal sectors (Hypnosis' iridescent hue wheel). */
const wheel = (at: Pt, colours: readonly string[], cursor: number): Shape[] => {
  const span = 360 / colours.length;
  const out: Shape[] = [fullHex(flat(colours[0]!))];
  for (let i = 1; i < colours.length; i++) {
    out.push(poly(sectorPoly(cursor + span * i, cursor + span * (i + 1), at), flat(colours[i]!)));
  }
  return out;
};

// =================================================================================================
// 01 · CONSOLE — nine pastel grounds, an isometric cube, a worn CRT on top
// =================================================================================================

const CONSOLE_TILES = [
  { mid: '#c6d9cd', mv: 'cube', vp: 0 },
  { mid: '#bdd2c5', mv: 'corridor', vp: 1 },
  { mid: '#b4cabc', mv: 'flip', vp: 2 },
  { mid: '#cfc4d9', mv: 'terrace', vp: 3 },
  { mid: '#c6bbd4', mv: 'plateau', vp: 1 },
  { mid: '#bdb1cb', mv: 'wire', vp: 4 },
  { mid: '#e7dcc4', mv: 'inverted', vp: 2 },
  { mid: '#ded0b3', mv: 'cube', vp: 5 },
  { mid: '#d2c1a2', mv: 'terrace', vp: 0 },
] as const;

const consoleVintage = (vp: number): Shape[] => [
  // phosphor warmth near the top (CSS: 120% x 80% at 50% 6%, 8% cream)
  full(rad([CX, H(6)], [W(60), H(40)], [[0, '#fff4cf1f'], [0.62, 'transparent']])),
  // vignette from 54% out — what makes it look like a lit tube
  full(rad([CX, CY], [W(75), H(60)], [[0.54, 'transparent'], [1, '#2a24184d']])),
  // 1 px on / 1 px off scanlines, phase moved per variant ("printed, not stamped")
  full(bands(0, u(2), [[0, '#221f1424'], [0.5, 'transparent']], u(vp))),
];

const consoleArt = (mid: string, mv: string, vp: number, home: boolean): SkinArt => {
  const hi = mix(mid, 0.66, '#ffffff');
  const lo = mix(mid, 0.78, '#5f5c57');
  const rim1 = mix(hi, 0.88, '#ffffff');
  const rim2 = mix(lo, 0.74, '#2f2d2a');
  const rim = u(1.2);
  const base = fullHex(lin(158, [[0, rim1], [1, rim2]]));
  const vintage = consoleVintage(vp);

  if (home) {
    // A cube inside a cube: inset 14%, its own conic, a dark ring, a pastel bloom, the CRT on top.
    const inset = W(14);
    return {
      rim,
      hex: [base],
      face: [
        fullHex(flat(mix(rim2, 0.76, '#000000')), inset - u(1.5)),
        ...cube(300, ['#ffffff', hi, mid], inset),
      ],
      above: [full(rad([CX, CY], [W(60), H(60)], [[0, fade(mid, 0.4)], [1, 'transparent']]))],
      whole: vintage,
      wash: 0.9,
    };
  }

  let face: Shape[] = [full(lin(180, [[0, '#ffffff24'], [0.3, 'transparent']]))];
  let above: Shape[] = [];
  if (mv === 'terrace') {
    // Seven stacked bands instead of a cube: a terrace seen edge on.
    face = [
      full(lin(180, [[0, '#ffffff1f'], [0.26, 'transparent']])),
      full(lin(180, [
        [0, hi], [0.13, hi], [0.13, lo], [0.28, lo], [0.28, mid], [0.44, mid],
        [0.44, hi], [0.57, hi], [0.57, mid], [0.73, mid], [0.73, lo], [0.87, lo], [0.87, hi], [1, hi],
      ])),
    ];
    above = Array.from({ length: 8 }, (_, i) =>
      poly(sectorPoly(i * 45, (i + 1) * 45, [CX, CY], rim, 0), flat(i % 2 ? 'transparent' : fade(lo, 0.45))));
  } else {
    if (mv === 'corridor') {
      const cols = [hi, mid, hi, lo, hi, mid];
      face.push(fullHex(flat(cols[0]!)));
      for (let i = 1; i < 6; i++) face.push(poly(sectorPoly(i * 60, (i + 1) * 60), flat(cols[i]!)));
      face.push(full(rad([CX, CY], [W(36), H(36)], [[0, mix(lo, 0.8, '#3a3833')], [0.07, mix(lo, 0.8, '#3a3833')], [0.34, 'transparent']])));
    } else if (mv === 'flip') {
      const cols = [hi, lo, hi, mid, hi, lo, hi, mid, hi, lo, hi, mid];
      face.push(fullHex(flat(cols[0]!)));
      for (let i = 1; i < 12; i++) face.push(poly(sectorPoly(i * 30, (i + 1) * 30), flat(cols[i]!)));
    } else if (mv === 'inverted') {
      face.push(...cube(120, [hi, lo, mid]));
    } else {
      face.push(...cube(300, [hi, lo, mid]));
    }
    if (mv === 'plateau') {
      // A raised cube: its own hexagon inset 19%, a dark ring, then the three faces.
      const inset = W(19);
      const dx = W(5.5);
      const dy = -W(3.5);
      const shift = (s: Shape): Shape => (s.t === 'poly' ? poly(s.pts.map(([x, y]) => [x + dx, y + dy] as Pt), s.p) : s);
      above = [
        fullHex(flat(mix(rim2, 0.7, '#000000')), inset - u(1.2)),
        ...cube(300, ['#ffffff', mid, lo], inset),
      ].map(shift);
    } else if (mv === 'wire') {
      // Three hairline grids at 0/60/120, the "wireframe" move.
      above = [
        full(bands(0, u(6), [[0, fade(lo, 0.42)], [u(0.8) / u(6), 'transparent']])),
        full(bands(60, u(6), [[0, fade(lo, 0.34)], [u(0.7) / u(6), 'transparent']])),
        full(bands(120, u(6), [[0, fade(lo, 0.34)], [u(0.7) / u(6), 'transparent']])),
      ];
    }
  }
  return { rim, hex: [base], face, above, whole: vintage, wash: vp % 2 ? 0.78 : 0.92 };
};

// =================================================================================================
// 02 · VOXEL — a weighted pixel desert (14 grounds, nine colours)
// =================================================================================================

const VOXEL = {
  ink: '#20120c', sh: '#3c2a20', earth: '#6b3018', terr: '#c05a24', sand: '#e89a52',
  cream: '#f7dcb4', green: '#3f6b3a', leaf: '#7fa35e', water: '#4a7a8c',
} as const;

/** The preview's 10 x 10 character sprites, verbatim. One background, no DOM per pixel. */
const VOXEL_SPRITES: Record<string, readonly string[]> = {
  cactus: ['..........', '....cg....', '....cg..g.', '..g.cg..g.', '..g.cg.lg.', '..gcggllg.', '....cg....', '....cg....', '...egge...', '..........'],
  scrub: ['..........', '..........', '..........', '..g...g...', '.glg.gl..g', '.glg.gl.g.', '..g...g.lg', '.......g..', '..........', '..........'],
  trail: ['..........', '...cc.....', '..cc......', '.cc.......', '.cc....cc.', '......cc..', '.....cc...', '....cc....', '..........', '..........'],
  mesa: ['..........', '..........', '..kkkkkk..', '..caaaac..', '..cattac..', '..cattac..', '..cattac..', '.ecattac..', '.eeeeeeee.', '..........'],
  agave: ['..........', '....ca....', '.g..tg..g.', '..g.tg.g..', '...gtg....', '.g.gtg.g..', '..g.tg.g..', '....tg....', '...egge...', '..........'],
  water: ['..........', '..........', '....ww....', '..wwssww..', '.wssssssw.', '.wssscssw.', '..wwssww..', '....ww....', '..........', '..........'],
  boulder: ['..........', '..........', '....kk....', '...kaak.kk', '..kaaaakkk', '..kassakka', '.kaaaaaksk', '.ksssskssk', '..kkkkkkk.', '..........'],
  well: ['..........', '....kk....', '...kssk...', '..kssssk..', '..kswwsk..', '..kswwsk..', '..kssssk..', '...kssk...', '....kk....', '..........'],
  fence: ['..........', '..........', '..........', '.c.c.c.c..', 'cccccccc..', '.c.c.c.c..', 'cccccccc..', '.c.c.c.c..', '..........', '..........'],
  deadtree: ['..........', '.....ss...', '....ss....', '..s.ss....', '...ssss...', '....ss.s..', '....ss....', '....ss....', '...esss...', '..........'],
  arch: ['..........', '...kkkk...', '..kssssk..', '.kss..ssk.', '.ks....sk.', '.ks....sk.', '.ks....sk.', '.ks....sk.', '.eeeeeeee.', '..........'],
};
const VOXEL_VARIANT: Record<string, number> = {
  scrub: 2, trail: 3, cactus: 4, mesa: 5, agave: 6, water: 7, boulder: 8, well: 9, fence: 10, deadtree: 11, arch: 13,
};
/** Sprites that stand on the ground and cast the little contact shadow. */
const VOXEL_GROUNDED = new Set(['cactus', 'mesa', 'agave', 'boulder', 'well', 'fence', 'deadtree', 'arch']);
const VOXEL_SLOT: Record<string, string> = {
  k: VOXEL.ink, s: VOXEL.sh, e: VOXEL.earth, t: VOXEL.terr, a: VOXEL.sand,
  c: VOXEL.cream, g: VOXEL.green, l: VOXEL.leaf, w: VOXEL.water,
};

const voxelSprite = (name: string, inset: number): Shape[] => {
  const rows = VOXEL_SPRITES[name]!;
  const cell = ART_W / 10;
  const x0 = inset;
  const y0 = inset + H(5.5);
  const out: Shape[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      if (ch === '.') { x++; continue; }
      let run = 1;
      while (row[x + run] === ch) run++;
      // 1.04 on the height: touching runs must not show a hairline of the band underneath.
      out.push(rect(x0 + cell * x, y0 + cell * y, cell * run, cell * 1.04, flat(VOXEL_SLOT[ch]!)));
      x += run;
    }
  });
  if (VOXEL_GROUNDED.has(name)) {
    out.push(full(rad([CX, H(82)], [W(30), H(16)], [[0, '#20120c73'], [0.17, '#20120c73'], [0.32, 'transparent']])));
  }
  return out;
};

const VOXEL_BASE: Shape[] = [
  rect(0, 0, ART_W, H(26) + 0.3, flat(VOXEL.sand)),
  rect(0, H(26), ART_W, H(44) + 0.3, flat(VOXEL.terr)),
  rect(0, H(70), ART_W, H(30), flat(VOXEL.earth)),
];

const voxelArt = (variant: number, home: boolean): SkinArt => {
  const rim = u(1);
  const base = fullHex(lin(150, [[0, VOXEL.cream], [1, VOXEL.earth]]));
  if (home) {
    // The hut. Every part sits between 24% and 80% of the height — the only band a pointy-top
    // hexagon is wide enough for a building. Each preview layer is a sized, positioned rect.
    const box = (px: number, py: number, pw: number, ph: number, c: string): Shape =>
      rect(W(px) - W(pw) / 2, H(py) - H(ph) / 2, W(pw), H(ph), flat(c));
    return {
      rim,
      hex: [base],
      face: [
        box(64, 12, 7, 7, VOXEL.cream), box(58, 19, 7, 7, VOXEL.cream),
        box(64, 24, 6, 8, VOXEL.ink), box(50, 27.5, 32, 5, VOXEL.ink),
        box(50, 34, 50, 9, VOXEL.sand), box(50, 42, 66, 8, VOXEL.terr),
        box(50, 47.5, 72, 3.5, VOXEL.ink), box(50, 58, 56, 22, VOXEL.cream),
        box(50, 67, 14, 17, VOXEL.ink), box(28, 55, 8, 8, VOXEL.sh), box(72, 55, 8, 8, VOXEL.sand),
        full(rad([CX, H(74)], [W(34), H(18)], [[0, alpha(VOXEL.ink, 0.55)], [0.24, alpha(VOXEL.ink, 0.55)], [0.40, 'transparent']])),
      ],
      above: [],
      whole: [],
    };
  }
  const name = Object.keys(VOXEL_VARIANT).find((k) => VOXEL_VARIANT[k] === variant) ?? null;
  let face: Shape[] = VOXEL_BASE;
  if (variant === 1) {
    face = [
      full(lin(180, [[0, VOXEL.sand], [0.48, VOXEL.terr], [1, VOXEL.earth]])),
      full(rad([W(18), H(118)], [W(120), H(62)], [[0, VOXEL.cream], [0.34, VOXEL.cream], [0.345, 'transparent']])),
      full(rad([W(96), H(112)], [W(130), H(70)], [[0, VOXEL.sand], [0.30, VOXEL.sand], [0.305, 'transparent']])),
    ];
  } else if (variant === 12) {
    // Crop field: a dark shelf, planted rows, the upper terrace.
    face = [
      rect(0, H(78), ART_W, H(22), flat(VOXEL.earth)),
      rect(0, H(20), ART_W, H(46), bands(90, W(16), [[0, mix(VOXEL.green, 0.86, '#000000')], [0.5, VOXEL.leaf]])),
      rect(0, 0, ART_W, H(22), flat(VOXEL.terr)),
    ];
  }
  return { rim, hex: [base], face, above: name ? voxelSprite(name, rim) : [], whole: [] };
};

// =================================================================================================
// 03 · BRUSHED — blue anodised aluminium: bevel + specular sweep + ambient occlusion
// =================================================================================================

const BRUSH = { white: '#ffffff', bright: '#d3ebfd', mid: '#5aa7dd', deep: '#2a6597', ink: '#0b2438' } as const;

const BRUSH_BASE = lin(180, [
  [0, BRUSH.white], [0.2, mix(BRUSH.bright, 0.8, BRUSH.mid)], [0.48, BRUSH.mid], [0.76, BRUSH.deep], [1, BRUSH.ink],
]);
const BRUSH_BANDS = lin(180, [
  [0, mix(BRUSH.bright, 0.88, '#ffffff')], [0.15, BRUSH.bright], [0.40, BRUSH.mid],
  [0.68, mix(BRUSH.deep, 0.88, BRUSH.mid)], [0.84, BRUSH.deep], [1, mix(BRUSH.ink, 0.9, BRUSH.deep)],
]);
const BRUSH_SHEEN = lin(180, [[0.04, 'transparent'], [0.075, '#ffffffdb'], [0.11, '#ffffff66'], [0.16, 'transparent']]);
const BRUSH_LOBE = rad([W(22), H(4)], [W(120), H(68)], [[0, '#ffffffe6'], [0.56, 'transparent']]);
const BRUSH_LINES = bands(96, u(4), [
  [0, 'transparent'], [0.375, '#ffffff2b'], [0.625, '#0b243826'], [1, 'transparent'],
]);

/** Per variant: the specular sweep's position, and the wear layer (`--wear`). */
const BRUSHED_WEAR: readonly { sweep: number; wear: Shape[] }[] = [
  { sweep: 18, wear: [full(bands(178, u(11), [[0, 'transparent'], [0.318, '#0b243824'], [0.5, '#0b243824'], [0.6, 'transparent']]))] },
  { sweep: 26, wear: [full(lin(112, [[0, 'transparent'], [0.468, 'transparent'], [0.468, '#ffffffd9'], [0.477, '#ffffffd9'], [0.477, '#0b243899'], [0.486, '#0b243899'], [0.486, 'transparent']]))] },
  { sweep: 32, wear: [
    full(lin(74, [[0, 'transparent'], [0.41, 'transparent'], [0.41, '#ffffff2e'], [0.55, '#ffffff2e'], [0.55, 'transparent']])),
    full(lin(74, [[0, 'transparent'], [0.43, 'transparent'], [0.43, '#0b243840'], [0.52, '#0b243840'], [0.52, 'transparent']])),
    full(lin(74, [[0, 'transparent'], [0.445, 'transparent'], [0.445, '#ffffffe6'], [0.46, '#ffffffe6'], [0.46, 'transparent']])),
  ] },
  { sweep: 14, wear: [full(rad([W(68), H(34)], [W(44), H(30)], [[0, '#1d4a724d'], [0.74, 'transparent']]))] },
  { sweep: 38, wear: [full(bands(84, u(9), [[0, 'transparent'], [0.556, '#ffffff2b'], [0.778, '#0b243824'], [1, 'transparent']]))] },
  { sweep: 20, wear: [
    full(lin(126, [[0, 'transparent'], [0.30, 'transparent'], [0.30, '#ffffffcc'], [0.309, '#ffffffcc'], [0.309, 'transparent']])),
    full(lin(126, [[0, 'transparent'], [0.37, 'transparent'], [0.37, '#0b243880'], [0.377, '#0b243880'], [0.377, 'transparent']])),
  ] },
  { sweep: 44, wear: [full(bands(70, u(11), [[0, 'transparent'], [0.273, '#ffffff73'], [0.364, 'transparent'], [1, 'transparent']]))] },
];

const brushedArt = (variant: number, home: boolean): SkinArt => {
  const rim = u(1.6);
  const ao = full(rad([CX, CY], [W(150), H(130)], [[0.57, 'transparent'], [1, '#0720338c']]));
  if (home) {
    // The plate raised as a boss: its own specular, an occlusion ring, a machined edge, one bolt.
    const inset = W(15);
    return {
      rim,
      hex: [fullHex(BRUSH_BASE)],
      face: [
        fullHex(flat(BRUSH.ink), inset - u(1.4)),
        fullHex(lin(180, [[0, BRUSH.bright], [0.52, BRUSH.mid], [0.84, BRUSH.deep], [1, BRUSH.ink]]), inset),
        fullHex(BRUSH_LINES, inset),
      ],
      above: [
        full(BRUSH_SHEEN),
        full(BRUSH_LOBE),
        ao,
        circle([CX, CY], W(5.5), rad([CX, CY], [W(5.5), W(5.5)], [[0, '#ffffff'], [0.40, BRUSH.bright], [0.78, BRUSH.mid], [1, BRUSH.ink]])),
      ],
      whole: [],
    };
  }
  const { sweep, wear } = BRUSHED_WEAR[Math.min(variant, BRUSHED_WEAR.length - 1)]!;
  const s = sweep / 100;
  return {
    rim,
    hex: [fullHex(BRUSH_BASE)],
    face: [full(BRUSH_SHEEN), full(BRUSH_LOBE), full(BRUSH_LINES), full(BRUSH_BANDS)],
    above: [
      full(lin(112, [[0, 'transparent'], [s, 'transparent'], [s + 0.04, '#ffffffe0'], [s + 0.08, '#ffffff40'], [s + 0.15, 'transparent']])),
      ao,
      ...wear,
    ],
    whole: [],
  };
};

// =================================================================================================
// 04 · CARRARA — natural stone: veins whose width changes along their length
// =================================================================================================

const CARRARA = { stone: '#eef1f4', warm: '#f8fafb', shade: '#c3ccd5', deep: '#59636f', vein: '#7d8a97', glint: '#ffffff' } as const;

const CARRARA_VEINS: readonly Shape[][] = [
  // v1 the bold seam: four members 2-4° apart, so it swells mid-tile and thins to nothing
  [
    full(lin(111, [[0, 'transparent'], [0.372, 'transparent'], [0.384, '#78858f34'], [0.416, '#78858f34'], [0.43, '#78858f1f'], [0.452, '#78858f1f'], [0.47, 'transparent']])),
    full(lin(114, [[0, 'transparent'], [0.386, 'transparent'], [0.402, '#78858f2e'], [0.434, '#78858f2e'], [0.456, 'transparent']])),
    full(lin(108, [[0, 'transparent'], [0.401, 'transparent'], [0.418, '#78858f26'], [0.430, '#78858f26'], [0.448, 'transparent']])),
    full(lin(117, [[0, 'transparent'], [0.414, 'transparent'], [0.426, '#78858f1a'], [0.436, '#78858f1a'], [0.450, 'transparent']])),
  ],
  // v2 busy block: three families, none dominant
  [
    full(lin(103, [[0, 'transparent'], [0.146, 'transparent'], [0.154, '#78858f2e'], [0.172, '#78858f2e'], [0.190, 'transparent']])),
    full(lin(107, [[0, 'transparent'], [0.158, 'transparent'], [0.166, '#78858f24'], [0.176, '#78858f24'], [0.186, 'transparent']])),
    full(lin(116, [[0, 'transparent'], [0.384, 'transparent'], [0.392, '#78858f2b'], [0.408, '#78858f2b'], [0.424, 'transparent']])),
    full(lin(112, [[0, 'transparent'], [0.396, 'transparent'], [0.404, '#78858f1f'], [0.412, '#78858f1f'], [0.420, 'transparent']])),
    full(lin(96, [[0, 'transparent'], [0.614, 'transparent'], [0.622, '#78858f26'], [0.636, '#78858f26'], [0.652, 'transparent']])),
    full(lin(129, [[0, 'transparent'], [0.806, 'transparent'], [0.812, '#78858f1f'], [0.820, '#78858f1f'], [0.830, 'transparent']])),
  ],
  // v3 book-match: two seams crossing, each with a partner 3° off
  [
    full(lin(56, [[0, 'transparent'], [0.446, 'transparent'], [0.454, '#78858f33'], [0.472, '#78858f33'], [0.490, 'transparent']])),
    full(lin(59, [[0, 'transparent'], [0.456, 'transparent'], [0.462, '#78858f26'], [0.470, '#78858f26'], [0.478, 'transparent']])),
    full(lin(124, [[0, 'transparent'], [0.418, 'transparent'], [0.426, '#78858f2e'], [0.442, '#78858f2e'], [0.458, 'transparent']])),
    full(lin(121, [[0, 'transparent'], [0.428, 'transparent'], [0.434, '#78858f1f'], [0.442, '#78858f1f'], [0.450, 'transparent']])),
  ],
  // v4 soft cloud: no hard vein at all
  [
    full(rad([W(29), H(27)], [W(72), H(44)], [[0, '#8c99a659'], [0.70, 'transparent']])),
    full(rad([W(73), H(72)], [W(58), H(38)], [[0, '#8c99a640'], [0.72, 'transparent']])),
    full(rad([W(52), H(48)], [W(40), H(26)], [[0, '#8c99a626'], [0.74, 'transparent']])),
  ],
  // v5 tight grain: a fine, near-vertical family plus its ghosts
  [
    full(lin(93, [[0, 'transparent'], [0.258, 'transparent'], [0.264, '#78858f2b'], [0.274, '#78858f2b'], [0.284, 'transparent']])),
    full(lin(90, [[0, 'transparent'], [0.266, 'transparent'], [0.272, '#78858f1f'], [0.278, '#78858f1f'], [0.286, 'transparent']])),
    full(lin(87, [[0, 'transparent'], [0.546, 'transparent'], [0.552, '#78858f26'], [0.562, '#78858f26'], [0.572, 'transparent']])),
    full(lin(96, [[0, 'transparent'], [0.708, 'transparent'], [0.714, '#78858f1f'], [0.720, '#78858f1f'], [0.728, 'transparent']])),
  ],
  // v6 edge seam: hugs the cut edge, with a spur 30° off
  [
    full(lin(73, [[0, 'transparent'], [0.058, 'transparent'], [0.070, '#78858f38'], [0.090, '#78858f38'], [0.106, 'transparent']])),
    full(lin(76, [[0, 'transparent'], [0.066, 'transparent'], [0.078, '#78858f26'], [0.088, '#78858f26'], [0.100, 'transparent']])),
    full(lin(117, [[0, 'transparent'], [0.536, 'transparent'], [0.544, '#78858f24'], [0.554, '#78858f24'], [0.564, 'transparent']])),
    full(lin(147, [[0, 'transparent'], [0.374, 'transparent'], [0.380, '#78858f1a'], [0.388, '#78858f1a'], [0.396, 'transparent']])),
  ],
];

const CARRARA_BASE = lin(180, [[0, CARRARA.glint], [0.54, CARRARA.shade], [1, CARRARA.deep]]);
const CARRARA_CHAMFER = lin(180, [[0, '#ffffff'], [0.022, '#ffffff'], [0.032, '#ffffffb3'], [0.07, 'transparent']]);

const carraraArt = (variant: number, home: boolean): SkinArt => {
  const rim = u(1.5);
  if (home) {
    // The medallion: whiter stone, one bold seam plus its ghost, a cut line, a real drop shadow.
    const inset = W(17);
    return {
      rim,
      hex: [fullHex(CARRARA_BASE)],
      face: [
        fullHex(flat(CARRARA.deep), inset - u(1)),
        fullHex(lin(170, [[0, '#ffffff'], [0.46, '#f2f5f8'], [1, '#c9d2db']]), inset),
        full(lin(118, [[0, 'transparent'], [0.424, 'transparent'], [0.436, '#78858f2b'], [0.464, '#78858f2b'], [0.482, 'transparent']])),
        full(lin(121, [[0, 'transparent'], [0.438, 'transparent'], [0.446, '#78858f1f'], [0.458, '#78858f1f'], [0.470, 'transparent']])),
        { t: 'dots', pitch: u(2.9), r: u(0.6), at: [0, 0], c: '#7d8a9738' },
        full(CARRARA_CHAMFER),
        full(rad([W(30), H(14)], [W(80), H(46)], [[0, '#ffffffd9'], [0.64, 'transparent']])),
      ],
      above: [],
      whole: [],
    };
  }
  const v = Math.min(Math.max(variant, 0), CARRARA_VEINS.length - 1);
  return {
    rim,
    hex: [fullHex(CARRARA_BASE)],
    face: [
      full(lin(168, [[0, CARRARA.warm], [0.42, CARRARA.stone], [1, CARRARA.shade]])),
      // the depth shadow is UNDER the veins: the block falls away behind them
      full(rad([W(50), H(114)], [W(140), H(58)], [[0, '#38434ea6'], [0.64, 'transparent']])),
      full(rad([W(44), H(32)], [W(64), H(42)], [[0, '#ffffff59'], [0.72, 'transparent']])),
      ...CARRARA_VEINS[v]!,
      { t: 'dots', pitch: u(2.3), r: u(0.45), at: [u(1.4), u(2.1)], c: '#59636f4d' },
      { t: 'dots', pitch: u(3.1), r: u(0.55), at: [0, 0], c: '#7d8a976b' },
      full(rad([W(73), H(63)], [W(34), H(22)], [[0, '#ffffff4d'], [0.72, 'transparent']])),
      full(rad([W(27), H(13)], [W(78), H(44)], [[0, '#ffffffc4'], [0.62, 'transparent']])),
      // the chamfer, over the veins: light crosses the stone
      full(CARRARA_CHAMFER),
    ],
    above: [],
    whole: [],
  };
};

// =================================================================================================
// 05 · NERO — GTA 2, monochrome, seam-closed by arithmetic
// =================================================================================================

const NERO = {
  black: '#08090b', asphalt: '#191d23', lane: '#232833', block: '#dfe3e4', block2: '#c4cbcd',
  line: '#f7fafa', accent: '#ff4d3d', park: '#8fa78d', court: '#2b3138',
} as const;

/**
 * ONE ROAD RIBBON. A gradient's line length is |W·sinθ| + |H·cosθ| — H at 180°, but 1.25H at 60°
 * and 120° — so the STOP WIDTHS differ while the ROAD does not: 0.07 H at every conic direction.
 * That is the whole seam guarantee: two tiles sharing an edge paint the identical stub.
 */
const ROAD_BAND = 0.07 * ART_H;
const road = (angle: number): Paint => {
  const band = ROAD_BAND / lineLength(angle);
  const at = 0.5 - band / 2;
  return lin(angle, [
    [0, 'transparent'], [at, 'transparent'],
    [at, NERO.asphalt], [at + band * 0.3, NERO.asphalt],
    [at + band * 0.3, NERO.lane], [at + band * 0.7, NERO.lane],
    [at + band * 0.7, NERO.asphalt], [at + band, NERO.asphalt], [at + band, 'transparent'],
  ]);
};

/** The six between-road sectors are the only place furniture may go. */
const NERO_CITY: readonly Shape[][] = [
  // v1 blocks — bare city, one red car on the junction approach
  [rect(W(51.5), H(45.3), W(5), H(3.4), flat(NERO.accent))],
  // v2 courtyard — a dark yard inside the upper block, with a door gap
  [rect(W(37), H(10), W(26), H(22), flat(NERO.court)), rect(W(46.5), H(28.5), W(7), H(9), flat(NERO.block2))],
  // v3 park — a green in the upper-left block, with three trees
  [
    rect(W(8), H(25), W(28), H(22), flat(NERO.park)),
    circle([W(8.4), H(24.6)], W(3), flat(NERO.block2)),
    circle([W(22), H(24.6)], W(3), flat(NERO.block2)),
    circle([W(15), H(32.2)], W(3), flat(NERO.block2)),
  ],
  // v4 plaza — a paved square low on the tile, bollards, a centre line
  [
    rect(W(37), H(69), W(26), H(20), flat(NERO.block2)),
    rect(W(41), H(78), W(18), H(2), flat(NERO.line)),
    circle([CX, H(22)], W(2.4), flat(NERO.black)),
    circle([CX, H(78)], W(2.4), flat(NERO.black)),
  ],
  // v5 alley — a service lane cutting one block in two
  [rect(W(37), H(10), W(18), H(16), flat(NERO.court)), rect(W(76), H(28.5), W(4), H(15), flat(NERO.asphalt))],
  // v6 car park — bays as stripes inside a sized box, never across a road
  [
    rect(W(37), H(10), W(26), H(22), flat(NERO.court)),
    rect(W(39), H(12), W(22), H(18), lin(90, [[0, NERO.court], [0.55, NERO.court], [0.55, NERO.block2], [1, NERO.block2]])),
  ],
  // v7 roundabout — the junction becomes a ring island (correct here: it IS a junction)
  [
    circle([CX, CY], W(14.4), flat(NERO.block2)),
    circle([CX, CY], W(11.4), flat(NERO.black)),
    circle([CX, CY], W(9), flat(NERO.block2)),
    circle([CX, CY], W(6), flat(NERO.block)),
  ],
];

const neroArt = (variant: number, home: boolean): SkinArt => {
  const rim = u(1);
  const base = fullHex(lin(180, [[0, '#3d434c'], [1, '#0a0b0e']]));
  if (home) {
    // The interchange: a ring, six radiating roads, a lit centre. Every road converges.
    const spokes: Shape[] = [];
    for (let i = 0; i < 6; i++) {
      spokes.push(poly(sectorPoly(i * 60 + 0.8, i * 60 + 3.2, [CX, CY], 0, 0), flat(NERO.line)));
      spokes.push(poly(sectorPoly(i * 60 + 3.2, i * 60 + 5.6, [CX, CY], 0, 0), flat(NERO.line)));
    }
    return {
      rim,
      hex: [base],
      face: [
        full(rad([CX, CY], [W(30), W(30)], [[0, 'transparent'], [0.30, fade(NERO.block, 0.24)], [0.58, 'transparent']])),
        ...spokes,
        circle([CX, CY], W(8.5), flat(NERO.block)),
        circle([CX, CY], W(6), flat(NERO.black)),
        circle([CX, CY], W(4.4), flat(NERO.line)),
        circle([CX, CY], W(2.6), flat(NERO.block)),
        circle([CX, CY], W(1.2), flat(NERO.line)),
      ],
      above: [],
      whole: [],
    };
  }
  const v = Math.min(Math.max(variant, 0), NERO_CITY.length - 1);
  return {
    rim,
    hex: [base],
    face: [
      // the block mass is the BASE; the roads are painted ON TOP of it, so no block can sit on a street
      full(lin(165, [[0, NERO.block], [1, NERO.block2]])),
      full(bands(0, u(4.4), [[0, '#00000010'], [u(0.7) / u(4.4), 'transparent']])),
      full(bands(90, u(4.4), [[0, '#00000010'], [u(0.7) / u(4.4), 'transparent']])),
      full(road(180)),
      full(road(120)),
      full(road(60)),
      ...NERO_CITY[v]!,
    ],
    above: [],
    whole: [],
  };
};

// =================================================================================================
// 06 · HYPNOSIS — lowkey iridescent: a wedge fan and a ring set on two centres, a moiré between
// =================================================================================================

const HYPNOSIS = {
  pearl: '#f4f2ee', lilac: '#c3b6d6', sky: '#aabfd4', sage: '#b6c9b4',
  rose: '#d8b8b4', amber: '#d8c6a8', ink: '#1a2030', deep: '#4b4a68',
} as const;
const PEARL = [HYPNOSIS.lilac, HYPNOSIS.sky, HYPNOSIS.sage, HYPNOSIS.amber, HYPNOSIS.rose] as const;

type HypnoPlan = {
  ax: number; ay: number; bx: number; by: number; rot: number;
  arms?: readonly [number, number, number];
  rings?: readonly (readonly [number, number])[];
};
const HYPNOSIS_PLANS: readonly HypnoPlan[] = [
  { ax: 46, ay: 45, bx: 54, by: 56, rot: 0, arms: [7, 14, 0], rings: [[4.2, 1.0]] },
  { ax: 56, ay: 52, bx: 46, by: 44, rot: 40, arms: [9, 18, 120], rings: [[3.4, 0.8]] },
  { ax: 50, ay: 52, bx: 50, by: 52, rot: 100, arms: [3, 6, 0] },
  { ax: 50, ay: 50, bx: 50, by: 50, rot: 160, rings: [[7.4, 1.2], [3.1, 0.6], [1.7, 0.3]] },
  { ax: 44, ay: 54, bx: 52, by: 47, rot: 220, arms: [5, 10, 0], rings: [[2.6, 0.6]] },
  { ax: 50, ay: 50, bx: 50, by: 50, rot: 280, rings: [[2.9, 0.9]] },
  { ax: 50, ay: 48, bx: 50, by: 48, rot: 60, arms: [40, 80, 0] },
];

/** A repeating-radial gradient's rings, written out as gradient stops (one paint server). */
const ringStops = (at: Pt, pitch: number, width: number): Paint => {
  const far = Math.max(...[[0, 0], [ART_W, 0], [0, ART_H], [ART_W, ART_H]].map(([x, y]) => Math.hypot(x! - at[0], y! - at[1])));
  const stops: Stop[] = [];
  for (let r = 0; r < far - 1e-6; r += pitch) {
    const inner = r + Math.max(0.001, pitch - width);
    stops.push([r / far, 'transparent'], [Math.min(1, inner / far), 'transparent'], [Math.min(1, inner / far), '#ffffff73'], [Math.min(1, (r + pitch) / far), '#ffffff73']);
  }
  if (stops[stops.length - 1]![0] < 1) stops.push([1, stops[stops.length - 1]![1]]);
  return rad(at, [far, far], stops);
};

const hypnosisArt = (variant: number, home: boolean): SkinArt => {
  const rim = u(0.9);
  const base = fullHex(lin(180, [[0, HYPNOSIS.pearl], [1, HYPNOSIS.deep]]));
  if (home) {
    // The aperture: rings collapse to a white pupil with a bloom.
    return {
      rim,
      hex: [base],
      face: [
        circle([CX, CY], W(23), lin(180, [[0, HYPNOSIS.deep], [1, HYPNOSIS.pearl]])),
        circle([CX, CY], W(17), flat(HYPNOSIS.pearl)),
        circle([CX, CY], W(15), lin(180, [[0, HYPNOSIS.ink], [1, HYPNOSIS.deep]])),
        circle([CX, CY], W(8), flat(HYPNOSIS.pearl)),
        circle([CX, CY], W(3.4), flat('#ffffff')),
        full(rad([CX, CY], [W(34), W(34)], [[0, '#ffffffcc'], [0.35, fade('#ffffff', 0.3)], [1, 'transparent']])),
      ],
      above: [],
      whole: [],
    };
  }
  const p = HYPNOSIS_PLANS[Math.min(Math.max(variant, 0), HYPNOSIS_PLANS.length - 1)]!;
  const at: Pt = [W(p.ax), H(p.ay)];
  const far = Math.max(...[[0, 0], [ART_W, 0], [0, ART_H], [ART_W, ART_H]].map(([x, y]) => Math.hypot(x! - at[0], y! - at[1])));
  const face: Shape[] = [];
  if (p.arms) {
    const [on, period, from] = p.arms;
    for (let a = from; a < from + 360 - 1e-9; a += period) {
      face.push(poly(sectorPoly(a, Math.min(a + on, from + 360), at, 0, 0), flat('#ffffff8c')));
    }
  }
  if (p.rings) for (const [pitch, width] of p.rings) face.push(full(ringStops([W(p.bx), H(p.by)], u(pitch), u(width))));
  face.push(...wheel(at, PEARL, p.rot));
  face.push(full(rad(at, [far, far], [[0, HYPNOSIS.pearl], [0.34, '#cfd3dd'], [0.88, HYPNOSIS.deep], [1, HYPNOSIS.ink]])));
  if (variant === 6) {
    face.push(full(bands(0, u(4.6), [[0, '#ffffff2b'], [u(0.7) / u(4.6), 'transparent']])));
    face.push(full(bands(90, u(4.6), [[0, '#ffffff2b'], [u(0.7) / u(4.6), 'transparent']])));
  }
  return {
    rim,
    hex: [base],
    face,
    above: [
      full(rad(at, [W(4), H(4)], [[0, '#ffffffb3'], [0.35, '#ffffffb3'], [1, 'transparent']])),
      full(rad([CX, CY], [W(72), W(72)], [[0.44, 'transparent'], [1, '#1a2030b3']])),
    ],
    whole: [],
  };
};

// =================================================================================================
// the six, and the one entry point
// =================================================================================================

const BUILDERS: Record<TileSkinId, (variant: number, home: boolean) => SkinArt> = {
  console: (v, home) => { const c = CONSOLE_TILES[Math.min(v, CONSOLE_TILES.length - 1)]!; return consoleArt(c.mid, c.mv, c.vp, home); },
  voxel: voxelArt,
  brushed: brushedArt,
  carrara: carraraArt,
  nero: neroArt,
  hypnosis: hypnosisArt,
};

/** A variant index clamped into a family's range (an unknown/legacy id can never index past it). */
export const tileSkinVariant = (id: TileSkinId, variant: number): number => {
  const n = TILE_SKIN_GROUNDS[id];
  return Number.isFinite(variant) ? Math.min(Math.max(0, Math.trunc(variant)), n - 1) : 0;
};

/** The art for one (family, variant). `home` is the family's home picture. Pure. */
export const tileSkinArt = (id: TileSkinId, variant: number, home = false): SkinArt =>
  BUILDERS[id](home ? 0 : tileSkinVariant(id, variant), home);

// ---- the renderer ------------------------------------------------------------------------------

let seq = 0;
const uid = (): string => `tsk${(seq++).toString(36)}`;

const stopEl = (parent: Element, offset: number, colour: string): void => {
  const c = parseColour(colour);
  const stop = el('stop', { offset: `${+(Math.min(1, Math.max(0, offset)) * 100).toFixed(3)}%` }, parent);
  stop.setAttribute('stop-color', `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`);
  if (c[3] < 1) stop.setAttribute('stop-opacity', `${+c[3].toFixed(3)}`);
};

const paintOf = (defs: Element, p: Paint): string => {
  if (p.t === 'flat') return p.c;
  const id = uid();
  if (p.t === 'lin') {
    const a = (p.a * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const length = lineLength(p.a);
    const g = el('linearGradient', {
      id, gradientUnits: 'userSpaceOnUse',
      x1: `${+(CX - (dx * length) / 2).toFixed(3)}`, y1: `${+(CY - (dy * length) / 2).toFixed(3)}`,
      x2: `${+(CX + (dx * length) / 2).toFixed(3)}`, y2: `${+(CY + (dy * length) / 2).toFixed(3)}`,
    }, defs);
    for (const [o, c] of p.stops) stopEl(g, o, c);
  } else {
    const g = el('radialGradient', {
      id, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 1,
      gradientTransform: `translate(${+p.at[0].toFixed(3)} ${+p.at[1].toFixed(3)}) scale(${+p.r[0].toFixed(3)} ${+p.r[1].toFixed(3)})`,
    }, defs);
    for (const [o, c] of p.stops) stopEl(g, o, c);
  }
  return `url(#${id})`;
};

const shapeEl = (defs: Element, parent: Element, s: Shape): void => {
  if (s.t === 'rect') {
    el('rect', { x: +s.x.toFixed(3), y: +s.y.toFixed(3), width: +s.w.toFixed(3), height: +s.h.toFixed(3), fill: paintOf(defs, s.p) }, parent);
  } else if (s.t === 'poly') {
    el('polygon', { points: s.pts.map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(' '), fill: paintOf(defs, s.p) }, parent);
  } else if (s.t === 'circle') {
    el('circle', { cx: +s.at[0].toFixed(3), cy: +s.at[1].toFixed(3), r: +s.r.toFixed(3), fill: paintOf(defs, s.p) }, parent);
  } else {
    // A dot field: one pattern of dots, then one rect that wears it (CSS's background-position).
    const id = uid();
    const pitch = +s.pitch.toFixed(3);
    const pattern = el('pattern', { id, width: pitch, height: pitch, patternUnits: 'userSpaceOnUse', x: +s.at[0].toFixed(3), y: +s.at[1].toFixed(3) }, defs);
    const c = parseColour(s.c);
    el('circle', { cx: pitch / 2, cy: pitch / 2, r: +s.r.toFixed(3), fill: `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+c[3].toFixed(3)})` }, pattern);
    el('rect', { x: 0, y: 0, width: +ART_W.toFixed(3), height: +ART_H.toFixed(3), fill: `url(#${id})` }, parent);
  }
};

const made = new WeakMap<Element, Map<string, string>>();

/**
 * Build (once) and return the id of the `<g>` that paints one family's variant. `defs` is the
 * board's own `<defs>`; the art is created there and painted per cell with `<use>`.
 */
export const tileSkinDef = (defs: Element, id: TileSkinId, variant: number, home = false): string => {
  const key = `${id}:${home ? 'h' : tileSkinVariant(id, variant)}`;
  let cache = made.get(defs);
  if (!cache) { cache = new Map(); made.set(defs, cache); }
  const hit = cache.get(key);
  if (hit) return hit;

  const art = tileSkinArt(id, variant, home);
  const gid = `tileskin-${id}-${home ? 'home' : tileSkinVariant(id, variant)}-${(seq++).toString(36)}`;
  const clipOf = (name: string, inset: number): string => {
    const cid = `${gid}-${name}`;
    const cls = el('clipPath', { id: cid, clipPathUnits: 'userSpaceOnUse' }, defs);
    el('polygon', { points: hexPts(inset).map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(' ') }, cls);
    return cid;
  };
  const wholeClip = clipOf('hex', 0);
  const faceClip = clipOf('face', art.rim);
  const g = el('g', { id: gid }, defs);
  const layer = (shapes: readonly Shape[], clipId: string, opacity?: number): void => {
    if (!shapes.length) return;
    const host = el('g', { 'clip-path': `url(#${clipId})` }, g);
    if (opacity !== undefined && opacity < 1) host.setAttribute('opacity', String(opacity));
    for (const s of shapes) shapeEl(defs, host, s);
  };
  layer(art.hex, wholeClip);
  layer(art.face, faceClip);
  layer(art.above, faceClip);
  layer(art.whole, wholeClip, art.wash);
  cache.set(key, gid);
  return gid;
};

/**
 * The transform that puts a `<g>` built by `tileSkinDef` on a cell, in board units, at scale `k`.
 * The art frame is the board's pointy-top hexagon, so a "flat" board turns it a quarter — the
 * product board is always "flat" (`setFixedBoardOrient('flat')`), but the 0.5 line is not, and the
 * same def serves both.
 */
export const tileSkinPlacement = (x: number, y: number, k: number, orient: 'pointy' | 'flat'): string => {
  const turn = orient === 'flat' ? ' rotate(-90)' : '';
  return `translate(${+x.toFixed(3)} ${+y.toFixed(3)}) scale(${+k.toFixed(4)})${turn} translate(${-CX.toFixed(3)} ${-CY.toFixed(3)})`;
};

/** The box a skinned picture occupies, relative to the cell's centre (board units). */
export const tileSkinBox = (orient: 'pointy' | 'flat'): { x: number; y: number; w: number; h: number } =>
  orient === 'flat' ? { x: -ART_H / 2, y: -ART_W / 2, w: ART_H, h: ART_W } : { x: -CX, y: -CY, w: ART_W, h: ART_H };
