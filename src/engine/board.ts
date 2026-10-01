import { DIRECTIONS } from './constants.js';
import type { Coord, Player, RootStyle } from './types.js';

/** Normalises -0 to 0 so keys and JSON stay canonical. */
const n0 = (x: number): number => x + 0;

export const coordKey = (c: Coord): string => `${n0(c.q)},${n0(c.r)}`;

export const parseKey = (key: string): Coord => {
  const m = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!m) throw new Error(`Malformed coord key: ${key}`);
  return { q: n0(Number(m[1])), r: n0(Number(m[2])) };
};

export const coordsEqual = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;

export const addCoord = (a: Coord, b: Coord): Coord => ({ q: n0(a.q + b.q), r: n0(a.r + b.r) });

export const scaleCoord = (c: Coord, k: number): Coord => ({ q: n0(c.q * k), r: n0(c.r * k) });

/** Point reflection through the centre. */
export const mirror = (c: Coord): Coord => ({ q: n0(-c.q), r: n0(-c.r) });

export const hexDistance = (a: Coord, b: Coord): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export const isOnBoard = (c: Coord, radius: number): boolean =>
  Number.isInteger(c.q) &&
  Number.isInteger(c.r) &&
  Math.abs(c.q) <= radius &&
  Math.abs(c.r) <= radius &&
  Math.abs(c.q + c.r) <= radius;

/** Every on-board hex, in a fixed order (q ascending, then r ascending). */
export const allCoords = (radius: number): Coord[] => {
  const out: Coord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius);
    const hi = Math.min(radius, -q + radius);
    for (let r = lo; r <= hi; r++) out.push({ q: n0(q), r: n0(r) });
  }
  return out;
};

/** All six neighbours in DIRECTIONS order, including off-board ones. */
export const allNeighbors = (c: Coord): Coord[] => DIRECTIONS.map((d) => addCoord(c, d));

/** On-board neighbours in DIRECTIONS order. */
export const neighbors = (c: Coord, radius: number): Coord[] =>
  allNeighbors(c).filter((n) => isOnBoard(n, radius));

export const isAdjacent = (a: Coord, b: Coord): boolean => hexDistance(a, b) === 1;

/** True when the coords form one non-empty cluster under hex adjacency. */
export const isConnected = (coords: readonly Coord[]): boolean => {
  const first = coords[0];
  if (!first) return false;
  const remaining = new Set(coords.map(coordKey));
  const stack: Coord[] = [first];
  remaining.delete(coordKey(first));
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const n of allNeighbors(cur)) {
      const k = coordKey(n);
      if (remaining.delete(k)) stack.push(n);
    }
  }
  return remaining.size === 0;
};

/** Root position (spec 4.3). P2's root is always the mirror of P1's. */
export const rootCoord = (player: Player, style: RootStyle, radius: number): Coord => {
  const p1: Coord = style === 'ring2' ? { q: -2, r: 2 } : { q: -radius, r: radius };
  return player === 0 ? { q: n0(p1.q), r: n0(p1.r) } : mirror(p1);
};
