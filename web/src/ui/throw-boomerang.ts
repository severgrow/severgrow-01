// THE SWIPE-UP THROW'S BOOMERANG (owner, 2026-10-25).
//
// One authored motion: the card lifts off the hand, flies toward the board, turns a few degrees,
// settles into alignment for an instant as if placed, then comes back to the Throw pile — a
// boomerang. It is deliberately quiet: one turn out, one turn home, no bounce, no loop.
//
// PRESENTATION ONLY. The game commits the throw before this plan is read (main.ts calls
// session.play, then the discard step draws the flight). Nothing here sees the session, an action
// or the legal move list, so it can never gate or delay the real move; fast-forward skips it.
//
// The vocabulary is the interface-motion one (the `--ix-*` tokens, mirrored in
// `ui/interface-motion.ts`): the outbound leg is `open`, the settle hold is `press`, the return is
// `close`, and the short fade that hands the pile over is a fraction of `press`. No new curves.
import { INTERFACE_MOTION } from './interface-motion.js';

/** The fade tail is shorter than the acknowledgement: just enough to hand the pile over. */
const fade = Math.round(INTERFACE_MOTION.press * 0.6);
const out = INTERFACE_MOTION.open;
const hold = INTERFACE_MOTION.press;
const back = INTERFACE_MOTION.close;
const land = out + hold + back;
const total = land + fade;

export const BOOMERANG = Object.freeze({
  out,
  hold,
  back,
  fade,
  total,
  /** Fractions of `total` (the test and the discard step read these, never repeat them). */
  settleAt: out / total,
  holdAt: (out + hold) / total,
  landAt: land / total,
  /** How big the card is while it appears placed on the board (a near-tile size). */
  boardScale: 0.62,
  /** Degrees: a small turn on the way out and a smaller one on the way home. */
  spinOut: -11,
  spinBack: 7,
});

export type FlightRect = { left: number; top: number; width: number; height: number };

export type BoomerangPlan = {
  /** 0 when motion is off: no frames, no flight. */
  duration: number;
  frames: Keyframe[];
  /** ms after the start at which the card is on the pile, before the fade. */
  landMs: number;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const at = (x: number, y: number): string => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

const pose = (x: number, y: number, deg: number, scale: number): string =>
  `${at(x, y)} rotate(${deg}deg) scale(${scale.toFixed(3)})`;

/**
 * Plan the flight in viewport coordinates. `board` is the point on the board it settles over
 * (the player's home), `to` is the Throw pile's real rect. Returns `duration: 0` and no frames
 * when motion is not allowed, or when there is no box to fly from.
 */
export const planBoomerang = (
  from: FlightRect,
  board: { x: number; y: number },
  to: FlightRect,
  allowed: boolean,
): BoomerangPlan => {
  if (!allowed || from.width < 1 || from.height < 1 || to.height < 1) {
    return { duration: 0, frames: [], landMs: 0 };
  }
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const outX = board.x - cx;
  const outY = board.y - cy;
  const toX = to.left + to.width / 2 - cx;
  const toY = to.top + to.height / 2 - cy;
  const pileScale = to.height / Math.max(from.height, 1);
  const midOut = BOOMERANG.settleAt * 0.62;
  const midBack = BOOMERANG.holdAt + (BOOMERANG.landAt - BOOMERANG.holdAt) * 0.55;
  const frames: Keyframe[] = [
    { transform: pose(0, 0, 0, 1), opacity: 1, offset: 0, easing: INTERFACE_MOTION.easeOpen },
    // The lift: most of the way to the board, already turning.
    {
      transform: pose(outX * 0.64, outY * 0.64 - 12, BOOMERANG.spinOut, lerp(1, BOOMERANG.boardScale, 0.64)),
      opacity: 1,
      offset: midOut,
    },
    // Aligned: rotation zero, a near-tile size, as if it had been placed for a moment.
    {
      transform: pose(outX, outY, 0, BOOMERANG.boardScale),
      opacity: 1,
      offset: BOOMERANG.settleAt,
      easing: INTERFACE_MOTION.easeOpen,
    },
    { transform: pose(outX, outY, 0, BOOMERANG.boardScale), opacity: 1, offset: BOOMERANG.holdAt },
    // The boomerang home: a smaller turn the other way.
    {
      transform: pose(
        lerp(outX, toX, 0.55),
        lerp(outY, toY, 0.55),
        BOOMERANG.spinBack,
        lerp(BOOMERANG.boardScale, pileScale, 0.55),
      ),
      opacity: 1,
      offset: midBack,
      easing: INTERFACE_MOTION.easeOpen,
    },
    // Arrival: exactly on the pile's rect (centre + its height), before the fade.
    { transform: pose(toX, toY, 0, pileScale), opacity: 1, offset: BOOMERANG.landAt },
    { transform: pose(toX, toY, 0, pileScale), opacity: 0, offset: 1 },
  ];
  return { duration: BOOMERANG.total, frames, landMs: Math.round(BOOMERANG.total * BOOMERANG.landAt) };
};
