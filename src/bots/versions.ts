// Bot versions (v0.5). A world-map ticket stores the bot version it was played against;
// verification replays the bot's moves with exactly that version.
import type { Action, View } from '../engine/index.js';
import { V06_LEVEL_8, V06_LEVEL_9, chooseLevelAction, chooseWithConfig } from './levels.js';
import type { Level } from './levels.js';
import { chooseLevelAction as chooseV05 } from './v05/levels.js';

export type LevelChooser = (v: View, level: Level, seed: number) => Action;

export const CURRENT_BOT_VERSION = 'bots-v0.7';

/** bots-v0.6: levels 1-7 as now; levels 8 and 9 with their old discard rule (keep every combo card). */
const chooseV06: LevelChooser = (v, level, seed) =>
  level === 8 ? chooseWithConfig(v, V06_LEVEL_8, seed) : level === 9 ? chooseWithConfig(v, V06_LEVEL_9, seed) : chooseLevelAction(v, level, seed);

/** Every bot version still accepted, by name. */
export const BOT_VERSIONS: Readonly<Record<string, LevelChooser>> = Object.freeze({
  'bots-v0.5': chooseV05,
  'bots-v0.6': chooseV06,
  [CURRENT_BOT_VERSION]: chooseLevelAction,
});

/** The bot for a version, or null if unknown. */
export const botFor = (version: string): LevelChooser | null => (Object.hasOwn(BOT_VERSIONS, version) ? BOT_VERSIONS[version]! : null);
