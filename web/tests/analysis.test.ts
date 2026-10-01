import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State, View } from '../../src/engine/index.js';
import { cutLoss, dangerWarning, simulate, threats } from '../src/analysis.js';
import { fixture } from '../../tests/helpers.js';

const view = (f: ReturnType<typeof fixture>, hand: Card[] = []): View => {
  const base = newGame(1);
  const s: State = { ...base, config: f.config, board: f.board, terrain: f.terrain, hands: [hand, base.hands[1]], phase: 'ACT' };
  return viewFor(s, 0);
};

describe('cutLoss: how many tiles are lost if this tile is cut', () => {
  // My chain: root(-2,2) - (-1,1) - (0,0) - (1,0)
  const f = fixture({ tiles: { '-1,1': [0, 3], '0,0': [0, 4], '1,0': [0, 5], '1,-1': [1, 2] } });

  it('counts the tile itself plus everything cut off behind it', () => {
    expect(cutLoss(f, '-1,1').sort()).toEqual(['-1,1', '0,0', '1,0']);
    expect(cutLoss(f, '0,0').sort()).toEqual(['0,0', '1,0']);
    expect(cutLoss(f, '1,0')).toEqual(['1,0']);
  });

  it('works for the bot too, and is empty for roots and empty hexes', () => {
    expect(cutLoss(f, '1,-1')).toEqual(['1,-1']);
    expect(cutLoss(f, '-2,2')).toEqual([]);
    expect(cutLoss(f, '3,0')).toEqual([]);
  });
});

describe('threats and the danger warning', () => {
  it('flags my weak chokepoints within the bot’s reach', () => {
    // Chain toward the bot: (-1,1) - (0,0) - (1,-1)? keep (1,-1) empty; chain ends at (1,0).
    const f = fixture({ tiles: { '-1,1': [0, 1], '0,0': [0, 2], '1,0': [0, 3] } });
    const t = threats(f, 0);
    expect(t[0]).toEqual({ key: '-1,1', loss: 3 });
  });

  it('strength-9 tiles cannot be overgrown, so they are not threats', () => {
    const f = fixture({ tiles: { '-1,1': [0, 9], '0,0': [0, 9], '1,0': [0, 3] } });
    expect(threats(f, 0)).toEqual([]);
  });

  it('warns before a move that creates a bigger cut, and stays quiet for a safe move', () => {
    // A weak tile at (-1,1) next to my root; a line beyond it would hang off it.
    const f = fixture({ tiles: { '-1,1': [0, 1] } });
    const hand: Card[] = [
      { id: 1, suit: 0, rank: 3 },
      { id: 2, suit: 0, rank: 4 },
      { id: 3, suit: 0, rank: 5 },
      { id: 9, suit: 3, rank: 9 },
    ];
    const v = view(f, hand);
    const risky: Action = { t: 'MeldRun', cards: [1, 2, 3], start: { q: 0, r: 0 }, dir: 0 }; // hangs off (-1,1)
    expect(dangerWarning(v, risky)).toMatch(/could cut off 4 of your tiles/);
    const safe: Action = { t: 'MeldRun', cards: [1, 2, 3], start: { q: -2, r: 1 }, dir: 2 }; // hangs off the root
    expect(dangerWarning(v, safe)).toBeNull();
  });
});

describe('simulate', () => {
  it('reports tiles placed, points, takeovers and cut-offs', () => {
    // Bot arm (1,-1)-(0,0)-(-1,0); my hypha from (-1,1) takes (0,0) and (1,-1), cutting (-1,0).
    const f = fixture({ rich: ['0,0'], tiles: { '0,0': [1, 1], '1,-1': [1, 1], '-1,0': [1, 1] } });
    const hand: Card[] = [
      { id: 1, suit: 0, rank: 3 },
      { id: 2, suit: 0, rank: 4 },
      { id: 3, suit: 0, rank: 5 },
      { id: 4, suit: 1, rank: 1 },
    ];
    const r = simulate(view(f, hand), { t: 'MeldRun', cards: [1, 2, 3], start: { q: -1, r: 1 }, dir: 1 })!;
    expect(r).toMatchObject({ placed: 3, taken: 2, botCut: 1, myLoss: 0, points: 4, botPointsLost: 4, wins: false });
  });
});
