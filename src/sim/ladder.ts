// `npm run ladder -- --pair=6,7 --games=1000 --part=0 --parts=4 --dir=ladder-out`
// `npm run ladder -- --table --dir=ladder-out` prints the combined table (Markdown).
// `--ruleset=seed` plays the Seed version of the A/B test (default: Sprout, the plain defaults).
// Plays level A against level B with swapped starts (half the games each way, same
// seeds), so neither level gets the first-move advantage more often.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RULESETS, apply, newGame, viewFor } from '../engine/index.js';
import type { Ruleset, State } from '../engine/index.js';
import { botSeed, chooseLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = opt('dir') ?? 'ladder-out';
const ruleset = (opt('ruleset') ?? 'sprout') as Ruleset;
if (!(ruleset in RULESETS)) throw new Error(`unknown ruleset ${ruleset}`);

export type PairResult = { a: Level; b: Level; games: number; aWins: number; draws: number; scoreDiff: number; moves: number; msA: number; msB: number };

/** Plays one game; returns the winner's level seat (0 = a) and some numbers. */
export const playPair = (a: Level, b: Level, seed: number, aFirst: boolean) => {
  const levels: [Level, Level] = aFirst ? [a, b] : [b, a];
  let s: State = newGame(seed, RULESETS[ruleset]);
  let moves = 0;
  while (s.phase !== 'GAME_OVER') {
    const level = levels[s.actor];
    const action = chooseLevelAction(viewFor(s, s.actor), level, botSeed(s.seed, level, s.turnNumber, s.history?.length ?? 0));
    s = apply(s, action);
    moves++;
  }
  const aSeat = aFirst ? 0 : 1;
  return { winner: s.result!.winner === null ? null : s.result!.winner === aSeat ? 'a' : 'b', diff: s.result!.scores[aSeat] - s.result!.scores[1 - aSeat]!, moves };
};

if (process.argv.includes('--table')) {
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as PairResult);
  const merged = new Map<string, PairResult>();
  for (const r of rows) {
    const k = `${r.a}-${r.b}`;
    const m = merged.get(k);
    merged.set(k, m ? { ...m, games: m.games + r.games, aWins: m.aWins + r.aWins, draws: m.draws + r.draws, scoreDiff: m.scoreDiff + r.scoreDiff, moves: m.moves + r.moves } : r);
  }
  console.log('| Higher level | vs | Games | Higher level wins | Draws | Avg score lead |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const r of [...merged.values()].sort((x, y) => y.a - x.a || y.b - x.b)) {
    console.log(`| ${r.a} | ${r.b} | ${r.games} | ${((100 * r.aWins) / r.games).toFixed(1)}% | ${r.draws} | ${(r.scoreDiff / r.games).toFixed(1)} |`);
  }
} else if (opt('pair')) {
  const [a, b] = opt('pair')!.split(',').map(Number) as [Level, Level];
  const games = Number(opt('games') ?? 1000);
  const part = Number(opt('part') ?? 0);
  const parts = Number(opt('parts') ?? 1);
  mkdirSync(dir, { recursive: true });
  const res: PairResult = { a, b, games: 0, aWins: 0, draws: 0, scoreDiff: 0, moves: 0, msA: 0, msB: 0 };
  for (let i = part; i < games / 2; i += parts) {
    for (const aFirst of [true, false]) {
      const g = playPair(a, b, 10_000 + i, aFirst);
      res.games++;
      if (g.winner === 'a') res.aWins++;
      if (g.winner === null) res.draws++;
      res.scoreDiff += g.diff;
      res.moves += g.moves;
    }
  }
  writeFileSync(`${dir}/${a}-${b}-p${part}.json`, JSON.stringify(res));
  console.log(`${a} vs ${b} part ${part}: ${res.aWins}/${res.games}`);
}
