// How long each bot level takes per move: `npm run bot-timing -- --games=40`.
// Plays level N against level 7 and times only level N's moves (avg / p95 / max ms).
import { apply, newGame, viewFor } from '../engine/index.js';
import { LEVELS, botSeed, chooseLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';

const games = Number(process.argv.find((a) => a.startsWith('--games='))?.slice(8) ?? 40);
console.log('| Level | Moves timed | avg ms | p95 ms | max ms |');
console.log('| --- | --- | --- | --- | --- |');
for (const level of LEVELS) {
  const ms: number[] = [];
  for (let g = 0; g < games; g++) {
    let s = newGame(70_000 + g);
    const me = g % 2;
    while (s.phase !== 'GAME_OVER') {
      const lv: Level = s.actor === me ? level : 7;
      const v = viewFor(s, s.actor);
      const t0 = performance.now();
      const a = chooseLevelAction(v, lv, botSeed(s.seed, lv, s.turnNumber, s.history?.length ?? 0));
      if (s.actor === me) ms.push(performance.now() - t0);
      s = apply(s, a);
    }
  }
  ms.sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(`| ${level} | ${ms.length} | ${avg.toFixed(1)} | ${ms[Math.floor(ms.length * 0.95)]!.toFixed(0)} | ${ms[ms.length - 1]!.toFixed(0)} |`);
}
