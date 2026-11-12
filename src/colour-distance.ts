/**
 * COLOUR MATHS FOR THE TERRITORY PALETTE (2026-10-30).
 *
 * Pure, deterministic, no I/O — the same rules as `src/engine/`. Nothing in the running game imports
 * this: it exists so the palette's "twenty colours that are actually tellable apart" claim is a
 * NUMBER in a test (`tests/tile-colours.test.ts`) rather than an opinion in a comment. It also
 * measures the two forms of colour-vision deficiency the palette must survive.
 *
 * Only the one CSS shape the map hands out is parsed — `hsl(<h> <s>% <l>%)` — because that is what
 * `src/tile-colours.ts` emits and what the wire carries.
 */

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** `hsl(<h> <s>% <l>%)` → sRGB in 0..1. Throws on anything else, so a typo cannot pass as a colour. */
export const parseCssColour = (css: string): Rgb => {
  const m = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(css.trim());
  if (!m) throw new Error(`Not an hsl() colour: ${css}`);
  const h = ((Number(m[1]) % 360) + 360) % 360 / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    const x = ((t % 1) + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
};

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG relative luminance of an sRGB triple (0..1 per channel). */
export const relativeLuminance = ([r, g, b]: Rgb): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG contrast ratio, 1..21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** sRGB → CIELAB (D65). */
export const toLab = (rgb: Rgb): Lab => {
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

/**
 * CIEDE2000 with kL = kC = kH = 1 (Sharma, Wu & Dalal 2005). Implemented here in full rather than
 * approximated by ΔE76: at the separations the palette works at (~5–15), ΔE76 over-rewards the
 * blue region and would let two blues pass that a viewer cannot tell apart.
 */
export const deltaE2000 = (labA: Lab, labB: Lab): number => {
  const [L1, a1, b1] = labA;
  const [L2, a2, b2] = labB;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hueOf = (x: number, y: number): number => {
    if (x === 0 && y === 0) return 0;
    const h = Math.atan2(y, x) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hueOf(a1p, b1), h2p = hueOf(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else hbarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbarp - 30) * rad) + 0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) - 0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
};

export type Vision = 'normal' | 'protanopia' | 'deuteranopia';

/**
 * Machado, Oliveira & Fernandes (2009) severity-1.0 matrices, applied in LINEAR RGB. These are the
 * published full-deficiency rows; they are the harsh case (someone who sees no red at all), not a
 * mild filter, so a palette that survives them survives everyday anomalous trichromacy too.
 */
const CVD: Record<Exclude<Vision, 'normal'>, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280264, 0.672927, 0.046809,
    -0.011820, 0.042940, 0.968881,
  ],
};

/** What a person with `vision` sees when looking at `rgb`. */
export const simulate = (rgb: Rgb, vision: Vision): Rgb => {
  if (vision === 'normal') return rgb;
  const m = CVD[vision];
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const rows: Rgb = [
    clamp01(m[0]! * r + m[1]! * g + m[2]! * b),
    clamp01(m[3]! * r + m[4]! * g + m[5]! * b),
    clamp01(m[6]! * r + m[7]! * g + m[8]! * b),
  ];
  return [encode(rows[0]), encode(rows[1]), encode(rows[2])] as Rgb;
};

export type Pair = { a: string; b: string; distance: number };

/**
 * The whole pairwise table for one list of CSS colours under one vision, worst pair first.
 * 190 pairs for 20 colours, so a test can assert the MINIMUM and name the pair that produced it.
 */
export const pairwise = (colours: readonly string[], vision: Vision = 'normal'): Pair[] => {
  const labs = colours.map((css) => toLab(simulate(parseCssColour(css), vision)));
  const pairs: Pair[] = [];
  for (let i = 0; i < colours.length; i++) {
    for (let j = i + 1; j < colours.length; j++) {
      pairs.push({ a: colours[i]!, b: colours[j]!, distance: deltaE2000(labs[i]!, labs[j]!) });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
};
