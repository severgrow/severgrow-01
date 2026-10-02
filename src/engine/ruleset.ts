// The Seed A/B test (spec 7.4.1). Two rulesets share one game; the only difference is the
// one-card move. Sprout: the card's number becomes the tile. Seed: the tile is always worth 1
// (the card is still used up), and Strengthen has no per-game limit, so a Seed can be grown
// later. The ruleset lives in the config, so saves, replays and tickets keep it.
import type { RulesConfig, Ruleset } from './types.js';

export const RULESET_NAMES: readonly Ruleset[] = ['sprout', 'seed'];

/** The config overrides for each ruleset. Sprout is the plain defaults (no new key). */
export const RULESETS: Readonly<Record<Ruleset, Readonly<Partial<RulesConfig>>>> = Object.freeze({
  sprout: Object.freeze({}),
  seed: Object.freeze({ ruleset: 'seed', strengthenLimitPerGame: -1 }),
});

/** A Seed tile is always worth this much. */
export const SEED_STRENGTH = 1;

/** The ruleset a config plays ('sprout' when the key is absent). */
export const rulesetOf = (c: Pick<RulesConfig, 'ruleset'>): Ruleset => c.ruleset ?? 'sprout';

/** The strength of the tile a one-card move (Sprout or Seed) puts on a hex for a card of `rank`. */
export const sproutStrength = (c: Pick<RulesConfig, 'ruleset'>, rank: number): number => (rulesetOf(c) === 'seed' ? SEED_STRENGTH : rank);
