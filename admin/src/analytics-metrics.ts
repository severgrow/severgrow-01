// Owner-facing analytics computed from data the Players endpoint already returns.
//
// These are NOT visit logs: each player carries one `lastSeenAt` (the newest recorded row of any
// kind). Retention here means "the server recorded something again after the window", not classic
// daily-active-user retention. The screen says so; these functions never pretend otherwise.
import type { AdminPlayersRow } from '../../server/src/admin/players.js';

export const DAY = 24 * 60 * 60 * 1000;

export const utcDayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export type DayCount = { day: string; n: number };

/** New human players per UTC day for the last `days` days ending at `now` (inclusive). */
export const joinsByUtcDay = (humans: readonly AdminPlayersRow[], now: number, days: number): DayCount[] => {
  const keys: string[] = [];
  const end = Date.parse(`${utcDayKey(now)}T00:00:00.000Z`);
  for (let i = days - 1; i >= 0; i -= 1) keys.push(utcDayKey(end - i * DAY));
  const counts = new Map(keys.map((day) => [day, 0]));
  for (const row of humans) {
    const day = utcDayKey(row.createdAt);
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return keys.map((day) => ({ day, n: counts.get(day) ?? 0 }));
};

export type CohortRetentionRow = {
  key: 'd1' | 'd7';
  label: string;
  eligible: number;
  returned: number;
  /** Whole-percent share, or null when `eligible` is 0. */
  rate: number | null;
  /** Plain note shown beside the figure. */
  note: string;
};

const retentionWindow = (
  humans: readonly AdminPlayersRow[],
  now: number,
  key: 'd1' | 'd7',
  label: string,
  minAgeMs: number,
  returnAfterMs: number,
  note: string,
): CohortRetentionRow => {
  const eligible = humans.filter((row) => row.createdAt <= now - minAgeMs);
  const returned = eligible.filter((row) => row.lastSeenAt - row.createdAt >= returnAfterMs).length;
  return {
    key,
    label,
    eligible: eligible.length,
    returned,
    rate: eligible.length > 0 ? Math.round((returned / eligible.length) * 100) : null,
    note,
  };
};

/**
 * Honest return rates from `createdAt` and `lastSeenAt` only.
 *
 * D1: joined at least 2 days ago; "returned" = something was recorded ≥ 1 full day after join.
 * D7: joined at least 8 days ago; "returned" = something was recorded ≥ 7 full days after join.
 */
export const cohortRetention = (humans: readonly AdminPlayersRow[], now: number): CohortRetentionRow[] => [
  retentionWindow(
    humans,
    now,
    'd1',
    'Recorded again after day 1',
    2 * DAY,
    DAY,
    'Players who joined at least 2 days ago. "Returned" means the newest recorded row is at least 24 h after they joined — not a visit log.',
  ),
  retentionWindow(
    humans,
    now,
    'd7',
    'Recorded again after day 7',
    8 * DAY,
    7 * DAY,
    'Players who joined at least 8 days ago. "Returned" means the newest recorded row is at least 7 days after they joined.',
  ),
];

export type FunnelStep = { label: string; n: number; fromPrevious: string | null };

export const funnelConversions = (steps: readonly { label: string; n: number }[]): FunnelStep[] =>
  steps.map((step, index) => ({
    ...step,
    fromPrevious: index === 0 ? null : formatPercent(step.n, steps[index - 1]!.n),
  }));

const formatPercent = (part: number, total: number): string | null =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : null;

/** Humans with at least two finished online matches — a simple repeat-play signal. */
export const repeatOnlinePlayers = (humans: readonly AdminPlayersRow[]): number =>
  humans.filter((row) => row.matches.finished >= 2).length;
