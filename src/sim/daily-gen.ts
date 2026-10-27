// DAILY PUZZLE GENERATOR — `npm run daily:gen -- --from=1 --to=200 --out=/tmp/daily.jsonl`
//
// Puzzles are FOUND, not invented: real level-7 vs level-7 games are searched turn by turn for a
// Grow step whose BEST POSSIBLE result only a few endings reach (src/daily/core.ts `prove`), and
// that the computer's own play misses.
// Each candidate is one JSON line: the position, its goal, its proof and the numbers used to pick
// and order puzzles. A person picks from these; nothing here ships by itself.
//
// For each Grow step (turn 6 onward), from an exhaustive search of every ending:
//   win     some ending surrounds their home (at most MAX_SOLUTIONS do);
//   cut     the most tiles any ending cuts off (3+);
//   points  the biggest lead gain (5+).
// The goal is always the best the turn allows, so a solve is "the best turn there was". It must be
// rare: at most MAX_SOLUTIONS endings, and at most 1 in 20 of all endings.
// Then the TRAP TEST: the level-7 computer (greedy, no deliberate mistakes) plays the same Grow
// step; if its turn meets the goal, the puzzle is too obvious and is dropped. Whether the level-9
// (search) computer finds it is recorded as a difficulty signal.
import { appendFileSync, writeFileSync } from 'node:fs';
import { apply, viewFor } from '../engine/index.js';
import type { Action, State } from '../engine/index.js';
import { newMatch } from '../engine/match.js';
import { botSeed, chooseLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';
import { exploreTurn, goalMet, playTurn, prove } from '../daily/core.js';
import type { DailyGoal, TurnSpace } from '../daily/core.js';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const FROM = Number(arg('from', '1'));
const TO = Number(arg('to', '50'));
const OUT = arg('out', '/tmp/daily-candidates.jsonl');
const CAP = Number(arg('cap', '50000'));
const FIRST_TURN = Number(arg('first-turn', '6'));
const MAX_SOLUTIONS = Number(arg('max-solutions', '6'));

/** The position a puzzle ships: the state itself, without the game's past (it plays no part). */
export const puzzleStart = (s: State): State => ({ ...s, history: [], lastResolution: null });

/** The actions a bot of `level` plays in this Grow step, until the step ends. */
const botTurn = (start: State, level: Level, seed: number): Action[] => {
  const actions: Action[] = [];
  let s = start;
  for (let i = 0; s.phase === 'ACT' && i < 40; i++) {
    const a = chooseLevelAction(viewFor(s, s.actor), level, botSeed(seed, level, s.turnNumber, 900 + i));
    if (a.t === 'Discard') break;
    actions.push(a);
    s = apply(s, a);
  }
  return actions;
};

const solvedBy = (start: State, goal: DailyGoal, actions: Action[]): boolean => {
  try {
    return goalMet(goal, playTurn(start, actions));
  } catch {
    return false; // a bot step that did not finish the Grow step does not solve it
  }
};

/** The best goal of each kind this turn offers (the prover then checks how rare it is). */
const goalsOf = (space: TurnSpace): DailyGoal[] => {
  const all = [...space.endings.values()].map((e) => e.outcome);
  const goals: DailyGoal[] = [];
  if (all.some((o) => o.won)) goals.push({ kind: 'win' });
  const maxCut = Math.max(...all.map((o) => o.cut));
  if (maxCut >= 3) goals.push({ kind: 'cut', n: maxCut });
  const best = Math.max(...all.map((o) => (o.won ? -Infinity : o.gain)));
  if (best >= 5) goals.push({ kind: 'points', n: best });
  return goals;
};

/** What the answer uses — for variety when picking puzzles. */
const ideasOf = (actions: Action[]): string[] => {
  const kinds = new Set<string>();
  for (const a of actions) {
    if (a.t === 'Bloom') kinds.add(`bloom${a.cards.length}`);
    else if (a.t === 'MegaBomb') kinds.add('blast');
    else if (a.t === 'PlayFruit') kinds.add('bomb');
    else if (a.t === 'Sprout') kinds.add('grow');
  }
  return [...kinds].sort();
};

writeFileSync(OUT, '');
let steps = 0, found = 0, capped = 0;
const started = Date.now();
for (let seed = FROM; seed <= TO; seed++) {
  let s = newMatch(seed);
  let lastWasDraw = false;
  for (let i = 0; s.phase !== 'GAME_OVER' && i < 3000; i++) {
    if (s.phase === 'ACT' && lastWasDraw && s.turnNumber >= FIRST_TURN) {
      steps++;
      const space = exploreTurn(s, CAP);
      if (space.capped) capped++;
      else {
        for (const goal of goalsOf(space)) {
          const proof = prove({ start: s, goal }, CAP, MAX_SOLUTIONS);
          if (!proof.ok || proof.solutions * 20 > proof.endings) continue;
          if (solvedBy(s, goal, [])) continue;
          const level7 = solvedBy(s, goal, botTurn(s, 7, seed));
          if (level7) continue;
          const level9 = solvedBy(s, goal, botTurn(s, 9, seed));
          const all = [...space.endings.values()].map((e) => e.outcome);
          const nearMiss =
            goal.kind === 'points' ? all.filter((o) => !o.won && o.gain >= goal.n - 2 && o.gain < goal.n).length
            : goal.kind === 'cut' ? all.filter((o) => o.cut >= goal.n - 1 && o.cut < goal.n).length
            : 0;
          found++;
          appendFileSync(OUT, JSON.stringify({
            id: `s${seed}-t${s.turnNumber}-${goal.kind}`,
            seed,
            turn: s.turnNumber,
            goal,
            solution: proof.solution,
            steps: proof.solution.length,
            solutions: proof.solutions,
            ideas: ideasOf(proof.solution),
            endings: proof.endings,
            nearMiss,
            level9Solves: level9,
            hand: s.hands[s.turnPlayer].length,
            start: puzzleStart(s),
          }) + '\n');
        }
      }
    }
    const a = chooseLevelAction(viewFor(s, s.actor), 7, botSeed(seed, 7, s.turnNumber, i));
    lastWasDraw = a.t === 'Draw';
    s = apply(s, a);
  }
  console.log(`seed ${seed}: ${steps} grow steps, ${found} candidates, ${capped} too large, ${Math.round((Date.now() - started) / 1000)}s`);
}
