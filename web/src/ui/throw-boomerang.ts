// THE THROW'S BOOMERANG (owner, 2026-10-25; remade 2026-11-08: "it doesn't look satisfying and is too
// quick. work on it to make it 10/10").
//
// One authored motion, in six readable legs:
//   1. wind-up  - the card rises off the hand a hair, tips back, grows a touch: the hand lets go;
//   2. out      - it arcs to the board, turning, and arrives square at a near-tile size;
//   3. kiss     - it presses onto the board for an instant (a small give, then seated), as if placed;
//   4. back     - it comes home on a curved path, spinning one full turn like a real boomerang;
//   5. catch    - it lands a touch big on the pile and settles to the pile's own size;
//   6. hand-off - a short fade over the pile top, which turned over at the catch.
// The pile answers the catch with its own small thud (main.ts, `PILE_THUD`).
//
// PRESENTATION ONLY. The game commits the throw before this plan is read (main.ts calls
// session.play, then the discard step draws the flight). Nothing here sees the session, an action
// or the legal move list, so it can never gate or delay the real move; fast-forward skips it.
// Since 0.8 a player's own animation never blocks their input, and a throw ends the turn, so the
// flight may be longer than the old 248 ms squeeze: it is `PINNED.boomerang`.
//
// Easing comes from the interface vocabulary (`INTERFACE_MOTION`), no hand-written curve here.
import { PINNED } from '../logic/motion.js';
import { INTERFACE_MOTION } from './interface-motion.js';

/** Leg lengths as shares of the whole flight. */
const SHARE = Object.freeze({ windup: 0.08, out: 0.3, kiss: 0.12, back: 0.36, catch: 0.08, fade: 0.06 });

const total = PINNED.boomerang;
const ms = (share: number): number => Math.round(total * share);
const windup = ms(SHARE.windup);
const out = ms(SHARE.out);
const kiss = ms(SHARE.kiss);
const back = ms(SHARE.back);
const catchMs = ms(SHARE.catch);
const fade = total - windup - out - kiss - back - catchMs;

export const BOOMERANG = Object.freeze({
  windup,
  out,
  kiss,
  back,
  catch: catchMs,
  fade,
  total,
  /** Fractions of `total` (the tests and the discard step read these, never repeat them). */
  liftAt: windup / total,
  settleAt: (windup + out) / total,
  holdAt: (windup + out + kiss) / total,
  landAt: (windup + out + kiss + back) / total,
  seatAt: (windup + out + kiss + back + catchMs) / total,
  /** How big the card is while it appears placed on the board (a near-tile size). */
  boardScale: 0.72,
  /** The kiss: how far the card gives as it touches the board. */
  press: 0.94,
  /** Wind-up: a small lift and tip as the hand lets go. */
  liftPx: 10,
  liftTip: 4,
  liftScale: 1.05,
  /** Degrees on the way out. The way home is one whole turn. */
  spinOut: -16,
  spinBack: 360,
  /** The return path bows out by this share of its length (a curve, not a straight line home). */
  bow: 0.2,
  /** The catch lands this much bigger than the pile, then seats. */
  catchScale: 1.08,
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
  /** The screen, so the way home bows toward its middle and never off an edge. */
  view: { width: number; height: number } = { width: 0, height: 0 },
): BoomerangPlan => {
  if (!allowed || from.width < 1 || from.height < 1 || to.height < 1) {
    return { duration: 0, frames: [], landMs: 0 };
  }
  const B = BOOMERANG;
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const outX = board.x - cx;
  const outY = board.y - cy;
  const toX = to.left + to.width / 2 - cx;
  const toY = to.top + to.height / 2 - cy;
  const pileScale = to.height / Math.max(from.height, 1);
  // The way home bows out to one side: the perpendicular of the board->pile line, at its middle.
  const dx = toX - outX;
  const dy = toY - outY;
  const len = Math.hypot(dx, dy) || 1;
  let bowX = (-dy / len) * len * B.bow;
  let bowY = (dx / len) * len * B.bow;
  if (view.width > 0 && view.height > 0) {
    // Bow toward the screen's middle: flip when the chosen side points away from it.
    const midX = cx + (outX + toX) / 2;
    const midY = cy + (outY + toY) / 2;
    if (bowX * (view.width / 2 - midX) + bowY * (view.height / 2 - midY) < 0) {
      bowX = -bowX;
      bowY = -bowY;
    }
  }
  const midOut = lerp(B.liftAt, B.settleAt, 0.6);
  const midBack = lerp(B.holdAt, B.landAt, 0.5);
  const kissAt = lerp(B.settleAt, B.holdAt, 0.35);
  const frames: Keyframe[] = [
    { transform: pose(0, 0, 0, 1), opacity: 1, offset: 0, easing: INTERFACE_MOTION.easeOpen },
    // 1. wind-up: the hand lets go
    { transform: pose(0, -B.liftPx, B.liftTip, B.liftScale), opacity: 1, offset: B.liftAt, easing: INTERFACE_MOTION.easeOpen },
    // 2. out: most of the way, turning
    {
      transform: pose(outX * 0.62, outY * 0.62 - 18, B.spinOut, lerp(B.liftScale, B.boardScale, 0.62)),
      opacity: 1,
      offset: midOut,
      easing: INTERFACE_MOTION.easeOpen,
    },
    // ...arriving square on the board
    { transform: pose(outX, outY, 0, B.boardScale), opacity: 1, offset: B.settleAt, easing: INTERFACE_MOTION.easeOpen },
    // 3. kiss: a small give, then seated, as if placed
    { transform: pose(outX, outY, 0, B.boardScale * B.press), opacity: 1, offset: kissAt, easing: INTERFACE_MOTION.easeOpen },
    { transform: pose(outX, outY, 0, B.boardScale), opacity: 1, offset: B.holdAt, easing: INTERFACE_MOTION.easeOpen },
    // 4. back: a curved path home, one whole turn
    {
      transform: pose(lerp(outX, toX, 0.5) + bowX, lerp(outY, toY, 0.5) + bowY, B.spinBack / 2, lerp(B.boardScale, pileScale, 0.5)),
      opacity: 1,
      offset: midBack,
      easing: INTERFACE_MOTION.easeOpen,
    },
    // 5. the catch: on the pile, a touch big...
    { transform: pose(toX, toY, B.spinBack, pileScale * B.catchScale), opacity: 1, offset: B.landAt, easing: INTERFACE_MOTION.easeOpen },
    // ...then seated at the pile's own size
    { transform: pose(toX, toY, B.spinBack, pileScale), opacity: 1, offset: B.seatAt },
    // 6. hand-off over the pile top
    { transform: pose(toX, toY, B.spinBack, pileScale), opacity: 0, offset: 1 },
  ];
  return { duration: B.total, frames, landMs: Math.round(B.total * B.landAt) };
};

/** The pile's own small thud at the catch (transform only; main.ts plays it on the pile). */
export const PILE_THUD: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(0.955)', offset: 0.35 },
  { transform: 'scale(1.012)', offset: 0.7 },
  { transform: 'scale(1)' },
];
export const PILE_THUD_MS = 220;
