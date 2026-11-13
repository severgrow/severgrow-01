import type {Clock} from './center.js';

/** The 250 ms display clock runs only for a visible Blitz game or invitation countdown. */
export const createLiveTicker = (tick: () => void, clock: Pick<Clock,'setTimeout'|'clearTimeout'>) => {
  let active = false;
  let timer: unknown = null;
  const schedule = () => {
    if (!active || timer !== null) return;
    timer = clock.setTimeout(() => {
      timer = null;
      if (!active) return;
      tick();
      schedule();
    },250);
  };
  return {
    setActive(next: boolean) {
      active = next;
      if (!active && timer !== null) { clock.clearTimeout(timer); timer = null; }
      schedule();
    },
  };
};
