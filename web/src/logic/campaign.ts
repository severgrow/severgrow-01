// CAMPAIGN MODE (web) — the offline-only seam and the campaign's own storage keys.
//
// THE SEAM. The engine already accepts `Partial<RulesConfig>` when a match opens; the browser gates
// that behind the test copy's Lab experiments. A campaign level is the ONE production caller that
// passes terrain into a match, and it does so only from the offline campaign screen. Online board
// generation lives on the server and the online client never starts an offline match, so a campaign
// config cannot reach an online board — `web/tests/campaign-seam.test.ts` pins both halves.
import type { RulesConfig } from '../../../src/engine/index.js';
import type { CampaignChapter, CampaignLevel, CampaignProgress, CampaignResult } from '../../../src/campaign/index.js';
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_SAVE_KEY,
  LAST_MODE_KEY,
  CAMPAIGN_LEVELS,
  currentLevel,
  isCompleted,
  recordCampaignResult,
} from '../../../src/campaign/index.js';
import { SAVE_KEY } from './persist.js';

export { CAMPAIGN_SAVE_KEY, LAST_MODE_KEY };
export { CAMPAIGN_PROGRESS_KEY, parseProgress, serializeProgress, freshProgress } from '../../../src/campaign/index.js';
export type { CampaignProgress, CampaignResult } from '../../../src/campaign/index.js';

/**
 * The overrides an OFFLINE match starts with:
 *   - a campaign level's authored config (only a campaign match passes one), else
 *   - the test copy's active Lab experiment, else
 *   - `{}` — the classic game's own configuration.
 * This is the whole of the seam: no other caller can pass terrain in production.
 */
export const overridesForMatch = (
  campaign: CampaignLevel | null,
  isTest: boolean,
  labOverrides: Partial<RulesConfig> = {},
): Partial<RulesConfig> => (campaign ? campaign.config : isTest ? labOverrides : {});

/**
 * The storage key an offline save belongs to. A campaign save NEVER shares the classic key, so
 * introducing the campaign cannot overwrite (or be mistaken for) an existing classic save.
 */
export const offlineSaveKey = (campaign: CampaignLevel | null): string =>
  campaign ? CAMPAIGN_SAVE_KEY : SAVE_KEY;

/** Which offline match the player last played, so Continue resumes the right one. */
export type OfflineMode = 'classic' | 'campaign';
export const parseLastMode = (raw: string | null): OfflineMode => (raw === 'campaign' ? 'campaign' : 'classic');

/**
 * The campaign's own resume save: which level, and the offline match save (the same
 * `encodeSave` format the classic game uses, so resuming replays through the tested decoder).
 */
export type CampaignSave = { levelId: string; match: string };

export const encodeCampaignSave = (levelId: string, match: string): string =>
  JSON.stringify({ v: 1, levelId, match });

export const decodeCampaignSave = (raw: string | null): CampaignSave | null => {
  try {
    const s = JSON.parse(raw ?? '') as { v?: number; levelId?: unknown; match?: unknown };
    if (s?.v !== 1 || typeof s.levelId !== 'string' || !s.levelId || typeof s.match !== 'string' || !s.match) return null;
    return { levelId: s.levelId, match: s.match };
  } catch {
    return null;
  }
};

/**
 * WHAT THE CAMPAIGN ENTRY DOES, decided from data rather than from whichever state the page happens
 * to be in. The bug this replaces: the menu label came from progress while the press preferred a
 * saved match, so with an old replay left unfinished the entry said `LEVEL 70` and opened level 31.
 *
 *   - `list`   — every built level is complete. The chapter list is the only place left to go, so the
 *                entry stops claiming a level number at all.
 *   - `start`  — nothing saved: open the next unfinished level, silently (one tap).
 *   - `ask`    — an unfinished saved match exists. The player is ALWAYS asked before it resumes:
 *                either "continue this level or start it over" when the save is the level being
 *                entered, or "resume the saved level or start the next one" when it is a different
 *                level. Owner decision (2026-10-19): no silent resume on entry, and no Continue on
 *                the main menu.
 */
export type CampaignEntry =
  | { kind: 'list' }
  | { kind: 'start'; level: CampaignLevel }
  | { kind: 'ask'; next: CampaignLevel; saved: CampaignLevel };

export const campaignEntry = (
  progress: CampaignProgress,
  savedLevel: CampaignLevel | null,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): CampaignEntry => {
  const next = currentLevel(progress, levels);
  // `currentLevel` returns the first unlocked level that is not complete, else the furthest unlocked.
  // If even that is complete, every built level is done.
  if (isCompleted(progress, next.id)) return { kind: 'list' };
  if (!savedLevel) return { kind: 'start', level: next };
  // THE PLACE IS THE ANCHOR (owner, 2026-10-24). A saved match on any level BEHIND the place is a
  // replay in progress: it may not become the thing this entry opens, or replaying level 1 would
  // make the entry offer to "come back" to level 1 (the reported bug). Only a save on the place
  // itself still asks continue-vs-start-over. The replay save stays on the device untouched; the
  // level list can still start that level again.
  if (savedLevel.id !== next.id) return { kind: 'start', level: next };
  return { kind: 'ask', next, saved: savedLevel };
};

/**
 * The player's PLACE: the level they are working on. This is the one anchor of the whole flow
 * (owner, 2026-10-24): the PLAY entry, the level list's "current" tile and its Continue, and the
 * return path after a finished level all read it. It is derived from progress on every read, so a
 * replay cannot move it and nothing has to be kept in sync.
 */
export const placeFor = (
  progress: CampaignProgress,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): CampaignLevel => currentLevel(progress, levels);

/** A replay: a level BEHIND the place, i.e. one whose win cannot unlock anything new. */
export const isReplay = (
  progress: CampaignProgress,
  level: Pick<CampaignLevel, 'number'>,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): boolean => level.number < placeFor(progress, levels).number;

/**
 * Whether a saved match may be offered where the campaign is entered. A save on a replay is NOT
 * the place: offering it is exactly how the player got stranded behind their own progress.
 */
export const resumeOffersPlace = (
  progress: CampaignProgress,
  saved: Pick<CampaignLevel, 'id'>,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): boolean => saved.id === placeFor(progress, levels).id;

/** What kind of campaign match is running. */
export type CampaignMatchKind = 'campaign' | 'tutorial';

/**
 * The Tutorial (Settings) replays campaign levels 1-9 EXACTLY as the campaign plays them — same
 * level object, same seed, same bot, same config, same lesson. It is an entry point, never a copy:
 * this is the whole of its level data.
 */
export const TUTORIAL_LEVEL_COUNT = 9;

export const tutorialLevels = (levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS): CampaignLevel[] =>
  levels.filter((level) => level.number >= 1 && level.number <= TUTORIAL_LEVEL_COUNT);

/** The campaign level a tutorial tile opens, or null outside the Tutorial's range. */
export const tutorialLevel = (
  number: number,
  levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS,
): CampaignLevel | null => levels.find((level) => level.number === number && level.number <= TUTORIAL_LEVEL_COUNT) ?? null;

/**
 * Only a real campaign match writes the record and the resume save. A tutorial replay is inert by
 * design (owner, 2026-10-24): it is a way to re-read lessons, not a way to play the campaign, so it
 * cannot mark a level complete, un-unlock anything, or overwrite an unfinished match.
 */
export const writesCampaignRecord = (kind: CampaignMatchKind): boolean => kind === 'campaign';

/**
 * The progress after one finished match. Kept here (rather than in the page) so the Tutorial's
 * inertness is a tested rule: `kind: 'tutorial'` returns the SAME record, byte for byte.
 */
export const progressAfterMatch = (
  progress: CampaignProgress,
  kind: CampaignMatchKind,
  level: Pick<CampaignLevel, 'id' | 'number'>,
  result: CampaignResult,
): CampaignProgress =>
  writesCampaignRecord(kind) ? recordCampaignResult(progress, level, result) : progress;

/**
 * How far the player is through the CHAPTER a level belongs to. The PLAY submenu's caption under
 * LEVEL <n> is the one reader: the entry already says the level number, so the line says what the
 * entry cannot — how much of that chapter is behind the player ("5 of 10 complete"). It counts from
 * the same progress record the level list reads, and returns null when there is no level to describe
 * (the entry opens the chapter list instead), so a caller can omit the line rather than invent one.
 */
export const chapterProgressFor = (
  level: CampaignLevel | null,
  progress: CampaignProgress,
  chapters: readonly CampaignChapter[] = CAMPAIGN_CHAPTERS,
): { done: number; total: number } | null => {
  if (!level) return null;
  const chapter = chapters.find((c) => c.number === level.chapter);
  if (!chapter || chapter.levels.length === 0) return null;
  return {
    done: chapter.levels.filter((l) => isCompleted(progress, l.id)).length,
    total: chapter.levels.length,
  };
};

