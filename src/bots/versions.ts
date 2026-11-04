// Bot versions. A world-map ticket stores the bot version it was played against; verification
// replays the bot's moves with exactly that version. Only the current bots are kept (v0.6).
import type { Action, View } from '../engine/index.js';
import { chooseKeepsGrowing } from './keeps-growing.js';
import { chooseLevelAction } from './levels.js';
import type { Level } from './levels.js';

export type LevelChooser = (v: View, level: Level, seed: number) => Action;

/**
 * bots-v0.11 (2026-11-04): a turn never ends without its grow (keeps-growing.ts). The page plays it;
 * a server learns it with its next deploy and lists it in its health `features`, and until then the
 * page keeps its proofs queued (seed-rewards.ts), so no Seeds are lost in between.
 */
export const CURRENT_BOT_VERSION = 'bots-v0.11';
/** The version before: every proof queued by an older page names it, so it stays accepted. */
export const PREVIOUS_BOT_VERSION = 'bots-v0.10';

/** Every bot version still accepted, by name. */
export const BOT_VERSIONS: Readonly<Record<string, LevelChooser>> = Object.freeze({
  [CURRENT_BOT_VERSION]: chooseKeepsGrowing,
  [PREVIOUS_BOT_VERSION]: chooseLevelAction,
});

/** The bot the game plays now (the current version's chooser). */
export const chooseBotAction: LevelChooser = chooseKeepsGrowing;

/** The bot for a version, or null if unknown. */
export const botFor = (version: string): LevelChooser | null => (Object.hasOwn(BOT_VERSIONS, version) ? BOT_VERSIONS[version]! : null);
