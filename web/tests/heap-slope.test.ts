// The online soak's heap guard, and the estimator under it.
//
// The 2026-10-24 release failed `the tail retained-heap slope is under 1024 KB/match` at
// 1172 KB/match and passed on the very next run of the same code. The cause was not a leak: the
// guard computed its slope from TWO samples (a checkpoint at the end of the first third and one at
// the end) and divided by the tail length, so a few MB of ordinary GC jitter in a browser heap
// became a large per-match number.
//
// These tests pin the property that matters: the fitted estimator must still FAIL a real leak, and
// must IGNORE jitter of the size that produced the false red. If someone later "fixes" a red run by
// raising the threshold instead of repairing the estimate, the leak test here goes red — which is
// the point.
import { describe, expect, it } from 'vitest';
import { fitSlope, tailSamples } from '../../web/e2e/helpers/heap-slope.js';

const KB = 1024;
const MB = 1024 * 1024;
/** The soak's guard, copied deliberately: this test is about the guard's real threshold. */
const GUARD_BYTES_PER_MATCH = 1024 * KB;

/** Matches 1..15, the soak's default run, with a given retained growth per match and jitter. */
const soak = (perMatchBytes: number, jitter: (match: number) => number = () => 0) =>
  Array.from({ length: 15 }, (_, i) => {
    const match = i + 1;
    return { x: match, y: 6 * MB + perMatchBytes * match + jitter(match) };
  });

const guardFails = (samples: { x: number; y: number }[]) => {
  const firstN = Math.ceil(15 / 3); // the soak's own split: 5
  const tail = tailSamples(samples, firstN);
  return { slope: fitSlope(tail), fails: fitSlope(tail) >= GUARD_BYTES_PER_MATCH };
};

describe('the heap guard still catches a real leak', () => {
  it('a clean 32 KB/match leak is caught with a clearly sub-guard slope', () => {
    const { slope, fails } = guardFails(soak(32 * KB));
    expect(fails).toBe(false);
    expect(Math.abs(slope - 32 * KB)).toBeLessThan(1);
  });

  it('a genuine 2 MB/match leak FAILS the guard', () => {
    const { slope, fails } = guardFails(soak(2 * MB));
    expect(fails).toBe(true);
    expect(slope).toBeGreaterThan(GUARD_BYTES_PER_MATCH);
  });

  it('the old two-point estimator agrees on a clean leak but is the one that flaked', () => {
    // Reproduce the old arithmetic exactly, to document the difference rather than assert a myth.
    const samples = soak(20 * KB);
    const mid = samples[4]!; // end of the first third (match 5)
    const end = samples[14]!;
    const oldTail = (end.y - mid.y) / (15 - 5);
    const firstN = 5;
    const newTail = fitSlope(tailSamples(samples, firstN));
    expect(Math.abs(oldTail - newTail)).toBeLessThan(KB); // both see ~20 KB/match
  });
});

describe('jitter the size that produced the false red does not trip it', () => {
  const firstN = 5;

  it('ONE stale endpoint — the actual flake shape — fails the old estimate and passes the fit', () => {
    // A settled 6 MB heap whose final sample reads 12 MB high because V8 had not trimmed yet. This
    // is the real failure mode: a two-point difference divides that one bad reading by ten matches
    // and reports a leak that is not there.
    const settled = Array.from({ length: 15 }, (_, i) => ({ x: i + 1, y: 6 * MB }));
    const stale = settled.map((p) => (p.x === 15 ? { ...p, y: p.y + 12 * MB } : p));

    const oldTail = (stale[14]!.y - stale[4]!.y) / (15 - firstN);
    const newTail = fitSlope(tailSamples(stale, firstN));

    expect(oldTail).toBeGreaterThan(GUARD_BYTES_PER_MATCH); // the false red
    expect(newTail).toBeLessThan(GUARD_BYTES_PER_MATCH); // correctly quiet
  });

  it('an alternating +/-6 MB tail stays under the guard', () => {
    const jitter = (m: number) => (m % 2 === 0 ? 6 * MB : -6 * MB);
    const { fails } = guardFails(soak(0, jitter));
    expect(fails).toBe(false);
  });

  it('a gradual warming of caches in the tail is not mistaken for a leak', () => {
    // Caches fill once and then flatten; a fit through the tail absorbs the leftover slope.
    const warm = (m: number) => (m <= 8 ? 4 * MB * (m - 5) : 4 * MB * 3);
    const { fails } = guardFails(soak(0, warm));
    expect(fails).toBe(false);
  });
});

describe('the fit is pure and well behaved', () => {
  it('is exactly the slope for a perfect line', () => {
    const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: 1000 + 250 * x }));
    expect(fitSlope(points)).toBe(250);
  });

  it('is symmetric: reversing the sample order gives the same slope', () => {
    const points = [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 500 + 75 * x + (x % 2 === 0 ? 400 : -400) }));
    expect(fitSlope([...points].reverse())).toBe(fitSlope(points));
  });

  it('never divides by zero, and degrades to two points on a short run', () => {
    expect(fitSlope([])).toBe(0);
    expect(fitSlope([{ x: 3, y: 900 }])).toBe(0);
    expect(fitSlope([{ x: 1, y: 100 }, { x: 5, y: 900 }])).toBe(200);
    // A flat line through stacked samples is zero, not NaN.
    expect(fitSlope([{ x: 1, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 7 }])).toBe(0);
  });

  it('the tail excludes the warm-up third the soak uses for "fills once"', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({ x, y: x }));
    expect(tailSamples(samples, 5).map((p) => p.x)).toEqual([6, 7, 8, 9, 10]);
    expect(tailSamples([...samples].reverse(), 5).map((p) => p.x)).toEqual([6, 7, 8, 9, 10]);
  });
});
