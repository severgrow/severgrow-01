// Card weight: how heavy a card FEELS, from its rank. Presentation only.
//
// `weightOf(rank, maxRank)` is 0 for the lightest card and 1 for the heaviest. The hand uses it to
// shape a press (logic/press.ts), a lift, a settle and a sway — never a hit box, a legal action or
// a duration. One number, one meaning, so nothing drifts between the CSS and the page.

/** The game's top rank. Pass another max only for a variant deck. */
export const MAX_RANK = 9;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * 0..1 by rank, monotonic. A rank at or below 1 is weightless and a rank at or above `maxRank`
 * is fully heavy; an out-of-range or fractional input cannot escape the range. A Bomb (rank 0)
 * reads as the lightest object, which is what its small face looks like.
 */
export const weightOf = (rank: number, maxRank: number = MAX_RANK): number => {
  const top = Number.isFinite(maxRank) ? Math.max(2, Math.round(maxRank)) : MAX_RANK;
  if (!Number.isFinite(rank)) return 0;
  return clamp01((rank - 1) / (top - 1));
};

/** The picked card's lift: light cards come out further (22 px) than heavy ones (16 px). */
export const CARD_LIFT = Object.freeze({ light: 22, heavy: 16 });

/** The lift in dock px for a weight. Never changes the card's box or the fan's geometry. */
export const liftOf = (weight: number): number => CARD_LIFT.light + (CARD_LIFT.heavy - CARD_LIFT.light) * clamp01(weight);

/** The landing overshoot in px: a heavier card carries a little more momentum. */
export const settleOvershootOf = (weight: number): number => 1 + 2 * clamp01(weight);

/** The rest shadow's blur and offset: heavier cards sit a touch deeper on the felt. */
export const shadowOf = (weight: number): { y: number; blur: number; alpha: number } => {
  const w = clamp01(weight);
  return { y: 2 + 4 * w, blur: 4 + 8 * w, alpha: 0.28 + 0.16 * w };
};
