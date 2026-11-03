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
//
// STRENGTH, 2026-11-03. The owner chose 8% after seeing the whole ladder, knowing it is past the 10%
// edge-length bar (worst tile 1.1499, 56 of 274 tiles past it): rim tiles are knowingly compressed.
// `docs/DECISIONS.md` records it. The hexagon tests below therefore pin the HARD floor (1.20, the last
// rung before the tiles shear) instead of the product bar. The bar itself is kept and its breach is
// counted, so the cost stays a number rather than a deleted test.
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
   * THE PRODUCT BAR FOR "A HEX IS A HEX". The sphere squashes a rim tile radially (that IS the tilt),
   * so an edge-length ratio is how far a tile has been allowed to go. 1.10 means no edge may be more
   * than 10% away from the tile's longest: a hexagon the eye still reads as a hexagon.
   *
   * This stays the honest line, and the owner's 2026-11-03 choice of 8% sits PAST it (1.1499) by his
   * explicit decision (docs/DECISIONS.md). It is kept, not loosened, so the cost stays measurable.
   */
  const HEX_TOLERANCE = 1.1;
  /**
   * THE HARD FLOOR — what the geometry can tolerate before a tile stops reading as a hexagon at all.
   * Measured ladder for the worst tile (8,-10), max/min edge: 0.05 = 1.0877, 0.08 = 1.1499 (shipped),
   * 0.10 = 1.1962 (sharpest interior angle 109.1 degrees), 0.12 = 1.2469 (106.3 degrees — starts to
   * read as a trapezoid), 0.20 = 1.5056 (91.4 degrees, nearly rectangular), 0.40 = 3.7242. 1.20 sits
   * between the last still-hexagonal rung and the first sheared one: it leaves the owner room to nudge
   * the strength (to 0.09 or 0.10, still inside) while any jump to 0.12 or beyond fails here.
   */
  const SHEAR_CEILING = 1.2;
  const worstEdgeRatio = (strength: number) => {
    let worst = 0;
    for (const cell of WORLD_CELLS) {
      const lengths = edges(corners(globePose(WORLD_CELLS, strength)!, cell.q, cell.r));
      worst = Math.max(worst, Math.max(...lengths) / Math.min(...lengths));
    }
    return worst;
  };

  it('keeps every tile a hexagon — no sliver, no pinch', () => {
    // THE HONEST READING OF THE SHIPPED 8%. The worst tile in the frozen world is the outer corner
    // (8,-10): max/min edge = 1.1499, its two RADIAL edges 13.0% shorter than its four tangential
    // ones, interior angles 111.7/111.8 and 125.7/124.8 against a regular hexagon's 120. It reads as
    // visibly COMPRESSED — the flank turning away from the light — not as a sliver or a pinch, and
    // that is past HEX_TOLERANCE by the owner's explicit choice. So the product bar above is recorded,
    // and this test pins the HARD floor: no tile anywhere may cross it. Measured distribution at 8%:
    // median 1.0571, p90 1.1188, max 1.1499, so the compression is concentrated at the rim exactly as
    // the projection predicts.
    let worst = 0;
    for (const cell of WORLD_CELLS) {
      const lengths = edges(corners(pose, cell.q, cell.r));
      const ratio = Math.max(...lengths) / Math.min(...lengths);
      expect(ratio).toBeLessThan(SHEAR_CEILING);
      worst = Math.max(worst, ratio);
    }
    expect(worst).toBeCloseTo(1.1499, 3);
    // The cost of the owner's choice, stated as a number rather than hidden: 56 of 274 tiles are past
    // the 1.10 product bar (they were 0 at 0.05). If that count moves, the strength or the world moved.
    const pastBar = WORLD_CELLS.filter((cell) => {
      const lengths = edges(corners(pose, cell.q, cell.r));
      return Math.max(...lengths) / Math.min(...lengths) > HEX_TOLERANCE;
    }).length;
    expect(pastBar).toBe(56);
  });

  it('still refuses a bend that shears the tiles — the guard above the owner’s 8%', () => {
    // Re-pointed when the owner chose 0.08 on 2026-11-03 (docs/DECISIONS.md). Not deleted and not
    // loosened into nothing: the SHIPPED strength must stay inside the hard floor, and a bend the
    // geometry cannot carry must fail here before an owner ever sees it.
    expect(worstEdgeRatio(GLOBE_FALLOFF)).toBeLessThan(SHEAR_CEILING);
    expect(worstEdgeRatio(0.12)).toBeGreaterThan(SHEAR_CEILING); // 1.2469, sharpest angle 106.3 deg
    expect(worstEdgeRatio(0.2)).toBeGreaterThan(SHEAR_CEILING);  // 1.5056, nearly rectangular
    expect(worstEdgeRatio(0.4)).toBeGreaterThan(SHEAR_CEILING);  // 3.7242, folded over
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
