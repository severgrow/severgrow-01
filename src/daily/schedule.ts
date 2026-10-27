// WHEN THE DAILY PUZZLES RUN — tiny on purpose, so the menu can say "DAILY #042" without loading
// the puzzles themselves (src/daily/puzzles.ts is fetched only when one is opened).
//
// Day DAILY_EPOCH (UTC) is puzzle #1, the next day #2, and so on. A day past the last shipped
// puzzle has none: the menu entry stands down until more are added (never a repeat — a number
// names one puzzle forever). DAILY_COUNT is pinned to the data by tests/daily/puzzles.test.ts.
export const DAILY_EPOCH = '2026-10-28';
export const DAILY_COUNT = 30;
