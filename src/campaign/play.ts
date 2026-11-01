// CAMPAIGN MODE — the one place a campaign match is opened. It uses the product's own opening
// (`newMatch`), which applies the seeded starting-player lottery, so the campaign position is
// reproducible from the level's seed and validated config alone. Nothing here reaches online:
// online board generation lives on the server and never sees a campaign level.
import { newMatch } from '../engine/index.js';
import type { State } from '../engine/index.js';
import type { CampaignLevel } from './levels.js';

/** The opening state of a campaign level. The same level always yields the same position. */
export const campaignOpening = (level: CampaignLevel): State => newMatch(level.seed, level.config);

/**
 * RANDOM DEALS (owner, 2026-11-01): "I want deals to always be completely random. As if you'd be
 * playing card game in real life." From this level up, every attempt is a fresh shuffle — hands,
 * piles and who starts — while the level's authored board and bot level stay fixed, so difficulty
 * comes from terrain and the bot only. Levels below it are the authored lessons (one fixed opening).
 */
export const RANDOM_DEALS_FROM_LEVEL = 11;

export const dealsRandomly = (level: Pick<CampaignLevel, 'number'>): boolean => level.number >= RANDOM_DEALS_FROM_LEVEL;

/** A deal seed: a whole 32-bit unsigned number (the same range the server's own match seeds use). */
export const isDealSeed = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/**
 * One deal of a level: its authored board and rules, shuffled by `seed`. Deterministic, so the
 * server rebuilds exactly the deal the player saw from the seed their win proof carries.
 * `campaignDeal(level, level.seed)` is the level's fixed opening.
 */
export const campaignDeal = (level: CampaignLevel, seed: number): State => newMatch(seed, level.config);

/**
 * The word a server lists in `GET /v1/health` `features` once it can check a random-deal win. A page
 * only deals randomly after seeing it: an older server would refuse such a win and its Seeds would be
 * lost (a refused proof is dropped from the queue).
 */
export const RANDOM_DEALS_FEATURE = 'campaign-random-deals';
