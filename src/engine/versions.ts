// A recorded game names its rules. Archived versions stay so old replays, tickets and saves
// still verify; the current Futasaku 0.4 rules add the engine's draw for who starts and the
// strength tie-break (docs/SPEC.md, "Rules versions").
import { DEFAULT_CONFIG } from './config.js';
import type { RulesConfig } from './types.js';

export const PREVIOUS_RULES_VERSION = 'v0.8-fruit-sprout';
export const PREVIOUS_03_RULES_VERSION = 'futasaku0.3-unlimited-strengthen';
export const PREVIOUS_MEGA_RULES_VERSION = 'futasaku0.3-mega-bomb-final-turns';
export const PREVIOUS_SIX_CARD_RULES_VERSION = 'futasaku0.3-six-card-bloom';
export const CURRENT_RULES_VERSION = 'futasaku0.4';

/** Everything Futasaku 0.4 added is off in every archived version. */
const before04 = { randomStarter: false, strengthTieBreak: false } as const;

/** Accepted rules for deterministic replay and existing game tickets. */
export const RULES_VERSIONS: Readonly<Record<string, Readonly<RulesConfig>>> = Object.freeze({
  [PREVIOUS_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, ...before04, strengthenLimitPerGame: 2, deckFinalTurns: false, expandedBloom: false }),
  [PREVIOUS_03_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, ...before04, deckFinalTurns: false, expandedBloom: false }),
  [PREVIOUS_MEGA_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, ...before04, expandedBloom: false }),
  [PREVIOUS_SIX_CARD_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, ...before04 }),
  [CURRENT_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG }),
});

/** The config for a rules version, or null if the version is unknown. */
export const rulesConfig = (version: string): RulesConfig | null => {
  const c = Object.hasOwn(RULES_VERSIONS, version) ? RULES_VERSIONS[version] : undefined;
  return c ? { ...c } : null;
};
