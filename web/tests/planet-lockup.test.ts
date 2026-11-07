// The home paint does not fill its viewBox. The lockup sizes the element so the visible brush
// matches the word under it, not the padded box.
import { describe, expect, it } from 'vitest';
import { PAINT_INK, paintLockup } from '../src/player/planet-lockup.js';

describe('the menu paint matches the word', () => {
  it('the visible ink is inset inside the viewBox, and narrower than it', () => {
    expect(PAINT_INK.left).toBeCloseTo(55 / 2106);
    expect(PAINT_INK.width).toBeCloseTo(1995 / 2106);
    expect(PAINT_INK.left + PAINT_INK.width).toBeLessThan(1);
    expect(PAINT_INK.top + PAINT_INK.height).toBeLessThan(1);
  });

  it('the brush is exactly as wide as the word, and the gap is measured from the paint', () => {
    const word = { left: 100, width: 200 };
    const width = word.width / PAINT_INK.width;
    const placed = { left: 40, width, height: width * (662 / 2106) };
    const fit = paintLockup(word, placed);
    expect(fit.width).toBeCloseTo(width);
    const inkLeft = placed.left + fit.shiftX + placed.width * PAINT_INK.left;
    const inkRight = inkLeft + placed.width * PAINT_INK.width;
    expect(inkLeft).toBeCloseTo(word.left);
    expect(inkRight).toBeCloseTo(word.left + word.width);
    const gap = placed.height * (1 - PAINT_INK.top - PAINT_INK.height) + fit.marginBottom;
    expect(gap).toBeCloseTo(word.width * 0.075);
  });
});
