// Eye candy (UI overhaul, Part 3): the small decisions behind the decorations, kept pure so a
// test can check them. Every piece sits behind the "Eye candy" setting and also respects Reduce
// motion and Effects.
import { MOTION } from './motion.js';
/** B. The splash: once per visit, short, and a still picture with Reduce motion. */
export const splashPlan = (o: { reduceMotion: boolean; on: boolean; shownThisVisit: boolean }): { show: boolean; ms: number; animated: boolean } => {
  if (!o.on || o.shownThisVisit) return { show: false, ms: 0, animated: false };
  return o.reduceMotion ? { show: true, ms: 700, animated: false } : { show: true, ms: 1600, animated: true };
};

/** C. The last-card moment: when the deck goes from 2+ to 1, and when it empties. */
export const deckMoment = (before: number, after: number): 'last' | 'out' | null => (after === 1 && before > 1 ? 'last' : after === 0 && before > 0 ? 'out' : null);

/**
 * The last card and the empty pile share one consequence beat. A small scale click, never a
 * twist or a spring: the old last-card move overshot to 1.5 and held for 600ms.
 */
export const DECK_BEAT = Object.freeze({ ms: MOTION.move, lastScale: 1.06 });

/**
 * A score change. The digits ease out over one move, then the number that changed gives a
 * small click. Not a linear count and not a bounce (the old pop reached 1.28).
 */
export const SCORE_BEAT = Object.freeze({ countMs: MOTION.move, popMs: MOTION.quick, popScale: 1.06 });

/** Ease-out for a score count: most of the change lands early, then the digits rest. */
export const scoreProgress = (k: number): number => {
  const t = Math.min(1, Math.max(0, k));
  return 1 - (1 - t) ** 3;
};

/** D. Spores returning to my root from tiles I just grew (at most 6, nearest the root first). */
export const sporesHome = (grown: readonly string[], root: string, max = 6): { from: string; delay: number }[] => {
  const d = (k: string) => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    const [a, b] = root.split(',').map(Number) as [number, number];
    return Math.max(Math.abs(q - a), Math.abs(r - b), Math.abs(q + r - a - b));
  };
  return [...grown]
    .sort((x, y) => d(x) - d(y) || (x < y ? -1 : 1))
    .slice(0, max)
    .map((from, i) => ({ from, delay: i * 90 }));
};
