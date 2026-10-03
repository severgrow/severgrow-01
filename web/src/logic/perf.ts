// Smoother mode (UI overhaul Part 4): watches the frame rate while things animate. Under 50
// frames a second for 3 seconds in a row, it says "drop to Low" once. Pure: the page feeds it
// frame times.
export const PERF_RULES = Object.freeze({ minFps: 50, seconds: 3, ignoreFrameMs: 500 });

export type PerfState = { slowMs: number; done: boolean };
export const perfStart = (): PerfState => ({ slowMs: 0, done: false });

/** One frame: its length in ms. `drop` is true exactly once, when the slow time reaches the limit. */
export const perfStep = (s: PerfState, frameMs: number, r = PERF_RULES): { state: PerfState; drop: boolean } => {
  if (s.done || frameMs > r.ignoreFrameMs) return { state: s, drop: false };
  const slow = frameMs > 1000 / r.minFps;
  const slowMs = slow ? s.slowMs + frameMs : 0;
  if (slowMs >= r.seconds * 1000) return { state: { slowMs, done: true }, drop: true };
  return { state: { slowMs, done: false }, drop: false };
};
