// THE SLICE FITS THE EDGE CPU LIMIT (2026-11-17). Measured on the live server: a Practice win against
// the rival bots (10-12) was checked in 1.2 s slices and a slice at times died with
// `546 WORKER_RESOURCE_LIMIT` (the Edge runtime stops a request after ~2 s of CPU). The budget is
// only looked at BETWEEN bot moves, so one slow move runs past it: measured locally, the slowest rival
// move is ~0.6 s (probe of 6 games per bot, levels 9-12), and the Edge CPU is assumed half as fast.
import { describe, expect, it } from 'vitest';
import { PROOF_SLICE_MS } from '../src/seeds/service.js';

const EDGE_CPU_LIMIT_MS = 2000;
const SLOWEST_BOT_MOVE_MS = 610;
const EDGE_SLOWER = 1.5;
/** Reading the body, the resume token, the rate limit and the receipt around the slice. */
const REQUEST_OVERHEAD_MS = 150;

describe('one proof slice', () => {
  it('plus its slowest move and the request around it stays under the Edge CPU limit', () => {
    expect(PROOF_SLICE_MS + SLOWEST_BOT_MOVE_MS * EDGE_SLOWER + REQUEST_OVERHEAD_MS).toBeLessThan(EDGE_CPU_LIMIT_MS);
  });
  it('is still long enough that a whole game is a handful of rounds, not dozens', () => {
    // a rival game is ~2.8 s of bot moves (same probe): at most ~6 rounds
    expect(Math.ceil(2800 / PROOF_SLICE_MS)).toBeLessThanOrEqual(6);
  });
});
