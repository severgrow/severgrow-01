// Golden games for the current default rules: 8 GreedyBot-vs-GreedyBot games recorded
// with their final-state hashes. Re-run (with tsx) ONLY when the default rules are
// deliberately changed; tests/engine/golden.test.ts then guards against any accidental change.
import { writeFileSync } from 'node:fs';
import { CURRENT_RULES_VERSION, apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { stateHash } from '../hash.js';

const games: { seed: number; actions: Action[]; stateHash: string; historyHash: string; result: unknown }[] = [];
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  let s: State = newGame(seed);
  const actions: Action[] = [];
  while (s.phase !== 'GAME_OVER') {
    const a = GreedyBot.chooseAction(viewFor(s, s.actor));
    actions.push(a);
    s = apply(s, a);
  }
  const { history, ...rest } = s;
  games.push({ seed, actions, stateHash: stateHash(rest), historyHash: stateHash(history), result: s.result });
}
writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify({ rules: CURRENT_RULES_VERSION, games }));
console.log(`recorded ${games.length} games, ${games.reduce((n, g) => n + g.actions.length, 0)} actions`);
