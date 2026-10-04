// Part 3 adversarial tests for the v0.4 one game. Written to break it; never weakened.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, State, Suit } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { fixture } from '../helpers.js';

let nextId = 9000;
const c = (suit: Suit, rank: number): Card => ({ id: nextId++, suit, rank });
const at = (tiles: Record<string, [0 | 1, number]>, hand: Card[], deck: Card[] = Array.from({ length: 20 }, () => c(0, 1))): State => {
  const f = fixture({ tiles });
  const base = newGame(1);
  return { ...base, board: f.board, terrain: f.terrain, hands: [hand, [c(1, 2), c(2, 3), c(3, 4)]], deck, phase: 'ACT' };
};

describe('v0.4 adversarial', () => {
  it('ADV-1: Sprout with the last card in hand: discard skipped, turn completes, no deadlock', () => {
    const last = c(1, 4);
    const s = apply(at({}, [last]), { t: 'Sprout', card: last.id, coord: { q: -1, r: 1 } });
    expect(s.hands[0]).toEqual([]);
    expect(legalActions(viewFor(s, 0))).toEqual([{ t: 'EndAct' }]);
    const n = apply(s, { t: 'EndAct' });
    expect(n.turnPlayer).toBe(1);
    expect(n.phase).toBe('DRAW');
    expect(n.hands[0]).toHaveLength(7);
    expect(legalActions(viewFor(n, 1)).length).toBeGreaterThan(0);
  });

  it('ADV-2: a Sprout that cuts an enemy arm in two removes exactly the far half', () => {
    // Enemy chain from its root (2,-2): (1,-1) - (0,0) - (-1,0) - (-2,0) - (-3,0)? (-3,0) is on board.
    const s = at({ '-1,1': [0, 1], '1,-1': [1, 2], '0,0': [1, 2], '-1,0': [1, 2], '-2,0': [1, 2], '-3,0': [1, 2] }, [c(1, 3), c(2, 1)]);
    const n = apply(s, { t: 'Sprout', card: s.hands[0][0]!.id, coord: { q: 0, r: 0 } });
    expect(n.board['1,-1']).toEqual({ owner: 1, strength: 2 }); // near half stays
    for (const k of ['-1,0', '-2,0', '-3,0']) expect(n.board[k]).toBeNull(); // far half withers
    expect(n.lastResolution!.severed).toEqual([{ player: 1, coords: [{ q: -3, r: 0 }, { q: -2, r: 0 }, { q: -1, r: 0 }] }]);
  });

  it('ADV-4: a tile with the top number (maxRank) cannot be replaced by any move', () => {
    const s = at({ '-1,1': [1, 7] }, [c(0, 5), c(0, 6), c(0, 7), c(1, 7), c(2, 7), c(3, 7)]);
    const touching = legalActions(viewFor(s, 0)).filter((a) =>
      (a.t === 'Sprout' && a.coord.q === -1 && a.coord.r === 1) ||
      (a.t === 'Bloom' && a.hexes.some((h) => h.q === -1 && h.r === 1)),
    );
    expect(touching).toEqual([]);
    expect(() => apply(s, { t: 'Sprout', card: s.hands[0][2]!.id, coord: { q: -1, r: 1 } })).toThrow(/NOT_STRONGER/);
  });

  it('ADV-5: at maxRank 5 the deck runs out sooner, and games still end cleanly', () => {
    const turns = (maxRank: number) => {
      let total = 0;
      for (let seed = 1; seed <= 25; seed++) {
        let g = newGame(seed, { maxRank });
        for (let i = 0; i < 5000 && g.phase !== 'GAME_OVER'; i++) g = apply(g, GreedyBot.chooseAction(viewFor(g, g.actor)));
        expect(g.phase).toBe('GAME_OVER');
        expect(['deck_exhaustion', 'strangle']).toContain(g.result!.reason);
        total += g.turnNumber;
      }
      return total / 25;
    };
    expect(createDeckSize(5)).toBe(40);
    expect(turns(5)).toBeLessThan(turns(9));
  }, 120_000);
});

const createDeckSize = (m: number) => 4 * m * 2;
