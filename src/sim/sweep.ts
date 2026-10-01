// `npm run sweep -- --games=500 [--only=rot,knockDeadwood]`
import { writeFileSync } from 'node:fs';
import { formatSweepTable, runSweeps } from './sweeps.js';

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const games = Number(opt('games') ?? 500);
const only = opt('only')?.split(',');
const started = Date.now();
const results = runSweeps({ games, ...(only ? { only } : {}) });
console.log(`Sweeps: GreedyBot vs GreedyBot, ${games} games per variant`);
console.log(formatSweepTable(results));
console.log(`\n(${((Date.now() - started) / 1000).toFixed(0)}s)`);
writeFileSync(opt('out') ?? 'sweep-results.json', JSON.stringify({ games, results }, null, 2));
