// CAMPAIGN MODE — progress + the campaign's own resume save. Deliberately SEPARATE from the classic
// offline save (`severgrow.save.v7`) and from the Classic record (`severgrow.stats.v1`): introducing
// the campaign must never erase or reshape what a player already has.
//
// The unlock rule is the whole of the progression: level 1 is open by default, WINNING a level
// unlocks the next, a loss NEVER removes progress, and a completed level stays replayable.
import type { CampaignLevel } from './levels.js';
import { CAMPAIGN_LEVELS, FIRST_CAMPAIGN_LEVEL } from './levels.js';

/** The campaign's own resume save — a saved unfinished campaign match. */
export const CAMPAIGN_SAVE_KEY = 'severgrow.campaign.save.v1';
/** Which offline match the player last played, so Continue resumes the right one. */
export const LAST_MODE_KEY = 'severgrow.lastmode.v1';
/** The campaign progress record. */
export const CAMPAIGN_PROGRESS_KEY = 'severgrow.campaign.progress.v1';

export const CAMPAIGN_PROGRESS_VERSION = 1;

/** One finished campaign attempt. */
export type CampaignResult = {
  /** The player won (surrounded the home, or led when the deck ended). */
  won: boolean;
  /** The player's final score. */
  score: number;
  /** The final turn number. */
  turns: number;
};

export type CampaignProgress = {
  version: typeof CAMPAIGN_PROGRESS_VERSION;
  /** Count of levels unlocked from the start (>= 1). Level n is playable iff n <= unlocked. */
  unlocked: number;
  /** Ids of levels won at least once. */
  completed: string[];
  /** Best attempt per level id. */
  best: Record<string, CampaignResult>;
};

/** A player who has never opened the campaign: level 1 open, nothing done. */
export const freshProgress = (): CampaignProgress => ({
  version: CAMPAIGN_PROGRESS_VERSION,
  unlocked: 1,
  completed: [],
  best: {},
});

const clampResult = (v: unknown): CampaignResult | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.won !== 'boolean') return null;
  const score = typeof r.score === 'number' && Number.isFinite(r.score) ? Math.max(0, Math.trunc(r.score)) : 0;
  const turns = typeof r.turns === 'number' && Number.isFinite(r.turns) ? Math.max(0, Math.trunc(r.turns)) : 0;
  return { won: r.won, score, turns };
};

/** Reads a stored progress record. Tolerant: anything unreadable, or a hole in it, is dropped. */
export const parseProgress = (raw: string | null): CampaignProgress => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    return freshProgress();
  }
  if (!saved || typeof saved !== 'object') return freshProgress();
  const rec = saved as Record<string, unknown>;
  const out = freshProgress();
  if (typeof rec.unlocked === 'number' && Number.isInteger(rec.unlocked) && rec.unlocked >= 1) {
    out.unlocked = rec.unlocked;
  }
  if (Array.isArray(rec.completed)) {
    out.completed = [...new Set(rec.completed.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  }
  if (rec.best && typeof rec.best === 'object') {
    for (const [id, v] of Object.entries(rec.best as Record<string, unknown>)) {
      const r = clampResult(v);
      if (id && r) out.best[id] = r;
    }
  }
  return out;
};

export const serializeProgress = (p: CampaignProgress): string => JSON.stringify(p);

export const isUnlocked = (p: CampaignProgress, level: Pick<CampaignLevel, 'number'>): boolean =>
  level.number <= p.unlocked;

export const isCompleted = (p: CampaignProgress, levelId: string): boolean => p.completed.includes(levelId);

/** The number of levels the player has completed. */
export const completedCount = (p: CampaignProgress): number => p.completed.length;

/** The best attempt so far: a win beats a loss; then the higher score; then the fewer turns. */
const better = (a: CampaignResult | undefined, b: CampaignResult): CampaignResult => {
  if (!a) return b;
  if (a.won !== b.won) return a.won ? a : b;
  if (a.score !== b.score) return a.score >= b.score ? a : b;
  return a.turns <= b.turns ? a : b;
};

/**
 * The progress after one finished campaign attempt. A win unlocks the next level and marks this
 * one completed; a loss changes neither. The best attempt is kept either way. Never mutates `p`.
 */
export const recordCampaignResult = (
  p: CampaignProgress,
  level: Pick<CampaignLevel, 'id' | 'number'>,
  result: CampaignResult,
): CampaignProgress => ({
  version: CAMPAIGN_PROGRESS_VERSION,
  unlocked: result.won ? Math.max(p.unlocked, level.number + 1) : p.unlocked,
  completed: result.won && !p.completed.includes(level.id) ? [...p.completed, level.id] : [...p.completed],
  best: { ...p.best, [level.id]: better(p.best[level.id], result) },
});

/**
 * The level Continue should open: the first unlocked level the player has NOT yet completed
 * (level 1 for a new player); if every unlocked level is done, the furthest unlocked level.
 */
export const currentLevel = (
  p: CampaignProgress,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): CampaignLevel => {
  let furthest = FIRST_CAMPAIGN_LEVEL;
  for (const level of levels) {
    if (!isUnlocked(p, level)) continue;
    if (level.number > furthest.number) furthest = level;
    if (!isCompleted(p, level.id)) return level;
  }
  return furthest;
};
