// Helpers for the server-core tests: real games played by real bots.
import { apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';

/**
 * Plays a full game: the human (player 0) is played by `humanLevel`, the bot (player 1)
 * by `botLevel` with the exact seeding the server uses. Returns the actions and the end.
 */
export const playLogged = (seed: number, botLevel: Level, humanLevel: Level = 9): { actions: Action[]; end: State } => {
  let s = newGame(seed);
  const actions: Action[] = [];
  while (s.phase !== 'GAME_OVER') {
    const level = s.actor === 0 ? humanLevel : botLevel;
    // The human side uses a different seed stream so it never mirrors the bot.
    const a = chooseLevelAction(viewFor(s, s.actor), level, botSeed(s.seed, s.actor === 0 ? 100 + level : level, s.turnNumber, s.history?.length ?? 0));
    actions.push(a);
    s = apply(s, a);
  }
  return { actions, end: s };
};

/** The first seed from `from` where the human wins against `botLevel`. */
export const winningGame = (botLevel: Level, from = 1, humanLevel: Level = 9) => {
  for (let seed = from; seed < from + 500; seed++) {
    const g = playLogged(seed, botLevel, humanLevel);
    if (g.end.result?.winner === 0) return { seed, ...g };
  }
  throw new Error('no winning game found');
};

export const losingGame = (botLevel: Level, from = 1) => {
  for (let seed = from; seed < from + 500; seed++) {
    const g = playLogged(seed, botLevel, 1);
    if (g.end.result?.winner === 1) return { seed, ...g };
  }
  throw new Error('no losing game found');
};
