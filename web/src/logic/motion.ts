// Step 7: the motion tokens. Every duration and easing in the page comes from this short list
// (the CSS custom properties of the same names hold the same values; a test keeps them equal).
// Input is never locked by motion: a tap during an animation jumps it to its end.
export const MOTION = Object.freeze({
  /** a press: buttons and cards answer at once */
  tap: 96,
  /** small state changes: a ring, a highlight, a chip */
  quick: 192,
  /** a tile, a card or a panel moving */
  move: 336,
  /** an earned moment: a Bloom ripple, a big cut, the Strangle finish beats */
  moment: 720,
});
export const EASE = Object.freeze({
  out: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
  spring: 'cubic-bezier(0.2, 0.8, 0.3, 1.1)',
});
