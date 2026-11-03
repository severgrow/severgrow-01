// THE MAP ON THE GLOBE (web/src/online/map-globe.ts).
//
// The owner rejected a per-tile size falloff that produced visible contours (branch `fisheye-a`,
// 8.5% at the rim, drawn by growing the middle). What he asked for is the LATTICE bending like the
// meridians and parallels of a wireframe globe, at a strength he would call "nothing crazy". So the
// tests here pin the three things that make that honest rather than decorative:
//
//   1. the projection is a real sphere, so the bow and the compression cannot drift apart;
//   2. neighbours still share their exact corners — a warp may never open a seam;
//   3. the middle is untouched and the rim only recedes, so no tile anywhere grows.
import { describe, expect, it } from 'vitest';
import { WORLD_CELLS } from '../../server/src/world.js';
import {
  GLOBE_FALLOFF,
  arcFor,
  flatCell,
  globePoint,
  globePose,
  globeScale,
  mapCell,
  mapHex,
  mapScale,
  worldGlobe,
} from '../src/online/map-globe.js';

const X = Math.sqrt(3);
const R = 10;
const CORNERS = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]] as const;
const corners = (pose: NonNullable<ReturnType<typeof globePose>>, q: number, r: number) =>
  CORNERS.map(([dx, dy]) => { const at = flatCell(q, r); return globePoint(pose, at.x + dx * R, at.y + dy * R); });
const edges = (points: { x: number; y: number }[]) =>
  points.map((a, i) => { const b = points[(i + 1) % 6]!; return Math.hypot(b.x - a.x, b.y - a.y); });

describe('the arc a strength means', () => {
  it('solves sin(theta)/theta = 1 - falloff, the sphere’s own rim ratio', () => {
    for (const falloff of [0.01, 0.03, 0.04, 0.05, 0.08, 0.2, 0.4]) {
      const theta = arcFor(falloff);
      expect(Math.sin(theta) / theta).toBeCloseTo(1 - falloff, 12);
    }
  });

  it('is monotone: a stronger falloff means a larger arc', () => {
    const arcs = [0.01, 0.03, 0.05, 0.08, 0.2].map(arcFor);
    for (let i = 1; i < arcs.length; i++) expect(arcs[i]!).toBeGreaterThan(arcs[i - 1]!);
  });

  it('is a flat map at zero', () => {
    expect(globePose(WORLD_CELLS, 0)).toBeNull();
    expect(globePose([], 0.04)).toBeNull();
  });
});

describe('the drawn map is a sphere, not a scale', () => {
  const pose = worldGlobe()!;
  /**
   * THE BAR FOR "A HEX IS A HEX". The sphere squashes a rim tile radially (that IS the tilt), so an
   * edge-length ratio is how far a tile has been allowed to go. 1.10 means no edge may be more than
   * 10% away from the tile's longest: a hexagon the eye still reads as a hexagon. It is a product
   * rule, not a fit to the current number — the ladder is measured against it in the last test here.
   */
  const HEX_TOLERANCE = 1.1;
  const worstEdgeRatio = (strength: number) => {
    let worst = 0;
    for (const cell of WORLD_CELLS) {
      const lengths = edges(corners(globePose(WORLD_CELLS, strength)!, cell.q, cell.r));
      worst = Math.max(worst, Math.max(...lengths) / Math.min(...lengths));
    }
    return worst;
  };

  it('keeps every tile a hexagon — no sliver, no pinch', () => {
    // At the shipped strength the worst tile in the frozen world is the outer corner, whose two
    // RADIAL edges are 6.9% shorter than its four tangential ones — the flank that reads as the tile
    // turning away from the light.
    for (const cell of WORLD_CELLS) {
      const lengths = edges(corners(pose, cell.q, cell.r));
      expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(HEX_TOLERANCE);
    }
  });

  it('rules out the strength the owner rejected: 8% is past the hexagon bar', () => {
    // The ladder's top rung is kept as a screenshot, not as a setting. If someone raises
    // GLOBE_FALLOFF to it, this says why that is wrong before an owner ever sees it.
    expect(worstEdgeRatio(0.08)).toBeGreaterThan(HEX_TOLERANCE);
    expect(worstEdgeRatio(GLOBE_FALLOFF)).toBeLessThan(HEX_TOLERANCE);
  });

  it('leaves the middle exactly where it was and only lets the rim recede', () => {
    expect(globePoint(pose, pose.cx, pose.cy)).toEqual({ x: pose.cx, y: pose.cy });
    // Nothing anywhere is drawn larger than it is today.
    for (const cell of WORLD_CELLS) {
      const at = flatCell(cell.q, cell.r);
      const drawn = globePoint(pose, at.x, at.y);
      expect(Math.hypot(drawn.x - pose.cx, drawn.y - pose.cy))
        .toBeLessThanOrEqual(Math.hypot(at.x - pose.cx, at.y - pose.cy) + 1e-9);
    }
  });

  it('draws the rim exactly GLOBE_FALLOFF smaller than the middle', () => {
    const rim = { x: pose.cx + pose.radius, y: pose.cy };
    expect(globeScale(pose, rim.x, rim.y)).toBeCloseTo(1 - GLOBE_FALLOFF, 12);
    expect(globeScale(pose, pose.cx, pose.cy)).toBe(1);
  });

  it('squashes a rim tile RADIALLY about three times as much as it narrows it tangentially', () => {
    // That ratio is the "meridional" read: a tile turns away instead of just shrinking.
    const theta = pose.arc;
    const radial = Math.cos(theta);
    const tangential = Math.sin(theta) / theta;
    expect(tangential).toBeCloseTo(1 - GLOBE_FALLOFF, 12);
    expect(1 - radial).toBeGreaterThan(2.5 * (1 - tangential));
    expect(1 - radial).toBeLessThan(3.5 * (1 - tangential));
  });

  it('bows a straight lattice line and compresses the rows toward the rim', () => {
    // A 280-unit run at 60 off the middle becomes an ARC: its middle stays at its own radius while
    // the ends are pulled in toward the middle of the map, so the run bows AWAY from the axis like a
    // parallel of latitude. And two neighbouring cells near the rim sit closer together than two at
    // the middle: the meridians converge.
    const a = globePoint(pose, pose.cx - 140, pose.cy + 60);
    const b = globePoint(pose, pose.cx, pose.cy + 60);
    const c = globePoint(pose, pose.cx + 140, pose.cy + 60);
    expect(b.y).toBeGreaterThan((a.y + c.y) / 2 + 0.5);
    const middle = Math.hypot(mapCell(1, 0).x - mapCell(0, 0).x, mapCell(1, 0).y - mapCell(0, 0).y);
    const far = { x: pose.cx + pose.radius * 0.62, y: pose.cy };
    const inner = globePoint(pose, far.x, far.y);
    const outer = globePoint(pose, far.x + 8.66, far.y + 15);
    expect(Math.hypot(outer.x - inner.x, outer.y - inner.y)).toBeLessThan(middle);
  });

  it('never folds back on itself, however far a cell is grown', () => {
    let previous = -1;
    for (let d = 0; d < 2000; d += 5) {
      const drawn = Math.hypot(globePoint(pose, pose.cx + d, pose.cy).x - pose.cx, 0);
      expect(drawn).toBeGreaterThan(previous);
      previous = drawn;
    }
  });
});

describe('neighbours still touch', () => {
  const pose = worldGlobe()!;
  it('draws a shared corner at one point, for every pair of touching tiles', () => {
    const byId = new Map(WORLD_CELLS.map((cell) => [cell.id, cell] as const));
    let pairs = 0;
    for (const cell of WORLD_CELLS) {
      const mine = corners(pose, cell.q, cell.r);
      for (const [dq, dr] of [[1, 0], [1, -1], [0, -1]] as const) {
        const near = byId.get(`${cell.q + dq},${cell.r + dr}`);
        if (!near) continue;
        pairs++;
        const theirs = corners(pose, near.q, near.r);
        const shared = mine.filter((point) => theirs.some((other) => Math.abs(other.x - point.x) < 1e-9 && Math.abs(other.y - point.y) < 1e-9));
        // Two tiles that touch share exactly an edge: two corners, to the last bit.
        expect(shared).toHaveLength(2);
      }
    }
    expect(pairs).toBeGreaterThan(400);
  });

  it('keeps a mark on its tile: the swords use the tile’s own centre and scale', () => {
    const at = flatCell(2, 3);
    expect(mapScale(at.x, at.y)).toBeGreaterThan(0.9);
    expect(mapScale(at.x, at.y)).toBeLessThanOrEqual(1);
    const hex = mapHex(at.x, at.y);
    expect(hex.startsWith('M')).toBe(true);
    expect(hex.endsWith('Z')).toBe(true);
  });
});
