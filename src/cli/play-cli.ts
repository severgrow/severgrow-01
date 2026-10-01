// `npm run play -- [--seed=N]`
import { createInterface } from 'node:readline';
import { runTerminalGame } from './play.js';

const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const seed = seedArg ? Number(seedArg.slice(7)) : Math.floor(Math.random() * 1_000_000_000);
// Read stdin as a queue of lines, so piped input works as well as typing.
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
await runTerminalGame({
  seed,
  ask: async (prompt) => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? 'q' : String(next.value);
  },
  print: (line) => console.log(line),
});
console.log(`(seed ${seed})`);
rl.close();
