// THE PLANET'S SKIN IS ONE SURFACE, IN ONE ORIENTATION (owner, 2026-11-15: "on the planet it looks
// like it puts color on tiles and skin on top -- looking ugly", and, about the art, "the rotation of
// tiles there is also messed up, should be always in default orientation", clarified as "meaning the
// skin"; then 2026-11-16: "theres still pink visible under it - it should be replacing the color and
// fitting in the hex nicely. also some of the skins tiles are rotated - use the og rotation").
//
// Four rules are guarded here, because none of them can be seen in a Node test any other way:
//  1. the ground shader composites a skinned tile as the PICTURE ALONE — no owner colour under it, no
//     owner colour mixed into it, and no per-tile choice of picture (so all land of one owner reads as
//     one sheet, in one orientation);
//  2. NO owner colour anywhere on a skinned tile, at any radius — not just in the middle;
//  3. the picture fills the tile (its own mask edge never reaches the rim);
//  4. every tile turns its art by the SAME half hex step, so no tile can sit 60 degrees off its
//     neighbours on screen.
// The real pixels are checked on the built page by web/e2e/planet-skins.ts: a magenta owner colour
// over a water skin must leave no magenta anywhere on a tile's rim, every skinned tile's middle must
// match the others' at >= .8, and no tile may sit at another's on-screen angle.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSphere, homeQuat, latticeMap, unit, type Sphere, type V3 } from '../src/sphere/geometry.js';
import { HALF_STEP, tileFace } from '../src/sphere/tile-face.js';
import { stampCoordinates } from '../src/sphere/challenge-stamp.js';
import { inverse, multiply, rotate, type Quat } from '../src/sphere/rotation.js';
import { northUpDrag } from '../src/sphere/upright.js';
import { EYE } from '../src/sphere/renderer.js';

const source = readFileSync(new URL('../src/sphere/renderer.ts', import.meta.url), 'utf8');
/** The ground shader's skin branch: from `float skinned` to the tile's material. */
const skin = source.slice(source.indexOf('float skinned'), source.indexOf("// THE TILE'S MATERIAL"));
/** The pixel pass order, after the material: the owner line, the selection ring, the grout. */
const rim = source.slice(source.indexOf('// OWNER BORDERS'), source.indexOf('colour += (hash(gl_FragCoord.xy)'));

describe('a skinned planet tile wears the picture alone', () => {
  it('takes its colour from the picture, never from the owner', () => {
    expect(skin).toContain('c = t.rgb;');
    // The old line mixed the owner's colour in under the art's soft alpha — the coloured margin and
    // the pale halo at every tile's rim.
    expect(skin).not.toMatch(/mix\(\s*c\s*,\s*t\.rgb/);
    expect(skin).not.toContain('vColour');
  });
  it('draws the same default picture on every tile of a set', () => {
    // No pick from the seed: the nine plain pictures are nine different paintings, and shuffling them
    // across the planet made one holding read as tiles turned every which way.
    expect(skin).not.toMatch(/float pick/);
    expect(skin).not.toContain('vSeed');
    expect(skin).toContain('quadrant + vec2(uv.x, 1.0 - uv.y)');
  });
  it('fills the tile: the sample stays inside the atlas hexagon, never on its mask edge', () => {
    // The atlas cell is masked to the same hexagon the tile is, and the transparent pixels outside it
    // carry a pale grey; sampling 1:1 put that on every rim ("fitting in the hex nicely"). Inner 94%.
    expect(skin).toContain('vTile * .47 + .5');
    expect(skin).not.toContain('vTile * .5 + .5');
  });
});

describe('no owner colour is painted on a skinned tile, at any radius', () => {
  it('turns the owner line off on skinned tiles and keeps it on plain ones', () => {
    // The line itself is unchanged for colour-only tiles (`mix(c, cream, .3)`); it is gated OFF by
    // `(1.0 - skinned)`, so no owner colour reaches a skinned tile at any radius.
    expect(rim).toContain('* border * owned * (1.0 - skinned)');
    expect(rim).toContain('mix(colour, mix(c, vec3(.94, .91, .82), .3) * lit, band * .6)');
    // The old owner-coloured edge (`mix(vColour, cream, .3)`) must not come back.
    expect(rim).not.toContain('vColour');
  });
  it('keeps ownership readable without colour: a deeper seam along the territory edge', () => {
    // The grout widens and deepens only on a skinned tile's border sides: a groove between two
    // plates, never a tint on anyone's art.
    expect(rim).toContain('float frontier = border * owned * skinned;');
    expect(rim).toMatch(/smoothstep\(1\.0 - w \* mix\(1\.7, 2\.9, frontier\)/);
  });
});

/** A planet point's direction on screen, in the renderer's own projection (scale is irrelevant to an
 *  angle; every factor common to x and y drops out). Camera space is y-up, so a screen angle measured
 *  clockwise from straight up is atan2(x, y). */
const screenAngle = (q: Quat, p: V3, d: V3, eps = 1e-3): number => {
  const at = rotate(q, p), tip = rotate(q, [p[0] + d[0] * eps, p[1] + d[1] * eps, p[2] + d[2] * eps]);
  const a = { x: at[0] / (EYE - at[2]), y: at[1] / (EYE - at[2]) };
  const b = { x: tip[0] / (EYE - tip[2]), y: tip[1] / (EYE - tip[2]) };
  return (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
};
/** The stamp frame's basis (challenge-stamp.ts): x = east, y = `north` projected on the tangent plane. */
const basis = (centre: V3, north: V3): { x: V3; y: V3 } => {
  const aligned = Math.abs(north[0] * centre[0] + north[1] * centre[1] + north[2] * centre[2]);
  const up: V3 = aligned < .99 ? north : (Math.abs(centre[0]) < .9 ? [1, 0, 0] : [0, 0, 1]);
  const x: V3 = [up[1] * centre[2] - up[2] * centre[1], up[2] * centre[0] - up[0] * centre[2], up[0] * centre[1] - up[1] * centre[0]];
  const l = Math.hypot(...x);
  const ex: V3 = [x[0] / l, x[1] / l, x[2] / l];
  const ey: V3 = [centre[1] * ex[2] - centre[2] * ex[1], centre[2] * ex[0] - centre[0] * ex[2], centre[0] * ex[1] - centre[1] * ex[0]];
  return { x: ex, y: ey };
};
/** The direction the ART's up points on the ground: the face frame's +y, carried back to the sphere. */
const artUp = (centre: V3, north: V3, angle: number): V3 => {
  const { x, y } = basis(centre, north);
  const t = -angle, s = Math.sin(t), c = Math.cos(t);
  return unit([x[0] * s + y[0] * c, x[1] * s + y[1] * c, x[2] * s + y[2] * c]);
};
/** The view's north (planet.ts): the home cell's own north — one fixed vector for the whole planet. */
const viewNorth = (sphere: Sphere, map: ReturnType<typeof latticeMap>) =>
  unit(rotate(inverse(homeQuat(sphere, map, '0,0')), [0, 1, 0]));
/** The pose a landing leaves: the home cell faces the camera (north up), then the view turns by the
 *  destination tile's reported angle — `roll = -tileFace().angle` in planet.ts. */
const settled = (sphere: Sphere, map: ReturnType<typeof latticeMap>, id: string, north: V3): Quat => {
  const to = northUpDrag(homeQuat(sphere, map, id), viewNorth(sphere, map), 0, 0, 1);
  const c = sphere.cells[map.cellOf.get(id)!]!;
  const turn = -tileFace(c.centre, c.corners.map(i => sphere.corners[i]!), north).angle;
  return multiply([0, 0, Math.sin(turn / 2), Math.cos(turn / 2)], to);
};
/** Every tile's art-up on screen, and how far the worst sits off the mean. */
const artSpread = (sphere: Sphere, map: ReturnType<typeof latticeMap>, ids: readonly string[], q: Quat, north: V3, turnOf: (c: (typeof sphere.cells)[number]) => number) => {
  const ups: number[] = [];
  for (const id of ids) {
    const i = map.cellOf.get(id);
    if (i === undefined) continue;
    const c = sphere.cells[i]!;
    if (c.pentagon || rotate(q, c.centre)[2] < 0) continue;
    const d = artUp(c.centre, north, turnOf(c));
    ups.push(screenAngle(q, c.centre, d));
  }
  const rad = ups.map(a => (a * Math.PI) / 180);
  const mean = Math.atan2(rad.reduce((s, a) => s + Math.sin(a), 0), rad.reduce((s, a) => s + Math.cos(a), 0)) * 180 / Math.PI;
  return { count: ups.length, ups, worst: Math.max(...ups.map(a => Math.abs(((a - mean + 540) % 360) - 180))) };
};
/** THE RULE THIS REPLACED (owner's report, 2026-11-16): turn so the hex edge nearest north is on top.
 *  Kept here only to show what it did to the art — it asked which of six edges was nearest, and the
 *  lattice's answer drifted, so scattered tiles came out a whole hex edge (60 degrees) apart. */
const nearestNorthTurn = (centre: V3, corners: readonly V3[], north: V3): number => {
  const uv = stampCoordinates(centre, corners, north);
  let best = -Infinity, mx = 0, my = 1;
  for (let i = 0; i < uv.length; i++) {
    const a = uv[i]!, b = uv[(i + 1) % uv.length]!;
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    const facing = y / (Math.hypot(x, y) || 1);
    if (facing > best) { best = facing; mx = x; my = y; }
  }
  return Math.atan2(mx, my);
};

/** The board's own cells: the product plays radius 3, so radius 6 is the generous case. */
const boardIds = (() => {
  const out: string[] = [];
  for (let r = -6; r <= 6; r++) for (let q = -6; q <= 6; q++) if (Math.abs(r + q) <= 6) out.push(`${r},${q}`);
  return out;
})();

describe('every skinned tile shows the picture the same way up ON SCREEN', () => {
  it('turns every tile by the same half hex step, so no tile sits 60 degrees off', () => {
    const sphere = buildSphere();
    const map = latticeMap(sphere);
    const north = viewNorth(sphere, map);
    expect(HALF_STEP).toBeCloseTo(Math.PI / 6, 12);
    // The renderer takes the turn from tileFace, and tileFace's turn is a constant.
    expect(source).toContain('tileFace(c.centre, c.corners.map(i => sphere.corners[i]!), north)');
    for (const id of ['0,0', '1,0', '0,1', '-1,0', '3,2']) {
      const c = sphere.cells[map.cellOf.get(id)!]!;
      expect(tileFace(c.centre, c.corners.map(i => sphere.corners[i]!), north).angle).toBeCloseTo(HALF_STEP, 12);
    }
    const q = settled(sphere, map, '0,0', north);
    const r = artSpread(sphere, map, boardIds, q, north, () => HALF_STEP);
    expect(r.count).toBeGreaterThan(100);
    // Measured: worst 3.3 degrees across the whole 127-cell board; none anywhere near 60.
    expect(r.worst).toBeLessThan(5);
    expect(Math.max(...r.ups.map(a => Math.abs(a)))).toBeLessThan(6);
  });
  it('still rests flat side up: the top edge is level on screen', () => {
    const sphere = buildSphere();
    const map = latticeMap(sphere);
    const north = viewNorth(sphere, map);
    const q = settled(sphere, map, '0,0', north);
    const tilts: number[] = [];
    for (const id of boardIds) {
      const i = map.cellOf.get(id);
      if (i === undefined) continue;
      const c = sphere.cells[i]!;
      if (c.pentagon || rotate(q, c.centre)[2] < 0) continue;
      const corners = c.corners.map(k => sphere.corners[k]!);
      const face = tileFace(c.centre, corners, north);
      // The topmost edge's midpoint, in planet space.
      let top = -Infinity, edge = 0;
      for (let e = 0; e < 6; e++) {
        const a = face.coords[e]!, b = face.coords[(e + 1) % 6]!;
        if ((a[1] + b[1]) / 2 > top) { top = (a[1] + b[1]) / 2; edge = e; }
      }
      const A = corners[edge]!, B = corners[(edge + 1) % 6]!;
      const mid: V3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
      const d = unit([mid[0] - c.centre[0], mid[1] - c.centre[1], mid[2] - c.centre[2]]);
      tilts.push(screenAngle(q, c.centre, d));
    }
    expect(tilts.length).toBeGreaterThan(100);
    // Owner, 2026-11-14: flat side up. Measured: within 4 degrees across the board.
    expect(Math.max(...tilts.map(a => Math.abs(a)))).toBeLessThan(6);
  });
  it('would catch the rule it replaced: 52 of the 127 cells came out 60 degrees apart', () => {
    const sphere = buildSphere();
    const map = latticeMap(sphere);
    const north = viewNorth(sphere, map);
    const q = settled(sphere, map, '0,0', north);
    const r = artSpread(sphere, map, boardIds, q, north,
      (c) => -nearestNorthTurn(c.centre, c.corners.map(i => sphere.corners[i]!), north));
    expect(r.count).toBeGreaterThan(100);
    expect(r.ups.filter(a => Math.abs(a) > 30).length).toBeGreaterThan(40);
    expect(r.worst).toBeGreaterThan(35);
  });
});
