// THE TERRITORY ENTRY'S ANSWER CLOCK (owner, 2026-11-01): while an incoming challenge still needs
// THIS player's answer, the entry's tile count becomes the compact time left to answer, ticking.
//
// Cheap by construction, because the menu is not a game surface:
//   - ONE interval, started only when a deadline exists and stopped the moment none does (a
//     closed window, a resolved challenge, an unread list, or a menu pass that finds nothing);
//   - a tick only formats the time and writes ONE text node, and only when the short label has
//     actually changed (it moves once a minute for most of the answer window);
//   - no layout read, no animation, no fetch: the deadline comes from the read the menu already
//     made, and the formatter is the lobby's own (`formatRemaining`, "18h 42m").
//
// The module is mounted by `installOnlineLobby` beside `installTerritoryCountUI`, so the entry's
// paint path and its clock stay separate: this file owns the timer, the entry owns the DOM, and
// both read the countdown's one rule (`answerLabel` in `menu-territory.ts`).
import { answerLabel } from './menu-territory.js';

/** A one-second check: the visible label only ever changes on a minute boundary (or at zero). */
export const ANSWER_TICK_MS = 1_000;

export type AnswerClock = {
  /**
   * Point the clock at an absolute deadline on the SERVER's clock, or null when no answer is
   * waiting. Null stops the interval and hands the read-out back to the tile count at once.
   */
  set(deadline: number | null): void;
  /** Stop ticking and give the read-out back to the tile count (sign-out, a failed read). */
  stop(): void;
};

/**
 * `paint` receives the label to show, or null when the tile count should own the half again.
 * `now` and `tickMs` are injectable so the interval's start/stop and its change-only writes are
 * unit-tested without a browser clock (see `web/tests/menu-territory-live.test.ts`).
 */
export const mountAnswerClock = (
  paint: (text: string | null) => void,
  now: () => number = () => Date.now(),
  tickMs: number = ANSWER_TICK_MS,
): AnswerClock => {
  let deadline: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  /** The last label written, so an unchanged minute does not touch the DOM at all. */
  let written: string | null = null;

  const label = (): string | null => answerLabel(deadline, now());

  const clear = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const write = () => {
    const next = label();
    if (next === written) return;
    written = next;
    paint(next);
  };

  const tick = () => {
    if (deadline === null) {
      clear();
      return;
    }
    // A hidden tab is not seen: skip the write, keep the timer, and let the next visible tick
    // catch up (the deadline is absolute, so nothing drifts).
    if (typeof document !== 'undefined' && document.hidden) return;
    if (label() === null) clear();
    write();
  };

  return {
    set(next) {
      deadline = next;
      if (next === null) {
        clear();
        write();
        return;
      }
      if (timer === null) timer = setInterval(tick, tickMs);
      write();
    },
    stop() {
      deadline = null;
      clear();
      write();
    },
  };
};
