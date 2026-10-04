// Step 3: the board fills the screen in whichever orientation gives bigger tiles, the dock has
// one fixed height, nothing overlaps, a full hand (Fruit cards included) is always visible, no
// gap around the board is over 16pt, and the corner tools never cover a tile.
import { afterEach, describe, expect, it } from 'vitest';
import { allCoords, coordKey } from '../../src/engine/index.js';
import { BOARD_MARGIN, CENTRE_MIN, HAND_EDGE, HEIGHTS, SIDE_GAP, MAX_GAP, MAX_HAND, MIN_SLICE, SORT_W, TOOL, boardUnits, computeLayout, overlaps } from '../src/logic/layout.js';
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
      // positioning pass: the fan sits between two equal fixed slots (Undo left, Sort right)
      expect(l.card.w + (MAX_HAND - 1) * l.card.slice + 2 * (SORT_W + HAND_EDGE)).toBeLessThanOrEqual(l.dock.w + 0.01);
      const handBottom = l.dock.y + l.rows.table + l.rows.hand;
      expect(handBottom).toBeLessThanOrEqual(v.h - (v.safeBottom ?? 0) + 0.01);
    });
    it(`${v.w}x${v.h}: the board centred in its zone; no gap over ${MAX_GAP}pt unless the board already spans the full width (phones), the dock fixed`, () => {
      const l = computeLayout(v);
      if (l.mode === 'stack') {
        const above = l.board.y - l.zone.y;
        const below = l.zone.y + l.zone.h - (l.board.y + l.board.h);
        expect(Math.abs(above - below)).toBeLessThanOrEqual(0.01);
        // positioning pass: with no hint row, a tall phone has more height than a full-width board
        // can use (the dock rows already took what they can use): only then is the gap larger
        const fullWidth = l.board.w >= l.zone.w - 0.5;
        if (!fullWidth) expect(above).toBeLessThanOrEqual(MAX_GAP + 0.6);
        else if (above > MAX_GAP + 0.6) {
          const card = l.card;
          expect(l.parts.pileCard.h + 22 + 32).toBeLessThanOrEqual(l.rows.table + 0.01);
          expect(l.rows.hand).toBeGreaterThanOrEqual(card.h + HEIGHTS.handPad + 32 - 0.01);
        }
      }
      expect(computeLayout(v)).toEqual(l);
      expect(l.dock.h).toBeGreaterThanOrEqual(l.rows.table + l.rows.hand);
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
  it('the dock rows: the pile row (with the hint and the moves in it) and the hand; no message row', () => {
    const l = computeLayout({ w: 390, h: 844 });
    expect(Object.keys(l.rows)).toEqual(['table', 'hand']);
    expect('forecast' in HEIGHTS).toBe(false);
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

// v0.8 UI pass: the Draw / Grow / Throw bar is gone, its height (and the landmarks' headroom:
// the homes are now drawn top-down inside their hex) goes to the board; the piles row grows; the
// "?" sits in the board zone's lower-right corner.
const V07: Record<string, number> = { '360x640': 47.6, '390x844': 56.8, '430x932': 62.9 };
describe('v0.8 UI pass: a bigger board, bigger piles, "?" on the board', () => {
  it('no step bar: the header is the score bar and the race bar only', () => {
    const l = computeLayout({ w: 390, h: 844 });
    expect(l.header.h).toBe(HEIGHTS.hud + HEIGHTS.race);
    expect('steps' in HEIGHTS).toBe(false);
  });
  for (const v of PHONES) {
    it(`${v.w}x${v.h}: tiles bigger than v0.7 (${V07[`${v.w}x${v.h}`]}pt)`, () => {
      expect(computeLayout(v).hexPx).toBeGreaterThan(V07[`${v.w}x${v.h}`]! * 1.03);
    });
    it(`${v.w}x${v.h}: the piles row is at least 84pt (pile cards about a fifth bigger than v0.7)`, () => {
      expect(computeLayout(v).rows.table).toBeGreaterThanOrEqual(84);
    });
    it(`${v.w}x${v.h}: the "?" is in the board zone's lower-right corner, never over a tile or the dock`, () => {
      const l = computeLayout(v);
      const b = l.tools.help;
      expect(b.w).toBe(TOOL.hit);
      expect(b.x + b.w).toBeGreaterThan(l.zone.x + l.zone.w - TOOL.hit - 8);
      expect(b.y + b.h).toBeGreaterThan(l.zone.y + l.zone.h - TOOL.hit - 8);
      expect(coversTile(b, tilePolys(l))).toBe(false);
      expect(overlaps(b, l.dock)).toBe(false);
    });
  }
});

// v0.8.1: on desktop (side layout) the dock had spare height but its rows touched: the piles sat
// on the hand. The rows now have SIDE_GAP between them, and the dock box counts it (positioning
// pass: two rows, so one gap).
describe('desktop side layout: air between the dock rows', () => {
  for (const [w, h] of [[1000, 620], [1280, 800], [1440, 900], [1920, 1080]] as const) {
    it(`${w}x${h}: the dock counts a gap of at least 16pt between its rows and still fits`, () => {
      const l = computeLayout({ w, h });
      expect(l.mode).toBe('side');
      expect(SIDE_GAP).toBeGreaterThanOrEqual(16);
      expect(l.dock.h).toBeGreaterThanOrEqual(l.rows.table + l.rows.hand + SIDE_GAP);
      expect(l.dock.y + l.dock.h).toBeLessThanOrEqual(h);
      expect(overlaps(l.board, l.dock)).toBe(false);
    });
  }
});

// Positioning pass, Step 3: every dock row symmetric about the dock's centre line; the hint has
// no row of its own (its height went to the board); Undo and Sort have fixed, equal slots.
const VIEWS = [
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
  { w: 375, h: 667, safeTop: 20, safeBottom: 0 },
  { w: 390, h: 844, safeTop: 47, safeBottom: 34 },
];
describe('positioning pass: a symmetric dock', () => {
  for (const v of VIEWS) {
    const tag = `${v.w}x${v.h}${v.safeTop ? ' (notch)' : ''}`;
    it(`${tag}: pile pair, hint column, moves column and hand fan centred on the dock's centre line`, () => {
      const l = computeLayout(v);
      const c = l.dock.x + l.dock.w / 2;
      const mid = (b: { x: number; w: number }) => b.x + b.w / 2;
      const p = l.parts;
      expect(Math.abs(mid(p.piles) - c)).toBeLessThanOrEqual(1);
      expect(Math.abs(mid(p.fan) - c)).toBeLessThanOrEqual(1);
      // the hint and the moves under it sit in the centre column; the deck and the throw pile
      // mirror each other either side of it
      expect(Math.abs(mid(p.hint) - c)).toBeLessThanOrEqual(1);
      expect(Math.abs(mid(p.moves) - c)).toBeLessThanOrEqual(1);
      expect(p.deck.w).toBeCloseTo(p.discard.w, 6);
      expect(Math.abs(c - (p.deck.x + p.deck.w) - (p.discard.x - c))).toBeLessThanOrEqual(0.5);
      expect(overlaps(p.deck, p.hint) || overlaps(p.discard, p.hint) || overlaps(p.deck, p.moves) || overlaps(p.discard, p.moves)).toBe(false);
      // Undo and Sort: equal slots, mirrored, never over the largest fan
      expect(p.undo.w).toBe(p.sort.w);
      expect(Math.abs(p.undo.x - l.dock.x - (l.dock.x + l.dock.w - (p.sort.x + p.sort.w)))).toBeLessThanOrEqual(0.5);
      expect(overlaps(p.undo, p.fan)).toBe(false);
      expect(overlaps(p.sort, p.fan)).toBe(false);
      // the pile pair, hint and moves share the pile row; nothing sits in a row of its own
      for (const b of [p.hint, p.piles, p.moves]) {
        expect(b.y).toBeGreaterThanOrEqual(l.dock.y - 0.01);
        expect(b.y + b.h).toBeLessThanOrEqual(l.dock.y + l.rows.table + 0.01);
      }
      // the centre column holds a 28-character hint on one line at 14pt, and a row of moves
      expect(p.hint.w).toBeGreaterThanOrEqual(CENTRE_MIN - 0.01);
      expect(p.hint.h).toBeGreaterThanOrEqual(18);
      expect(p.moves.h).toBeGreaterThanOrEqual(44);
    });
    it(`${tag}: the pile cards are never taller than the hand's cards (the hand stays the main area)`, () => {
      const l = computeLayout(v);
      expect(l.parts.pileCard.h).toBeLessThanOrEqual(l.card.h);
      expect(l.parts.pileCard.h).toBeGreaterThanOrEqual(62); // at least the v0.8 size
    });
  }
  it('the board got the hint row back: 360x640 (height-limited) tiles grow', () => {
    // v0.8 at 360x640: 50.0pt tiles with the 56pt message row
    expect(computeLayout({ w: 360, h: 640 }).hexPx).toBeGreaterThan(50.0 * 1.05);
  });
});
