// Lightweight, opt-in timing trace (`?debug=timing`). It exists so a two-phone playtest can name
// the slow segment instead of guessing; it never drives the game and costs nothing when off.
//
// Every mark carries BOTH clocks: `t` is `performance.now()` (accurate within one page) and `wall`
// is `Date.now()` (shared by two browser contexts on the same machine), so a two-seat test can
// measure "the other phone saw the turn X ms after the Throw" across pages.
export type TimingMark = {
  /** performance.now(), rounded to 0.1ms. */
  t: number;
  /** Date.now(): comparable between two browser contexts. */
  wall: number;
  ev: string;
  d?: Record<string, unknown>;
};

const MAX = 6000;

const readEnabled = (): boolean => {
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    if (!loc?.search) return false;
    return new URLSearchParams(loc.search).get('debug') === 'timing';
  } catch {
    return false;
  }
};

const enabled = readEnabled();
const marks: TimingMark[] = [];

export const timingEnabled = (): boolean => enabled;

/** Stamp one event. A no-op unless `?debug=timing` is on the URL. */
export const mark = (ev: string, d?: Record<string, unknown>): void => {
  if (!enabled) return;
  const m: TimingMark = { t: Math.round(performance.now() * 10) / 10, wall: Date.now(), ev };
  if (d) m.d = d;
  marks.push(m);
  if (marks.length > MAX) marks.splice(0, marks.length - MAX);
  if (d) console.debug('[timing]', ev, d);
  else console.debug('[timing]', ev);
};

export const timingLog = (): TimingMark[] => marks.slice();

export const clearTiming = (): void => {
  marks.length = 0;
};
