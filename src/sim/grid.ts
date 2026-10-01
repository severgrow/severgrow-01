// `npm run grid -- --games=1000 --part=0 --parts=4 --dir=grid-out`
// Part 4 decision grid: maxRank {9,8,7,6} x Sprout {off,on} x guarantee {off,on} x copies {2,3},
// GreedyBot vs GreedyBot. Each process runs every `parts`-th cell and writes one JSON per cell;
// `--table` prints the combined table from the directory.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { RulesConfig } from '../engine/index.js';
import { aggregate } from './metrics.js';
import type { Metrics } from './metrics.js';
import { runBatch } from './run.js';

export type Cell = { maxRank: number; sprout: boolean; guarantee: boolean; copies: number };
export const GRID: Cell[] = [9, 8, 7, 6].flatMap((maxRank) =>
  [false, true].flatMap((sprout) =>
    [false, true].flatMap((guarantee) => [2, 3].map((copies) => ({ maxRank, sprout, guarantee, copies }))),
  ),
);
export const cellConfig = (c: Cell): Partial<RulesConfig> => ({
  maxRank: c.maxRank,
  sproutsPerTurn: c.sprout ? 1 : 0,
  guaranteeOpeningMeld: c.guarantee,
  copiesPerCard: c.copies,
});
const cellName = (c: Cell) => `r${c.maxRank}-s${c.sprout ? 1 : 0}-g${c.guarantee ? 1 : 0}-c${c.copies}`;

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = opt('dir') ?? 'grid-out';
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

if (process.argv.includes('--table')) {
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { cell: Cell; metrics: Metrics })
    .sort((a, b) => GRID.findIndex((g) => cellName(g) === cellName(a.cell)) - GRID.findIndex((g) => cellName(g) === cellName(b.cell)));
  console.log('maxRank | Sprout | guarantee | copies | no-tile turns (1-5) | turns/player (mean/median/p90) | P1 win | choice | Strangle | close <=2 | score gap | games');
  for (const { cell, metrics: m } of rows) {
    console.log(
      [cell.maxRank, cell.sprout ? 'on' : 'off', cell.guarantee ? 'on' : 'off', cell.copies, pct(m.noTileRateEarly),
        `${m.turnsPerPlayer.mean.toFixed(1)} / ${m.turnsPerPlayer.median} / ${m.turnsPerPlayer.p90}`, pct(m.firstPlayerWinRate),
        pct(m.choiceRate), pct(m.strangleRate), pct(m.closeGameRate), m.avgScoreGap.toFixed(1), m.games].join(' | '),
    );
  }
} else {
  const games = Number(opt('games') ?? 1000);
  const part = Number(opt('part') ?? 0);
  const parts = Number(opt('parts') ?? 1);
  mkdirSync(dir, { recursive: true });
  GRID.forEach((cell, i) => {
    if (i % parts !== part) return;
    const started = Date.now();
    const metrics = aggregate(runBatch({ games, bots: ['greedy', 'greedy'], config: cellConfig(cell) }));
    writeFileSync(`${dir}/${cellName(cell)}.json`, JSON.stringify({ cell, games, metrics }));
    console.log(`${cellName(cell)} done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  });
}
