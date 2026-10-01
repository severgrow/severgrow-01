import { apply } from './apply.js';
import { newGame } from './newGame.js';
import type { Action, RulesConfig, State } from './types.js';

/** Rebuilds a game from its seed and action log (spec 18). Throws on an illegal entry. */
export const replay = (seed: number, actions: readonly Action[], config: Partial<RulesConfig> = {}): State =>
  actions.reduce<State>((s, a) => apply(s, a), newGame(seed, config));
