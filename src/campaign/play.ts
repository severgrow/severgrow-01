// CAMPAIGN MODE — the one place a campaign match is opened. It uses the product's own opening
// (`newMatch`), which applies the seeded starting-player lottery, so the campaign position is
// reproducible from the level's seed and validated config alone. Nothing here reaches online:
// online board generation lives on the server and never sees a campaign level.
import { newMatch } from '../engine/index.js';
import type { State } from '../engine/index.js';
import type { CampaignLevel } from './levels.js';

/** The opening state of a campaign level. The same level always yields the same position. */
export const campaignOpening = (level: CampaignLevel): State => newMatch(level.seed, level.config);
