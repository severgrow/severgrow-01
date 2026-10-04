// Plays bot-vs-bot games and records per-game statistics from the event log.
import { allNeighbors, apply, coordKey, legalActions, newGame, rootCoord, score, viewFor } from '../engine/index.js';
import type { Action, GameResult, Player, RulesConfig, State } from '../engine/index.js';
import type { Bot } from '../bots/Bot.js';
import { GreedyBot } from '../bots/GreedyBot.js';
import { createRandomBot } from '../bots/RandomBot.js';
import { simulate } from '../bots/evaluate.js';

export type BotKind = 'greedy' | 'random';

export type GameRecord = {
  seed: number;
  /** bots[0] sits as P1 (moves first). */
  bots: [BotKind, BotKind];
  actions: Action[];
  result: GameResult;
  /** Player-turns played (the final turnNumber). */
  turns: number;
  tilesByTurn: number[];
  noTileTurns: number;
  melds: number;
  tilesPlaced: number;
  overgrows: number;
  severedTiles: number;
  maxSever: number;
  rotTurns: number;
  midGameTurns: number;
  midGameRotTurns: number;
  fruitUses: number;
  knocked: boolean;
  knockReversal: boolean;
  firstContactTurn: number | null;
  strangleChances: number;
  maxSwing: number;
  comeback: boolean;
  legalActionsSum: number;
  decisions: number;
  /** Player-turns in which a combo or Sprout was playable (a real choice). */
  choiceTurns: number;
  /** Turns 1-5 in which no tile was placed. */
  noTileTurnsEarly: number;
};

const makeBot = (kind: BotKind, seed: number, seat: Player): Bot => (kind === 'greedy' ? GreedyBot : createRandomBot(seed * 2 + seat + 1));

/** Some tile touches an enemy tile (roots count). */
const inContact = (s: State): boolean =>
  Object.entries(s.board).some(([k, t]) => {
    if (!t) return false;
    const [q, r] = k.split(',').map(Number) as [number, number];
    return allNeighbors({ q, r }).some((n) => {
      const o = s.board[coordKey(n)];
      return !!o && o.owner !== t.owner;
    });
  });

/** Could the actor win at once by Strangle with one of these moves? */
const canStrangle = (s: State, acts: Action[]): boolean => {
  if (s.phase !== 'ACT') return false;
  const v = viewFor(s, s.actor);
  const ring = new Set(allNeighbors(rootCoord(s.actor === 0 ? 1 : 0, s.config.rootStyle, s.config.boardRadius)).map(coordKey));
  return acts.some((a) => {
    const hexes = a.t === 'Bloom' ? a.hexes : a.t === 'PlayFruit' ? [a.target] : null;
    if (!hexes) return false;
    if (a.t === 'Bloom' && !hexes.some((h) => ring.has(coordKey(h)))) return false;
    return simulate(v, a)?.wins ?? false;
  });
};

export const playGame = (seed: number, bots: [BotKind, BotKind], config: Partial<RulesConfig> = {}): GameRecord => {
  const players = [makeBot(bots[0], seed, 0), makeBot(bots[1], seed, 1)];
  let s = newGame(seed, config);
  const rec: Omit<GameRecord, 'result' | 'turns' | 'noTileTurns' | 'comeback' | 'noTileTurnsEarly'> = {
    seed,
    bots,
    actions: [],
    tilesByTurn: [],
    melds: 0,
    tilesPlaced: 0,
    overgrows: 0,
    severedTiles: 0,
    maxSever: 0,
    rotTurns: 0,
    midGameTurns: 0,
    midGameRotTurns: 0,
    fruitUses: 0,
    knocked: false,
    knockReversal: false,
    firstContactTurn: null,
    strangleChances: 0,
    maxSwing: 0,
    legalActionsSum: 0,
    decisions: 0,
    choiceTurns: 0,
  };
  const choiceSeen = new Set<number>();
  let knock: { player: Player; led: boolean } | null = null;
  const worstDiff: [number, number] = [0, 0]; // lowest (mine - theirs) each player reached

  for (let i = 0; s.phase !== 'GAME_OVER'; i++) {
    if (i > 20_000) throw new Error(`sim: game ${seed} did not finish`);
    const before = s;
    const v = viewFor(s, s.actor);
    const legal = legalActions(v);
    rec.decisions++;
    rec.legalActionsSum += legal.length;
    if (canStrangle(s, legal)) rec.strangleChances++;
    if (s.phase === 'ACT' && !choiceSeen.has(s.turnNumber) && legal.some((x) => x.t === 'Bloom' || x.t === 'Sprout')) {
      choiceSeen.add(s.turnNumber);
      rec.choiceTurns++;
    }
    const a = players[s.actor]!.chooseAction(v);
    s = apply(s, a);
    rec.actions.push(a);

    const turn = before.turnNumber;
    while (rec.tilesByTurn.length < turn) rec.tilesByTurn.push(0);
    for (const e of s.history!.slice(before.history!.length)) {
      if (e.t === 'Bloom') {
        rec.melds++;
        rec.tilesPlaced += e.hexes.length;
        rec.tilesByTurn[turn - 1]! += e.hexes.length;
      }
      if (e.t === 'Sprout') {
        rec.tilesPlaced += 1;
        rec.tilesByTurn[turn - 1]! += 1;
      }
      if (e.t === 'Overgrow') rec.overgrows++;
      if (e.t === 'Sever') {
        rec.severedTiles += e.coords.length;
        rec.maxSever = Math.max(rec.maxSever, e.coords.length);
      }
      if (e.t === 'FruitCard') rec.fruitUses++;
      if (e.t === 'RotCount') {
        if (turn >= 4) rec.midGameTurns++;
        if (e.count > 0) {
          rec.rotTurns++;
          if (turn >= 4) rec.midGameRotTurns++;
        }
      }
    }
    if (a.t === 'Knock') {
      const p = before.turnPlayer;
      rec.knocked = true;
      knock = { player: p, led: score(before, p) > score(before, p === 0 ? 1 : 0) };
    }
    if (rec.firstContactTurn === null && inContact(s)) rec.firstContactTurn = turn;
    const d0b = score(before, 0) - score(before, 1);
    const d0a = score(s, 0) - score(s, 1);
    rec.maxSwing = Math.max(rec.maxSwing, Math.abs(d0a - d0b));
    worstDiff[0] = Math.min(worstDiff[0], d0a);
    worstDiff[1] = Math.min(worstDiff[1], -d0a);
  }
  const result = s.result!;
  while (rec.tilesByTurn.length < s.turnNumber) rec.tilesByTurn.push(0);
  if (knock && result.reason === 'knock') rec.knockReversal = knock.led && result.winner !== knock.player;
  return {
    ...rec,
    result,
    turns: s.turnNumber,
    noTileTurns: rec.tilesByTurn.filter((n) => n === 0).length,
    noTileTurnsEarly: rec.tilesByTurn.slice(0, 5).filter((n) => n === 0).length,
    comeback: result.winner !== null && worstDiff[result.winner] <= -5,
  };
};

export type BatchOptions = {
  games: number;
  bots: [BotKind, BotKind];
  config?: Partial<RulesConfig>;
  /** Play every seed twice with the seats swapped (matched seeds). */
  swapSeats?: boolean;
  firstSeed?: number;
};

export const runBatch = (o: BatchOptions): GameRecord[] => {
  const out: GameRecord[] = [];
  const first = o.firstSeed ?? 1;
  for (let seed = first; seed < first + o.games; seed++) {
    out.push(playGame(seed, o.bots, o.config));
    if (o.swapSeats) out.push(playGame(seed, [o.bots[1], o.bots[0]], o.config));
  }
  return out;
};
