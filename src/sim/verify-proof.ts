// Proof that the server's game check accepts honest games and catches tampering.
//   npm run verify-proof -- --games=200            all levels
//   npm run verify-proof -- --games=200 --level=9  one level
// For each level it plays `games` real games (a level-9 "human" against the bot, with
// the exact seeding the server uses), then:
//   - every finished game must pass verifyGame exactly when the human won;
//   - each win is also sent with one bot move changed: that must always be refused.
// It prints how long one verifyGame call takes (this decides which servers can run it).
import { apply, legalActions, newGame, viewFor } from '../engine/index.js';
import type { Action, State } from '../engine/index.js';
import { LEVELS, botSeed, chooseLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';
import { DEFAULT_WORLD_CONFIG, issueTicket, verifyGame } from '../server-core/index.js';

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const games = Number(opt('games') ?? 200);
const only = opt('level') ? [Number(opt('level')) as Level] : [...LEVELS];

const play = (seed: number, level: Level) => {
  let s: State = newGame(seed);
  const actions: Action[] = [];
  while (s.phase !== 'GAME_OVER') {
    const humanSide = s.actor === 0;
    const lv: Level = humanSide ? 9 : level;
    const a = chooseLevelAction(viewFor(s, s.actor), lv, botSeed(s.seed, humanSide ? 100 + lv : lv, s.turnNumber, s.history?.length ?? 0));
    actions.push(a);
    s = apply(s, a);
  }
  return { actions, won: s.result?.winner === 0 };
};

/** The same log with the first bot move that has a legal alternative swapped for it. */
const tamper = (seed: number, actions: Action[]) => {
  let s = newGame(seed);
  for (let i = 0; i < actions.length; i++) {
    if (s.actor === 1) {
      const alt = legalActions(viewFor(s, 1)).find((x) => JSON.stringify(x) !== JSON.stringify(actions[i]));
      if (alt) return [...actions.slice(0, i), alt, ...actions.slice(i + 1)];
    }
    s = apply(s, actions[i]!);
  }
  return null;
};

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;
let allOk = true;
console.log('| Level | Games | Human wins | Wins accepted | Losses refused | Tampered wins refused | verifyGame ms (avg / p95 / max) |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const level of only) {
  let wins = 0, accepted = 0, refusedLoss = 0, tampered = 0, tamperRefused = 0;
  const ms: number[] = [];
  for (let i = 0; i < games; i++) {
    const seed = 50_000 + level * 1000 + i;
    const g = play(seed, level);
    const t = issueTicket({ id: `p-${seed}`, playerId: 'proof', seed, level, now: 0 }, DEFAULT_WORLD_CONFIG);
    const t0 = performance.now();
    const r = verifyGame(t, g.actions, 1000);
    ms.push(performance.now() - t0);
    if (g.won) {
      wins++;
      if (r.ok) accepted++;
      const bad = tamper(seed, g.actions);
      if (bad) {
        tampered++;
        if (!verifyGame(t, bad, 1000).ok) tamperRefused++;
      }
    } else if (!r.ok) refusedLoss++;
  }
  const ok = accepted === wins && refusedLoss === games - wins && tamperRefused === tampered;
  allOk &&= ok;
  ms.sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(`| ${level} | ${games} | ${wins} | ${accepted}/${wins} | ${refusedLoss}/${games - wins} | ${tamperRefused}/${tampered} | ${avg.toFixed(0)} / ${pct(ms, 0.95).toFixed(0)} / ${ms[ms.length - 1]!.toFixed(0)} |`);
}
console.log(allOk ? '\nPASS: every honest game was judged right and every tampered win was refused.' : '\nFAIL');
if (!allOk) process.exit(1);
