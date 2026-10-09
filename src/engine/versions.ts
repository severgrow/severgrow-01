// A recorded game names its rules. Keep Test2 and earlier 0.3 rules for old replays;
// the current 0.3 adds Mega Bomb and equal no-draw final turns.
import { DEFAULT_CONFIG } from './config.js';
import type { RulesConfig } from './types.js';

export const PREVIOUS_RULES_VERSION = 'v0.8-fruit-sprout';
export const PREVIOUS_03_RULES_VERSION = 'futasaku0.3-unlimited-strengthen';
export const PREVIOUS_MEGA_RULES_VERSION = 'futasaku0.3-mega-bomb-final-turns';
export const CURRENT_RULES_VERSION = 'futasaku0.3-six-card-bloom';

/** Accepted rules for deterministic replay and existing game tickets. */
export const RULES_VERSIONS: Readonly<Record<string, Readonly<RulesConfig>>> = Object.freeze({
  [PREVIOUS_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, strengthenLimitPerGame: 2, deckFinalTurns:false, expandedBloom:false }),
  [PREVIOUS_03_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, deckFinalTurns:false, expandedBloom:false }),
  [PREVIOUS_MEGA_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, expandedBloom:false }),
  [CURRENT_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG }),
});

/** The config for a rules version, or null if the version is unknown. */
export const rulesConfig = (version: string): RulesConfig | null => {
  const c = Object.hasOwn(RULES_VERSIONS, version) ? RULES_VERSIONS[version] : undefined;
  return c ? { ...c } : null;
};
