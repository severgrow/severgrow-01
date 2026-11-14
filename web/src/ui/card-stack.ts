// THE SHAPE OF A FACE-DOWN DECK, IN ONE PLACE.
//
// The pre-game ritual handles a nine-card stack (`player/starter-ritual.ts`) and the dock's draw
// pile is the same object once those cards have filed back into it. Owner, 2026-11-14: "make the
// draw pile look exactly like the pile in ritual at the end when cards coming back together in
// middle screen" — so both read this module instead of each carrying a copy of the numbers.
//
// A stack is a FAN, not a set of slabs: the card you see stays square, every card under it drifts
// a little further to the right and down and tilts a little further counter-clockwise, and the
// bottom card casts the whole stack's one soft shadow. The fan is a share of the CARD'S OWN BOX,
// so a 50px draw pile and an 86px ritual deck are the same object at two sizes.
//
// Nothing here touches the DOM: the ritual turns the px form straight into WAAPI keyframes and the
// draw pile's layers use the percentage form in CSS. Both are generated below, from one set of
// numbers, and `tests/card-stack.test.ts` holds the CSS to them.

/** The card box the shipped ritual's fan was measured on (a 390x844 phone). */
export const CARD_STACK_BOX: Readonly<{ width: number; height: number }> = Object.freeze({ width: 85.8, height: 121.8 });

/**
 * How far the BOTTOM card of a nine-card deck sits from the top one: 2.4px right and 5.76px down
 * on {@link CARD_STACK_BOX}, as percentages of that box. The ritual's own numbers, measured on the
 * live overlay, so moving this changes both the ceremony and the pile together.
 */
export const CARD_STACK_FAN: Readonly<{ x: number; y: number }> = Object.freeze({ x: 2.797, y: 4.729 });

/** How far the bottom card is rotated against the top one (degrees, counter-clockwise). */
export const CARD_STACK_TILT = 1.04;

/** Where one layer sits against the card in front of it, as percentages of the card's own box. */
export type CardStackPose = { readonly x: number; readonly y: number; readonly rot: number };

/**
 * The pose of one layer. `depth` 0 is the card you see (square, on top); `layers` is how many cards
 * the stack shows, so the same card box fans further when the deck is thicker and the pile reads
 * thinner as it is dealt away.
 */
export const cardStackPose = (layers: number, depth: number): CardStackPose => {
  const steps = Math.max(1, layers - 1);
  const t = Math.min(1, Math.max(0, depth / steps));
  return {
    x: Number((CARD_STACK_FAN.x * t).toFixed(3)),
    y: Number((CARD_STACK_FAN.y * t).toFixed(3)),
    rot: t === 0 ? 0 : Number((-(CARD_STACK_TILT * t)).toFixed(3)),
  };
};

/** The same pose in px, for a card of `box` size — the form the ritual's WAAPI keyframes animate. */
export const cardStackPosePx = (layers: number, depth: number, box = CARD_STACK_BOX): CardStackPose => {
  const pose = cardStackPose(layers, depth);
  return {
    x: Number(((pose.x / 100) * box.width).toFixed(2)),
    y: Number(((pose.y / 100) * box.height).toFixed(2)),
    rot: pose.rot,
  };
};

/**
 * The ONE shadow a face-down stack casts, from its lowest visible card: the ritual's own
 * `0 18px 40px rgba(0,0,0,.45)` on its 121.8px card, kept as a share of the card's height so the
 * draw pile casts the same shadow at its own size (style.css paints the ritual's copy, and
 * `tests/card-stack.test.ts` holds that copy to these numbers).
 */
export const CARD_STACK_SHADOW: Readonly<{ y: number; blur: number; alpha: number }> = Object.freeze({ y: 0.148, blur: 0.328, alpha: 0.45 });

/** {@link CARD_STACK_SHADOW} as one `box-shadow` value for a card of `box` size. */
export const cardStackShadow = (box = CARD_STACK_BOX): string =>
  `0 ${Math.round(CARD_STACK_SHADOW.y * box.height)}px ${Math.round(CARD_STACK_SHADOW.blur * box.height)}px rgba(0,0,0,${CARD_STACK_SHADOW.alpha})`;
