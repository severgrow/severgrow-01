import { describe, expect, it } from 'vitest';
import { replay } from '../../src/engine/index.js';
import { aggregate } from '../../src/sim/metrics.js';
import { formatReport } from '../../src/sim/reports.js';
import { playGame, runBatch } from '../../src/sim/run.js';

describe('sim: one game record', () => {
  const g = playGame(7, ['greedy', 'greedy']);

  it('is consistent with the game’s own events', () => {
    const end = replay(7, g.actions);
    const h = end.history!;
    expect(g.result).toEqual(end.result);
    expect(g.turns).toBe(end.turnNumber);
    expect(g.melds).toBe(h.filter((e) => e.t === 'MeldRun' || e.t === 'MeldSet').length);
    // Tiles placed = combo tiles + one per Sprout (v0.4).
    expect(g.tilesPlaced).toBe(h.reduce((n, e) => n + (e.t === 'MeldRun' || e.t === 'MeldSet' ? e.hexes.length : e.t === 'Sprout' ? 1 : 0), 0));
    expect(g.overgrows).toBe(h.filter((e) => e.t === 'Overgrow').length);
    expect(g.severedTiles).toBe(h.reduce((n, e) => n + (e.t === 'Sever' ? e.coords.length : 0), 0));
    expect(g.fruitUses).toBe(h.filter((e) => e.t === 'Fruit').length);
    expect(g.knocked).toBe(h.some((e) => e.t === 'Knock'));
  });

  it('choice and early-turn numbers add up', () => {
    expect(g.choiceTurns).toBeGreaterThanOrEqual(0);
    expect(g.choiceTurns).toBeLessThanOrEqual(g.turns);
    expect(g.noTileTurnsEarly).toBe(g.tilesByTurn.slice(0, 5).filter((n) => n === 0).length);
  });

  it('per-turn numbers add up', () => {
    expect(g.tilesByTurn.reduce((a, b) => a + b, 0)).toBe(g.tilesPlaced);
    expect(g.tilesByTurn).toHaveLength(g.turns);
    expect(g.noTileTurns).toBe(g.tilesByTurn.filter((n) => n === 0).length);
    expect(g.decisions).toBeGreaterThan(0);
    expect(g.legalActionsSum).toBeGreaterThanOrEqual(g.decisions);
  });

  it('is deterministic', () => {
    expect(playGame(7, ['greedy', 'greedy'])).toEqual(g);
  });
});

describe('sim: batches and metrics', () => {
  const records = runBatch({ games: 12, bots: ['greedy', 'random'], swapSeats: true });
  const m = aggregate(records);

  it('swapped seats play every seed twice', () => {
    expect(records).toHaveLength(24);
    expect(records.filter((r) => r.bots[0] === 'greedy')).toHaveLength(12);
    expect(records.filter((r) => r.bots[0] === 'random')).toHaveLength(12);
  });

  it('totals add up', () => {
    expect(m.games).toBe(24);
    expect(m.wins.p1 + m.wins.p2 + m.wins.draws).toBe(24);
    expect(Object.values(m.endings).reduce((a, b) => a + b, 0)).toBe(24);
    expect(m.byBot.greedy!.games + m.byBot.random!.games).toBe(48);
    expect(m.turnsPerPlayer.max).toBeGreaterThanOrEqual(m.turnsPerPlayer.median);
    expect(m.firstPlayerWinRate).toBeGreaterThanOrEqual(0);
    expect(m.firstPlayerWinRate).toBeLessThanOrEqual(1);
  });

  it('has every section 17 metric and the opening metrics', () => {
    for (const k of [
      'games', 'wins', 'turnsPerPlayer', 'endings', 'avgFinalScore', 'avgFinalDeadwood', 'meldsPerTurn', 'tilesPerTurn',
      'overgrowsPerGame', 'severedPerGame', 'rotEventsPerGame', 'midGameRotRate', 'fruitPerGame', 'knockRate',
      'undercutRate', 'knockReversalRate', 'firstContactTurn', 'firstPlayerWinRate', 'byBot', 'doubleStrangles',
      'strangleChancesPerGame', 'largestSever', 'largestSwing', 'comebacks', 'closeGames', 'meanLegalActions',
      'noTileTurnRate', 'tilesPerTurnEarly', 'avgGameLength',
      'choiceRate', 'noTileRateEarly', 'avgScoreGap', 'closeGameRate', 'strangleRate',
    ]) {
      expect(m).toHaveProperty(k);
    }
  });

  it('rates are between 0 and 1 and consistent with counts', () => {
    for (const k of ['choiceRate', 'noTileRateEarly', 'closeGameRate', 'strangleRate'] as const) {
      expect(m[k]).toBeGreaterThanOrEqual(0);
      expect(m[k]).toBeLessThanOrEqual(1);
    }
    expect(m.closeGameRate).toBeCloseTo(m.closeGames / m.games);
    expect(m.avgScoreGap).toBeGreaterThanOrEqual(0);
  });

  it('greedy beats random', () => {
    expect(m.byBot.greedy!.winRate).toBeGreaterThan(m.byBot.random!.winRate);
  });

  it('the report is readable text', () => {
    const text = formatReport(m, 'test');
    expect(text).toMatch(/Games: 24/);
    expect(text).toMatch(/First-player win rate/);
  });
}, );
