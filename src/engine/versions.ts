// A recorded game names its rules. Keep the last Test2 config for old recordings and saves;
// Futasaku 0.3 removes the per-game Strengthen cap.
import { DEFAULT_CONFIG } from './config.js';
import type { RulesConfig } from './types.js';

export const PREVIOUS_RULES_VERSION = 'v0.8-fruit-sprout';
export const CURRENT_RULES_VERSION = 'futasaku0.3-unlimited-strengthen';

/** Accepted rules for deterministic replay and existing game tickets. */
export const RULES_VERSIONS: Readonly<Record<string, Readonly<RulesConfig>>> = Object.freeze({
  [PREVIOUS_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, strengthenLimitPerGame: 2 }),
  [CURRENT_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG }),
});

/** The config for a rules version, or null if the version is unknown. */
export const rulesConfig = (version: string): RulesConfig | null => {
  const c = Object.hasOwn(RULES_VERSIONS, version) ? RULES_VERSIONS[version] : undefined;
  return c ? { ...c } : null;
};
