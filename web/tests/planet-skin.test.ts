// THE PLANET'S SKIN IS ONE SURFACE (owner, 2026-11-15: "on the planet it looks like it puts color on
// tiles and skin on top -- looking ugly", and, about the art, "the rotation of tiles there is also
// messed up, should be always in default orientation", clarified as "meaning the skin").
//
// Two things are guarded here, because neither can be seen in a Node test any other way:
//  1. the ground shader composites a skinned tile as the PICTURE ALONE — no owner colour under it, no
//     owner colour mixed into it, and no per-tile choice of picture (so all land of one owner reads as
//     one sheet, in one orientation);
//  2. ownership still has a place on the tile: the quiet inner edge line is drawn in the OWNER's
//     colour on a skinned tile.
// The real pixels are checked on the built page by web/e2e/planet-skins.ts (a magenta owner colour
// over a water skin must leave no magenta on the tile, and every skinned tile's centre patch must
// correlate with the others' at >= .8).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSphere, latticeMap, type V3 } from '../src/sphere/geometry.js';
import { tileFace } from '../src/sphere/tile-face.js';
import { rotate, type Quat } from '../src/sphere/rotation.js';
import { EYE } from '../src/sphere/renderer.js';

const source = readFileSync(new URL('../src/sphere/renderer.ts', import.meta.url), 'utf8');
/** The ground shader's skin branch: from `float skinned` to the tile's material. */
const skin = source.slice(source.indexOf('float skinned'), source.indexOf("// THE TILE'S MATERIAL"));

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
  it('still marks the owner where owners meet, in the owner colour, on the edge only', () => {
    expect(source).toContain('mix(vColour, vec3(.94, .91, .82), .3)');
    // The line is the `band` term: inside the tile, gated by the border bit and by owned ground.
    const band = source.slice(source.indexOf('float band'), source.indexOf('colour = mix(colour, edge'));
    expect(band).toContain('* border * owned');
  });
});

/** A planet point's direction on screen, in the renderer's own projection (scale is irrelevant to an
 *  angle; every factor that is common to x and y drops out). */
const screenDirection = (q: Quat, p: V3): { x: number; y: number } => {
  const r = rotate(q, p);
  return { x: r[0] / (EYE - r[2]), y: r[1] / (EYE - r[2]) };
};

describe('every skinned tile shows its picture the same way up', () => {
  it("the picture-up of neighbouring tiles projects to the same direction within 1 degree", () => {
    const sphere = buildSphere();
    const map = latticeMap(sphere);
    const north: V3 = [0, 1, 0];
    // One fixed pose: the home cell turned to face the camera, level (as a landed flight leaves it).
    const home = sphere.cells[map.cellOf.get('0,0')!]!;
    const c0 = home.centre;
    const axis: V3 = [c0[1], -c0[0], 0];
    const len = Math.hypot(...axis);
    const angle = Math.acos(Math.max(-1, Math.min(1, c0[2])));
    const q: Quat = len < 1e-9 ? [0, 0, 0, 1]
      : [(axis[0] / len) * Math.sin(angle / 2), (axis[1] / len) * Math.sin(angle / 2), 0, Math.cos(angle / 2)];
    const ids = ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '-1,0', '-1,1', '0,2', '1,2', '2,-1', '3,0', '3,1', '0,3'];
    const ups: number[] = [];
    for (const id of ids) {
      const i = map.cellOf.get(id);
      if (i === undefined) continue;
      const c = sphere.cells[i]!;
      const corners = c.corners.map((k) => sphere.corners[k]!);
      const face = tileFace(c.centre, corners, north);
      // The picture's top edge is the hex edge highest in the tile's own (levelled) frame.
      let best = -Infinity, pa = 0, pb = 1;
      for (let k = 0; k < corners.length; k++) {
        const a = face.coords[k]!, b = face.coords[(k + 1) % corners.length]!;
        const y = (a[1] + b[1]) / 2;
        if (y > best) { best = y; pa = k; pb = (k + 1) % corners.length; }
      }
      const A = corners[pa]!, B = corners[pb]!;
      const mid: V3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
      const at = screenDirection(q, c.centre), tip = screenDirection(q, mid);
      ups.push((Math.atan2(tip.x - at.x, -(tip.y - at.y)) * 180) / Math.PI);
    }
    const rad = ups.map((a) => (a * Math.PI) / 180);
    const mean = Math.atan2(rad.reduce((s, a) => s + Math.sin(a), 0), rad.reduce((s, a) => s + Math.cos(a), 0)) * 180 / Math.PI;
    const worst = Math.max(...ups.map((a) => Math.abs(((a - mean + 540) % 360) - 180)));
    expect(ups.length).toBeGreaterThan(10);
    expect(worst).toBeLessThan(1);
  });
});
