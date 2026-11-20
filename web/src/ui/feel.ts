// 0.85 FEEL PASS (owner, 2026-11-08: "find another 5 things like that and improve to 2028 lvl").
// Small finite motions that give a flat beat a give and a settle. Transform / opacity only; the
// callers skip every one of them under Reduce motion.
import { PILE_THUD, PILE_THUD_MS } from './throw-boomerang.js';

/**
 * A pile receives a card: the pile itself takes a small impact (owner, 2026-11-20: "add a small
 * addition of the whole pile feeling small impact of the card landing on it").
 *
 * It is one shot, played on the pile's own body (`.pile-card`): the stack presses down under the
 * card's weight and settles back (PILE_THUD, transform only), while a short contact shade deepens
 * at the top of the stack as the weight arrives (opacity only, removed when it ends). It is
 * deliberately NOT played on the pile button: that element carries the step's glow, the count and
 * the Throw swell's CSS transition, and a landing must not move or fight any of those.
 *
 * `motionOn` is the single Reduce motion / Speed Off gate (motionAllowed): when it is false there
 * is no press, no shade and no DOM at all — same as every other feel beat.
 */
export const thudPile = (el: Element | null | undefined, f: number, motionOn: boolean, easing: string): void => {
  if (!el || !motionOn) return;
  const body = el.querySelector<HTMLElement>(':scope > .pile-card');
  const target = body ?? (el as HTMLElement);
  if (typeof target.animate !== 'function') return;
  const ms = PILE_THUD_MS * Math.max(f, 0.1);
  target.animate(PILE_THUD, { duration: ms, easing });
  if (!body) return; // no stack to carry the shade: the press alone is the whole beat
  const shade = document.createElement('span');
  shade.className = 'pile-impact';
  body.appendChild(shade);
  const done = () => shade.remove();
  if (typeof shade.animate === 'function') {
    const a = shade.animate(
      [{ opacity: 0 }, { opacity: 0.85, offset: 0.22 }, { opacity: 0 }],
      { duration: ms * 1.35, easing },
    );
    a.finished.then(done, done);
  } else setTimeout(done, ms * 1.35 + 60);
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

/** "Not allowed": a short head-shake that settles (was one 3px nudge). */
export const DENY_SHAKE: Keyframe[] = [
  { transform: 'translateX(0px)' },
  { transform: 'translateX(-5px)', offset: 0.18 },
  { transform: 'translateX(4px)', offset: 0.42 },
  { transform: 'translateX(-2px)', offset: 0.66 },
  { transform: 'translateX(1px)', offset: 0.84 },
  { transform: 'translateX(0px)' },
];
export const DENY_SHAKE_MS = 260;
