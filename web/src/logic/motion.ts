// Phase 0: one motion language.
//
// There are exactly TWO tempo tokens:
//   ack          the immediate answer to a press or a tap (96 ms)
//   consequence  a physical move on the board (336 ms)
// Everything else is derived, never a second hand-picked number:
//   quick  = 2 * ack
//   moment = 2 * consequence + ack / 2
// The legacy names (`tap`, `move`, `quick`, `moment`) stay as aliases, so every existing use
// resolves to the same millisecond value it did before this file changed.
//
// `PINNED` is the choreography that must never drift: values measured with web/e2e/motion-audit.ts
// and asserted by web/tests/motion.test.ts. Code imports these names instead of repeating literals.

/** The only two tempo tokens. */
export const TEMPO = Object.freeze({ ack: 96, consequence: 336 });

/** Values that are part of the game's feel and are deliberately pinned. */
export const PINNED = Object.freeze({
  /** A human card leaves the pile and lands in the hand. */
  humanDraw: 396,
  /** A human card leaves the hand and reaches the discard pile (the step's wait). */
  throw: 396,
  /** The thrown card's own flight, which lands inside that wait (32359b5: the snappier beat). */
  throwFlight: 320,
  /** The shortest hold for a live enemy turn, so a quiet turn cannot blink past. */
  liveReveal: 700,
  /** The LED display's minimum dwell before another message may replace it. */
  displayDwell: 2000,
  /** A whole cut at Normal speed, whatever the number of tiles or chained cuts. */
  cutCap: 1800,
  /** The cut's local flash never exceeds this, even at Slow speed. */
  flash: 60,
  /** Two short freezes used by the existing choreography (light and heavy impacts). */
  hitStopShort: 60,
  hitStop: 100,
  /** One ripple ring starts every this many ms, capped by the plan itself. */
  ripple: 70,
  /** How long a grown tile holds after it lands. */
  growHold: 160,
  /** A multi-tile grow starts the next tile when the previous one is this far through its pop. */
  growOverlap: 0.6,
});

/** The derived durations, plus the legacy aliases that existing code already reads. */
export const MOTION = Object.freeze({
  /** The two source tokens, exposed under their own names. */
  ack: TEMPO.ack,
  consequence: TEMPO.consequence,
  /** Legacy name for `ack`. */
  tap: TEMPO.ack,
  /** Derived: two acknowledgements. */
  quick: TEMPO.ack * 2,
  /** Legacy name for `consequence`. */
  move: TEMPO.consequence,
  /** Derived: two consequences plus half an acknowledgement. */
  moment: TEMPO.consequence * 2 + TEMPO.ack / 2,
});

/** One easing family: the same control points, with the settle variant overshooting to 1.1. */
const STANDARD_EASE = 'cubic-bezier(0.2, 0.8, 0.3, 1)';
const SETTLE_EASE = 'cubic-bezier(0.2, 0.8, 0.3, 1.1)';
export const EASE = Object.freeze({
  /** The canonical easing: decelerate into the resting position. */
  standard: STANDARD_EASE,
  /** The same control points, with a small overshoot for a physical landing. */
  settle: SETTLE_EASE,
  /** Legacy aliases. */
  out: STANDARD_EASE,
  spring: SETTLE_EASE,
});

/** Continuous marquees are the only place for `linear`; the LED projector is the only `steps(1)`. */
export const EASE_SPECIAL = Object.freeze({ marquee: 'linear', led: 'steps(1)' });

/**
 * The hand's idle breath (phase 4). It is ambient continuous motion, so it lives with the
 * marquees rather than in a one-off duration: 4.5-6 s per card, 0.4-0.8% of the card's size.
 * Lighter cards sway a little more; at most seven cards breathe at once. The values are
 * presentation only and never reach a legal action's duration.
 */
export const BREATH = Object.freeze({ minPeriod: 4500, maxPeriod: 6000, minAmp: 0.004, maxAmp: 0.008, maxCards: 7 });

/** A deterministic 32-bit mix: the same card id breathes the same way in every session. */
const mix = (n: number): number => {
  let h = Math.imul(n | 0, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
};

/** A card's breath period in ms, 4500-6000, fixed by its id. */
export const breathPeriodOf = (cardId: number): number =>
  BREATH.minPeriod + (mix(cardId) % (BREATH.maxPeriod - BREATH.minPeriod + 1));

/** A negative delay in ms so cards do not breathe in step (the phase is part of the breath). */
export const breathPhaseOf = (cardId: number): number => -(mix(cardId ^ 0x5bd1e995) % BREATH.maxPeriod);

/** 0.8% for the lightest card down to 0.4% for the heaviest. */
export const breathAmpOf = (weight: number): number => {
  const w = Math.max(0, Math.min(1, weight));
  return BREATH.maxAmp + (BREATH.minAmp - BREATH.maxAmp) * w;
};

/**
 * The one motion gate. Every path that animates reads this: a reduced-motion preference or a
 * time scale of zero (Speed Off / fast-forward) means "no motion", never a new preference.
 */
export const motionAllowed = (reduceMotion: boolean, timeScale: number): boolean =>
  !reduceMotion && timeScale > 0;
