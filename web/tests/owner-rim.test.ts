// THE OWNER-COLOUR INNER RIM (owner, 2026-11-20: the owner's colour on the planet is "a thin inner
// rim on a skinned tile"). ui/owner-rim.ts is identical on the picker branch, and the planet shader
// reads its numbers directly (web/tests/planet-skin.test.ts pins that). These tests pin the
// GEOMETRY the painters are handed: always inside the hexagon, always thin, total for any radius.
import { describe, expect, it } from 'vitest';
import { HEX_APOTHEM_RATIO, OWNER_RIM, ownerRimFor } from '../src/ui/owner-rim.js';

describe('the rim contract', () => {
  it('is the design doc\'s thin inner rim: 6% in, 4.5% thick, 1.5-3 px', () => {
    expect(OWNER_RIM).toEqual({ insetFraction: 0.06, widthFraction: 0.045, minWidthPx: 1.5, maxWidthPx: 3, maxBandFraction: 0.4 });
    expect(HEX_APOTHEM_RATIO).toBeCloseTo(Math.cos(Math.PI / 6), 12);
  });

  it('at a 46 px tile (radius 23) sits 1.4 px in, 1.5 px thick', () => {
    const ring = ownerRimFor('#c0247e', 23);
    expect(ring.colour).toBe('#c0247e');
    expect(ring.insetPx).toBeCloseTo(23 * 0.06, 6);
    expect(ring.widthPx).toBe(OWNER_RIM.minWidthPx);
  });

  it('never draws thinner than 1.5 px nor fatter than 3 px on a real tile', () => {
    for (let r = 8; r <= 400; r *= 1.07) {
      const { widthPx } = ownerRimFor('#fff', r);
      expect(widthPx).toBeGreaterThanOrEqual(OWNER_RIM.minWidthPx - 1e-9);
      expect(widthPx).toBeLessThanOrEqual(OWNER_RIM.maxWidthPx + 1e-9);
    }
  });

  it('always fits inside the hexagon, at every radius including microscopic ones', () => {
    for (const r of [0, 0.5, 2, 4, 8, 23, 46, 120, 400]) {
      const { insetPx, widthPx } = ownerRimFor('#fff', r);
      const apothem = r * HEX_APOTHEM_RATIO;
      // The band's outer edge is `inset` inside the boundary and it is `width` thick, so the band
      // never reaches further in than the apothem: it is a ring, not the middle of the tile.
      expect(insetPx + widthPx).toBeLessThanOrEqual(apothem * OWNER_RIM.maxBandFraction + 1e-9);
      expect(apothem - insetPx - widthPx).toBeGreaterThanOrEqual(-1e-9);
      expect(insetPx).toBeGreaterThanOrEqual(0);
      expect(widthPx).toBeGreaterThanOrEqual(0);
    }
  });

  it('is total: a missing, zero or NaN radius yields no ring, never a throw', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const ring = ownerRimFor('#123456', bad);
      expect(ring.colour).toBe('#123456');
      expect(Number.isFinite(ring.insetPx)).toBe(true);
      expect(Number.isFinite(ring.widthPx)).toBe(true);
      expect(ring.insetPx).toBe(0);
      expect(ring.widthPx).toBe(0);
    }
  });
});
