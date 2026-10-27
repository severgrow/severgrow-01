// THE DAILY CALENDAR — one puzzle per UTC day, the same everywhere at the same moment.
// Pure: every function takes the time (ms since 1970) it should answer for; nothing reads a clock.

const DAY = 86_400_000;

/** The UTC date of a moment, as YYYY-MM-DD. */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The puzzle number of the UTC day containing `ms` (day `epoch` is #1); null before the first day. */
export const puzzleNoOn = (ms: number, epoch: string): number | null => {
  const first = Date.parse(`${epoch}T00:00:00Z`);
  const n = Math.floor((ms - first) / DAY) + 1;
  return n >= 1 ? n : null;
};

/** Milliseconds until the next puzzle (the next UTC midnight). */
export const msToNextPuzzle = (ms: number): number => DAY - (((ms % DAY) + DAY) % DAY);

/**
 * Consecutive solved puzzles ending today — or ending yesterday, since a streak stays alive until
 * today's puzzle is missed (a day is only lost once it is over).
 */
export const streakOf = (solved: readonly number[], today: number): number => {
  const set = new Set(solved.filter((n) => n <= today));
  let n = set.has(today) ? today : today - 1;
  let streak = 0;
  while (set.has(n)) {
    streak++;
    n--;
  }
  return streak;
};

export const TRIES = 3;

/** The share line: a short device printout, no board spoilers. */
export const shareLine = (r: { no: number; title: string; tries: number; solved: boolean; streak: number }): string => {
  const used = r.solved ? r.tries : 0;
  const diamonds = '◆'.repeat(used) + '◇'.repeat(TRIES - used);
  const result = r.solved ? `SOLVED IN ${r.tries}` : 'NOT TODAY';
  const streak = r.streak > 0 ? ` · STREAK ${r.streak}` : '';
  return `FUTASAKU DAILY #${String(r.no).padStart(3, '0')} · ${r.title.toUpperCase()}\n${diamonds} ${result}${streak}\nfutasaku.com`;
};
