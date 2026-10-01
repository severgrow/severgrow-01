// Records the v0.3.1 engine's behaviour so later versions can prove the legacyV03 config
// reproduces it. Generated ONCE, before the v0.4 rule changes (run with tsx); do not
// re-run on a newer engine, or the fixture would just record the new behaviour.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { createRandomBot } from '../../src/bots/RandomBot.js';

const canonical = (x: unknown): string =>
  JSON.stringify(x, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const hash = (x: unknown) => createHash('sha256').update(canonical(x)).digest('hex');

const games: { seed: number; bot: string; actions: Action[]; stateHash: string; historyHash: string }[] = [];
const play = (seed: number, bot: 'random' | 'greedy') => {
  const bots = bot === 'random' ? [createRandomBot(seed * 2 + 1), createRandomBot(seed * 2 + 2)] : [GreedyBot, GreedyBot];
  let s: State = newGame(seed);
  const actions: Action[] = [];
  while (s.phase !== 'GAME_OVER') {
    const a = bots[s.actor]!.chooseAction(viewFor(s, s.actor));
    actions.push(a);
    s = apply(s, a);
  }
  const { history, ...rest } = s;
  games.push({ seed, bot, actions, stateHash: hash(rest), historyHash: hash(history) });
};
for (let seed = 1; seed <= 10; seed++) play(seed, 'random');
for (let seed = 101; seed <= 105; seed++) play(seed, 'greedy');
writeFileSync(new URL('./legacy-v03.json', import.meta.url), JSON.stringify({ engine: 'v0.3.1', games }));
console.log(`recorded ${games.length} games, ${games.reduce((n, g) => n + g.actions.length, 0)} actions`);
