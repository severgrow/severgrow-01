// HOW LONG UNTIL THE SEEDS LIMIT COMES BACK (owner ask, 2026-11-20): "when 'seeds limit reached'
// says how many hours left round up to 23h, 15h, 1h etc -- smart."
//
// WHERE THE RESET COMES FROM. The cap is the server's UTC-day ceiling
// (`SEED_ECONOMY.utcDailyRepeatableCap`, server/src/seeds/config.ts) and every receipt is filed under
// `utcDay(input.now)` (server/src/seeds/postgres.ts, memory.ts), where `utcDay` is
// `new Date(ms).toISOString().slice(0, 10)`. So this is NOT a rolling 24-hour window: the allowance
// returns at the next 00:00 UTC. `nextUtcMidnight` is exactly that boundary, in arithmetic, with no
// clock of its own.
//
// ROUNDING UP, AND WHY. The label is a DURATION, never a clock time and never a timestamp. It rounds
// UP so the card can never promise the cap is back before it is:
//   14h 01m -> "15h"      exactly 15h -> "15h" (an exact hour stays that hour)
//   23h 59m -> "24h"      the most a UTC-midnight reset can ever be
// Under an hour, whole hours would over-promise ("1h" for 4 minutes), so it says minutes instead:
// "59m", "4m". At/after the boundary it says "now". Time is rounded up to the minute there, so a
// few seconds left still reads "1m" — the only rounding that never over-promises.
//
// THE TIME COMES FROM THE SERVER. Callers pass the server-corrected `now` (the `noteServerNow` /
// `correctedNow` clock in web/src/online/clock.ts), never `Date.now()`: a phone whose clock is hours
// out must not change the answer. This module therefore reads no clock and needs no timer — the
// sentence is computed once, on the render that paints the refusal.

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** 00:00 UTC on the day after `nowMs`: when the server's `utc_day` turns over and the cap returns. */
export const nextUtcMidnight = (nowMs: number): number =>
  Math.floor(nowMs / DAY_MS) * DAY_MS + DAY_MS;

/**
 * The wait until `resetAtMs`, rounded up: "now", "1m".."59m", then "1h".."24h". Pure: the two
 * timestamps are the whole input, so every boundary is a test and no clock is read.
 */
export const seedCapResetLabel = (nowMs: number, resetAtMs: number): string => {
  const left = resetAtMs - nowMs;
  if (!Number.isFinite(left) || left <= 0) return 'now';
  // Under an hour: minutes, rounded up, but never "60m" (that is the hour's own label). The 59 cap
  // under-promises by less than a minute, which is the safe side.
  if (left < HOUR_MS) return `${Math.min(59, Math.ceil(left / MINUTE_MS))}m`;
  return `${Math.ceil(left / HOUR_MS)}h`;
};

/**
 * The finish card's whole sentence. Terse on purpose: `#go-seeds` is ONE line in a card that must not
 * grow, and at 320px with Large text it holds 27 monospace characters (~260px). This is 25 at its
 * longest ("Seed limit · 24h to reset"), measured in web/tests/seed-cap-countdown.test.ts.
 *
 * ONE STRING, AT THE PAINT. There is no timer and no per-second repaint: the line is computed when
 * the refusal is painted, and a re-render (a resize, a late receipt) computes it again. A player who
 * leaves the finished card open across UTC midnight keeps the old figure until that re-render — the
 * quiet trade-off for never paying for a ticking clock on a screen that is a result, not a widget.
 */
export const seedCapNotice = (nowMs: number): string => {
  const label = seedCapResetLabel(nowMs, nextUtcMidnight(nowMs));
  return label === 'now' ? 'Seed limit · reset now' : `Seed limit · ${label} to reset`;
};
