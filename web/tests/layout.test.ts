// UI overhaul items 1-2: the board fills the screen, the dock has one fixed height, nothing
// overlaps, and a full hand is always visible with a big enough slice of every card.
import { describe, expect, it } from 'vitest';
import { HEIGHTS, MAX_HAND, MIN_SLICE, boardUnits, computeLayout, overlaps } from '../src/logic/layout.js';
import type { Viewport } from '../src/logic/layout.js';

const PHONES: [Viewport, number][] = [
  [{ w: 360, h: 640 }, 0.74],
  [{ w: 390, h: 844, safeTop: 47, safeBottom: 34 }, 0.95],
  [{ w: 430, h: 932, safeTop: 59, safeBottom: 34 }, 0.95],
];
const ALL: Viewport[] = [...PHONES.map(([v]) => v), { w: 768, h: 1024 }, { w: 1280, h: 800 }];

describe('board fit and the fixed dock', () => {
  for (const [v, share] of PHONES) {
    it(`${v.w}x${v.h}: the board uses at least ${Math.round(share * 100)}% of the width`, () => {
      const l = computeLayout(v);
      expect(l.mode).toBe('stack');
      expect(l.board.w / v.w).toBeGreaterThanOrEqual(share);
    });
  }

  it('hex tap targets are 44px or more on normal phones and up (where the screen allows)', () => {
    for (const v of ALL.filter((x) => x.w >= 390)) expect(computeLayout(v).hexPx, `${v.w}x${v.h}`).toBeGreaterThanOrEqual(44);
    expect(computeLayout({ w: 360, h: 640 }).hexPx).toBeGreaterThanOrEqual(34);
  });

  for (const v of ALL) {
    it(`${v.w}x${v.h}: header, board and dock never overlap; all on screen`, () => {
      const l = computeLayout(v);
      expect(overlaps(l.board, l.dock)).toBe(false);
      expect(overlaps(l.header, l.board)).toBe(false);
      expect(overlaps(l.header, l.dock)).toBe(false);
      for (const b of [l.header, l.board, l.dock]) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(v.w + 0.01);
        expect(b.y + b.h).toBeLessThanOrEqual(v.h + 0.01);
      }
    });

    it(`${v.w}x${v.h}: a full hand of ${MAX_HAND} fits, at least ${MIN_SLICE}px of each card shows, cards above the safe area`, () => {
      const l = computeLayout(v);
      expect(l.card.slice).toBeGreaterThanOrEqual(MIN_SLICE);
      expect(l.card.w + (MAX_HAND - 1) * l.card.slice).toBeLessThanOrEqual(l.dock.w - 2 * 16 + 0.01);
      const handBottom = l.dock.y + l.rows.toolbar + l.rows.hint + l.rows.forecast + l.rows.table + l.rows.hand;
      expect(handBottom).toBeLessThanOrEqual(v.h - (v.safeBottom ?? 0) + 0.01);
    });
  }

  it('the dock height depends only on the viewport (never on what is on screen)', () => {
    const a = computeLayout({ w: 390, h: 844 });
    const b = computeLayout({ w: 390, h: 844 });
    expect(a).toEqual(b);
    expect(a.rows.forecast).toBe(HEIGHTS.forecast);
    // the forecast row is always reserved
    expect(a.dock.h).toBe(a.rows.toolbar + a.rows.hint + a.rows.forecast + a.rows.table + a.rows.hand + HEIGHTS.bottomPad);
  });

  it('wide screens keep the side dock (board left, dock right); tablets in portrait stack', () => {
    expect(computeLayout({ w: 1280, h: 800 }).mode).toBe('side');
    const l = computeLayout({ w: 1280, h: 800 });
    expect(l.board.x + l.board.w).toBeLessThanOrEqual(l.dock.x);
    expect(l.board.h).toBeGreaterThanOrEqual(560);
    expect(computeLayout({ w: 768, h: 1024 }).mode).toBe('stack');
    expect(computeLayout({ w: 768, h: 1024 }).board.w).toBeGreaterThanOrEqual(600);
  });

  it('a bigger board radius still fits (smaller hexes, same dock)', () => {
    const r3 = computeLayout({ w: 390, h: 844 }, 3);
    const r4 = computeLayout({ w: 390, h: 844 }, 4);
    expect(r4.dock).toEqual(r3.dock);
    expect(r4.hexPx).toBeLessThan(r3.hexPx);
    expect(boardUnits(4).w).toBeGreaterThan(boardUnits(3).w);
  });
});
