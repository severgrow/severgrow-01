// Bot versions (v0.5). A world-map ticket stores the bot version it was played against;
// verification replays the bot's moves with exactly that version.
import type { Action, View } from '../engine/index.js';
import { chooseLevelAction } from './levels.js';
import type { Level } from './levels.js';
import { chooseLevelAction as chooseV05 } from './v05/levels.js';

export type LevelChooser = (v: View, level: Level, seed: number) => Action;

export const CURRENT_BOT_VERSION = 'bots-v0.6';

/** Every bot version still accepted, by name. */
export const BOT_VERSIONS: Readonly<Record<string, LevelChooser>> = Object.freeze({
  'bots-v0.5': chooseV05,
  [CURRENT_BOT_VERSION]: chooseLevelAction,
});

/** The bot for a version, or null if unknown. */
export const botFor = (version: string): LevelChooser | null => (Object.hasOwn(BOT_VERSIONS, version) ? BOT_VERSIONS[version]! : null);
