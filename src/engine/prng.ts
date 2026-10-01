// Seeded PRNG (spec section 2). This is the engine's only source of randomness.

export type Rng = () => number;

/** Canonical mulberry32. Returns floats in [0, 1). Seeds are taken modulo 2^32. */
export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Uniform integer in [0, n). */
export const randomInt = (rng: Rng, n: number): number => {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`randomInt: invalid n ${n}`);
  return Math.floor(rng() * n);
};

/** Fisher-Yates shuffle. Returns a new array; the input is not mutated. */
export const shuffle = <T>(items: readonly T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
};

/**
 * Derives an independent unsigned 32-bit seed for a named stream, so terrain and
 * deck order do not depend on each other (murmur3 fmix32 finaliser).
 */
export const deriveSeed = (seed: number, stream: number): number => {
  let h = ((seed >>> 0) ^ Math.imul(stream >>> 0, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
