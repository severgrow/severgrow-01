// PRACTICE STREAKS + BEST ONLINE BLITZ STREAK (owner, 2026-11-18). One pure rule, shared by the page
// (an instant number after a game) and the server (the account's record), so the two can never count
// a game differently. No clocks, no I/O.
//
// The owner-approved table:
//   Win +1 · Loss 0 · Draw unchanged · Resign 0 · Abandon (a new game over an unfinished one) 0 ·
//   Online Blitz forfeit or timeout 0 · Best = the highest current ever reached.

/** The four Practice keys: EASY / MEDIUM / HARD / BLITZ. Campaign, lessons and online never count. */
export const PRACTICE_TIERS = Object.freeze(['easy', 'medium', 'hard', 'blitz'] as const);
export type PracticeTier = (typeof PRACTICE_TIERS)[number];
export const isPracticeTier = (value: unknown): value is PracticeTier =>
  typeof value === 'string' && (PRACTICE_TIERS as readonly string[]).includes(value);

/** How a game ended, from the player's side. Everything but a win and a draw is a loss. */
export const STREAK_RESULTS = Object.freeze(['win', 'loss', 'draw', 'resign', 'abandon', 'forfeit', 'timeout'] as const);
export type StreakResult = (typeof STREAK_RESULTS)[number];
export const isStreakResult = (value: unknown): value is StreakResult =>
  typeof value === 'string' && (STREAK_RESULTS as readonly string[]).includes(value);

/**
 * A game that ran to its natural end from the player's side. The Practice keys' numbers are revealed
 * after three of these (owner, 2026-11-20); a restart/abandon, a resignation, an online forfeit or a
 * clock timeout all end a game but do not count as "fully completed".
 */
export const isCompletedResult = (result: StreakResult): boolean =>
  result === 'win' || result === 'loss' || result === 'draw';

export type Streak = { current: number; best: number };
export const emptyStreak = (): Streak => ({ current: 0, best: 0 });

const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export const applyGame = (streak: Streak, result: StreakResult): Streak => {
  const before = { current: count(streak.current), best: count(streak.best) };
  const current = result === 'win' ? before.current + 1 : result === 'draw' ? before.current : 0;
  return { current, best: Math.max(before.best, current) };
};

export const applyGames = (streak: Streak, results: readonly StreakResult[]): Streak =>
  results.reduce(applyGame, streak);

export type PracticeStreaks = Record<PracticeTier, Streak>;
export const emptyPracticeStreaks = (): PracticeStreaks =>
  ({ easy: emptyStreak(), medium: emptyStreak(), hard: emptyStreak(), blitz: emptyStreak() });
