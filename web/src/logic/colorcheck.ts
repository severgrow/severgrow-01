// Colour checks for the palettes: colour-blind simulation (Machado, Oliveira and
// Fernandes 2009, full severity) and colour distance (CIE76 delta E in Lab). Pure.

export const CVD_KINDS = ['deuteranopia', 'protanopia', 'tritanopia'] as const;
export type CvdKind = (typeof CVD_KINDS)[number];

type M3 = [number, number, number, number, number, number, number, number, number];
const MATRIX: Record<CvdKind, M3> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const hex = (c: number[]) => `#${c.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')}`;

/** How `color` looks to someone with full `kind` colour blindness. */
export const simulate = (color: string, kind: CvdKind): string => {
  const [r, g, b] = rgb(color).map(toLin) as [number, number, number];
  const m = MATRIX[kind];
  return hex([m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b].map((v) => fromLin(clamp(v))));
};

const lab = (color: string): [number, number, number] => {
  const [r, g, b] = rgb(color).map(toLin) as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

/** Colour distance (CIE76). About 2 is barely visible; 10+ is easy to tell apart. */
export const deltaE = (a: string, b: string): number => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** The colours that must never be confused: the two players and the four suits. */
export const KEY_COLORS = ['you', 'bot', 'moss', 'ash', 'dew', 'ember'] as const;

/** For normal vision and each kind of colour blindness: the closest pair and its distance. */
export const distinguishReport = (c: Record<(typeof KEY_COLORS)[number], string>) => {
  const out = {} as Record<'normal' | CvdKind, { min: number; pair: string }>;
  for (const kind of ['normal', ...CVD_KINDS] as const) {
    let best = { min: Infinity, pair: '' };
    for (let i = 0; i < KEY_COLORS.length; i++) {
      for (let j = i + 1; j < KEY_COLORS.length; j++) {
        const [a, b] = [c[KEY_COLORS[i]!], c[KEY_COLORS[j]!]];
        const d = kind === 'normal' ? deltaE(a, b) : deltaE(simulate(a, kind), simulate(b, kind));
        if (d < best.min) best = { min: d, pair: `${KEY_COLORS[i]} / ${KEY_COLORS[j]}` };
      }
    }
    out[kind] = best;
  }
  return out;
};
