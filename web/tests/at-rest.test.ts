import { describe, expect, it } from 'vitest';
import { measureAtRest, measureAtRestWithin } from '../src/ui/at-rest.js';

const fakeAnimation = (start: number, end: number) => {
  const a = { currentTime: start as number | null, effect: { getComputedTiming: () => ({ endTime: end }) } };
  return a;
};

describe('measureAtRest', () => {
  it('reads with every animation at its end, then restores each one', () => {
    const a = fakeAnimation(120, 600);
    const b = fakeAnimation(0, 300);
    const el = { getAnimations: () => [a, b] } as unknown as Element;
    const seen = measureAtRest(el, () => [a.currentTime, b.currentTime]);
    expect(seen).toEqual([600, 300]);
    expect(a.currentTime).toBe(120);
    expect(b.currentTime).toBe(0);
  });
  it('restores even when the reading throws', () => {
    const a = fakeAnimation(50, 400);
    const el = { getAnimations: () => [a] } as unknown as Element;
    expect(() => measureAtRest(el, () => { throw new Error('x'); })).toThrow('x');
    expect(a.currentTime).toBe(50);
  });
  it('leaves infinite animations alone and works without an element', () => {
    const a = fakeAnimation(10, Infinity);
    const el = { getAnimations: () => [a] } as unknown as Element;
    expect(measureAtRest(el, () => a.currentTime)).toBe(10);
    expect(measureAtRest(null, () => 7)).toBe(7);
  });
});

describe('measureAtRestWithin', () => {
  it('jumps only the animations on the root or inside it', () => {
    const inside = { id: 'in' }, outside = { id: 'out' };
    const root = { contains: (t: unknown) => t === inside } as unknown as Element;
    const a = { ...fakeAnimation(10, 500), effect: { target: inside, getComputedTiming: () => ({ endTime: 500 }) } };
    const b = { ...fakeAnimation(20, 900), effect: { target: outside, getComputedTiming: () => ({ endTime: 900 }) } };
    const doc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { getAnimations: () => [a, b] };
    try {
      expect(measureAtRestWithin(root, () => [a.currentTime, b.currentTime])).toEqual([500, 20]);
      expect(a.currentTime).toBe(10);
    } finally {
      (globalThis as { document?: unknown }).document = doc;
    }
  });
});
