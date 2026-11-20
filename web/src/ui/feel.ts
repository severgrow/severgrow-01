// 0.85 FEEL PASS (owner, 2026-11-08: "find another 5 things like that and improve to 2028 lvl").
// Small finite motions that give a flat beat a give and a settle. Transform / opacity only; the
// callers skip every one of them under Reduce motion.
import { PILE_THUD, PILE_THUD_MS } from './throw-boomerang.js';

/** A pile receives a card: the same small thud as the boomerang's catch. */
export const thudPile = (el: Element | null | undefined, f: number, motionOn: boolean, easing: string): void => {
  if (!el || !motionOn || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(PILE_THUD, { duration: PILE_THUD_MS * Math.max(f, 0.1), easing });
};

/** The pile a card is drawn from gives a little as it lets go (a lift, not a thud). */
export const DRAW_PILE_GIVE: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.025) translateY(-2px)', offset: 0.3 },
  { transform: 'scale(0.985)', offset: 0.65 },
  { transform: 'scale(1)' },
];
export const DRAW_PILE_GIVE_MS = 200;

/**
 * The drawn card's flight into the hand: out of the pile tilted, the tilt unwinding on the way, a
 * 4% overshoot as it lands (kept from before), then square and still.
 */
export const drawFrames = (dx: number, dy: number, fromScale: number): Keyframe[] => {
  const tilt = dx < 0 ? -7 : 7;
  return [
    { translate: `${dx}px ${dy}px`, scale: `${fromScale.toFixed(2)}`, rotate: `${tilt}deg`, opacity: 1 },
    { translate: `${(dx * .42).toFixed(1)}px ${(dy * .42 - 14).toFixed(1)}px`, scale: '.96', rotate: `${(tilt * 0.35).toFixed(1)}deg`, opacity: 1, offset: .5 },
    { translate: '0 0', scale: '1.04', rotate: '0deg', opacity: 1, offset: .8 },
    { translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 },
  ];
};

/**
 * STRENGTHEN: the tile itself answers (owner, 2026-11-20: another animation "easily improved for max
 * satisfaction joy dopamine"). A Strengthen used to change only the number on the stone — the tile
 * under it never moved, so the one grow move that keeps your tile read as a label swap. This is the
 * smallest physical answer in the vocabulary: the tile rises a hair over 1.6 px, swells 3.5 %, and
 * settles — the same family as a grown tile's pop, at a third of the size, because the tile was
 * already there.
 *
 * Transform only, and it fits INSIDE the Strengthen step's existing hold (MOTION.quick + 230 ms), so
 * the move is not a millisecond longer. Reduce motion skips it entirely (a still number).
 */
export const STRENGTHEN_POP: Keyframe[] = [
  { transform: 'translateY(0) scale(1)' },
  { transform: 'translateY(-1.6px) scale(1.035)', offset: 0.34 },
  { transform: 'translateY(0.6px) scale(0.996)', offset: 0.7 },
  { transform: 'translateY(0) scale(1)' },
];
export const STRENGTHEN_POP_MS = 220;

/** "Not allowed": a short head-shake that settles (was one 3px nudge). */export const DENY_SHAKE: Keyframe[] = [
  { transform: 'translateX(0px)' },
  { transform: 'translateX(-5px)', offset: 0.18 },
  { transform: 'translateX(4px)', offset: 0.42 },
  { transform: 'translateX(-2px)', offset: 0.66 },
  { transform: 'translateX(1px)', offset: 0.84 },
  { transform: 'translateX(0px)' },
];
export const DENY_SHAKE_MS = 260;
