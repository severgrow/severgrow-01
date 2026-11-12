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
  | 'cascade' // one ring of their cut tiles falls (the chain reaction)
  | 'finalTurns'
  | 'win'
  | 'lose';

export const FEEDBACK_EVENTS: readonly FeedbackEvent[] = ['press', 'place', 'placeTop', 'undo', 'draw', 'throw', 'cutSmall', 'cutMedium', 'cutBig', 'cutHuge', 'cutMe', 'cascade', 'finalTurns', 'win', 'lose'];

/**
 * Vibration patterns (ms: buzz, pause, buzz...). Each one is different; none is long. LIGHT AND RARE
 * (owner, 2026-11-05, with the recorded sounds): every pulse at most 24 ms, every pattern under a
 * quarter second, and only your tile landing, a Cut and the win/lose buzz by default (see `RARE`).
 */
export const HAPTICS: Readonly<Record<FeedbackEvent, number | readonly number[]>> = Object.freeze({
  press: 5,
  place: 8,
  placeTop: 12,
  undo: [6, 40, 6],
  draw: 4,
  throw: 9,
  cutSmall: 11,
  cutMedium: [14, 40, 9],
  cutBig: [18, 50, 12, 50, 8],
  cutHuge: [24, 60, 14, 60, 10, 50, 6],
  cutMe: [8, 80, 6],
  cascade: 3,
  finalTurns: [7, 120, 7],
  win: [14, 60, 14, 60, 22],
  lose: 22,
});

/** The longest pattern allowed, in total ms (nothing buzzes on and on). */
export const HAPTIC_MAX_MS = 400;

export type FeedbackSettings = { vibration: boolean; sound: boolean; effects: 'low' | 'normal' | 'high' };

/** The moments that buzz whenever Vibration is on; every other one only with Effects High. */
const RARE: ReadonlySet<FeedbackEvent> = new Set(['place', 'placeTop', 'cutSmall', 'cutMedium', 'cutBig', 'cutHuge', 'cutMe', 'win', 'lose']);

/** The vibration for a moment, or null when the settings say no. */
export const hapticFor = (e: FeedbackEvent, s: FeedbackSettings): number | readonly number[] | null => {
  if (!s.vibration) return null;
  if (!RARE.has(e) && s.effects !== 'high') return null;
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
