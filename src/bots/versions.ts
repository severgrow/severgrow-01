// Bot versions. A world-map ticket stores the bot version it was played against; verification
// replays the bot's moves with exactly that version. Only versions whose moves the current code
// still reproduces are kept (v0.6).
//
// bots-v0.11 added the rivals (levels 10-12) and changed nothing about levels 1-9
// (tests/bots/levels-frozen.test.ts pins that). So bots-v0.10 stays accepted for the tickets and
// proofs issued before the deploy: same function, limited to the levels it had.
import type { Action, View } from '../engine/index.js';
import { chooseLevelAction, isRival } from './levels.js';
import type { BotLevel } from './levels.js';

export type LevelChooser = (v: View, level: BotLevel, seed: number) => Action;

export const CURRENT_BOT_VERSION = 'bots-v0.11';

/** bots-v0.10: levels 1-9 exactly as today; it never had the rivals. */
const v010: LevelChooser = (v, level, seed) => {
  if (isRival(level)) throw new Error(`bots-v0.10 has no level ${level}`);
  return chooseLevelAction(v, level, seed);
};

/** Every bot version still accepted, by name. */
export const BOT_VERSIONS: Readonly<Record<string, LevelChooser>> = Object.freeze({
  'bots-v0.10': v010,
  [CURRENT_BOT_VERSION]: chooseLevelAction,
});

/** The bot for a version, or null if unknown. */
export const botFor = (version: string): LevelChooser | null => (Object.hasOwn(BOT_VERSIONS, version) ? BOT_VERSIONS[version]! : null);
