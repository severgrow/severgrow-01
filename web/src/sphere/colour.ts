import type { V3 } from './geometry.js';

/** `hsl(h s% l%)` (the game's tile colours, `src/tile-colours.ts`) or `#rrggbb` to 0..1 RGB. */
export const colourRgb = (css: string): V3 => {
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (hex) {
    const v = parseInt(hex[1]!, 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  const values = css.match(/-?[\d.]+/g)?.map(Number) ?? [];
  if (!/^hsla?\(/i.test(css.trim()) || values.length < 3) return [0.5, 0.5, 0.5];
  const h = (((values[0]! % 360) + 360) % 360) / 360, s = values[1]! / 100, l = values[2]! / 100;
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
};
