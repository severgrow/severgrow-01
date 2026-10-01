import { legalActions, mulberry32 } from '../engine/index.js';
import type { Bot } from './Bot.js';

/** Uniform over legal actions with its own seeded RNG (spec 16). For smoke and property games. */
export const createRandomBot = (seed: number): Bot => {
  const rand = mulberry32(seed);
  return {
    chooseAction(view) {
      const acts = legalActions(view);
      if (acts.length === 0) throw new Error('RandomBot: no legal actions');
      return acts[Math.floor(rand() * acts.length)]!;
    },
  };
};
