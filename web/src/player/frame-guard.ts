// QUIET AUTO-LOWER (Beta 0.8, owner 2026-11-06: "yes, quietly, but only when REALLY necessary").
// While moves animate, frame times are watched (main.ts watchFrames). Only a phone that stays under
// 30 frames a second for 4 seconds in a row turns the decorative extras off — dust, the light dip and
// the shake — for the rest of this visit. No note, nothing saved, the moves themselves always play.
import { perfStep } from '../logic/perf.js';
import type { PerfState } from '../logic/perf.js';

export const QUIET_PERF_RULES: { minFps: number; seconds: number; ignoreFrameMs: number } = Object.freeze({ minFps: 30, seconds: 4, ignoreFrameMs: 500 });

let extras = true;
/** True until this visit's frames have proved the phone really struggles. */
export const extrasOn = (): boolean => extras;

/** One frame for the quiet guard; returns the next state and turns the extras off on a drop. */
export const guardFrame = (s: PerfState, frameMs: number): PerfState => {
  const r = perfStep(s, frameMs, QUIET_PERF_RULES);
  if (r.drop) extras = false;
  return r.state;
};

/** Tests only: start a fresh visit. */
export const resetFrameGuard = (): void => {
  extras = true;
};
