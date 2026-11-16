// THE PLANET'S TILES SIT FLAT SIDE UP, AND EVERY TILE WEARS ITS PICTURE THE SAME WAY UP (owner,
// 2026-11-14: "always show tiles flat side up"; 2026-11-16: "some of the skins tiles are rotated —
// use the og rotation").
//
// A tile's picture is a flat-top hex; the planet's hexes lie at every angle, and the lattice's own
// hexagon reads pointy-top in the frame `north` gives. Turning the picture by exactly HALF A HEX STEP
// is what lays its flat top on one of the lattice's edges — and it is the SAME turn on every tile, so
// no tile can disagree with its neighbours.
//
// It used to be "turn so the edge nearest north is on top". That asks which of six edges is nearest,
// and the lattice's answer drifts across the sphere: on the board's 127 cells it turns 52 of them 60
// degrees away from the rest, which read on screen as tiles rotated against each other. A constant
// turn cannot jump. The reference (`north`) still sets which way the art's up points on the ground,
// and the view still levels the tile at the centre of the screen by the reported `angle`.
import { stampCoordinates } from './challenge-stamp.js';
import type { V3 } from './geometry.js';

export type TileFace = {
  /** Corner coordinates in the levelled tile frame (flat-top hex, circumradius 1). */
  coords: [number, number][];
  /** The turn between `north`'s frame and that tile frame (radians, counter-clockwise); levelling
   *  turns it back by this much. A constant half hex step — see the note above. */
  angle: number;
};

/** Half a hex step: the one turn that sets a flat-top picture on the lattice's hexagon. */
export const HALF_STEP = Math.PI / 6;

export function tileFace(centre: V3, corners: readonly V3[], north: V3 = [0, 1, 0]): TileFace {
  const uv = stampCoordinates(centre, corners, north);
  const turn = -HALF_STEP;
  const c = Math.cos(turn), s = Math.sin(turn);
  return {
    angle: -turn,
    coords: uv.map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number]),
  };
}

/**
 * NO TWO NEIGHBOURS ALIKE (owner, 2026-11-14): one of the nine plain tiles per planet cell. Each
 * cell, in index order, takes the first of its own fixed shuffle of the nine that no placed
 * neighbour wears; a cell has at most six neighbours, so one is always free. Deterministic.
 *
 * Since 2026-11-15 this index no longer chooses WHICH picture a skinned planet tile draws — every
 * tile of a set draws the set's default picture, so the art reads as one sheet ("always in default
 * orientation", owner). The index rides on in the tile's seed as its TONE, so neighbouring tiles
 * still catch the light differently, and the board's own nine-variant rule is untouched.
 */
export function tileVariants(cells: readonly { index: number; neighbours: readonly number[] }[], count = 9): Uint8Array {
  const variant = new Uint8Array(cells.length);
  const placed = new Uint8Array(cells.length);
  const order = (index: number) => Array.from({ length: count }, (_, i) => i)
    .sort((a, b) => (Math.sin((index * count + a) * 78.233) * 43758.5453 % 1) - (Math.sin((index * count + b) * 78.233) * 43758.5453 % 1));
  for (const c of cells) {
    const taken = new Set<number>();
    for (const n of c.neighbours) if (placed[n]) taken.add(variant[n]!);
    const prefs = order(c.index);
    variant[c.index] = prefs.find((v) => !taken.has(v)) ?? prefs[0]!;
    placed[c.index] = 1;
  }
  return variant;
}
