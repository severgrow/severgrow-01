// The estimator the online soak's heap guard is built on, kept pure so it can be tested without a
// browser.
//
// Why this exists at all: `online-soak-teardown` measures the retained heap after every match, and
// the guard wants "how many bytes does one more match retain". The obvious implementation — one
// sample at the end of the first third, one at the end, divide by the tail length — is a two-point
// difference, and it carries all the measurement noise of a double-GC'd browser heap straight into
// the answer. On 2026-10-24 that turned the release red at 1172 KB/match against a 1024 guard, then
// passed on the very next run of the same code.
//
// A least-squares fit through every tail sample averages that noise out AND detects a real leak
// better, because a leak is a consistent slope. The guard threshold did not move; only the
// estimator did, in the direction of being more sensitive.
//
// Pure: no I/O, no clock, no randomness. Deterministic for a given sample set.

export type HeapSample = { readonly x: number; readonly y: number };

/**
 * Least-squares slope of y against x (bytes per unit of x — the soak passes the match number, so the
 * result is bytes retained per match).
 *
 * With fewer than three samples a fit is meaningless, so it degrades to the two-point difference
 * between the first and last sample; a short `SOAK_MATCHES` debugging run still reports something
 * rather than dividing by zero.
 */
export const fitSlope = (samples: readonly HeapSample[]): number => {
  if (samples.length === 0) return 0;
  if (samples.length < 3) {
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    return (last.y - first.y) / Math.max(1, last.x - first.x);
  }
  const n = samples.length;
  const meanX = samples.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = samples.reduce((sum, p) => sum + p.y, 0) / n;
  let cov = 0;
  let varX = 0;
  for (const p of samples) {
    cov += (p.x - meanX) * (p.y - meanY);
    varX += (p.x - meanX) ** 2;
  }
  return varX === 0 ? 0 : cov / varX;
};

/**
 * The tail samples the guard is about: every per-match sample after the first third, ordered by
 * match number. `firstN` is the split the soak already uses for its "fills once" phase, so the
 * warm-up caches are excluded from the leak fit.
 */
export const tailSamples = (
  samples: readonly HeapSample[],
  firstN: number,
): HeapSample[] =>
  samples
    .filter((p) => p.x > firstN)
    .slice()
    .sort((a, b) => a.x - b.x);
