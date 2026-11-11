// What the lab says about an uploaded file, in plain English. Pure: the page measures the picture
// (size, format, see-through pixels, seams) and these functions judge it against the slot's rule.
import { BUDGET, CARD, minUpload, targetSize } from './slots.js';
import type { Slot } from './slots.js';

export type ImageMeta = {
  width: number;
  height: number;
  mime: string;
  bytes: number;
  /** some pixel is less than fully solid */
  anyTransparent: boolean;
  /** share (0-1) of the pixels outside the hex's circle that are solid (hex art must be clear there) */
  solidOutsideHex: number;
  /** hard-edge score where the picture repeats (about 1 = seamless; see seamScore) */
  seam?: number;
};

export type Verdict = { errors: string[]; warnings: string[]; notes: string[] };

const PICTURE = /^image\/(png|jpeg|webp)$/;
export const SEAM_LIMIT = 2.2;
const HEX_CLEAR_LIMIT = 0.08;

const dims = (w: number, h: number) => `${w}×${h}`;

/** Judges one upload against its slot. Errors stop the file; warnings and notes let it in. */
export const checkUpload = (slot: Slot, m: ImageMeta, fileSettings?: Record<string, unknown>): Verdict => {
  const v: Verdict = { errors: [], warnings: [], notes: [] };
  const r = slot.rule;
  if (r.shape === 'svg') {
    if (m.mime !== 'image/svg+xml') v.errors.push('This must be an SVG file (a PNG of at least 96×96 also works, but SVG stays sharp).');
    return m.mime === 'image/svg+xml' ? v : checkPictureOnly(v, m);
  }
  if (!PICTURE.test(m.mime)) {
    v.errors.push('This must be a PNG, JPG or WebP picture.');
    return v;
  }
  const [minW, minH] = minUpload(slot, fileSettings);
  const [loW, loH] = targetSize(slot, 'lo', fileSettings);
  const ratio = m.width / m.height;
  if (Math.abs(ratio - r.aspect) / r.aspect > 0.02) {
    v.errors.push(r.shape === 'card-sheet' || r.shape === 'card'
      ? `This must have a card's shape, ${dims(CARD.w, CARD.h)}${r.shape === 'card-sheet' ? ` (one card) or ${dims(minW, minH)} (a sheet of nine)` : ''}. Yours is ${dims(m.width, m.height)}.`
      : r.aspect === 1 ? `This must be square. Yours is ${dims(m.width, m.height)}.` : `This must be ${dims(minW, minH)} (or the same shape, bigger). Yours is ${dims(m.width, m.height)}.`);
  } else if (r.shape === 'card-sheet' && m.width < minW) {
    if (m.width < CARD.w) v.errors.push(`This must be at least ${dims(CARD.w, CARD.h)}. Yours is ${dims(m.width, m.height)}.`);
    else v.notes.push('One card: it is used for all nine numbers. Upload a sheet of nine to give each number its own picture.');
  } else if (m.width < loW || m.height < loH) {
    v.errors.push(`This must be at least ${dims(loW, loH)}${minW > loW ? `, best ${dims(minW, minH)}` : ''}. Yours is ${dims(m.width, m.height)}.`);
  } else if (m.width < minW) {
    v.warnings.push(`Fine on phones, a little soft on big screens. Best: ${dims(minW, minH)} (yours is ${dims(m.width, m.height)}).`);
  }
  if (r.alpha === 'required') {
    if (r.shape === 'hex' && m.solidOutsideHex > HEX_CLEAR_LIMIT) {
      v.errors.push(`This must be see-through around the hex: about ${Math.round(m.solidOutsideHex * 100)}% of the corners outside the hex are solid.`);
    } else if (!m.anyTransparent) v.errors.push('This needs a see-through background (a PNG or WebP with transparency).');
  } else if (r.alpha === 'forbidden' && m.anyTransparent) {
    (r.seamless ? v.errors : v.warnings).push(r.seamless
      ? 'This must be solid: a ground texture cannot have see-through areas.'
      : 'Some pixels are see-through; they will show dark in the game.');
  }
  if (r.seamless && m.seam !== undefined && m.seam > SEAM_LIMIT) v.warnings.push('Hard edges where it repeats: check the 3×3 tiling preview and soften the borders.');
  return v;
};

const checkPictureOnly = (v: Verdict, m: ImageMeta): Verdict => {
  if (PICTURE.test(m.mime) && m.width >= 96 && m.height >= 96 && m.anyTransparent) return { ...v, errors: [], notes: ['A picture icon: SVG stays sharper.'] };
  return v;
};

/** The weight of one converted file against its budget. */
export const weightNote = (slot: Slot, loBytes: number): string | null => {
  const kb = Math.round(loBytes / 1024);
  return kb > slot.rule.budgetKB * 1.5 ? `Heavy: ${kb} KB on phones (aim under ${slot.rule.budgetKB} KB). Simplify detail or noise.` : null;
};

/** What the whole pack adds to a phone's download (the lo tier plus cards and planet). */
export const budgetVerdict = (loKB: number): { level: 'ok' | 'warn' | 'over'; text: string } => {
  const kb = Math.round(loKB);
  if (kb > BUDGET.maxKB) return { level: 'over', text: `${kb} KB: too heavy for phones (keep it under ${BUDGET.maxKB} KB).` };
  if (kb > BUDGET.warnKB) return { level: 'warn', text: `${kb} KB: heavy for phones on a slow connection (aim under ${BUDGET.warnKB} KB).` };
  return { level: 'ok', text: `${kb} KB on phones.` };
};

/** Seconds a download takes on a slow phone connection (1.6 Mbit/s, the "slow 4G" preset). */
export const slowPhoneSeconds = (kb: number) => Math.round(((kb * 8) / 1600) * 10) / 10;

// ---------- measurements (pure, over RGBA pixels) ----------

/** Share of the pixels outside the circle that holds the hex (either orientation) that are solid. */
export const solidOutsideHex = (rgba: Uint8ClampedArray, w: number, h: number): number => {
  let out = 0, solid = 0;
  const cx = (w - 1) / 2, cy = (h - 1) / 2, r = Math.min(w, h) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) continue;
    out++;
    if (rgba[(y * w + x) * 4 + 3]! > 32) solid++;
  }
  return out ? solid / out : 0;
};

export const hasTransparency = (rgba: Uint8ClampedArray): boolean => {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 250) return true;
  return false;
};

/**
 * How hard the edges are where the picture repeats: the difference across the wrap (last column
 * next to the first, last row next to the first) over the typical difference between neighbouring
 * pixels inside. About 1 for a seamless texture; a visible seam scores well above 2.
 */
export const seamScore = (rgba: Uint8ClampedArray, w: number, h: number): number => {
  const px = (x: number, y: number) => (y * w + x) * 4;
  const diff = (a: number, b: number) => Math.abs(rgba[a]! - rgba[b]!) + Math.abs(rgba[a + 1]! - rgba[b + 1]!) + Math.abs(rgba[a + 2]! - rgba[b + 2]!);
  let wrap = 0, inner = 0, nw = 0, ni = 0;
  for (let y = 0; y < h; y++) {
    wrap += diff(px(w - 1, y), px(0, y)); nw++;
    for (const x of [Math.floor(w / 3), Math.floor(w / 2), Math.floor((2 * w) / 3)]) { inner += diff(px(x, y), px(x + 1, y)); ni++; }
  }
  for (let x = 0; x < w; x++) {
    wrap += diff(px(x, h - 1), px(x, 0)); nw++;
    for (const y of [Math.floor(h / 3), Math.floor(h / 2), Math.floor((2 * h) / 3)]) { inner += diff(px(x, y), px(x, y + 1)); ni++; }
  }
  const a = wrap / nw, b = inner / ni;
  return b < 1 ? (a < 1 ? 1 : a) : a / b;
};

/** WCAG contrast ratio of two #rrggbb colours (number ink on its plate). */
export const contrast = (a: string, b: string): number => {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x! + 0.05) / (y! + 0.05)) * 10) / 10;
};
