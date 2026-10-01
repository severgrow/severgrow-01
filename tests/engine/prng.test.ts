import { describe, expect, it } from 'vitest';
import { deriveSeed, mulberry32, randomInt, shuffle } from '../../src/engine/index.js';

describe('mulberry32', () => {
  it('matches the reference implementation for seed 0 and 1', () => {
    // Reference values from the canonical mulberry32 (Tommy Ettinger).
    const a = mulberry32(0);
    expect([a(), a(), a()]).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
    ]);
    const b = mulberry32(1);
    expect(b()).toBe(0.6270739405881613);
  });

  it('is deterministic per seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('different seeds give different streams', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('outputs are in [0, 1)', () => {
    const r = mulberry32(987654321);
    for (let i = 0; i < 10000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('treats seeds modulo 2^32 (negative and large seeds are valid)', () => {
    const a = mulberry32(-1);
    const b = mulberry32(0xffffffff);
    expect(a()).toBe(b());
  });
});

describe('randomInt', () => {
  it('stays within [0, n) and covers every value', () => {
    const r = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = randomInt(r, 6);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(6);
      seen.add(x);
    }
    expect(seen.size).toBe(6);
  });

  it('rejects n < 1 or non-integer n', () => {
    const r = mulberry32(7);
    expect(() => randomInt(r, 0)).toThrow();
    expect(() => randomInt(r, 2.5)).toThrow();
  });
});

describe('shuffle', () => {
  it('returns a permutation and does not mutate the input', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const copy = [...input];
    const out = shuffle(input, mulberry32(3));
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect([...out].sort((x, y) => x - y)).toEqual(copy);
    expect(out).not.toEqual(copy);
  });

  it('is deterministic for a seed', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(input, mulberry32(42))).toEqual(shuffle(input, mulberry32(42)));
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['x'], mulberry32(1))).toEqual(['x']);
  });
});

describe('deriveSeed', () => {
  it('is deterministic, unsigned 32-bit, and separates streams', () => {
    const a = deriveSeed(5, 1);
    expect(deriveSeed(5, 1)).toBe(a);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
    expect(deriveSeed(5, 2)).not.toBe(a);
    expect(deriveSeed(6, 1)).not.toBe(a);
  });
});
