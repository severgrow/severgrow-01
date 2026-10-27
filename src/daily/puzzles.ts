// THE SHIPPED DAILY PUZZLES. Loaded only when a puzzle is opened (the menu needs just
// ./schedule.ts), and by the server, which replays a claimed solve against the puzzle's own start.
import type { DailyPuzzle } from './core.js';
import { PUZZLE_DATA } from './puzzles-data.js';

/** Puzzle number `no` (1-based), or null when there is no such puzzle. */
export const dailyPuzzle = (no: number): DailyPuzzle | null => {
  const e = Number.isInteger(no) ? PUZZLE_DATA[no - 1] : undefined;
  return e ? { no: e.no, title: e.title, note: e.note, goal: e.goal, start: e.start } : null;
};

export const dailyPuzzleCount = (): number => PUZZLE_DATA.length;
