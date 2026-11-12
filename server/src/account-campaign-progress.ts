// ACCOUNT CAMPAIGN PROGRESS (owner, 2026-11-08). One snapshot per player; further-ahead wins.
//
// Deliberately free of campaign-board imports: the online server core must not read authored boards
// (isolation test). Level place is derived from completed id suffixes (`cN-MM`).
import { ApiError } from './errors.js';

/** Advertised on `/v1/health` so a page can skip the route on an older server. */
export const ACCOUNT_CAMPAIGN_PROGRESS_FEATURE = 'account-campaign-progress';

/** Cap so a corrupt payload cannot allocate without bound. */
const MAX_LEVELS = 200;

export type AccountCampaignBest = { won: boolean; score: number; turns: number };

/** The wire snapshot: completed level ids + best attempts. No Seeds, tiles or rewards. */
export type AccountCampaignProgressWire = {
  completed: string[];
  best: Record<string, AccountCampaignBest>;
};

/** `c1-01` → 1, `c7-70` → 70. Anything else is ignored. */
export const levelNumberFromId = (id: string): number | null => {
  const match = /^c\d+-(\d+)$/.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LEVELS ? n : null;
};

/**
 * First level not yet cleared in order, starting at 1. A gap stops the place (1,2,4 → 3).
 */
export const unlockedFromCompletedIds = (completed: readonly string[]): number => {
  const nums = new Set<number>();
  for (const id of completed) {
    const n = levelNumberFromId(id);
    if (n !== null) nums.add(n);
  }
  let unlocked = 1;
  while (nums.has(unlocked) && unlocked <= MAX_LEVELS) unlocked += 1;
  return unlocked;
};

type Rank = { unlocked: number; completedCount: number; attemptedCurrent: 0 | 1 };

const rankOf = (snap: AccountCampaignProgressWire): Rank => {
  const unlocked = unlockedFromCompletedIds(snap.completed);
  const attemptedCurrent: 0 | 1 = Object.keys(snap.best).some((id) => levelNumberFromId(id) === unlocked)
    ? 1
    : 0;
  return { unlocked, completedCount: snap.completed.length, attemptedCurrent };
};

const compareRank = (a: Rank, b: Rank): number => {
  if (a.unlocked !== b.unlocked) return a.unlocked - b.unlocked;
  if (a.completedCount !== b.completedCount) return a.completedCount - b.completedCount;
  return a.attemptedCurrent - b.attemptedCurrent;
};

/** Keep the further-ahead snapshot. Equal → `preferred` (same object). */
export const furtherAheadWire = (
  preferred: AccountCampaignProgressWire,
  other: AccountCampaignProgressWire,
): AccountCampaignProgressWire =>
  compareRank(rankOf(preferred), rankOf(other)) >= 0 ? preferred : other;

const clampBest = (value: unknown): AccountCampaignBest | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.won !== 'boolean') return null;
  const score = typeof row.score === 'number' && Number.isFinite(row.score) ? Math.max(0, Math.trunc(row.score)) : 0;
  const turns = typeof row.turns === 'number' && Number.isFinite(row.turns) ? Math.max(0, Math.trunc(row.turns)) : 0;
  return { won: row.won, score, turns };
};

/**
 * Read a POST body into a progress snapshot. Malformed completed/best throw; empty is allowed.
 */
export const parseAccountCampaignProgress = (body: Record<string, unknown>): AccountCampaignProgressWire => {
  const rawCompleted = body.completed;
  if (rawCompleted !== undefined && !Array.isArray(rawCompleted)) {
    throw new ApiError('INVALID_REQUEST', 'completed must be an array of level ids.');
  }
  const completed: string[] = [];
  if (Array.isArray(rawCompleted)) {
    for (const id of rawCompleted) {
      if (typeof id !== 'string' || id.length < 1 || id.length > 32) {
        throw new ApiError('INVALID_REQUEST', 'completed must be an array of level ids.');
      }
      if (levelNumberFromId(id) !== null) completed.push(id);
    }
  }
  const unique = [...new Set(completed)].slice(0, MAX_LEVELS);

  const best: Record<string, AccountCampaignBest> = {};
  const rawBest = body.best;
  if (rawBest !== undefined && (typeof rawBest !== 'object' || rawBest === null || Array.isArray(rawBest))) {
    throw new ApiError('INVALID_REQUEST', 'best must be an object of level attempts.');
  }
  if (rawBest && typeof rawBest === 'object') {
    for (const [id, value] of Object.entries(rawBest as Record<string, unknown>)) {
      if (typeof id !== 'string' || levelNumberFromId(id) === null) continue;
      const attempt = clampBest(value);
      if (!attempt) throw new ApiError('INVALID_REQUEST', 'best must hold won/score/turns attempts.');
      best[id] = attempt;
      if (Object.keys(best).length >= MAX_LEVELS) break;
    }
  }
  return { completed: unique, best };
};
