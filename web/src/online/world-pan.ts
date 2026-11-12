// THE TERRITORY CAMERA'S LIMITS AND FEEL — pure maths, unit-tested (web/tests/world-pan.test.ts).
//
// Owner brief, 2026-11-03: "Players must be able to drag beyond EVERY edge of the discovered map, on
// all four sides. Even outermost tiles must be able to reach the centre of the visible Territory
// viewport ... make overscroll feel soft and elastic rather than hitting an invisible wall" and "a
// quick drag release should carry a small amount of momentum ... slow, deliberate dragging should
// stop exactly where the finger leaves it".
//
// WHY THE OLD LIMIT COULD NOT DO IT. The camera's whole box was kept inside the world's extent plus
// an 18-unit pad, so the outermost row could reach the SCREEN EDGE and no further — on a phone the
// top coast stopped ~340px short of the panel's middle. Growing the pad would only have moved the
// wall. Here the limit is on the one point that matters, the FOCUS: the world point under the middle
// of the VISIBLE Territory panel (the panel is a crop of the menu's full-bleed canvas, so its middle
// is not the canvas middle). The focus may visit every discovered cell centre, plus `PAN_OVERSCAN`
// beyond, where the undiscovered rings show. Because the limit is on a point, it is the same at
// every zoom: zooming never makes an edge unreachable, and never invents more empty travel.
//
// THE GLOBE. The sphere is posed on the CANVAS centre (shared with the menu, see `map-globe.ts`); the
// panel's middle sits a few percent below it, where the bend is under 0.5% (measured: 0.4px on a
// 390 x 844 phone), so the flat focus is the drawn one to well under a pixel. No inverse projection.
import { R, X } from './map-globe.js';

export type ViewBox = [number, number, number, number];
/** The rectangle the FOCUS may occupy, in flat world units. */
export type FocusLimits = { minX: number; minY: number; maxX: number; maxY: number };
/** The focus as a fraction of the camera box: the middle of the visible panel. 0.5/0.5 = the canvas middle. */
export type Focus = { fx: number; fy: number };

/** How far past the outermost cell centre the focus may go: one cell, so the first fog ring shows. */
export const PAN_OVERSCAN = X * R;
/** The furthest the edge ever gives, as a fraction of the view (a hint of give, not a web page bounce). */
export const RUBBER_MAX = 0.15;
/** The rubber band's stiffness (the familiar 0.55: resistance grows smoothly as it is pulled). */
const RUBBER_C = 0.55;

const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/** The focus limits for a set of cells: their centres' extent plus the overscan. */
export const focusLimits = (cells: readonly { q: number; r: number }[], overscan = PAN_OVERSCAN): FocusLimits => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const x = X * (cell.q + cell.r / 2) * R, y = 1.5 * cell.r * R;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!(minX <= maxX)) return { minX: -overscan, minY: -overscan, maxX: overscan, maxY: overscan };
  return { minX: minX - overscan, minY: minY - overscan, maxX: maxX + overscan, maxY: maxY + overscan };
};

/** The world point under the focus of a camera box. */
export const focusOf = (box: readonly number[], focus: Focus): { x: number; y: number } =>
  ({ x: box[0]! + focus.fx * box[2]!, y: box[1]! + focus.fy * box[3]! });

/** The legal range of the box ORIGIN on each axis, for this box size. */
const originRange = (size: number, lo: number, hi: number, f: number): [number, number] => [lo - f * size, hi - f * size];

/** The HARD limit: the focus is brought inside the limits on each axis. A legal box is returned as is. */
export const hardPan = (box: readonly number[], limits: FocusLimits, focus: Focus): ViewBox => {
  const w = finite(box[2]!, 1) > 0 ? box[2]! : 1, h = finite(box[3]!, 1) > 0 ? box[3]! : 1;
  const [xlo, xhi] = originRange(w, limits.minX, limits.maxX, focus.fx);
  const [ylo, yhi] = originRange(h, limits.minY, limits.maxY, focus.fy);
  const x = Math.max(xlo, Math.min(xhi, finite(box[0]!, (xlo + xhi) / 2)));
  const y = Math.max(ylo, Math.min(yhi, finite(box[1]!, (ylo + yhi) / 2)));
  return [x, y, w, h];
};

/** Is the focus past a limit (beyond a hair of rounding)? */
export const isOutside = (box: readonly number[], limits: FocusLimits, focus: Focus): boolean => {
  const at = focusOf(box, focus);
  // A ten-thousandth of a world unit: a camera sitting ON a limit is never "outside" by rounding.
  const eps = 1e-4;
  return at.x < limits.minX - eps || at.x > limits.maxX + eps || at.y < limits.minY - eps || at.y > limits.maxY + eps;
};

/**
 * THE GIVE. Past the edge by `excess`, the camera shows `rubber(excess)`: continuous at the edge,
 * less than the finger travelled, each further step giving less, and never more than `RUBBER_MAX` of
 * the view. Signed, so it serves both ends of an axis.
 */
export const rubber = (excess: number, size: number): number => {
  if (!excess || !(size > 0)) return 0;
  const d = RUBBER_MAX * size;
  const e = Math.abs(excess);
  const shown = d * (1 - 1 / ((e * RUBBER_C) / d + 1));
  return Math.sign(excess) * shown;
};

/** The inverse of `rubber`: how far past the edge a raw camera is, for a shown give (resuming a drag mid-return). */
export const unrubber = (shown: number, size: number): number => {
  if (!shown || !(size > 0)) return 0;
  const d = RUBBER_MAX * size;
  const s = Math.min(Math.abs(shown), d * 0.999);
  return Math.sign(shown) * (d / RUBBER_C) * (1 / (1 - s / d) - 1);
};

/** The raw camera that `softPan` would SHOW as `shown`, so a finger landing on a giving edge picks it up without a jump. */
export const rawFor = (shown: readonly number[], limits: FocusLimits, focus: Focus): ViewBox => {
  const hard = hardPan(shown, limits, focus);
  return [hard[0] + unrubber(shown[0]! - hard[0], hard[2]), hard[1] + unrubber(shown[1]! - hard[1], hard[3]), hard[2], hard[3]];
};

/** The box a RAW (unclamped, finger-following) camera is SHOWN as: legal axes untouched, the rest given softly. */
export const softPan = (raw: readonly number[], limits: FocusLimits, focus: Focus): ViewBox => {
  const hard = hardPan(raw, limits, focus);
  const w = hard[2], h = hard[3];
  const dx = finite(raw[0]!, hard[0]) - hard[0], dy = finite(raw[1]!, hard[1]) - hard[1];
  return [hard[0] + rubber(dx, w), hard[1] + rubber(dy, h), w, h];
};

/** One finger sample, in screen pixels and milliseconds. */
export type Sample = { t: number; x: number; y: number };
/** Samples older than this before the release say nothing about the flick. */
const FLICK_WINDOW_MS = 100;

/**
 * THE FINGER'S SPEED AT THE RELEASE, in px/ms, from the last ~100ms of samples. A finger that rested
 * before lifting (no sample in the window) has none: a slow, deliberate drag stops where it is left.
 */
export const releaseVelocity = (samples: readonly Sample[], now: number): { x: number; y: number } => {
  const recent = samples.filter((s) => now - s.t <= FLICK_WINDOW_MS);
  if (recent.length < 2) return { x: 0, y: 0 };
  const a = recent[0]!, b = recent[recent.length - 1]!;
  const dt = b.t - a.t;
  if (!(dt > 0)) return { x: 0, y: 0 };
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
};

/** Below this release speed (px/ms) nothing carries: it was a placement, not a flick. */
export const FLICK_MIN = 0.3;
/** The carry's time constant: ~0.22s to lose two thirds of its speed. Short, like a weighted dial. */
const MOMENTUM_TAU_MS = 220;
/** Speed at which the carry has visibly ended. */
const MOMENTUM_STOP = 0.03;

/** One frame of the carry: the distance travelled this frame and the speed left after it. */
export const momentumStep = (v: { x: number; y: number }, dt: number): { dx: number; dy: number; v: { x: number; y: number }; done: boolean } => {
  const step = Math.max(0, Math.min(64, dt));
  const decay = Math.exp(-step / MOMENTUM_TAU_MS);
  // The distance is the integral of the decaying speed over the frame, so frame rate cannot change it.
  const travel = MOMENTUM_TAU_MS * (1 - decay);
  const next = { x: v.x * decay, y: v.y * decay };
  return { dx: v.x * travel, dy: v.y * travel, v: next, done: Math.hypot(next.x, next.y) < MOMENTUM_STOP };
};
