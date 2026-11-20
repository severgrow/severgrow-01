// THE THROW: ONE FLICK (owner, 2026-11-08: "the flight of the card doesn't look natural ... it should
// be a quick flick flight natural not stopping - from hand towards the board and back to throw pile";
// "light spin ... quick - but satisfying, not annoying"). It replaced the six-leg boomerang (a kiss and
// a hold on the board).
//
// 2026-11-12 SHARPENING PASS (owner: "make the card feel LIGHTER - snappy, natural, more satisfying";
// he approved all four techniques together, no comparison switch, and said the whole thing may be a
// little shorter). The SAME one-curve path, but:
//   1. SPEED is a real flick: fastest as it leaves the hand, decelerating like air drag, then a short
//      catch before the pile. The frames are spaced by ARC LENGTH, not by curve parameter, so the speed
//      profile below is the speed the eye actually sees. It is never zero: the card cannot stop.
//   2. 3D: the card tips back in perspective as it lifts off and flattens as it lands.
//   3. SPIN: a flick's spin that decays in flight, landing at a small natural rest angle (1-3 degrees,
//      varying between throws) instead of perfectly straight, then seating straight on the pile.
//   4. STRETCH: a tiny smear along the card's long axis at top speed, gone by the catch (cheaper and
//      more readable than a shadow layer, and it leaves nothing in the DOM).
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
  /** The spin's shape: it arrives with the flick (a quick rise) and dies by the catch. */
  spinRise: 0.55,
  spinDecay: 1.1,
  /** The natural rest angle it lands at: between these, either side, different every throw. */
  restMin: 1,
  restMax: 3,
  /**
   * Flick speed: `drag` is the share of top speed still carried mid-flight (air drag), `dragPow`
   * how quickly it bleeds, `catch` the short ramp back up before the pile, `catchPow` how late.
   * v(0) = 1 (fastest off the hand), v(1) = drag + catch (the catch).
   */
  drag: 0.52,
  dragPow: 1.4,
  catch: 0.42,
  catchPow: 7,
  /** 3D: the lift-off tilt in degrees and a small sideways turn, flattened by the landing. */
  tilt: 17,
  yaw: 7,
  persp: 760,
  /** The smear at top speed: along the card's long axis. */
  stretch: 0.06,
  /** The catch lands this much bigger than the pile, then seats. */
  catchScale: 1.07,
  /**
   * THE SPIN VARIANT (owner, 2026-11-20): one clean full turn while it flies to the pile, used on
   * about 1 throw in 5 instead of the plain flick. The turn is on the card's own Z axis (in the
   * screen plane, around its centre): the face stays towards the eye the whole way, so the eye can
   * still read the card it is losing; a Y-axis turn would foreshorten the card to an edge at the
   * middle of the flight and hide it.
   *
   * One whole turn, so the pose it lands in is the pose it left in. The easing (see `turnProgress`)
   * is the lesson from the frame captures: the flight's own drag shape (front-loaded) spent ~330 of
   * the 360 degrees in the first third of the flight, so the card arrived upright very early and
   * then slid flat — exactly the "reads as a bug" landing. A symmetric smoothstep fixed that but
   * peaked at ~38 deg per displayed frame (about nine frames a revolution), too fast to read as
   * clean. What ships keeps soft ends and a near-constant middle: ~22 deg a frame at the peak.
   */
  turn: 360,
  /** The share of the flight spent easing the turn in and out; the rest turns evenly. */
  turnEase: 0.2,
  /** The 3D lift-off is softened on a spin throw, so the in-plane turn is the one gesture. */
  spinTilt: 0.5,
  /**
   * The spin's own sample count. The plain flick needs 16 samples over its path; a full turn needs
   * more so the angle is a smooth curve and not 16 straight-line steps (the samples are what the
   * browser interpolates between, so their spacing IS the angular velocity profile's resolution).
   */
  spinSamples: 28,
  /** Flight samples (the curve is drawn by many short straight steps on an even clock). */
  samples: 16,
  /**
   * Arc-length table resolution. The curve's own parameter is not evenly spaced in pixels, so the
   * flick profile is fitted against real distance: this is the one place that is measured.
   */
  arcSteps: 64,
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
const deg = (d: number): string => `${Number(d.toFixed(1))}deg`;

type P = { x: number; y: number };
const cubic = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/** A deterministic 32-bit mix: the same throw always lands at the same angle, different throws vary. */
const mix = (n: number): number => {
  let h = Math.imul(n | 0, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
};

const fnv = (text: string): number => {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};

/**
 * HOW OFTEN THE CARD TURNS A FULL CIRCLE (owner, 2026-11-20: "use that animation of spin instead of
 * the current existing one roughly 20% of times but randomly. so its always a bit of surpise").
 * One throw in five. The gate is PRESENTATION ONLY and deterministic — a given game, turn and card
 * always makes the same choice, in every session and every replay — so the engine is never touched
 * and a replayed game never changes. It is the same `fnv(key) % 100 < RATE` gate the LED sign uses
 * for its rare lines (player/led-flavour.ts) and its pictures (player/led-art.ts).
 */
export const SPIN_RATE = 20;
export const spinSelected = (key: string): boolean => fnv(`throw-spin:${key}`) % 100 < SPIN_RATE;

/**
 * The key a throw's spin is decided from: the game, the turn and the card. The card id alone would
 * be a fixed property of that card (ids are the deck's faces, so "the Moss 3 always spins"); the
 * seed and the turn make it a surprise from game to game and from throw to throw, while a replay of
 * the same game still plays the same flights.
 */
export const throwSpinKey = (seed: number, turn: number, cardId: number): string => `${seed}:${turn}:${cardId}`;

/**
 * The share of the flight's LENGTH travelled by flight time u: the integral of the flick's speed
 * profile `drag + (1 - drag)(1 - u)^dragPow + catch * u^catchPow` (see BOOMERANG), normalised so
 * u=1 is the whole arc. The integrand is always positive, so the card never stops mid-air.
 */
const C1 = ((): number => {
  const B = BOOMERANG;
  return B.drag + (1 - B.drag) / (B.dragPow + 1) + B.catch / (B.catchPow + 1);
})();
const travelled = (u: number): number => {
  const B = BOOMERANG;
  const s = clamp(u, 0, 1);
  return (B.drag * s + ((1 - B.drag) * (1 - Math.pow(1 - s, B.dragPow + 1))) / (B.dragPow + 1) + (B.catch * Math.pow(s, B.catchPow + 1)) / (B.catchPow + 1)) / C1;
};

/** The spin's envelope: 0 at both ends, a quick rise (the flick) and a longer decay. Peaks at 1. */
const SPIN_PEAK = ((): number => {
  const a = BOOMERANG.spinRise;
  const b = BOOMERANG.spinDecay;
  return Math.pow(a / (a + b), a) * Math.pow(b / (a + b), b);
})();
const spinEnvelope = (u: number): number => {
  const s = clamp(u, 0, 1);
  return (Math.pow(s, BOOMERANG.spinRise) * Math.pow(1 - s, BOOMERANG.spinDecay)) / SPIN_PEAK;
};

/**
 * The full turn's progress. The turn eases in over the first fifth of the flight and out over the
 * last fifth, and turns evenly in between: a flicked card carries angular momentum, so the spin is
 * close to constant. Velocity is continuous at both joins (no snap, no kink), the card starts
 * turning with the flick rather than before it, and it arrives at exactly one whole turn at the
 * catch — never finishing mid-air and then sliding upright. It arrives at 1 (one whole turn).
 */
const turnProgress = (u: number): number => {
  const s = clamp(u, 0, 1);
  const e = BOOMERANG.turnEase;
  const area = s <= 0 ? 0
    : s <= e ? (s * s) / (2 * e)
      : s <= 1 - e ? e / 2 + (s - e)
        : (1 - e) - ((1 - s) * (1 - s)) / (2 * e);
  return area / (1 - e);
};

/** Sample a curve into cumulative arc lengths, so a frame can be placed at a distance. */
const arcTable = (curve: (t: number) => P) => {
  const n = BOOMERANG.arcSteps;
  const cum: number[] = [0];
  let last = curve(0);
  for (let i = 1; i <= n; i++) {
    const p = curve(i / n);
    cum.push(cum[i - 1]! + Math.hypot(p.x - last.x, p.y - last.y));
    last = p;
  }
  return { cum, total: cum[n]! };
};

/** The curve parameter at `share` of the flight's length (linear within one sampled step). */
const tAtShare = (table: ReturnType<typeof arcTable>, share: number): number => {
  const target = clamp(share, 0, 1) * table.total;
  const n = table.cum.length - 1;
  for (let i = 1; i <= n; i++) {
    const span = table.cum[i]! - table.cum[i - 1]!;
    if (target <= table.cum[i]! || i === n) return (i - 1 + (span > 1e-6 ? (target - table.cum[i - 1]!) / span : 0)) / n;
  }
  return 1;
};

/**
 * Plan the flight in viewport coordinates. `board` is the point on the board the flick reaches toward,
 * `to` the Throw pile's real rect, `view` the screen (the bow stays on it), `handMid` the x of the hand's
 * middle (the card's side of it sets the bow and the spin). `variant` varies the rest angle between
 * throws (the card's id: same card, same angle). `spin` asks for the full-turn variant (owner,
 * 2026-11-20; chosen by `spinSelected`). No motion, or no box: no flight.
 */
export const planBoomerang = (
  from: FlightRect,
  board: { x: number; y: number },
  to: FlightRect,
  allowed: boolean,
  view: { width: number; height: number } = { width: 0, height: 0 },
  opts: { handMid?: number; variant?: number; spin?: boolean } = {},
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

  const table = arcTable(curve);
  const spinPeak = (B.spin + B.spinExtra * Math.abs(place)) * side;
  // The landed angle: 1-3 degrees, either side, fixed by the throw (never straight, never the same twice).
  const variant = opts.variant ?? Math.round(cx * 3) + Math.round(cy * 7);
  const spread = mix(variant ^ 0x51ed270b) / 0x1_0000_0000;
  const rest = (B.restMin + (B.restMax - B.restMin) * spread) * ((mix(variant ^ 0x1b873593) & 1) ? 1 : -1);

  const pose = (q: P, rot: number, scale: number, u: number): string => {
    const flight = clamp(u, 0, 1);
    const tilt = B.tilt * (opts.spin ? B.spinTilt : 1) * Math.pow(1 - flight, 2.4);
    const yaw = B.yaw * (opts.spin ? B.spinTilt : 1) * side * Math.pow(1 - flight, 2);
    const st = B.stretch * Math.pow(1 - flight, 1.6);
    const body = st > 0.0005
      ? `scale(${(scale * (1 - st * 0.45)).toFixed(3)}, ${(scale * (1 + st)).toFixed(3)})`
      : `scale(${scale.toFixed(3)})`;
    const turn = tilt > 0.05 || Math.abs(yaw) > 0.05
      ? ` perspective(${B.persp}px) rotateX(${deg(-tilt)}) rotateY(${deg(yaw)})`
      : '';
    return `${at(q.x, q.y)} rotate(${deg(rot)})${turn} ${body}`;
  };

  const frames: Keyframe[] = [];
  const samples = opts.spin ? B.spinSamples : B.samples;
  for (let i = 0; i <= samples; i++) {
    const f = i / samples;              // the flight's own clock
    const u = f * B.landAt;             // this frame's offset in the whole throw
    const q = curve(tAtShare(table, travelled(f)));
    // The plain flick's spin decays to the landed rest angle; the spin variant spends one whole
    // turn exactly at the catch, so it arrives in the pose it left in. Either way the card then
    // seats straight on the pile.
    const rot = opts.spin
      ? rest + B.turn * turnProgress(f) * side
      : rest + spinPeak * spinEnvelope(f);
    const scale = f < 0.5 ? lerp(1, 0.88, f / 0.5) : lerp(0.88, pileScale * B.catchScale, (f - 0.5) / 0.5);
    frames.push({
      transform: pose(q, rot, scale, f),
      opacity: 1,
      offset: Number(u.toFixed(4)),
      ...(i === 0 ? { easing: 'linear' } : {}),
    });
  }
  frames[frames.length - 1]!.offset = B.landAt;
  // The catch settles at the pile's size and straightens as the real top card takes over: a 1-3
  // degree flyer must never be left sitting over the upright pile card. A spin throw has just spent
  // a whole turn, so its upright pose is expressed as that same whole turn (±360), never as 0:
  // interpolating -358deg to 0 would spin the card another full circle backwards in the last 27 ms.
  const seatRot = opts.spin ? B.turn * side : 0;
  frames.push({ transform: pose(end, seatRot, pileScale, 1), opacity: 1, offset: B.seatAt, easing: INTERFACE_MOTION.easeOpen });
  // No fade (owner, 2026-11-10: the card covers the old one as it lands): the pile is already this
  // card underneath (landMs), and the flyer is removed when the flight ends.
  frames.push({ transform: pose(end, seatRot, pileScale, 1), opacity: 1, offset: 1 });
  return { duration: B.total, frames, landMs: Math.round(B.total * B.landAt) };
};

/** The pile's own small thud at the catch (transform only; ui/feel.ts plays it on the pile).
 *  OWNER ADDED THE LANDING (2026-11-20: "add a small addition of the whole pile feeling small impact
 *  of the card landing on it"): the pile used to scale only. It now takes the weight as a press —
 *  down 2.4px and 4% smaller — and settles back through a hair of rebound, so the whole stack
 *  answers the card. Still transform only, still one shot, still skipped under Reduce motion. */
export const PILE_THUD: Keyframe[] = [
  { transform: 'translateY(0px) scale(1)' },
  { transform: 'translateY(2.4px) scale(0.962)', offset: 0.3 },
  { transform: 'translateY(-0.5px) scale(1.009)', offset: 0.66 },
  { transform: 'translateY(0px) scale(1)' },
];
export const PILE_THUD_MS = 180;
