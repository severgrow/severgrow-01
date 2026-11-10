// THE THROW: ONE FLICK (owner, 2026-11-08: "the flight of the card doesn't look natural, it shouldn't
// 'stop' on board and then go back to throw pile - it should be a quick flick flight natural not stopping -
// from hand towards the board and back to throw pile. doesn't always have to have the same path - can be
// depended on its position in hand ... physically correct"; "light spin ... quick - but satisfying, not
// annoying"). It replaced the six-leg boomerang (a kiss and a hold on the board).
//
// The path is ONE cubic curve: from the card's place in the hand, out toward the board, and back into the
// Throw pile. It bows to the side the card sat on in the hand (left of the hand's middle bows one way,
// right the other), so no two throws trace quite the same line, and it always bows toward the middle of
// the screen. Speed is a flick's: fastest off the hand, slowest around the turn (never stopped), quicker
// again before the catch. The card turns a little as it flies out and straightens as the pile catches it,
// a touch big, then seats at the pile's size; a short fade hands over to the pile top.
//
// PRESENTATION ONLY: rects in, keyframes out. The game commits the throw before this plan is read.
// effects.ts plays the frames on an even clock (`easing: 'linear'`): the timing lives in the samples.
import { PINNED } from '../logic/motion.js';
import { INTERFACE_MOTION } from './interface-motion.js';

const total = PINNED.boomerang;

export const BOOMERANG = Object.freeze({
  total,
  /** The flight ends on the pile here; then the catch settles and the hand-off fades. */
  landAt: 0.86,
  seatAt: 0.94,
  /** How far toward the board the curve's controls reach (1 = the board point itself). */
  reach: 1.15,
  /** Sideways bow as a share of the flight's length, plus a little more for a card far from the middle. */
  bow: 0.12,
  bowExtra: 0.04,
  /** Light spin: the peak turn in degrees, plus a little for a card far from the middle. */
  spin: 72,
  spinExtra: 16,
  /** Flick speed profile: 0 = even, toward 1 = fast ends and a slow turn. */
  flick: 0.1,
  /** The catch lands this much bigger than the pile, then seats. */
  catchScale: 1.07,
  /** Flight samples (the curve is drawn by many short straight steps on an even clock). */
  samples: 14,
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
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const at = (x: number, y: number): string => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
const pose = (x: number, y: number, deg: number, scale: number): string =>
  `${at(x, y)} rotate(${Number(deg.toFixed(1))}deg) scale(${scale.toFixed(3)})`;

type P = { x: number; y: number };
const cubic = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/**
 * Plan the flight in viewport coordinates. `board` is the point on the board the flick reaches toward,
 * `to` the Throw pile's real rect, `view` the screen (the bow stays on it), `handMid` the x of the hand's
 * middle (the card's side of it sets the bow and the spin). No motion, or no box: no flight.
 */
export const planBoomerang = (
  from: FlightRect,
  board: { x: number; y: number },
  to: FlightRect,
  allowed: boolean,
  view: { width: number; height: number } = { width: 0, height: 0 },
  opts: { handMid?: number } = {},
): BoomerangPlan => {
  if (!allowed || from.width < 1 || from.height < 1 || to.height < 1) return { duration: 0, frames: [], landMs: 0 };
  const B = BOOMERANG;
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const out = { x: board.x - cx, y: board.y - cy };
  const end = { x: to.left + to.width / 2 - cx, y: to.top + to.height / 2 - cy };
  const pileScale = to.height / Math.max(from.height, 1);
  // The card's place in the hand: -1 far left .. +1 far right (the screen's middle when unknown).
  const mid = opts.handMid ?? (view.width > 0 ? view.width / 2 : cx);
  const place = clamp((cx - mid) / 140, -1, 1);
  const side0 = place < 0 ? -1 : 1;
  const len = Math.hypot(end.x - out.x, end.y - out.y) + Math.hypot(out.x, out.y);
  const px = -(end.y - 0) / (Math.hypot(end.x, end.y) || 1);
  const py = (end.x - 0) / (Math.hypot(end.x, end.y) || 1);
  const apex = { x: out.x * B.reach, y: out.y * B.reach };

  const build = (side: number, shrink: number) => {
    const bow = (B.bow + B.bowExtra * Math.abs(place)) * len * side * shrink;
    const p1 = { x: apex.x + px * bow, y: apex.y + py * bow };
    // out on one side, home on the other: a narrow loop, so the card swings through the turn and never stalls
    const p2 = { x: lerp(apex.x, end.x, 0.5) - px * bow * 1.4, y: lerp(apex.y, end.y, 0.5) - py * bow * 1.4 };
    return (t: number) => cubic({ x: 0, y: 0 }, p1, p2, end, t);
  };
  const onScreen = (curve: (t: number) => P): boolean => {
    if (!(view.width > 0 && view.height > 0)) return true;
    for (let i = 0; i <= 24; i++) {
      const q = curve(i / 24);
      if (cx + q.x < 0 || cx + q.x > view.width || cy + q.y < 0 || cy + q.y > view.height) return false;
    }
    return true;
  };
  // Prefer the card's own side; flip if that leaves the screen; shrink the bow as a last resort.
  let side = side0;
  let curve = build(side, 1);
  if (!onScreen(curve)) { side = -side0; curve = build(side, 1); }
  for (let shrink = 0.75; !onScreen(curve) && shrink > 0.1; shrink -= 0.2) curve = build(side, shrink);

  const spinPeak = (B.spin + B.spinExtra * Math.abs(place)) * side;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= B.samples; i++) {
    const s = i / B.samples;
    // a flick: param speed 1 + flick*cos(2*pi*s) - fast at both ends, slowest at the turn
    const t = s + (B.flick * Math.sin(2 * Math.PI * s)) / (2 * Math.PI);
    const q = curve(t);
    // a light turn out, straightening for the catch
    const rot = spinPeak * Math.sin(Math.PI * Math.min(1, s * 1.08)) * (1 - s * 0.15);
    const scale = s < 0.5 ? lerp(1, 0.86, s / 0.5) : lerp(0.86, pileScale * B.catchScale, (s - 0.5) / 0.5);
    frames.push({
      transform: i === B.samples ? pose(end.x, end.y, 0, pileScale * B.catchScale) : pose(q.x, q.y, rot, scale),
      opacity: 1,
      offset: Number((s * B.landAt).toFixed(4)),
      ...(i === 0 ? { easing: 'linear' } : {}),
    });
  }
  frames[frames.length - 1]!.offset = B.landAt;
  frames.push({ transform: pose(end.x, end.y, 0, pileScale), opacity: 1, offset: B.seatAt, easing: INTERFACE_MOTION.easeOpen });
  // No fade (owner, 2026-11-10: the card covers the old one as it lands): the pile is already this
  // card underneath (landMs), and the flyer is removed when the flight ends.
  frames.push({ transform: pose(end.x, end.y, 0, pileScale), opacity: 1, offset: 1 });
  return { duration: B.total, frames, landMs: Math.round(B.total * B.landAt) };
};

/** The pile's own small thud at the catch (transform only; ui/feel.ts plays it on the pile). */
export const PILE_THUD: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(0.955)', offset: 0.35 },
  { transform: 'scale(1.012)', offset: 0.7 },
  { transform: 'scale(1)' },
];
export const PILE_THUD_MS = 220;
