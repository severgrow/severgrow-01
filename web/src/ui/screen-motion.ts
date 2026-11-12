// WHICH WAY A SCREEN ARRIVES (owner, 2026-11-02: "we should have animation for all menus, going to
// play from main, or profile, etc — if we have existing ones make them more visible and smooth").
//
// `interface-motion.ts` owns the numbers and the primitives; this file owns the one DECISION a whole
// screen needs and a sheet does not: the direction. A forward move (menu -> PLAY -> a level) rises
// from below; the way back drops from above. The two read differently without a second vocabulary:
// same duration, same curve, same distance, opposite sign.
//
// It is pure on purpose — no DOM, no clock, no storage — so `screen-motion.test.ts` can pin the
// ladder and the arithmetic instead of a browser having to guess at what "forward" means.

import { INTERFACE_MOTION } from './interface-motion.js';

/** The screens that can be arrived at. `play` is the PLAY submenu (a doorway, not one of the four). */
export type ScreenName = 'menu' | 'play' | 'levels' | 'campaign' | 'game';

/**
 * THE LADDER. Depth is the only thing that decides a direction: a deeper screen is "forward", a
 * shallower one is "back", two at the same depth do not travel. PLAY, the training picker and the
 * campaign chapter list are all one step below the menu (a player reaches them the same way), so
 * moving between them is a sideways move and does not fake a forward beat.
 */
export const SCREEN_RANK: Readonly<Record<ScreenName, number>> = Object.freeze({
  menu: 0,
  play: 1,
  levels: 2,
  campaign: 3,
  game: 4,
});

export type ScreenArrival = Readonly<{
  /** `forward` rises from below, `back` drops from above, `same` does not travel. */
  direction: 'forward' | 'back' | 'same';
  /** Signed travel for the screen itself, in px (positive = from below). */
  travel: number;
  /** Signed travel for the screen's own head — the smaller, second thing that lands. */
  head: number;
  /** Delay before the head arrives, in ms. */
  stagger: number;
  /** 0 means "no animation, be there now" (Reduce motion, or the board itself). */
  duration: number;
}>;

const STILL: ScreenArrival = Object.freeze({ direction: 'same', travel: 0, head: 0, stagger: 0, duration: 0 });

/**
 * The arrival for a screen change. `from` is what was on screen (null at boot: the first screen is
 * simply there, it is not arriving from anywhere), `reduce` is `!interfaceMotionAllowed()`.
 *
 * The GAME never travels: the board is the live object under the player's finger and must not slide
 * or fade, exactly as `docs/INTERFACE-MOTION.md` requires. The menu at boot is still.
 */
export const screenArrival = (from: ScreenName | null, to: ScreenName, reduce = false): ScreenArrival => {
  if (reduce || from === null || from === to || to === 'game') return STILL;
  const delta = SCREEN_RANK[to] - SCREEN_RANK[from];
  if (delta === 0) return STILL;
  const direction = delta > 0 ? 'forward' : 'back';
  const sign = direction === 'forward' ? 1 : -1;
  return Object.freeze({
    direction,
    travel: sign * INTERFACE_MOTION.screen,
    head: sign * INTERFACE_MOTION.travel,
    stagger: INTERFACE_MOTION.stagger,
    duration: INTERFACE_MOTION.open,
  });
};
