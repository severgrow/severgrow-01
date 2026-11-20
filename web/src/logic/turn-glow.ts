// THE TURN-START GLOW'S WAVE (owner 2026-11-20: "find another 3 animations that can be easily
// improved for max satisfaction joy dopamine").
//
// What it was: every card's own light (`#hand .card::before`) faded in TOGETHER over one 900 ms
// breath, so the most repeated moment of the whole game — my turn beginning — read as one flat
// wash of light. What it is now: the same light, on the same 900 ms, travelling across the fan
// card by card, left to right, the way a hand of cards is dealt.
//
// Pure, so the arithmetic that keeps it FREE is testable: the last card's delay plus its own
// duration is exactly the beat the caller asked for. The wave never lengthens a turn — it spends
// the time the light already had.
import { GLOW_BEAT } from './motion.js';

/** How long each card waits for the light, at most. Short enough to read as one sweep. */
export const GLOW_STEP_MAX = 46;

export type TurnGlowPlan = {
  /** each card's own fade, ms */
  cardMs: number;
  /** the beat between neighbouring cards, ms */
  stepMs: number;
  /** the last card's delay, ms (the head start the wave spends) */
  tailMs: number;
};

/**
 * The wave for `cards` cards inside `ms`. Returns null when motion is off (Reduce motion, Speed
 * off): the glow becomes NOTHING, never a slower or fainter version of itself.
 *
 * `stepMs` shrinks when the hand is large so the sweep stays one gesture rather than a queue, and
 * `cardMs` gives back exactly what the delays took: `tailMs + cardMs === ms`, always.
 */
export const turnGlowPlan = (ms: number, cards: number, motionOn: boolean): TurnGlowPlan | null => {
  if (!motionOn) return null;
  const total = Math.max(1, Math.round(ms));
  const n = Math.max(1, Math.floor(cards));
  if (n === 1) return { cardMs: total, stepMs: 0, tailMs: 0 };
  // Never spend more than a third of the beat on the head start, so a full light still holds.
  const stepMs = Math.max(1, Math.min(GLOW_STEP_MAX, Math.floor(total / 3 / (n - 1))));
  const tailMs = Math.min(total - 1, stepMs * (n - 1));
  return { cardMs: total - tailMs, stepMs, tailMs };
};

/** The beat the caller asks for: 900 ms at Normal, quicker on Fast — as before this change. */
export const turnGlowMs = (speedFactor: number): number => Math.round(GLOW_BEAT * Math.max(speedFactor, 0.5));
