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

const TWO32 = 4294967296;

/**
 * An exactly uniform integer in [0, n) from a generator of whole numbers in [0, range)
 * (Lemire's multiply-and-reject). Each result is produced by exactly floor(range / n)
 * generator values; the few left over (range mod n of them) are rejected and drawn again,
 * so there is no modulo bias. `range` is a parameter only so tests can feed in every
 * value of a small generator; the engine uses 2^32.
 */
export const boundedInt = (next: () => number, n: number, range = TWO32): number => {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 21) throw new RangeError(`randomInt: invalid n ${n}`);
  const threshold = (range - n) % n; // = range mod n: the values to reject
  for (;;) {
    const x = next();
    if (x < 0) return -1; // test generators signal "exhausted"
    const m = x * n; // exact: x < 2^32 and n <= 2^21
    if (m % range >= threshold) return Math.floor(m / range);
  }
};

/** An exactly uniform integer in [0, n) (v0.5; see boundedInt). */
export const randomInt = (rng: Rng, n: number): number => boundedInt(() => rng() * TWO32, n);

/** The pre-v0.5 method, floor(rng() * n): kept so earlier rules versions replay exactly. */
export const randomIntLegacy = (rng: Rng, n: number): number => {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`randomInt: invalid n ${n}`);
  return Math.floor(rng() * n);
};

/**
 * Fisher-Yates shuffle. Returns a new array; the input is not mutated. `unbiased` picks
 * the random-integer method (false only for rules versions before v0.5).
 */
export const shuffle = <T>(items: readonly T[], rng: Rng, unbiased = true): T[] => {
  const out = [...items];
  const pick = unbiased ? randomInt : randomIntLegacy;
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1);
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
