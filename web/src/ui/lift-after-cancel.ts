// WEBKIT LIFTS SOME DRAGS AS "POINTERCANCEL, THEN POINTERUP" (CI trace on 28b88c91: a cockpit Blast
// drag on the iPhone engine ended with pointercancel and pointerup at the same point, 0 ms apart,
// and the drop was lost). A cancel on a drag in motion therefore waits one short beat: a release
// for the same drag inside it is the lift, and only silence is a real cancel. Pure (the timer is
// injected), so the decision is unit-tested without a browser.

/** How long a cancel waits for its release. Short enough that a real cancel still feels instant. */
export const LIFT_AFTER_CANCEL_MS = 120;

type Timers = { schedule: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

export function liftAfterCancel(timers: Timers = {
  schedule: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}) {
  let waiting: unknown = null;
  return {
    /** A cancel arrived: run `cancel` after one beat unless a release comes first. */
    cancel(cancel: () => void) {
      if (waiting !== null) timers.clear(waiting);
      waiting = timers.schedule(() => { waiting = null; cancel(); }, LIFT_AFTER_CANCEL_MS);
    },
    /** A release arrived. Returns true when it was the lift of a waiting cancel (and commits it). */
    release(commit: () => void): boolean {
      if (waiting === null) return false;
      timers.clear(waiting);
      waiting = null;
      commit();
      return true;
    },
    pending: () => waiting !== null,
    /** Forget a waiting cancel (the drag ended some other way). */
    reset() {
      if (waiting !== null) timers.clear(waiting);
      waiting = null;
    },
  };
}
