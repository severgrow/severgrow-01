// Calibration sweeps (spec 17, Milestone C). Each variant runs GreedyBot vs GreedyBot
// and reports the full metric set; `npm run sweep` prints a comparison table and
// writes sweep-results.json.
import type { RulesConfig } from '../engine/index.js';
import { aggregate } from './metrics.js';
import type { Metrics } from './metrics.js';
import { runBatch } from './run.js';

export type Variant = { label: string; config: Partial<RulesConfig> };
export type Sweep = { name: string; variants: Variant[]; skipped?: string };

const grid = <T>(xs: T[], label: (x: T) => string, config: (x: T) => Partial<RulesConfig>): Variant[] =>
  xs.map((x) => ({ label: label(x), config: config(x) }));

export const SWEEPS: Sweep[] = [
  { name: 'rootStyle', variants: grid(['ring2', 'corner'] as const, (x) => x, (rootStyle) => ({ rootStyle })) },
  {
    name: 'rot',
    variants: [16, 20, 24, 28].flatMap((t) =>
      grid([6, 8, 10], (s) => `T=${t} step=${s}`, (rotStep) => ({ rotThreshold: t, rotStep })),
    ),
  },
  { name: 'knockDeadwood', variants: grid([10, 9, 8, 7], (x) => `${x}`, (knockDeadwood) => ({ knockDeadwood })) },
  { name: 'knockGivesFinalTurn', variants: grid([true, false], (x) => (x ? 'on' : 'off'), (knockGivesFinalTurn) => ({ knockGivesFinalTurn })) },
  { name: 'copiesPerCard', variants: grid([1, 2], (x) => `${x}`, (copiesPerCard) => ({ copiesPerCard })) },
  { name: 'fruitCardCount', variants: grid([0, 2, 4, 6], (x) => `${x}`, (fruitCardCount) => ({ fruitCardCount })) },
];

export type SweepResult = { name: string; skipped?: string; rows: { label: string; config: Partial<RulesConfig>; metrics: Metrics }[] };

export const runSweeps = (o: { games: number; only?: string[] }): SweepResult[] =>
  SWEEPS.filter((s) => !o.only || o.only.includes(s.name)).map((s) => ({
    name: s.name,
    ...(s.skipped ? { skipped: s.skipped } : {}),
    rows: s.skipped
      ? []
      : s.variants.map((v) => ({ label: v.label, config: v.config, metrics: aggregate(runBatch({ games: o.games, bots: ['greedy', 'greedy'], config: v.config })) })),
  }));

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

/** A compact comparison table: one line per variant with the headline metrics. */
export const formatSweepTable = (results: SweepResult[]): string => {
  const head = ['variant', 'turns/player', 'P1 win', 'knock', 'deck out', 'strangle', 'undercut', 'rot mid-game', 'tiles/turn', 'no-tile turns', 'severed/game'];
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`\n## ${r.name}${r.skipped ? ` — skipped: ${r.skipped}` : ''}`);
    if (r.skipped) continue;
    lines.push(head.join(' | '));
    for (const row of r.rows) {
      const m = row.metrics;
      lines.push(
        [
          row.label,
          m.turnsPerPlayer.mean.toFixed(1),
          pct(m.firstPlayerWinRate),
          pct((m.endings.knock ?? 0) / m.games),
          pct((m.endings.deck_exhaustion ?? 0) / m.games),
          pct(((m.endings.strangle ?? 0) + (m.endings.double_strangle ?? 0)) / m.games),
          pct(m.undercutRate),
          pct(m.midGameRotRate),
          m.tilesPerTurn.toFixed(2),
          pct(m.noTileTurnRate),
          m.severedPerGame.toFixed(1),
        ].join(' | '),
      );
    }
  }
  return lines.join('\n');
};
