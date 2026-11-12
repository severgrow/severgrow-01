// THE SAFETY NET'S CLOCK — three calm steps, reset by any touch.
//
// 6 s WHISPER, 12 s GUIDE, 20 s the light guide (pointer + glow, no heavy dim). It holds no game
// rule: it only reports which step the player has been quiet through, so the UI can raise the tier
// for that moment. A new touch resets it to zero.
export const IDLE_STEPS_MS = Object.freeze([6_000, 12_000, 20_000] as const);

export type IdleStage = 0 | 1 | 2 | 3;

export type IdleWatch = {
  /** Begin (or restart) from zero. */
  reset: () => void;
  /** Stop without changing the stage (leaving the level, opening a sheet). */
  stop: () => void;
  stage: () => IdleStage;
};

/**
 * `onStage` runs on every step (1 at 6 s, 2 at 12 s, 3 at 20 s). The timers are the platform's,
 * passed in so a test can drive them with fake timers; the production caller uses the defaults.
 */
export const createIdleWatch = (
  onStage: (stage: IdleStage) => void,
  timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis,
): IdleWatch => {
  let handles: ReturnType<typeof setTimeout>[] = [];
  let stage: IdleStage = 0;
  const stop = () => {
    for (const h of handles) timers.clearTimeout(h);
    handles = [];
  };
  const reset = () => {
    stop();
    stage = 0;
    IDLE_STEPS_MS.forEach((ms, i) => {
      handles.push(timers.setTimeout(() => {
        stage = (i + 1) as IdleStage;
        onStage(stage);
      }, ms));
    });
  };
  return { reset, stop, stage: () => stage };
};
