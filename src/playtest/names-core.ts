import type { Coord } from '../engine/index.js';

/** Hex names like "E3": row letter (top to bottom), then position in the row. */
export const hexName = (c: Coord, radius: number): string => {
  const row = 'ABCDEFGHIJKLM'[c.r + radius] ?? '?';
  const firstQ = Math.max(-radius, -c.r - radius);
  return `${row}${c.q - firstQ + 1}`;
};
