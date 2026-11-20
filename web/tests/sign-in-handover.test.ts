// The Google sign-in hand-over's patience (web/src/accounts/handover.ts). These are the numbers that
// decide whether a player whose server was merely busy sees "did not finish" (owner report,
// 2026-11-20: signed out, then Google showed that sheet). They are pinned against the SERVER's own
// behaviour so a later tidy-up cannot quietly shrink them back to a guess.
import { describe, expect, it } from 'vitest';
import {
  GOOGLE_HANDOVER_BACKOFF_MS,
  GOOGLE_HANDOVER_MS,
  GOOGLE_HANDOVER_RETRY_MS,
  googleHandOverBudgetMs,
  transientHandOver,
} from '../src/accounts/handover.js';
import { QUERY_STALL_DEFAULT_MS } from '../../server/src/storage/stall-guard.js';

describe('the Google hand-over waits for the server', () => {
  it('outlives the server database stall guard, so its own 503 (and its fresh connections) arrive', () => {
    expect(QUERY_STALL_DEFAULT_MS).toBe(10_000);
    expect(GOOGLE_HANDOVER_MS).toBeGreaterThan(QUERY_STALL_DEFAULT_MS);
    // The margin covers a cold isolate (~0.45 s) and the database round trip, not a second guess.
    expect(GOOGLE_HANDOVER_MS - QUERY_STALL_DEFAULT_MS).toBeLessThanOrEqual(3_000);
  });
  it('gives each retry over ten times the measured cost of one hand-over', () => {
    // Warm 0.13-0.34 s measured on the live server (2026-11-20); cold ~0.45 s (docs/ONLINE-SMOOTHNESS.md).
    expect(GOOGLE_HANDOVER_RETRY_MS).toBeGreaterThanOrEqual(10 * 340);
  });
  it('retries more than once, with short waits between attempts', () => {
    // One retry covered a single 503; a 3 s-cold hand-over and a two-503 burst did not.
    expect(GOOGLE_HANDOVER_BACKOFF_MS.length).toBe(2);
    for (const wait of GOOGLE_HANDOVER_BACKOFF_MS) expect(wait).toBeLessThanOrEqual(1_000);
  });
  it('is bounded: the whole sign-in ends inside 25 s', () => {
    expect(googleHandOverBudgetMs()).toBe(21_300);
    expect(googleHandOverBudgetMs()).toBeLessThan(25_000);
    // The first attempt is not the whole budget: both retries are still allowed after it.
    expect(googleHandOverBudgetMs() - GOOGLE_HANDOVER_MS).toBeGreaterThanOrEqual(2 * GOOGLE_HANDOVER_RETRY_MS);
  });
  it('presents a transient failure again, and never a 4xx answer', () => {
    for (const status of [0, 500, 502, 503, 504, 599]) expect(transientHandOver(status)).toBe(true);
    // 401 is a real session refusal; 4xx answers are never repeated.
    for (const status of [200, 400, 401, 403, 404, 429]) expect(transientHandOver(status)).toBe(false);
  });
});
