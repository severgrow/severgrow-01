// THE PROFILE'S ONE TILE IS A MAP HEX (owner, 2026-11-01: "change the color icon in profile to actual
// hex shape, in right direction like game map - with 'flat' edges on sides").
//
// The board's hexes come from vertices at 60°·i − 30° (web/src/ui/geom.ts), which is exactly TWO
// vertical edges (left and right) and a point at the top and the bottom. These tests pin that
// orientation, because the neighbouring orientation (a point on the left and right) is a 30° rotation
// away and looks wrong beside the map.
import { describe, expect, it } from 'vitest';
import { HEX_TILE_POINTS, hexPoints, hexVertices } from '../src/player/hex-tile.js';

const points = (size: number) => hexVertices(size).map(([x, y]) => ({ x: +x.toFixed(4), y: +y.toFixed(4) }));

describe('the hex has flat edges on the sides', () => {
  it('puts its extreme LEFT and RIGHT features on vertical edges, not points', () => {
    const v = points(10);
    const minX = Math.min(...v.map((p) => p.x));
    const maxX = Math.max(...v.map((p) => p.x));
    // Exactly two vertices share each extreme X, and they differ only in Y: that is a vertical edge.
    const left = v.filter((p) => Math.abs(p.x - minX) < 1e-6);
    const right = v.filter((p) => Math.abs(p.x - maxX) < 1e-6);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(Math.abs(left[0]!.y - left[1]!.y)).toBeGreaterThan(1); // a real edge, not one point
    expect(Math.abs(right[0]!.y - right[1]!.y)).toBeGreaterThan(1);
  });

  it('points at the TOP and BOTTOM', () => {
    const v = points(10);
    const minY = Math.min(...v.map((p) => p.y));
    const maxY = Math.max(...v.map((p) => p.y));
    // One vertex at each extreme Y, and it sits on the centre line (x = 0): a point.
    expect(v.filter((p) => Math.abs(p.y - minY) < 1e-6)).toHaveLength(1);
    expect(v.filter((p) => Math.abs(p.y - maxY) < 1e-6)).toHaveLength(1);
    expect(v.find((p) => Math.abs(p.y - minY) < 1e-6)!.x).toBeCloseTo(0, 6);
    expect(v.find((p) => Math.abs(p.y - maxY) < 1e-6)!.x).toBeCloseTo(0, 6);
  });

  it('is a regular hexagon: six equal sides, a taller-than-wide box', () => {
    const v = points(10);
    const sides = v.map((p, i) => {
      const q = v[(i + 1) % 6]!;
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    // A regular hexagon's side equals its circumradius. (The points() helper rounds to 4 decimals
    // so the float text is readable, hence the 3-digit tolerance.)
    for (const s of sides) expect(s).toBeCloseTo(10, 3);
    const w = Math.max(...v.map((p) => p.x)) - Math.min(...v.map((p) => p.x));
    const h = Math.max(...v.map((p) => p.y)) - Math.min(...v.map((p) => p.y));
    // Flat sides left/right means the width is the narrow dimension (2R·cos30°), height is 2R.
    expect(w).toBeCloseTo(10 * Math.sqrt(3), 3);
    expect(h).toBeCloseTo(20, 3);
    expect(h).toBeGreaterThan(w); // points top and bottom make it taller than wide
  });

  it('emits an SVG points attribute with six vertices', () => {
    const pts = hexPoints(11.5);
    expect(pts.split(' ')).toHaveLength(6);
    for (const pair of pts.split(' ')) expect(pair).toMatch(/^-?\d+\.\d{2},-?\d+\.\d{2}$/);
    expect(HEX_TILE_POINTS).toBe(pts);
  });
});
