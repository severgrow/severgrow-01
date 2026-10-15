// CAMPAIGN MODE (web) — the offline-only seam and the campaign's own storage keys.
//
// THE SEAM. The engine already accepts `Partial<RulesConfig>` when a match opens; the browser gates
// that behind the test copy's Lab experiments. A campaign level is the ONE production caller that
// passes terrain into a match, and it does so only from the offline campaign screen. Online board
// generation lives on the server and the online client never starts an offline match, so a campaign
// config cannot reach an online board — `web/tests/campaign-seam.test.ts` pins both halves.
import type { RulesConfig } from '../../../src/engine/index.js';
import type { CampaignLevel } from '../../../src/campaign/index.js';
import { CAMPAIGN_SAVE_KEY, LAST_MODE_KEY } from '../../../src/campaign/index.js';

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

/** Which offline match the player last played, so Continue resumes the right one. */
export type OfflineMode = 'classic' | 'campaign';
export const parseLastMode = (raw: string | null): OfflineMode => (raw === 'campaign' ? 'campaign' : 'classic');
