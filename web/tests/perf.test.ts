// UI overhaul Part 4: Smoother mode. If animations run under 50 frames a second for 3 seconds
// in a row, effects drop to Low once, and the player is asked once whether to keep it.
import { describe, expect, it } from 'vitest';
import { PERF_RULES, perfStart, perfStep } from '../src/logic/perf.js';

const run = (frameMs: number, seconds: number, st = perfStart()) => {
  let s = st;
  let fired = false;
  for (let t = 0; t < seconds * 1000; t += frameMs) {
    const r = perfStep(s, frameMs);
    s = r.state;
    fired ||= r.drop;
  }
  return { s, fired };
};

describe('Smoother mode', () => {
  it('60 fps never drops', () => expect(run(1000 / 60, 20).fired).toBe(false));
  it('a short stutter (under 3s of slow frames) never drops', () => {
    const a = run(1000 / 30, 2.5);
    expect(a.fired).toBe(false);
    expect(run(1000 / 60, 1, a.s).fired).toBe(false); // recovered: the slow time starts again
  });
  it(`under ${PERF_RULES.minFps} fps for ${PERF_RULES.seconds}s in a row: drops, once`, () => {
    const a = run(1000 / 30, 3.5);
    expect(a.fired).toBe(true);
    expect(run(1000 / 20, 10, a.s).fired).toBe(false); // never twice
  });
  it('45 fps (just under) counts as slow; 55 fps does not', () => {
    expect(run(1000 / 45, 4).fired).toBe(true);
    expect(run(1000 / 55, 10).fired).toBe(false);
  });
  it('one very long frame (a tab switch) is ignored, not counted as 3 seconds', () => {
    expect(perfStep(perfStart(), 5000).drop).toBe(false);
  });
});
