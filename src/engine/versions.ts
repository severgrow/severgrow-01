// Rules versions. Only the current rules are kept (v0.6: no old-version support). A recorded
// game or a world-map ticket names the rules version it was played under; an unknown one is
// refused rather than replayed under different rules.
import { DEFAULT_CONFIG } from './config.js';
import type { RulesConfig } from './types.js';

export const CURRENT_RULES_VERSION = 'v0.7-bloom';

/** Every rules version still accepted, by name: just the current one, a frozen copy of the defaults. */
export const RULES_VERSIONS: Readonly<Record<string, Readonly<RulesConfig>>> = Object.freeze({
  [CURRENT_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG }),
});

/** The config for a rules version, or null if the version is unknown. */
export const rulesConfig = (version: string): RulesConfig | null => {
  const c = Object.hasOwn(RULES_VERSIONS, version) ? RULES_VERSIONS[version] : undefined;
  return c ? { ...c } : null;
};
