// `npm run sim`: runs a batch, prints a report and writes sim-results.json.
// Options: --games=N --bots=greedy,greedy --swap --config='{"rootStyle":"corner"}'
//          --label=name --out=sim-results.json
import { writeFileSync } from 'node:fs';
import { resolveConfig } from '../engine/index.js';
import type { RulesConfig } from '../engine/index.js';
import { aggregate } from './metrics.js';
import { formatReport } from './reports.js';
import { runBatch } from './run.js';
import type { BotKind } from './run.js';

const opt = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const games = Number(opt('games') ?? 1000);
const bots = (opt('bots') ?? 'greedy,greedy').split(',') as [BotKind, BotKind];
const config = JSON.parse(opt('config') ?? '{}') as Partial<RulesConfig>;
const swapSeats = process.argv.includes('--swap');
const label = opt('label') ?? `${bots.join(' vs ')}, ${games} seeds${swapSeats ? ' x2 (swapped seats)' : ''}`;
const out = opt('out') ?? 'sim-results.json';

resolveConfig(config); // fail fast on a bad config
const started = Date.now();
const records = runBatch({ games, bots, config, swapSeats });
const metrics = aggregate(records);
console.log(formatReport(metrics, label));
console.log(`(${((Date.now() - started) / 1000).toFixed(0)}s)`);
writeFileSync(out, JSON.stringify({ label, options: { games, bots, config, swapSeats }, metrics }, null, 2));
console.log(`Wrote ${out}`);
