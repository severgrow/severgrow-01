// `npm run properties`: Milestone A. Plays many games with every section 15 invariant
// checked after every action. On failure, writes a replayable report to
// property-failure.json and exits with code 1.
import { writeFileSync } from 'node:fs';
import { PropertyFailure, runPropertyGame } from './invariants.js';
import type { PropertyBot } from './invariants.js';

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const plan: [PropertyBot, number][] = [
  ['random', arg('random', 10_000)],
  ['greedy', arg('greedy', 1_000)],
];

const started = Date.now();
for (const [bot, games] of plan) {
  let actions = 0;
  let maxTurn = 0;
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= games; seed++) {
    try {
      const r = runPropertyGame(seed, {}, { bot });
      actions += r.actions.length;
      maxTurn = Math.max(maxTurn, r.state.turnNumber);
      reasons[r.state.result!.reason] = (reasons[r.state.result!.reason] ?? 0) + 1;
    } catch (e) {
      if (e instanceof PropertyFailure) {
        writeFileSync('property-failure.json', JSON.stringify({ message: e.message, ...e.report }, null, 2));
        console.error(`FAIL (${bot}): ${e.message}\nReplayable report written to property-failure.json`);
        process.exit(1);
      }
      throw e;
    }
    if (seed % 1000 === 0) console.log(`  ${bot}: ${seed}/${games} games ok`);
  }
  console.log(`${bot}: ${games} games, ${actions} actions, 0 invariant failures, longest game ${maxTurn} turns, endings ${JSON.stringify(reasons)}`);
}
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
