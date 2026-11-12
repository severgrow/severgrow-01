/**
 * A hidden tab has nobody looking at it. Chrome throttles a background tab, but CSS animations and
 * WAAPI animations keep their own clocks and the compositor still ticks them, so a phone in a
 * pocket with the game open keeps painting. Measured (2026-10-29, 390×844, 4× CPU throttle): 19
 * animations still "running" with the page hidden.
 *
 * So: on `visibilitychange` to hidden, pause every animation that is actually playing; on the way
 * back, resume exactly those (and only those still paused), so an animation that something else
 * paused on purpose — the hand's breath under a finger, a frozen screenshot state — stays paused.
 *
 * The decision is split out as pure functions so it can be tested without a browser.
 */

/** The part of the Web Animations API this module touches. */
export type PlayableAnimation = {
  playState: string;
  pause(): void;
  play(): void;
};

/** Pause the animations that are playing right now; returns the ones this call paused. */
export const pausePlayingAnimations = (all: readonly PlayableAnimation[]): PlayableAnimation[] => {
  const paused: PlayableAnimation[] = [];
  for (const animation of all) {
    if (animation.playState !== 'running') continue;
    animation.pause();
    paused.push(animation);
  }
  return paused;
};

/** Resume the animations this module paused, skipping any that have since been finished or cancelled. */
export const resumePausedAnimations = (paused: readonly PlayableAnimation[]): void => {
  for (const animation of paused) if (animation.playState === 'paused') animation.play();
};

/** Mount the gate on the real document. Returns the unsubscribe function (tests and remounts). */
export const mountHiddenPause = (doc: Document = document): (() => void) => {
  let paused: PlayableAnimation[] = [];
  const onVisibility = () => {
    if (doc.hidden) {
      paused = pausePlayingAnimations(doc.getAnimations() as unknown as PlayableAnimation[]);
      return;
    }
    resumePausedAnimations(paused);
    paused = [];
  };
  doc.addEventListener('visibilitychange', onVisibility, { passive: true });
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    resumePausedAnimations(paused);
    paused = [];
  };
};
