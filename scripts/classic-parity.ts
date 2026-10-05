// Compare the actual protected Main checkout with this candidate after every action.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as candidate from '../src/engine/index.js';
import { chooseLevelAction } from '../src/bots/levels.js';
const root = process.env.MAIN_REFERENCE;
assert(root, 'Set MAIN_REFERENCE to the protected Main checkout');
const main = await import(pathToFileURL(`${root}/src/engine/index.ts`).href);
const bots = await import(pathToFileURL(`${root}/src/bots/levels.ts`).href);
const normalize = (s: candidate.State) => {
  assert.equal(s.config.board, null);
  assert.equal(s.config.reshuffleDiscard, false);
  const { board, reshuffleDiscard, ...config } = s.config;
  return { ...s, config };
};
let count = 0;
const events = new Set<string>();
for (let level = 1; level <= 9; level++) {
  for (const seed of [1, 42, 219682080]) {
    let a = main.newGame(seed), b = candidate.newGame(seed);
    const actions: candidate.Action[] = [];
    assert.deepEqual(normalize(b), a);
    while (a.phase !== 'GAME_OVER') {
      assert(actions.length < 1000, 'game must terminate');
      const av = main.viewFor(a, a.actor), bv = candidate.viewFor(b, b.actor);
      assert.deepEqual(candidate.legalActions(bv), main.legalActions(av));
      const botSeed = seed + actions.length * 31 + a.actor;
      const action = bots.chooseLevelAction(av, level, botSeed);
      assert.deepEqual(chooseLevelAction(bv, level as Parameters<typeof chooseLevelAction>[1], botSeed), action);
      actions.push(action);
      a = main.apply(a, action); b = candidate.apply(b, action);
      assert.deepEqual(normalize(b), a, `level ${level} seed ${seed} action ${actions.length}`);
      for (const e of b.history ?? []) events.add(e.t);
      count++;
    }
    assert.deepEqual(candidate.replay(seed, actions), b);
    assert.deepEqual(main.replay(seed, actions), a);
  }
  console.log(`Level ${level}: three complete games match Main, including legal actions and exact choices`);
}
console.log(JSON.stringify({ games: 27, actions: count, events: [...events].sort() }));
