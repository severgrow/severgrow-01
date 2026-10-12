import { apply } from './apply.js';
import { newGame } from './newGame.js';
import { stateFromSetup } from './match.js';
import type { MatchSetup } from './match.js';
import type { Action, RulesConfig, State } from './types.js';

/** Rebuilds a game from its seed and action log (spec 18). Throws on an illegal entry. */
export const replay = (seed: number, actions: readonly Action[], config: Partial<RulesConfig> = {}): State =>
  actions.reduce<State>((s, a) => apply(s, a), newGame(seed, config));

/**
 * Rebuilds a match from its versioned setup (rules version + seed + config + starting seat) and
 * its ordered action log. This is the reproducible recipe for 0.4 matches, either starting seat.
 */
export const replayMatch = (setup: MatchSetup, actions: readonly Action[]): State =>
  actions.reduce<State>((s, a) => apply(s, a), stateFromSetup(setup));
