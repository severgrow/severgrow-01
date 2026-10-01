// `npm run calibrate -- --name=<label> --config='{"mistakeRate":0.5}' --games=300 --dir=out`
// Plays a knob setting (a LevelConfig, merged over level 7's) against level 7 with
// swapped starts and writes its win rate. Used to tune docs/LADDER.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { apply, newGame, viewFor } from '../engine/index.js';
import { GreedyBot } from '../bots/GreedyBot.js';
import { LEVEL_CONFIGS, botSeed, chooseWithConfig } from '../bots/levels.js';
import type { LevelConfig } from '../bots/levels.js';

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const name = opt('name') ?? 'x';
const config: LevelConfig = { ...LEVEL_CONFIGS[7], ...(JSON.parse(opt('config') ?? '{}') as Partial<LevelConfig>) };
const games = Number(opt('games') ?? 300);
const dir = opt('dir') ?? 'calibrate-out';
let wins = 0;
let diff = 0;
for (let i = 0; i < games / 2; i++) {
  for (const meFirst of [true, false]) {
    let s = newGame(20_000 + i);
    const me = meFirst ? 0 : 1;
    while (s.phase !== 'GAME_OVER') {
      const v = viewFor(s, s.actor);
      s = apply(s, s.actor === me ? chooseWithConfig(v, config, botSeed(s.seed, 50, s.turnNumber, s.history?.length ?? 0)) : GreedyBot.chooseAction(v));
    }
    if (s.result!.winner === me) wins++;
    diff += s.result!.scores[me] - s.result!.scores[1 - me]!;
  }
}
mkdirSync(dir, { recursive: true });
const out = { name, config, games, winRate: wins / games, avgLead: diff / games };
writeFileSync(`${dir}/${name}.json`, JSON.stringify(out));
console.log(`${name}: ${(100 * out.winRate).toFixed(1)}% vs level 7 (lead ${out.avgLead.toFixed(2)})`);
