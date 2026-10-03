// What the player feels and hears for each moment (UI overhaul items 9, 17 and 18): one table of
// vibration patterns and one of sound cues, so every moment is distinct and every setting is
// respected in one place. Pure: the page plays what these return.

export type FeedbackEvent =
  | 'press' // any button
  | 'place' // a tile lands
  | 'placeTop' // a top-rank tile lands (heavier)
  | 'undo' // a move taken back
  | 'draw' // a card drawn
  | 'throw' // a card thrown
  | 'cutSmall'
  | 'cutMedium'
  | 'cutBig'
  | 'cutHuge'
  | 'cutMe' // the opponent cuts my tiles (calmer)
  | 'finalTurns'
  | 'win'
  | 'lose';

export const FEEDBACK_EVENTS: readonly FeedbackEvent[] = ['press', 'place', 'placeTop', 'undo', 'draw', 'throw', 'cutSmall', 'cutMedium', 'cutBig', 'cutHuge', 'cutMe', 'finalTurns', 'win', 'lose'];

/** Vibration patterns (ms: buzz, pause, buzz...). Each one is different; none is long. */
export const HAPTICS: Readonly<Record<FeedbackEvent, number | readonly number[]>> = Object.freeze({
  press: 6,
  place: 10,
  placeTop: 18,
  undo: [8, 40, 8],
  draw: 5,
  throw: 12,
  cutSmall: 20,
  cutMedium: [24, 40, 16],
  cutBig: [32, 50, 24, 50, 16],
  cutHuge: [45, 60, 30, 60, 20, 60, 12],
  cutMe: [14, 80, 10],
  finalTurns: [10, 120, 10],
  win: [30, 60, 30, 60, 140],
  lose: 70,
});

/** The longest pattern allowed, in total ms (nothing buzzes on and on). */
export const HAPTIC_MAX_MS = 400;

export type FeedbackSettings = { vibration: boolean; sound: boolean; effects: 'low' | 'normal' | 'high' };

/** Small moments (press, draw) buzz only with Effects High; the rest whenever Vibration is on. */
const SUBTLE: ReadonlySet<FeedbackEvent> = new Set(['press', 'draw']);

/** The vibration for a moment, or null when the settings say no. */
export const hapticFor = (e: FeedbackEvent, s: FeedbackSettings): number | readonly number[] | null => {
  if (!s.vibration) return null;
  if (SUBTLE.has(e) && s.effects !== 'high') return null;
  return HAPTICS[e];
};

/**
 * A tiny, repeatable pitch variation (about ±3%) so repeated sounds never feel like a loop.
 * Deterministic from a counter: the same moment in a replay sounds the same.
 */
export const pitchJitter = (n: number, spread = 0.03): number => {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h ^= h >>> 13;
  return 1 + spread * (((h >>> 0) % 2001) / 1000 - 1);
};

/** Undo's sound: the placement ladder played backwards (falling), as frequency multipliers. */
export const undoPitches = (tiles: number): number[] => {
  const n = Math.max(1, Math.min(6, tiles));
  return Array.from({ length: n }, (_, i) => 1.5 - (i * 0.5) / Math.max(1, n - 1 || 1));
};

/** How much the ambient bed ducks during a cut: 6 dB, as a gain factor. */
export const DUCK_DB = -6;
export const dbToGain = (db: number) => 10 ** (db / 20);

/**
 * How a new tile lands (item 17): bigger numbers drop from a little higher, squash more and
 * settle slower; the top rank lands heavy (a thud and a stronger tap).
 */
export const settleFor = (strength: number, maxRank: number) => {
  const k = Math.max(0, Math.min(1, (strength - 1) / Math.max(1, maxRank - 1)));
  const heavy = strength >= maxRank;
  return { drop: Math.round(2 + 6 * k + (heavy ? 2 : 0)), squash: +(0.08 + 0.08 * k + (heavy ? 0.04 : 0)).toFixed(3), ms: Math.round(380 + 80 * k + (heavy ? 40 : 0)), heavy };
};
