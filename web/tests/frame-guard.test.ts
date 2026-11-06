// Beta 0.8: the quiet auto-lower acts only when REALLY necessary (owner, 2026-11-06).
import { beforeEach, describe, expect, it } from 'vitest';
import { QUIET_PERF_RULES, extrasOn, guardFrame, resetFrameGuard } from '../src/player/frame-guard.js';
import { PERF_RULES, perfStart } from '../src/logic/perf.js';

describe('quiet auto-lower', () => {
  beforeEach(() => resetFrameGuard());
  it('is much stricter than the old Smoother mode: under 30 fps for 4 s in a row', () => {
    expect(QUIET_PERF_RULES.minFps).toBeLessThan(PERF_RULES.minFps);
    expect(QUIET_PERF_RULES.seconds).toBeGreaterThan(PERF_RULES.seconds);
  });
  it('40 fps for a long time, or short stalls between good frames, never turns anything off', () => {
    let s = perfStart();
    for (let i = 0; i < 2000; i++) s = guardFrame(s, 25);
    for (let i = 0; i < 2000; i++) s = guardFrame(s, i % 10 === 0 ? 16 : 45);
    expect(extrasOn()).toBe(true);
  });
  it('a phone stuck at ~20 fps for 4 s turns the extras off for the visit', () => {
    let s = perfStart();
    for (let i = 0; i < 90; i++) s = guardFrame(s, 50);
    expect(extrasOn()).toBe(false);
  });
});
