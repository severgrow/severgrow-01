// Step 3: the board fills the screen in whichever orientation gives bigger tiles, the dock has
// one fixed height, nothing overlaps, a full hand (Fruit cards included) is always visible, no
// gap around the board is over 16pt, and the corner tools never cover a tile.
import { afterEach, describe, expect, it } from 'vitest';
import { allCoords, coordKey } from '../../src/engine/index.js';
import { BOARD_MARGIN, HEIGHTS, MAX_GAP, MAX_HAND, MIN_SLICE, SORT_W, TOOL, boardUnits, computeLayout, overlaps } from '../src/logic/layout.js';
import type { Box, Layout, Viewport } from '../src/logic/layout.js';
import { setOrient } from '../src/logic/orient.js';
import { cornerPts } from '../src/ui/geom.js';

afterEach(() => setOrient('pointy'));
const PHONES: Viewport[] = [{ w: 360, h: 640 }, { w: 390, h: 844 }, { w: 430, h: 932 }];
const SAFE: Viewport[] = [{ w: 390, h: 844, safeTop: 47, safeBottom: 34 }, { w: 430, h: 932, safeTop: 59, safeBottom: 34 }];
const ALL: Viewport[] = [...PHONES, ...SAFE, { w: 768, h: 1024 }, { w: 1280, h: 800 }];
/** The old layout's tile widths (pt), measured before this change. */
const BEFORE: Record<string, number> = { '360x640': 36.9, '390x844': 49.7, '430x932': 54.9 };

/** Every tile's outline on screen (px) for a layout. */
const tilePolys = (l: Layout, radius = 3) => {
  setOrient(l.orient);
  const u = boardUnits(radius, l.orient);
  const px = (x: number, y: number) => [l.board.x + (x - u.x0) * l.scale, l.board.y + (y - u.y0) * l.scale] as const;
  return allCoords(radius).map((c) => cornerPts(coordKey(c), 30).map(([x, y]) => px(x, y)));
};
const inPoly = (x: number, y: number, poly: readonly (readonly [number, number])[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const coversTile = (b: Box, polys: ReturnType<typeof tilePolys>) => {
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const x = b.x + (b.w * i) / 8;
    const y = b.y + (b.h * j) / 8;
    if (polys.some((p) => inPoly(x, y, p))) return true;
  }
  return false;
};

describe('the bigger board: the better orientation, chosen by measurement', () => {
  for (const v of PHONES) {
    it(`${v.w}x${v.h}: tiles at least as big as before, and the turned board when it wins`, () => {
      const l = computeLayout(v);
      const flat = boardUnits(3, 'flat');
      const pointy = boardUnits(3, 'pointy');
      const sFlat = Math.min(l.zone.w / flat.w, l.zone.h / flat.h);
      const sPointy = Math.min(l.zone.w / pointy.w, l.zone.h / pointy.h);
      expect(l.orient).toBe(sFlat > sPointy ? 'flat' : 'pointy');
      expect(l.hexPx).toBeGreaterThanOrEqual(BEFORE[`${v.w}x${v.h}`]!);
    });
  }
  it('on a tall portrait phone the turned board wins by about 15%', () => {
    for (const v of [{ w: 390, h: 844 }, { w: 430, h: 932 }]) {
      const l = computeLayout(v);
      expect(l.orient).toBe('flat');
      expect(l.hexPx / BEFORE[`${v.w}x${v.h}`]!).toBeGreaterThan(1.12);
    }
  });
  it('tile tap size: 44pt or more on every phone', () => {
    for (const v of [...PHONES, ...SAFE]) expect(computeLayout(v).hexPx, `${v.w}x${v.h}`).toBeGreaterThanOrEqual(44);
  });
});

describe('three fixed zones, nothing overlaps', () => {
  for (const v of ALL) {
    it(`${v.w}x${v.h}: header, board zone and dock never overlap; all on screen; margins kept`, () => {
      const l = computeLayout(v);
      expect(overlaps(l.board, l.dock)).toBe(false);
      expect(overlaps(l.header, l.board)).toBe(false);
      expect(overlaps(l.header, l.dock)).toBe(false);
      for (const b of [l.header, l.board, l.dock]) {
        expect(b.x).toBeGreaterThanOrEqual(-0.01);
        expect(b.y).toBeGreaterThanOrEqual(-0.01);
        expect(b.x + b.w).toBeLessThanOrEqual(v.w + 0.01);
        expect(b.y + b.h).toBeLessThanOrEqual(v.h + 0.01);
      }
      expect(l.board.x).toBeGreaterThanOrEqual((v.safeLeft ?? 0) + BOARD_MARGIN - 0.01);
    });
    it(`${v.w}x${v.h}: a full hand of ${MAX_HAND} (Fruit cards too) fits beside the Sort button, ${MIN_SLICE}px of each card shows, above the safe area`, () => {
      const l = computeLayout(v);
      expect(l.card.slice).toBeGreaterThanOrEqual(MIN_SLICE);
      expect(l.card.w + (MAX_HAND - 1) * l.card.slice + SORT_W).toBeLessThanOrEqual(l.dock.w - 2 * 16 + 0.01);
      const handBottom = l.dock.y + l.rows.forecast + l.rows.table + l.rows.hand;
      expect(handBottom).toBeLessThanOrEqual(v.h - (v.safeBottom ?? 0) + 0.01);
    });
    it(`${v.w}x${v.h}: no gap above or below the board over ${MAX_GAP}pt (phones), the dock fixed`, () => {
      const l = computeLayout(v);
      if (l.mode === 'stack') {
        expect(l.board.y - l.zone.y).toBeLessThanOrEqual(MAX_GAP + 0.6);
        expect(l.zone.y + l.zone.h - (l.board.y + l.board.h)).toBeLessThanOrEqual(MAX_GAP + 0.6);
      }
      expect(computeLayout(v)).toEqual(l);
      expect(l.dock.h).toBeGreaterThanOrEqual(l.rows.forecast + l.rows.table + l.rows.hand);
    });
    it(`${v.w}x${v.h}: the corner tools (40pt, 44pt hit area) never cover a tile`, () => {
      const l = computeLayout(v);
      const polys = tilePolys(l);
      for (const [name, b] of Object.entries(l.tools)) {
        expect(b.w).toBe(TOOL.hit);
        expect(coversTile(b, polys), `${name} at ${JSON.stringify(b)}`).toBe(false);
        expect(overlaps(b, l.dock)).toBe(false);
      }
    });
  }
  it('the dock rows: the message row (hint or forecast), piles, hand (no toolbar row)', () => {
    const l = computeLayout({ w: 390, h: 844 });
    expect(Object.keys(l.rows)).toEqual(['forecast', 'table', 'hand']);
    expect(l.rows.forecast).toBeGreaterThanOrEqual(HEIGHTS.forecast);
  });
  it('wide screens keep the side dock (board left, dock right); tablets in portrait stack', () => {
    const l = computeLayout({ w: 1280, h: 800 });
    expect(l.mode).toBe('side');
    expect(l.board.x + l.board.w).toBeLessThanOrEqual(l.dock.x);
    expect(computeLayout({ w: 768, h: 1024 }).mode).toBe('stack');
  });
  it('the radius-4 board (report only) still fits, with smaller tiles', () => {
    const r3 = computeLayout({ w: 390, h: 844 }, 3);
    const r4 = computeLayout({ w: 390, h: 844 }, 4);
    expect(r4.hexPx).toBeLessThan(r3.hexPx);
    expect(boardUnits(4).w).toBeGreaterThan(boardUnits(3).w);
  });
});
