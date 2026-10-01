import type { Metrics } from './metrics.js';

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const n = (x: number, d = 2) => x.toFixed(d);

/** A plain-text report of one batch (spec 17). */
export const formatReport = (m: Metrics, label: string): string => {
  const bots = Object.entries(m.byBot)
    .map(([k, b]) => `${k}: ${pct(b.winRate)} wins (${b.wins}/${b.games}; as P1 ${b.winsAsP1}/${b.asP1})`)
    .join(' | ');
  const endings = Object.entries(m.endings)
    .map(([k, v]) => `${k} ${v} (${pct(v / m.games)})`)
    .join(', ');
  return [
    `=== ${label} ===`,
    `Games: ${m.games}   P1 wins ${m.wins.p1}, P2 wins ${m.wins.p2}, draws ${m.wins.draws}`,
    `First-player win rate: ${pct(m.firstPlayerWinRate)}`,
    `Bots: ${bots}`,
    `Turns per player: mean ${n(m.turnsPerPlayer.mean, 1)}, median ${m.turnsPerPlayer.median}, p90 ${m.turnsPerPlayer.p90}, max ${m.turnsPerPlayer.max}   (game length ${n(m.avgGameLength, 1)} player-turns)`,
    `Endings: ${endings}`,
    `Final score avg: P1 ${n(m.avgFinalScore[0]!, 1)}, P2 ${n(m.avgFinalScore[1]!, 1)}   final deadwood avg: ${n(m.avgFinalDeadwood[0]!, 1)} / ${n(m.avgFinalDeadwood[1]!, 1)}`,
    `Per turn: melds ${n(m.meldsPerTurn)}, tiles ${n(m.tilesPerTurn)}, turns with no tile ${pct(m.noTileTurnRate)}, tiles/turn in turns 1-5 ${n(m.tilesPerTurnEarly)}`,
    `Per game: overgrows ${n(m.overgrowsPerGame)}, severed tiles ${n(m.severedPerGame)}, Rot turns ${n(m.rotEventsPerGame)}, Fruit ${n(m.fruitPerGame)}`,
    `Rot fires on ${pct(m.midGameRotRate)} of mid-game turns (turn >= 4)`,
    `Knock rate ${pct(m.knockRate)}, Undercut rate ${pct(m.undercutRate)}, Knock reversal rate ${pct(m.knockReversalRate)}`,
    `First contact turn: mean ${n(m.firstContactTurn.mean, 1)}, median ${m.firstContactTurn.median}, by turn 2 in ${pct(m.firstContactTurn.onTurn1or2)}, never ${m.firstContactTurn.never}`,
    `Near-win: Strangle chances/game ${n(m.strangleChancesPerGame)}, double strangles ${m.doubleStrangles}, largest Sever ${m.largestSever}, largest swing ${m.largestSwing}, comebacks from 5+ behind ${m.comebacks}, games decided by <= 2 points ${m.closeGames}`,
    `Mean legal actions per decision: ${n(m.meanLegalActions, 1)}`,
  ].join('\n');
};
