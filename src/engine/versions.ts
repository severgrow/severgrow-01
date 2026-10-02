// Rules versions (v0.5). Each version is the complete config that reproduces it, so a
// recorded game or a world-map ticket replays with exactly the rules it was played under,
// even after the defaults change.
import { DEFAULT_CONFIG } from './config.js';
import { RULESETS } from './ruleset.js';
import type { RulesConfig } from './types.js';

/** v0.4-defaults-2: no Fruit, no Strengthen, the old random-integer method. */
const V04_DEFAULTS_2: RulesConfig = Object.freeze({
  ...DEFAULT_CONFIG,
  boardRadius: 3,
  rootStyle: 'ring2',
  handSize: 7,
  copiesPerCard: 2,
  rockCount: 4,
  richCount: 5,
  knockDeadwood: 10,
  knockGivesFinalTurn: true,
  rotThreshold: 20,
  rotStep: 8,
  forbidRedundantDiscard: true,
  allowHyphaOneBend: false,
  rootsScore: false,
  maxRank: 9,
  sproutsPerTurn: 1,
  maxTurnsPerPlayer: 30,
  rotEnabled: false,
  knockEnabled: false,
  fruitPerPlayer: 0,
  fruitSacrifice: 3,
  fruitOnlyWhenBehind: false,
  allowStrengthen: false,
  strengthenLimitPerGame: -1,
  unbiasedShuffle: false,
});

export const CURRENT_RULES_VERSION = 'v0.5-fruit-strengthen';
export const SEED_RULES_VERSION = 'v0.5-seed';

/** Every rules version still accepted, by name. The current one is a frozen copy of the defaults. */
export const RULES_VERSIONS: Readonly<Record<string, Readonly<RulesConfig>>> = Object.freeze({
  'v0.4-defaults-2': V04_DEFAULTS_2,
  [CURRENT_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG }),
  /** The Seed ruleset (A/B test): the current rules with Seed in place of Sprout. */
  [SEED_RULES_VERSION]: Object.freeze({ ...DEFAULT_CONFIG, ...RULESETS.seed }),
});

/** The config for a rules version, or null if the version is unknown. */
export const rulesConfig = (version: string): RulesConfig | null => {
  const c = Object.hasOwn(RULES_VERSIONS, version) ? RULES_VERSIONS[version] : undefined;
  return c ? { ...c } : null;
};
