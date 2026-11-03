// THE MAP ON THE GLOBE (web/src/online/map-globe.ts), CENTRED ON THE VIEW.
//
// The owner rejected a per-tile size falloff that produced visible contours (branch `fisheye-a`,
// 8.5% at the rim, drawn by growing the middle). What he asked for is the LATTICE bending like the
// meridians and parallels of a wireframe globe, at a strength he would call "nothing crazy". Then,
// on 2026-11-03: "position still jumps ... we need a diffrent approach" and "always the middle of
// the view - whats currently in the centre of the view is 'larger'". So the sphere is now POSED BY
// THE CAMERA (`viewGlobePose`): its centre is the world point under the middle of the view and its
// radius is the view's half-diagonal. The tests below pin the three things that make that honest:
//
//   1. the projection is a real sphere, so the bow and the compression cannot drift apart;
//   2. neighbours still share their exact corners — a warp may never open a seam;
//   3. the middle of the VIEW is untouched and the rim only recedes, so no tile anywhere grows.
//
// and one more that the 8% exposed: a tap must resolve against the DRAWN centres, not the flat ones.
//
// STRENGTH, 2026-11-03. The owner chose 8% after seeing the whole ladder. On the reference phone
// view below (390 x 844, the world view capped by the 46px cell floor) the worst tile measures
// 1.2234, past the 10% product bar (HEX_TOLERANCE) exactly as he was told. `docs/DECISIONS.md`
// records it. The hard floor is re-pointed, not deleted: 1.30, which the shipped 8% passes (1.2234)
// and a genuinely broken 0.12 fails (1.3870), so the cost cannot quietly widen.
import { describe, expect, it } from 'vitest';
import { WORLD_CELLS } from '../../server/src/world.js';
import {
  GLOBE_FALLOFF,
  X,
  R,
  arcFor,
  flatCell,
  globeHex,
  globePoint,
  globePose,
  globeScale,
  nearestCell,
  sameGlobePose,
  viewGlobePose,
  type GlobePose,
} from '../src/online/map-globe.js';

const CORNERS = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]] as const;
const corners = (pose: GlobePose, q: number, r: number) =>
  CORNERS.map(([dx, dy]) => { const at = flatCell(q, r); return globePoint(pose, at.x + dx * R, at.y + dy * R); });
const edges = (points: { x: number; y: number }[]) =>
  points.map((a, i) => { const b = points[(i + 1) % 6]!; return Math.hypot(b.x - a.x, b.y - a.y); });

/**
 * THE REFERENCE PHONE VIEW: the canvas the menu and the Territory share on a 390 x 844 phone. The
 * world view is capped so a CELL (including the rim's 8% squeeze) is at least 46 CSS px:
 * width = 390 * (X * R) / (46 / 0.92) = 135.1 world units, height follows the screen's aspect.
 */
const REFERENCE_BOX = [
  -390 * X * R / 50 / 2,
  -390 * X * R / 50 / (390 / 844) / 2,
  390 * X * R / 50,
  390 * X * R / 50 / (390 / 844),
] as const;

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
    expect(viewGlobePose([0, 0, 0, 10], 0.08)).toBeNull();
    expect(viewGlobePose([0, 0, 10, 10], 0)).toBeNull();
  });
});

describe('the view poses the globe, not the world', () => {
  it('puts the fat middle of the sphere under the middle of the camera', () => {
    const pose = viewGlobePose([-50, -80, 100, 160])!;
    expect(pose.cx).toBe(0);
    expect(pose.cy).toBe(0);
    // Its rim is the view's own half-diagonal, so the screen corners are exactly the 8% rung.
    expect(pose.radius).toBeCloseTo(Math.hypot(100, 160) / 2, 12);
    expect(globeScale(pose, pose.cx, pose.cy)).toBe(1);
    expect(globeScale(pose, pose.cx + pose.radius, pose.cy)).toBeCloseTo(1 - GLOBE_FALLOFF, 12);
  });

  it('follows the camera: panning moves the middle, zooming keeps the effect the same size', () => {
    const a = viewGlobePose([-50, -80, 100, 160])!;
    const panned = viewGlobePose([10, -20, 100, 160])!;
    expect(panned.cx - a.cx).toBeCloseTo(60, 12);
    expect(panned.cy - a.cy).toBeCloseTo(60, 12);
    expect(sameGlobePose(a, panned)).toBe(false);
    // Half the view in world units = half the sphere's radius: the visible rim rung does not change.
    const zoomed = viewGlobePose([-25, -40, 50, 80])!;
    expect(zoomed.sphere / a.sphere).toBeCloseTo(0.5, 12);
    expect(zoomed.arc).toBeCloseTo(a.arc, 12);
    // A sub-pixel/1e-9 nudge would draw the same pixels and must not trigger a re-pose.
    expect(sameGlobePose(a, viewGlobePose([-50 + 1e-9, -80, 100, 160]))).toBe(true);
  });

  it('draws a tile at the middle larger than the SAME tile panned to the view edge', () => {
    // Requirement 3 as a number: the middle is the fattest point of the view. The same cell (its
    // flat centre, and therefore its size) is measured with the camera on it, then with the same
    // camera panned so that cell sits on the view's right edge.
    const width = 135.1, height = 292.37;
    const at = flatCell(4, 0);
    const centre = viewGlobePose([at.x - width / 2, at.y - height / 2, width, height])!;
    const edge = viewGlobePose([at.x - width, at.y - height / 2, width, height])!;
    const middle = globeScale(centre, at.x, at.y);
    const rim = globeScale(edge, at.x, at.y);
    expect(middle).toBe(1);
    expect(rim).toBeLessThan(middle);
    expect(middle - rim).toBeGreaterThan(0.003); // measured: ~0.006 at the horizontal edge
  });
});

describe('the drawn map is a sphere, not a scale', () => {
  const pose = globePose(WORLD_CELLS, GLOBE_FALLOFF)!;
  /**
   * THE PRODUCT BAR FOR "A HEX IS A HEX". The sphere squashes a rim tile radially (that IS the
   * tilt), so an edge-length ratio is how far a tile has been allowed to go. 1.10 means no edge may
   * be more than 10% away from the tile's longest: a hexagon the eye still reads as a hexagon.
   */
  const HEX_TOLERANCE = 1.1;
  /**
   * THE HARD FLOOR on the VIEW pose. Measured on the reference phone view: the shipped 8% is
   * 1.2234 (91 of 274 tiles past the product bar), 0.10 is 1.2995 (still inside) and 0.12 is
   * 1.3870. 1.30 sits between the last still-hexagonal rung and the first that reads as a
   * trapezoid, so it leaves the owner room to nudge up a little while a broken bend fails here.
   */
  const SHEAR_CEILING = 1.3;
  const worstEdgeRatio = (strength: number, box: readonly [number, number, number, number] = REFERENCE_BOX) => {
    const viewPose = viewGlobePose(box, strength)!;
    let worst = 0;
    for (const cell of WORLD_CELLS) {
      const lengths = edges(corners(viewPose, cell.q, cell.r));
      worst = Math.max(worst, Math.max(...lengths) / Math.min(...lengths));
    }
    return worst;
  };

  it('keeps every tile a hexagon at the shipped view — the 8% cost stated as a number', () => {
    // The owner chose 8% knowing it is past the product bar. On the reference view the worst tile
    // is (-9,-2) at 1.2234; 91 of 274 tiles are past 1.10. The HARD floor is what is asserted; the
    // bar is recorded and counted so the cost cannot be quietly widened later.
    let worst = 0;
    let pastBar = 0;
    const viewPose = viewGlobePose(REFERENCE_BOX, GLOBE_FALLOFF)!;
    for (const cell of WORLD_CELLS) {
      const lengths = edges(corners(viewPose, cell.q, cell.r));
      const ratio = Math.max(...lengths) / Math.min(...lengths);
      expect(ratio).toBeLessThan(SHEAR_CEILING);
      if (ratio > HEX_TOLERANCE) pastBar++;
      worst = Math.max(worst, ratio);
    }
    expect(worst).toBeCloseTo(1.2234, 3);
    expect(pastBar).toBe(91);
  });

  it('still refuses a bend that shears the tiles — the guard above the owner’s 8%', () => {
    expect(worstEdgeRatio(GLOBE_FALLOFF)).toBeLessThan(SHEAR_CEILING); // 1.2234
    // 0.10 is 1.2995: just inside, so the owner still has room to nudge up one rung.
    expect(worstEdgeRatio(0.10)).toBeLessThan(SHEAR_CEILING);
    expect(worstEdgeRatio(0.12)).toBeGreaterThan(SHEAR_CEILING);       // 1.3870
    expect(worstEdgeRatio(0.2)).toBeGreaterThan(SHEAR_CEILING);        // 1.9324
  });

  it('leaves the middle of the VIEW exactly where it was and only lets the rim recede', () => {
    const viewPose = viewGlobePose(REFERENCE_BOX, GLOBE_FALLOFF)!;
    expect(globePoint(viewPose, viewPose.cx, viewPose.cy)).toEqual({ x: viewPose.cx, y: viewPose.cy });
    for (const cell of WORLD_CELLS) {
      const at = flatCell(cell.q, cell.r);
      const drawn = globePoint(viewPose, at.x, at.y);
      expect(Math.hypot(drawn.x - viewPose.cx, drawn.y - viewPose.cy))
        .toBeLessThanOrEqual(Math.hypot(at.x - viewPose.cx, at.y - viewPose.cy) + 1e-9);
    }
  });

  it('draws the rim exactly GLOBE_FALLOFF smaller than the middle', () => {
    const viewPose = viewGlobePose(REFERENCE_BOX, GLOBE_FALLOFF)!;
    expect(globeScale(viewPose, viewPose.cx + viewPose.radius, viewPose.cy)).toBeCloseTo(1 - GLOBE_FALLOFF, 12);
    expect(globeScale(viewPose, viewPose.cx, viewPose.cy)).toBe(1);
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
    const a = globePoint(pose, pose.cx - 140, pose.cy + 60);
    const b = globePoint(pose, pose.cx, pose.cy + 60);
    const c = globePoint(pose, pose.cx + 140, pose.cy + 60);
    expect(b.y).toBeGreaterThan((a.y + c.y) / 2 + 0.5);
    const middle = Math.hypot(
      globePoint(pose, flatCell(1, 0).x, flatCell(1, 0).y).x - globePoint(pose, flatCell(0, 0).x, flatCell(0, 0).y).x,
      globePoint(pose, flatCell(1, 0).x, flatCell(1, 0).y).y - globePoint(pose, flatCell(0, 0).x, flatCell(0, 0).y).y,
    );
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

describe('neighbours still touch at the shipped view', () => {
  it('draws a shared corner at one point, for every pair of touching tiles', () => {
    // Two different view centres, so the seam proof follows the pose and not one lucky middle.
    for (const box of [REFERENCE_BOX, [-120, -60, 135.1, 292.37] as const]) {
      const pose = viewGlobePose(box, GLOBE_FALLOFF)!;
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
    }
  });

  it('keeps a mark on its tile: the swords use the tile’s own centre and scale', () => {
    const at = flatCell(2, 3);
    const pose = viewGlobePose(REFERENCE_BOX, GLOBE_FALLOFF)!;
    expect(globeScale(pose, at.x, at.y)).toBeGreaterThan(0.8);
    expect(globeScale(pose, at.x, at.y)).toBeLessThanOrEqual(1);
    const hex = globeHex(pose, at.x, at.y);
    expect(hex.startsWith('M')).toBe(true);
    expect(hex.endsWith('Z')).toBe(true);
  });
});

describe('a tap resolves against what is DRAWN', () => {
  const pose = viewGlobePose(REFERENCE_BOX, GLOBE_FALLOFF)!;
  /** The flat-centre rule the 8% commit's hit test was wrongly described as using. */
  const nearestFlat = (x: number, y: number) => {
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const cell of WORLD_CELLS) {
      const at = flatCell(cell.q, cell.r);
      const distance = (at.x - x) ** 2 + (at.y - y) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = cell.id; }
    }
    return best;
  };

  it('selects the tile whose DRAWN centre the finger is on, at the view centre', () => {
    const at = flatCell(0, 0);
    const drawn = globePoint(pose, at.x, at.y);
    expect(nearestCell(WORLD_CELLS, pose, drawn.x, drawn.y)?.id).toBe('0,0');
  });

  it('selects the tile whose DRAWN centre the finger is on, near the view edge', () => {
    // (-1,9) is near the view's top-right corner; the 8% bend moves its centre ~13 world units.
    const at = flatCell(-1, 9);
    const drawn = globePoint(pose, at.x, at.y);
    expect(nearestCell(WORLD_CELLS, pose, drawn.x, drawn.y)?.id).toBe('-1,9');
    // And the flat rule would have selected a DIFFERENT cell at that same drawn point — this is the
    // bug the bend exposed, kept as a guard so a future "nearest flat centre" hit test fails here.
    expect(nearestFlat(drawn.x, drawn.y)).toBe('-1,8');
  });

  it('selects every drawn tile at its own centre anywhere in the reference view', () => {
    let checked = 0;
    for (const cell of WORLD_CELLS) {
      const at = flatCell(cell.q, cell.r);
      const drawn = globePoint(pose, at.x, at.y);
      if (Math.abs(drawn.x) > REFERENCE_BOX[2] / 2 || Math.abs(drawn.y) > REFERENCE_BOX[3] / 2) continue;
      checked++;
      expect(nearestCell(WORLD_CELLS, pose, drawn.x, drawn.y)?.id).toBe(cell.id);
    }
    expect(checked).toBeGreaterThan(20);
  });
});
