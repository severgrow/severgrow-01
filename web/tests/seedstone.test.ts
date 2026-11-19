import { expect, it } from 'vitest';
import { seedStoneCrop } from '../src/ui/seedstone.js';

it('keeps the neighbouring stone outside the charcoal 9 crop in both renderers', () => {
  const crop = seedStoneCrop(1, 9);
  // The bottom edge of the charcoal 6 still has visible pixels at row 1277.
  expect(crop.y).toBeGreaterThan(1277);
  expect(crop.y).toBeLessThanOrEqual(1284);
  expect(crop.offsetY).toBeGreaterThan(0);
  expect(crop.y + crop.height).toBeGreaterThanOrEqual(1508);
});
