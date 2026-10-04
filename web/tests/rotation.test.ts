// Positioning pass, Step 2: the board can be drawn at any of six rotations (steps of 60 degrees)
// within each orientation family, so the two homes lie on the screen's centre line (portrait:
// the opponent's volcano at the top, my tree at the bottom; a points-left-right board on a wide
// screen: my tree on the left). Display only: engine coordinates never change. Tile centres are
// snapped to device pixels through one rounded lattice, so every gap between neighbours is the
// same on screen.
import { afterEach, describe, expect, it } from 'vitest';
import { DIRECTIONS, allCoords, coordKey, newGame, rootCoord } from '../../src/engine/index.js';
import { getOrient, getRotation, homeRotation, setOrient, setRotation, toBoard, toScreen } from '../src/logic/orient.js';
import type { Orient } from '../src/logic/orient.js';
import { centerOf, setPixelGrid } from '../src/ui/geom.js';
import { hexAtPoint } from '../src/logic/draw.js';
import { snapBasis } from '../src/logic/pixelgrid.js';
import { computeLayout } from '../src/logic/layout.js';

afterEach(() => {
  setOrient('pointy');
  setRotation(0);
  setPixelGrid(0);
});

const FAMILIES: Orient[] = ['pointy', 'flat'];
const cfg = newGame(1).config;
const keys = new Set(allCoords(cfg.boardRadius).map(coordKey));
const deg = (v: { x: number; y: number }) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
const norm = (a: number) => ((a % 360) + 540) % 360 - 180;

describe('six rotations in each orientation family', () => {
  for (const o of FAMILIES) {
    for (let k = 0; k < 6; k++) {
      it(`${o}, rotation ${k}: screen <-> board round trip, every hex hit at its centre, neighbours in order`, () => {
        setOrient(o);
        setRotation(k);
        expect(getOrient()).toBe(o);
        expect(getRotation()).toBe(k);
        for (const [x, y] of [[0, 0], [12.5, -40], [-77, 3.25], [150, 150]] as const) {
          const s = toScreen(x, y);
          const b = toBoard(s.x, s.y);
          expect(b.x).toBeCloseTo(x, 9);
          expect(b.y).toBeCloseTo(y, 9);
        }
        for (const key of keys) {
          const c = centerOf(key);
          expect(hexAtPoint(c.x, c.y, keys), key).toBe(key);
        }
        // the six neighbours go round in steps of 60 degrees, the same way round as before
        const o0 = centerOf('0,0');
        const angles = DIRECTIONS.map((d) => {
          const c = centerOf(coordKey(d));
          return deg({ x: c.x - o0.x, y: c.y - o0.y });
        });
        for (let i = 1; i < 6; i++) expect(norm(angles[i]! - angles[i - 1]!)).toBeCloseTo(norm(angles[1]! - angles[0]!), 6);
        expect(Math.abs(norm(angles[1]! - angles[0]!))).toBeCloseTo(60, 6);
        // and every neighbour is the same distance away
        const d = DIRECTIONS.map((dd) => {
          const c = centerOf(coordKey(dd));
          return Math.hypot(c.x - o0.x, c.y - o0.y);
        });
        for (const x of d) expect(x).toBeCloseTo(d[0]!, 9);
      });
    }
  }
});

describe('the home axis', () => {
  const tree = coordKey(rootCoord(0, cfg.rootStyle, cfg.boardRadius));
  const volcano = coordKey(rootCoord(1, cfg.rootStyle, cfg.boardRadius));
  it('portrait (points left-right): the volcano straight above the tree, on the centre line', () => {
    setOrient('flat');
    setRotation(homeRotation('flat', cfg));
    const t = centerOf(tree);
    const v = centerOf(volcano);
    expect(t.x).toBeCloseTo(v.x, 6);
    expect(t.x + v.x).toBeCloseTo(0, 6); // symmetric about the board's centre
    expect(v.y).toBeLessThan(t.y);
  });
  it('a points-up-down board (wide screens): my tree on the left, the volcano on the right, level', () => {
    setOrient('pointy');
    setRotation(homeRotation('pointy', cfg));
    const t = centerOf(tree);
    const v = centerOf(volcano);
    expect(t.y).toBeCloseTo(v.y, 6);
    expect(t.x).toBeLessThan(v.x);
  });
});

describe('one rounded lattice: equal gaps on screen', () => {
  const viewports = [
    { w: 360, h: 640 },
    { w: 390, h: 844 },
    { w: 430, h: 932 },
    { w: 768, h: 1024 },
    { w: 1280, h: 800 },
  ];
  for (const v of viewports) {
    for (const dpr of [1, 1.5, 2, 2.625, 3]) {
      it(`${v.w}x${v.h} at pixel ratio ${dpr}: neighbour distances equal within 0.5px, centres on device pixels`, () => {
        const l = computeLayout(v);
        setOrient(l.orient);
        setRotation(homeRotation(l.orient, cfg));
        const quantum = 1 / (l.scale * dpr);
        const basis = snapBasis(quantum);
        // each basis vector is a whole number of device pixels
        for (const c of [basis.a.x, basis.a.y, basis.b.x, basis.b.y]) expect(Math.abs(c / quantum - Math.round(c / quantum))).toBeLessThan(1e-6);
        setPixelGrid(quantum);
        const dists: number[] = [];
        for (const key of keys) {
          const c = centerOf(key);
          const [q, r] = key.split(',').map(Number) as [number, number];
          for (const d of DIRECTIONS) {
            const n = coordKey({ q: q + d.q, r: r + d.r });
            if (!keys.has(n)) continue;
            const cn = centerOf(n);
            dists.push(Math.hypot(cn.x - c.x, cn.y - c.y) * l.scale);
          }
        }
        expect(Math.max(...dists) - Math.min(...dists)).toBeLessThanOrEqual(0.5);
        // and the snapped board stays close to the true one: at most 1.5 device pixels of drift per
        // step out from the centre (the corner tile is 3 steps out), the same on every side, so the
        // board stays centred
        setPixelGrid(0);
        const exact = [centerOf('3,-3'), centerOf('-3,3')];
        setPixelGrid(quantum);
        const snapped = [centerOf('3,-3'), centerOf('-3,3')];
        const drift = (i: number) => Math.hypot(exact[i]!.x - snapped[i]!.x, exact[i]!.y - snapped[i]!.y) * l.scale;
        expect(drift(0)).toBeLessThanOrEqual((3 * 1.5) / dpr);
        expect(drift(0)).toBeCloseTo(drift(1), 9);
        expect(snapped[0]!.x + snapped[1]!.x).toBeCloseTo(0, 9);
      });
    }
  }
});

describe('shadows stay inside the hex (one footprint for every tile type)', () => {
  it('a hex of any size moved down-right by any lift stays inside its tile', async () => {
    const { inFootprint } = await import('../src/ui/materials.js');
    const S = 30;
    const inside = (x: number, y: number) => Math.abs(x) <= (Math.sqrt(3) / 2) * S + 1e-6 && Math.abs(x) / Math.sqrt(3) + Math.abs(y) <= S + 1e-6;
    for (const size of [20, 24, 26.4, 27, 29]) {
      for (const lift of [0, 1, 3, 6, 12]) {
        const o = inFootprint(size, lift * 0.5, lift);
        expect(o.dy).toBeGreaterThanOrEqual(0); // down, away from the top-left light
        for (let i = 0; i < 6; i++) {
          const a = ((60 * i - 30) * Math.PI) / 180;
          // pointy-top corners (the board's own units)
          const [cx, cy] = [Math.cos(a) * size + o.dx, Math.sin(a) * size + o.dy];
          // the corner lies inside the pointy-top tile of radius S (the board's own units)
          expect(inside(cx, cy), `size ${size} lift ${lift} corner ${i}`).toBe(true);
        }
      }
    }
  });
});
