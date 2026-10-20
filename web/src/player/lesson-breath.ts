// THE LESSON'S BREATH — the lit thing keeps breathing until the player acts.
//
// A lesson beat lights one thing and then waits for the player. The light must not stop while it
// waits: a still highlight reads as a finished step, and the player looks away. The board's own
// tiles breathe with the rank glow, and the display carries its own baked bloom, but a CARD, a
// PILE or a CONTROL KEY had nothing — `.tutorial-target-card` even killed the hand's breath.
//
// One Web Animation per lit element, so it can be:
//   - stopped the moment the beat moves on (no CSS rule left running on a stale selector),
//   - paused with the page (hidden tab, pause, sheet — the same hold the hand's breath uses),
//   - skipped entirely under reduce motion (a static lit state, no infinite animation).
// It animates `scale` only. Never a filter, a shadow, a background or anything that lays out.
import type { FocusShape } from './glass-surface.js';

/** The animation's id, so a fast-forward sweep can tell the lesson's endless breath from a one-off. */
export const LESSON_BREATH_ID = 'lesson-beat-breath';

export const LESSON_BREATH = Object.freeze({
  /** One full breath: slow enough to read as breathing, fast enough to notice. */
  ms: 1800,
  /** 3% of the target's own size — the drawn pile's own breathe is 3.5%. */
  scale: 1.03,
});

/**
 * Which lit shapes breathe with the lesson. A hex already breathes on the board (the rank glow's
 * own breath), and the display lights itself, so neither is doubled here.
 */
export const breathesWithLesson = (shape: FocusShape): boolean => shape === 'card' || shape === 'pill';

/** The display is the light source itself; it is never scaled or dimmed by the lesson. */
const LIGHTS_ITSELF = /#smart-led\b/;

/**
 * A surface with its own dedicated breathe: the Draw pile in the Draw step (information.ts). Two
 * 3% scales out of step read as one doubled, uneven breath, so that rule is HELD where it is while
 * the lesson's breath is the only pulse — and released, still in phase, when the beat moves on.
 * If the pile's own rule is not running at all, the lesson's breath fills in and the pile is never
 * left still.
 */
const OWN_BREATH = 'futa04-draw-pile-breathe';
const ownBreathOf = (el: Element): Animation[] => {
  if (typeof el.getAnimations !== 'function') return [];
  return el.getAnimations().filter((animation) => animation.playState === 'running'
    && (animation as Animation & { animationName?: string }).animationName === OWN_BREATH);
};

export type LessonBreath = {
  /** Point the breath at the beat's lit targets. `on` false (reduce motion, not my turn) stops it. */
  sync: (selectors: readonly string[], shape: FocusShape, on: boolean) => void;
  /** Hold it where it is (hidden tab, pause, a sheet, a finger on the board). */
  hold: (on: boolean) => void;
  /** No beat on screen any more. */
  clear: () => void;
};

export const mountLessonBreath = (): LessonBreath => {
  let nodes: Element[] = [];
  let animations: Animation[] = [];
  /** A surface's own breathe, frozen while the lesson's breath is the one pulse. */
  let ownHeld: Animation[] = [];
  let still = false;

  const releaseOwn = () => {
    for (const animation of ownHeld) animation.play();
    ownHeld = [];
  };

  const stop = () => {
    for (const animation of animations) animation.cancel();
    animations = [];
    nodes = [];
    releaseOwn();
  };

  const applyStill = () => {
    for (const animation of animations) {
      if (still) animation.pause();
      else animation.play();
    }
  };

  const sync = (selectors: readonly string[], shape: FocusShape, on: boolean) => {
    const targets = on && breathesWithLesson(shape)
      ? [...new Set(selectors
        .filter((selector) => !LIGHTS_ITSELF.test(selector))
        .map((selector) => document.querySelector(selector))
        .filter((el): el is Element => !!el))]
      : [];
    // The same targets keep the same breath across renders (no restart, no phase jump); a target
    // the last render replaced is a new node, so the breath moves with it.
    if (targets.length === nodes.length && targets.every((el, i) => el === nodes[i])) return;
    stop();
    nodes = targets;
    for (const el of targets) {
      if (typeof el.animate !== 'function') continue;
      for (const own of ownBreathOf(el)) {
        own.pause();
        ownHeld.push(own);
      }
      // `composite: 'add'` makes the breath ADD to whatever scale the element already has (a
      // `scale` addition multiplies), so the lifted card keeps its 1.055, the Draw pile keeps its
      // own size, and the lesson only adds the 3% breath on top. A replace animation would shrink
      // the lifted card back to 1 at the bottom of its breath.
      const animation = el.animate(
        [{ scale: '1' }, { scale: String(LESSON_BREATH.scale) }, { scale: '1' }],
        { duration: LESSON_BREATH.ms, iterations: Infinity, easing: 'ease-in-out', composite: 'add' },
      );
      animation.id = LESSON_BREATH_ID;
      animations.push(animation);
    }
    applyStill();
  };

  const hold = (on: boolean) => {
    if (on === still) return;
    still = on;
    applyStill();
  };

  return { sync, hold, clear: stop };
};
