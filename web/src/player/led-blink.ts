/**
 * The display's idle re-prompt blink, as a pure cadence.
 *
 * It used to be a CSS `opacity` animation on the two glyph canvases. Measured on an idle game
 * screen (2026-10-29, 390×844 phone viewport, 4× CPU throttle): that one animation kept the main
 * thread in a full style pass every frame — ~105 ms of style recalculation and ~140 ms of
 * main-thread task per second — for as long as the player was only THINKING. On a phone that is a
 * permanent, invisible-in-the-trace drain while nobody touches the screen.
 *
 * A blink is two instants a second, not 60. This module is the decision only: which phase comes
 * next and how long it holds. `smart-cockpit.ts` owns the timer and the class that paints it, so
 * the same beat, the same dots and the same soft 20 ms edge, at ~0 cost.
 *
 * The caps stay the single source of truth (`LIGHT_CAPS.alarmMs` / `alarmOffMs`); nothing here
 * invents a new rhythm.
 */
import { LIGHT_CAPS } from './light.js';

/** The live caps the blink reads (structurally, so the test can pin its own numbers). */
export type BlinkCaps = { alarmMs: number; alarmOffMs: number };

export type BlinkPhase = {
  /** True while the dots and their bloom are OFF (the negative space of the blink). */
  off: boolean;
  /** How long this phase holds before the next one. */
  holdMs: number;
};

/** The blink's ON stretch: everything in the beat that is not the dots-off window. */
export const blinkOnMs = (caps: BlinkCaps = LIGHT_CAPS): number =>
  Math.max(0, caps.alarmMs - caps.alarmOffMs);

/** A blink beat opens with the dots ON. The first hold is the remaining ON stretch. */
export const firstBlinkPhase = (caps: BlinkCaps = LIGHT_CAPS): BlinkPhase =>
  ({ off: false, holdMs: blinkOnMs(caps) });

/**
 * The phase after `phase`. ON → OFF for `alarmOffMs`, OFF → ON for the rest of the beat, so every
 * full cycle is exactly `alarmMs` and the dots are dark for exactly `alarmOffMs` of it.
 */
export const nextBlinkPhase = (
  phase: BlinkPhase,
  caps: BlinkCaps = LIGHT_CAPS,
): BlinkPhase => (phase.off ? { off: false, holdMs: blinkOnMs(caps) } : { off: true, holdMs: Math.max(0, caps.alarmOffMs) });
