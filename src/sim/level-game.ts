// Plays a game between two EXISTING bot levels on a given config, driven exactly the way the
// browser drives its bot (`chooseLevelAction` + `botSeed`, the same pattern as
// `src/sim/bot-timing.ts`). `src/sim/run.ts` only knows 'greedy' | 'random', so level-vs-level
// batch work — the campaign balance report — uses this small runner instead of rebuilding a bot.
//
// The opening is `newMatch` (the product opening, starting-seat lottery included), so a campaign
// level is played from the same position the player gets.
import { apply, newMatch, score, viewFor } from '../engine/index.js';
import type { Player, RulesConfig, State } from '../engine/index.js';
import { botSeed, chooseLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';

export type LevelGameResult = {
  /** The match seed used for this game. */
  seed: number;
  /** The bot level in each seat: [seat 0, seat 1]. */
  levels: [Level, Level];
  winner: Player | null;
  /** The final player-turn number. */
  turns: number;
  scores: [number, number];
  /** Who moved first (the engine's seeded lottery). */
  startingPlayer: Player;
  /** The final state, for any deeper inspection the caller wants. */
  state: State;
};

/** Plays one finished game. `config` is a campaign level's (or any) engine overrides. */
export const playLevelGame = (
  seed: number,
  levels: [Level, Level],
  config: Partial<RulesConfig> = {},
): LevelGameResult => {
  let s = newMatch(seed, config);
  // `State.startingPlayer` is optional on the type; `newMatch` always sets it.
  const startingPlayer = s.startingPlayer ?? s.turnPlayer;
  for (let i = 0; s.phase !== 'GAME_OVER'; i++) {
    if (i > 20_000) throw new Error(`level-game: game ${seed} did not finish`);
    const v = viewFor(s, s.actor);
    const a = chooseLevelAction(
      v,
      levels[s.actor],
      botSeed(s.seed, levels[s.actor], s.turnNumber, s.history?.length ?? 0),
    );
    s = apply(s, a);
  }
  return {
    seed,
    levels,
    winner: s.result!.winner,
    turns: s.turnNumber,
    scores: [score(s, 0), score(s, 1)],
    startingPlayer,
    state: s,
  };
};

/** Plays `games` games from `firstSeed`, and — when `swapSeats` — each one again with the seats swapped. */
export const runLevelBatch = (
  o: {
    games: number;
    firstSeed: number;
    /** Seed step between games, so a sweep can walk the deal without repeating a game. */
    seedStep?: number;
    levels: [Level, Level];
    config?: Partial<RulesConfig>;
    swapSeats?: boolean;
  },
): LevelGameResult[] => {
  const out: LevelGameResult[] = [];
  const step = o.seedStep ?? 1;
  for (let i = 0; i < o.games; i++) {
    const seed = o.firstSeed + i * step;
    out.push(playLevelGame(seed, o.levels, o.config));
    if (o.swapSeats) out.push(playLevelGame(seed, [o.levels[1], o.levels[0]], o.config));
  }
  return out;
};

/** A compact win/draw tally for a batch. */
export type Tally = {
  games: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  avgTurns: number;
  minTurns: number;
  maxTurns: number;
};

export const tally = (games: readonly LevelGameResult[]): Tally => {
  let firstWins = 0;
  let secondWins = 0;
  let draws = 0;
  let turns = 0;
  let minTurns = Infinity;
  let maxTurns = 0;
  for (const g of games) {
    if (g.winner === 0) firstWins++;
    else if (g.winner === 1) secondWins++;
    else draws++;
    turns += g.turns;
    minTurns = Math.min(minTurns, g.turns);
    maxTurns = Math.max(maxTurns, g.turns);
  }
  return {
    games: games.length,
    firstWins,
    secondWins,
    draws,
    avgTurns: games.length ? turns / games.length : 0,
    minTurns: games.length ? minTurns : 0,
    maxTurns,
  };
};
