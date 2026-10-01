// Section 17 metrics over a batch of game records.
import type { BotKind, GameRecord } from './run.js';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
};
const ratio = (a: number, b: number) => (b ? a / b : 0);

export type Metrics = ReturnType<typeof aggregate>;

export const aggregate = (records: GameRecord[]) => {
  const games = records.length;
  const sum = (f: (r: GameRecord) => number) => records.reduce((n, r) => n + f(r), 0);
  const playerTurns = sum((r) => r.turns);
  const turnsPerPlayer = records.map((r) => r.turns / 2);
  const knocked = records.filter((r) => r.knocked);
  const endings: Record<string, number> = {};
  for (const r of records) endings[r.result.reason] = (endings[r.result.reason] ?? 0) + 1;
  const contact = records.map((r) => r.firstContactTurn).filter((t): t is number => t !== null);
  const withDeadwood = records.filter((r) => r.result.deadwood);

  const byBot: Partial<Record<BotKind, { games: number; wins: number; winRate: number; asP1: number; winsAsP1: number }>> = {};
  for (const r of records) {
    r.bots.forEach((kind, seat) => {
      const b = (byBot[kind] ??= { games: 0, wins: 0, winRate: 0, asP1: 0, winsAsP1: 0 });
      b.games++;
      if (seat === 0) b.asP1++;
      if (r.result.winner === seat) {
        b.wins++;
        if (seat === 0) b.winsAsP1++;
      }
    });
  }
  for (const b of Object.values(byBot)) b.winRate = ratio(b.wins, b.games);

  const p1 = records.filter((r) => r.result.winner === 0).length;
  const p2 = records.filter((r) => r.result.winner === 1).length;
  return {
    games,
    wins: { p1, p2, draws: games - p1 - p2 },
    firstPlayerWinRate: ratio(p1, games),
    byBot,
    turnsPerPlayer: {
      mean: mean(turnsPerPlayer),
      median: quantile(turnsPerPlayer, 0.5),
      p90: quantile(turnsPerPlayer, 0.9),
      max: Math.max(0, ...turnsPerPlayer),
    },
    avgGameLength: mean(records.map((r) => r.turns)),
    endings,
    avgFinalScore: [mean(records.map((r) => r.result.scores[0])), mean(records.map((r) => r.result.scores[1]))],
    avgFinalDeadwood: [
      mean(withDeadwood.map((r) => r.result.deadwood![0])),
      mean(withDeadwood.map((r) => r.result.deadwood![1])),
    ],
    meldsPerTurn: ratio(sum((r) => r.melds), playerTurns),
    tilesPerTurn: ratio(sum((r) => r.tilesPlaced), playerTurns),
    noTileTurnRate: ratio(sum((r) => r.noTileTurns), playerTurns),
    tilesPerTurnEarly: ratio(
      sum((r) => r.tilesByTurn.slice(0, 5).reduce((a, b) => a + b, 0)),
      sum((r) => Math.min(5, r.turns)),
    ),
    overgrowsPerGame: ratio(sum((r) => r.overgrows), games),
    severedPerGame: ratio(sum((r) => r.severedTiles), games),
    rotEventsPerGame: ratio(sum((r) => r.rotTurns), games),
    midGameRotRate: ratio(sum((r) => r.midGameRotTurns), sum((r) => r.midGameTurns)),
    fruitPerGame: ratio(sum((r) => r.fruitUses), games),
    knockRate: ratio(knocked.length, games),
    undercutRate: ratio(knocked.filter((r) => r.result.undercut).length, knocked.length),
    knockReversalRate: ratio(knocked.filter((r) => r.knockReversal).length, knocked.length),
    firstContactTurn: {
      mean: mean(contact),
      median: quantile(contact, 0.5),
      onTurn1or2: ratio(contact.filter((t) => t <= 2).length, games),
      never: games - contact.length,
    },
    doubleStrangles: records.filter((r) => r.result.reason === 'double_strangle').length,
    strangleChancesPerGame: ratio(sum((r) => r.strangleChances), games),
    largestSever: Math.max(0, ...records.map((r) => r.maxSever)),
    largestSwing: Math.max(0, ...records.map((r) => r.maxSwing)),
    comebacks: records.filter((r) => r.comeback).length,
    closeGames: records.filter((r) => Math.abs(r.result.scores[0] - r.result.scores[1]) <= 2).length,
    meanLegalActions: ratio(sum((r) => r.legalActionsSum), sum((r) => r.decisions)),
  };
};
