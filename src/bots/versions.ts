// Bot versions. A world-map ticket stores the bot version it was played against; verification
// replays the bot's moves with exactly that version. Only versions whose moves the current code
// still reproduces are kept (v0.6).
//
//   bots-v0.10  the ladder, levels 1-9
//   bots-v0.11  (2026-11-04) a turn never ends without its grow (keeps-growing.ts), levels 1-9
//   bots-v0.12  (2026-11-12) bots-v0.11 plus the rivals, levels 10-12 (docs/CAMPAIGN-71-100.md);
//               levels 1-9 play exactly as in bots-v0.11 (tests/bots/levels-frozen.test.ts)
//   bots-v0.13  (2026-11-12) the rivals search like level 9 (same strength, a fraction of the cost);
//               bots-v0.12's rivals are kept frozen (RIVAL_CONFIGS_V012) for its proofs
//
// The older two stay accepted for proofs queued by older pages; neither can ever replay a rival.
import type { Action, View } from '../engine/index.js';
import { chooseKeepsGrowing, keepsGrowingWith } from './keeps-growing.js';
import { chooseLevelAction, chooseLevelActionV012, isRival } from './levels.js';
import type { BotLevel } from './levels.js';

export type LevelChooser = (v: View, level: BotLevel, seed: number) => Action;

/**
 * bots-v0.13 (2026-11-12): the rivals at level 9's search cost. The page plays it; a server learns it
 * with its next deploy and lists it in its health `features`, and until then the page keeps its proofs
 * queued (web/src/online/seed-rewards.ts), so no Seeds are lost in between.
 */
export const CURRENT_BOT_VERSION = 'bots-v0.13';
/** The version before (already live): every proof queued by an older page names it, so it stays accepted. */
export const PREVIOUS_BOT_VERSION = 'bots-v0.12';

/** A version from before the rivals: the same chooser, refusing a rival it never had. */
const ladderOnly = (version: string, choose: LevelChooser): LevelChooser => (v, level, seed) => {
  if (isRival(level)) throw new Error(`${version} has no level ${level}`);
  return choose(v, level, seed);
};

/** Every bot version still accepted, by name. */
export const BOT_VERSIONS: Readonly<Record<string, LevelChooser>> = Object.freeze({
  [CURRENT_BOT_VERSION]: chooseKeepsGrowing,
  [PREVIOUS_BOT_VERSION]: keepsGrowingWith(chooseLevelActionV012),
  'bots-v0.11': ladderOnly('bots-v0.11', chooseKeepsGrowing),
  'bots-v0.10': ladderOnly('bots-v0.10', chooseLevelAction),
});

/** The bot the game plays now (the current version's chooser). */
export const chooseBotAction: LevelChooser = chooseKeepsGrowing;

/** The bot for a version, or null if unknown. */
export const botFor = (version: string): LevelChooser | null => (Object.hasOwn(BOT_VERSIONS, version) ? BOT_VERSIONS[version]! : null);
