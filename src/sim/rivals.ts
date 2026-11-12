// RIVALS — `npx tsx src/sim/rivals.ts -- --rival=11 --games=50 [--from=0] [--opp=9full]`
//
// Plays a rival (bot 10, 11 or 12) against a reference on campaign boards, seats swapped, and prints
// one JSON line: wins, how the games ended, and the style signals each rival must show
// (docs/RIVALS.md). The reference `9full` is level 9 searching authored boards as fully as the
// classic board (the campaign's own level 9 is throttled there; a rival must match the full one).
//
// Boards rotate over the late campaign (levels 25-70), one deal per game, seats swapped per deal.
import { apply, newMatch, viewFor } from '../engine/index.js';
import type { Action, Player, RulesConfig, State } from '../engine/index.js';
import { LEVEL_CONFIGS, RIVAL_CONFIGS, botSeed, decideWithConfig, isRival } from '../bots/levels.js';
import type { LevelConfig } from '../bots/levels.js';
import { CAMPAIGN_LEVELS } from '../campaign/index.js';

const arg = (name: string, fallback: string): string =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

/** Named configs a run can pit against each other. */
export const NAMED: Record<string, LevelConfig> = {
  '9': LEVEL_CONFIGS[9],
  '9full': { ...LEVEL_CONFIGS[9], fullSearch: true },
  '8': LEVEL_CONFIGS[8],
  '10': RIVAL_CONFIGS[10],
  '11': RIVAL_CONFIGS[11],
  '12': RIVAL_CONFIGS[12],
};

export type SideStats = {
  wins: number;
  strangleWins: number;
  strangledLosses: number;
  bloom4: number;
  bloom3: number;
  fruitEarly: number;
  fruitLate: number;
  finalTiles: number;
  ms: number;
  decisions: number;
};

const blank = (): SideStats => ({ wins: 0, strangleWins: 0, strangledLosses: 0, bloom4: 0, bloom3: 0, fruitEarly: 0, fruitLate: 0, finalTiles: 0, ms: 0, decisions: 0 });

/** One game; `cfgs[seat]` plays that seat. Returns the final state. Stats go to `stats[seat]`. */
export const playConfigs = (seed: number, config: Partial<RulesConfig>, cfgs: [LevelConfig, LevelConfig], ids: [number, number], stats: [SideStats, SideStats]): State => {
  let s = newMatch(seed, config);
  for (let i = 0; s.phase !== 'GAME_OVER'; i++) {
    if (i > 20_000) throw new Error(`rivals: game ${seed} did not finish`);
    const p = s.actor as Player;
    const v = viewFor(s, p);
    const t0 = performance.now();
    const a: Action = decideWithConfig(v, cfgs[p], botSeed(s.seed, ids[p], s.turnNumber, s.history?.length ?? 0)).action;
    stats[p].ms += performance.now() - t0;
    stats[p].decisions++;
    if (a.t === 'Bloom') a.cards.length >= 4 ? stats[p].bloom4++ : stats[p].bloom3++;
    if (a.t === 'PlayFruit') v.deckCount <= 8 ? stats[p].fruitLate++ : stats[p].fruitEarly++;
    s = apply(s, a);
  }
  const r = s.result!;
  for (const p of [0, 1] as const) {
    stats[p].finalTiles += Object.values(s.board).filter((t) => t?.owner === p && !t.root).length;
    if (r.winner === p) {
      stats[p].wins++;
      if (r.reason === 'strangle') stats[p].strangleWins++;
    } else if (r.winner !== null && r.reason === 'strangle') stats[p].strangledLosses++;
  }
  return s;
};

const main = () => {
  const a = arg('rival', '11');
  const b = arg('opp', '9full');
  const games = Number(arg('games', '20'));
  const from = Number(arg('from', '0'));
  const levelsArg = arg('levels', '25-70').split('-').map(Number);
  const boards = CAMPAIGN_LEVELS.filter((l) => l.number >= levelsArg[0]! && l.number <= (levelsArg[1] ?? levelsArg[0]!));
  const A = NAMED[a]!;
  const B = NAMED[b]!;
  const sa = blank();
  const sb = blank();
  let draws = 0;
  for (let i = from; i < from + games; i++) {
    const level = boards[i % boards.length]!;
    const seed = 500_000 + i * 7919;
    const swap = i % 2 === 1;
    const stats: [SideStats, SideStats] = swap ? [sb, sa] : [sa, sb];
    const idA = isRival(Number(a)) ? Number(a) : 9;
    const s = playConfigs(seed, level.config, swap ? [B, A] : [A, B], swap ? [9, idA] : [idA, 9], stats);
    if (s.result!.winner === null) draws++;
  }
  console.log(JSON.stringify({ rival: a, opp: b, games, from, draws, rivalSide: sa, oppSide: sb }));
};

if (process.argv[1]?.endsWith('rivals.ts')) main();
