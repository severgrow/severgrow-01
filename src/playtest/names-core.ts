import type { Coord } from '../engine/index.js';

/** Hex names like "E3": row letter (top to bottom), then position in the row. */
export const hexName = (c: Coord, radius: number): string => {
  // up to 26 rows (the Lab's big boards); beyond that, plain coordinates
  const row = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[c.r + radius];
  if (row === undefined) return `${c.q},${c.r}`;
  const firstQ = Math.max(-radius, -c.r - radius);
  return `${row}${c.q - firstQ + 1}`;
};
