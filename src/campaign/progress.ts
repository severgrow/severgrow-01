// CAMPAIGN MODE — progress + the campaign's own resume save. Deliberately SEPARATE from the classic
// offline save (`severgrow.save.v7`) and from the Classic record (`severgrow.stats.v1`): introducing
// the campaign must never erase or reshape what a player already has.
//
// The unlock rule is the whole of the progression: level 1 is open by default, WINNING a level
// unlocks the next, a loss NEVER removes progress, and a completed level stays replayable.
import type { CampaignLevel } from './levels.js';
import { CAMPAIGN_LEVELS, FIRST_CAMPAIGN_LEVEL } from './levels.js';

/**
 * The campaign's own resume save — a saved unfinished campaign match.
 *
 * v3 (2026-10-19): the onboarding polish changed lesson versions and several authored boards, so
 * a v2 match cannot be resumed onto a board it no longer matches. A v2 (or v1) save is not read at
 * all: the old key stays on disk unused rather than being migrated into a mismatch.
 */
export const CAMPAIGN_SAVE_KEY = 'severgrow.campaign.save.v3';
/** Which offline match the player last played, so Continue resumes the right one. */
export const LAST_MODE_KEY = 'severgrow.lastmode.v1';
/**
 * The campaign progress record.
 *
 * v3 (2026-10-19): owner direction — reset the campaign once more for the onboarding polish, so
 * nobody resumes onto a changed board or keeps progress through a lesson script that has moved on.
 * A v2 (or v1) record is ignored, so an existing player starts at level 1; the old key is left
 * alone so nothing is destroyed on their device.
 */
export const CAMPAIGN_PROGRESS_KEY = 'severgrow.campaign.progress.v3';

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
  /** Derived count of levels open from the start (>= 1). Level n is playable iff n <= unlocked.
   *  It is RECOMPUTED from `completed` rather than trusted, so it can never disagree with the
   *  record — see `unlockedThrough`. */
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
  // The stored counter is NOT trusted: it is recomputed from the completed list, so a save that
  // claims more progress than it records cannot grant access to a level the player skipped.
  out.unlocked = unlockedThrough(out);
  return out;
};

export const serializeProgress = (p: CampaignProgress): string => JSON.stringify(p);

/**
 * The first level you have NOT won, in level order: level 1 for a new player, and after winning
 * 1..n it is n+1. This is the ONE source of access — the stored `unlocked` is recomputed from it.
 *
 * Reads the completed LIST rather than a counter, so a gap cannot be skipped over: if 40 is missing,
 * nothing past 40 opens, however many later levels are in the record.
 */
export const unlockedThrough = (
  p: CampaignProgress,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): number => {
  let unlocked = FIRST_CAMPAIGN_LEVEL.number;
  for (const level of [...levels].sort((a, b) => a.number - b.number)) {
    if (!p.completed.includes(level.id)) break;
    unlocked = level.number + 1;
  }
  return unlocked;
};

/** Level n is playable iff every level before it has been won. Order is part of the rule. */
export const isUnlocked = (
  p: CampaignProgress,
  level: Pick<CampaignLevel, 'number'>,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): boolean => level.number <= unlockedThrough(p, levels);

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
 * The progress after one finished campaign attempt. A win marks this one completed and therefore
 * opens the next level IN ORDER; a loss changes neither. The best attempt is kept either way.
 * The `unlocked` counter is recomputed from the completed list, never advanced blindly: winning a
 * replay of an earlier level cannot open anything new. Never mutates `p`.
 */
export const recordCampaignResult = (
  p: CampaignProgress,
  level: Pick<CampaignLevel, 'id' | 'number'>,
  result: CampaignResult,
): CampaignProgress => {
  const next: CampaignProgress = {
    version: CAMPAIGN_PROGRESS_VERSION,
    unlocked: 0,
    completed: result.won && !p.completed.includes(level.id) ? [...p.completed, level.id] : [...p.completed],
    best: { ...p.best, [level.id]: better(p.best[level.id], result) },
  };
  // Derived after the fact, so a win that leaves a gap opens nothing past the gap.
  return { ...next, unlocked: unlockedThrough(next) };
};

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
    if (!isUnlocked(p, level, levels)) continue;
    if (level.number > furthest.number) furthest = level;
    if (!isCompleted(p, level.id)) return level;
  }
  return furthest;
};
