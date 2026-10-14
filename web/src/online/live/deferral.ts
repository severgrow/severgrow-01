// Live duels — when may the challenge pop-up appear? Pure.
//
// It never interrupts a drag or a Bloom paint (hard blocks, no time limit), waits for a replay or
// an animation to finish (soft blocks, at most 10 s), and never shows during the tutorial.

export const MAX_SOFT_DEFER_MS = 10_000;

export type ScreenState = {
  tutorial: boolean;
  /** A finger/pointer is down, a card is being dragged, or a Bloom is being painted. */
  hardBusy: boolean;
  /** An animation or the opponent's turn replay is playing. */
  softBusy: boolean;
};

export type DeferDecision = 'show' | 'wait' | 'never';

export const deferDecision = (s: ScreenState, waitedMs: number): DeferDecision => {
  if (s.tutorial) return 'never';
  if (s.hardBusy) return 'wait';
  if (s.softBusy && waitedMs < MAX_SOFT_DEFER_MS) return 'wait';
  return 'show';
};
