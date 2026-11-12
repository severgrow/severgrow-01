import { describe, expect, it } from 'vitest';
import { buildSphere } from '../src/sphere/geometry.js';
import { stampCoordinates } from '../src/sphere/challenge-stamp.js';

describe('challenged-cell stamp coordinates do not alter the sphere', () => {
  it('aligns sword tips with the same geographic north used by the north-up camera', () => {
    const points=stampCoordinates([0,0,1],[[.1,0,.99],[0,.1,.99]], [1,0,0]);
    expect(points[0]![1]).toBeGreaterThan(.99);
    expect(Math.abs(points[0]![0])).toBeLessThan(1e-8);
    expect(Math.abs(points[1]![1])).toBeLessThan(1e-8);
  });
  it('keeps a finite, bounded, centred stamp on hexes, pentagons and poles', () => {
    const sphere = buildSphere(2);
    for (const cell of sphere.cells) {
      const points = stampCoordinates(cell.centre, cell.corners.map(i => sphere.corners[i]!));
      expect(points.length).toBe(cell.corners.length);
      expect(Math.max(...points.map(p => Math.hypot(...p)))).toBeCloseTo(1);
      for (const point of points) for (const component of point) {
        expect(Number.isFinite(component)).toBe(true);
        expect(Math.abs(component)).toBeLessThanOrEqual(1.00001);
      }
    }
    expect(stampCoordinates([0,1,0], [[.1,.99,0],[0,.99,.1],[-.1,.99,0]])[0]?.every(Number.isFinite)).toBe(true);
  });
});
