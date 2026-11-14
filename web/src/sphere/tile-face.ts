// THE PLANET'S TILES SIT FLAT SIDE UP (owner, 2026-11-14). A tile's picture is a flat-top hex; the
// planet's hexes lie at every angle. Each tile is turned (at most 30 degrees either way) so its edge
// nearest geographic north is its top, and its corners are given in that tile's own frame: x right,
// y up, circumradius 1. The same turn levels the view when the planet comes to rest.
import { stampCoordinates } from './challenge-stamp.js';
import type { V3 } from './geometry.js';

export type TileFace = {
  /** Corner coordinates in the levelled tile frame (flat-top hex, circumradius 1). */
  coords: [number, number][];
  /** The tile's own turn (radians, counter-clockwise from flat-top-north, within +-30 degrees);
   *  levelling turns it back by this much. */
  angle: number;
};

export function tileFace(centre: V3, corners: readonly V3[], north: V3 = [0, 1, 0]): TileFace {
  const uv = stampCoordinates(centre, corners, north);
  let best = -Infinity, mx = 0, my = 1;
  for (let i = 0; i < uv.length; i++) {
    const a = uv[i]!, b = uv[(i + 1) % uv.length]!;
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    const facing = y / (Math.hypot(x, y) || 1);
    if (facing > best) { best = facing; mx = x; my = y; }
  }
  // The edge's direction from north (clockwise), then the turn that brings it straight up.
  const toTop = Math.atan2(mx, my);
  const c = Math.cos(toTop), s = Math.sin(toTop);
  const k = (Math.sqrt(3) / 2) / (Math.hypot(mx, my) || 1);
  return {
    angle: -toTop,
    coords: uv.map(([x, y]) => [(x * c - y * s) * k, (x * s + y * c) * k] as [number, number]),
  };
}
