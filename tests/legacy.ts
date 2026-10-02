import type { RulesConfig } from '../src/engine/index.js';

/**
 * Test-only config that reproduces the v0.3.1 game (the old "Classic"): ranks 1-9,
 * 2 copies, no Sprout, no Strengthen, the pre-v0.5 random integers, Rot + Knock + Fruit on.
 * Never used by
 * the page.
 */
export const LEGACY_V03: Partial<RulesConfig> = {
  maxRank: 9,
  copiesPerCard: 2,
  sproutsPerTurn: 0,
  allowStrengthen: false,
  unbiasedShuffle: false,
  maxTurnsPerPlayer: 0,
  rotEnabled: true,
  knockEnabled: true,
  fruitPerPlayer: 1,
};
