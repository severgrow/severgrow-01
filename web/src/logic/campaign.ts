// CAMPAIGN MODE (web) — the offline-only seam and the campaign's own storage keys.
//
// THE SEAM. The engine already accepts `Partial<RulesConfig>` when a match opens; the browser gates
// that behind the test copy's Lab experiments. A campaign level is the ONE production caller that
// passes terrain into a match, and it does so only from the offline campaign screen. Online board
// generation lives on the server and the online client never starts an offline match, so a campaign
// config cannot reach an online board — `web/tests/campaign-seam.test.ts` pins both halves.
import type { RulesConfig } from '../../../src/engine/index.js';
import type { CampaignLevel, CampaignProgress } from '../../../src/campaign/index.js';
import { CAMPAIGN_SAVE_KEY, LAST_MODE_KEY, CAMPAIGN_LEVELS, currentLevel, isCompleted } from '../../../src/campaign/index.js';
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
 *   - `start`  — nothing saved: open the next unfinished level.
 *   - `resume` — the saved match IS that level: resume it. No question, because there is no conflict.
 *   - `ask`    — the saved match is a DIFFERENT level: the only case where the player has to choose.
 *                Asking here and nowhere else keeps a normal press to one tap.
 */
export type CampaignEntry =
  | { kind: 'list' }
  | { kind: 'start'; level: CampaignLevel }
  | { kind: 'resume'; level: CampaignLevel }
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
  if (savedLevel.id === next.id) return { kind: 'resume', level: next };
  return { kind: 'ask', next, saved: savedLevel };
};

