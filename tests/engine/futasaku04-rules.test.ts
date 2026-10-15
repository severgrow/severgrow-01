import { describe, expect, it } from 'vitest';
import {
  allNeighbors,
  apply,
  coordKey,
  deckExhaustionResult,
  homeCoord,
  legalActions,
  newGame,
  startingPlayerFor,
  strengthTotal,
  strengths,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';
import { DIFFICULTIES, stepAfterGame, stepLevelFor } from '../../web/src/logic/difficulty.js';

const bomb = (id: number) => ({ id, suit: null, rank: 0 } as const);
const card = (id: number, rank = 3) => ({ id, suit: 0 as const, rank });
const play = (s: State, a: Action) => apply(s, a);

const blastPosition = () => {
  const base = newGame(3107);
  const target = { q: -1, r: 2 };
  const board = { ...base.board };
  board[coordKey(target)] = { owner: 1 as Player, strength: 9 };
  for (const cell of allNeighbors(target)) {
    const key = coordKey(cell);
    if (board[key] === null) board[key] = { owner: 1 as Player, strength: 4 };
  }
  // Keep the enemy network joined to its home so sever does not clear the setup.
  for (const step of [{ q: 0, r: 1 }, { q: 1, r: 0 }, { q: 1, r: -1 }]) {
    const key = coordKey(step);
    if (board[key] === null) board[key] = { owner: 1 as Player, strength: 2 };
  }
  const hand = [bomb(1000), bomb(1001), card(1002, 5)];
  return {
    state: { ...base, board, hands: [hand, base.hands[1]] as State['hands'], phase: 'ACT' as const, sproutsThisTurn: 0 },
    target,
  };
};

describe('Futasaku 0.4 Grow / Bomb / Blast rules', () => {
  it('a single Bomb uses the turn’s one Grow', () => {
    const base = newGame(2201);
    const target = { q: -1, r: 1 };
    const board = { ...base.board };
    board[coordKey(target)] = { owner: 1, strength: 9 };
    // Enemy tile already touches player 0’s home at (-2,2); home counts as touch.
    const state: State = {
      ...base,
      board,
      hands: [[bomb(500), card(501, 4)], base.hands[1]],
      phase: 'ACT',
      sproutsThisTurn: 0,
    };
    const after = play(state, { t: 'PlayFruit', card: 500, target });
    expect(after.board[coordKey(target)]).toBeNull();
    expect(after.sproutsThisTurn).toBe(1);
    expect(legalActions(viewFor(after, 0)).some((a) => a.t === 'Sprout' || a.t === 'PlayFruit')).toBe(false);
  });

  it('Blast does not consume the turn’s Grow (same as Bloom)', () => {
    const { state, target } = blastPosition();
    const after = play(state, { t: 'MegaBomb', cards: [1000, 1001], target });
    expect(after.sproutsThisTurn).toBe(0);
    expect(after.lastResolution?.megaBomb?.destroyed.length).toBeGreaterThan(0);
    const grow = legalActions(viewFor(after, 0)).find((a) => a.t === 'Sprout');
    expect(grow).toBeDefined();
  });

  it('Blast remains legal after a Grow, and Grow remains legal after a Blast', () => {
    const { state, target } = blastPosition();
    // Place Grow on an empty hex that is not the blast target and still touches network.
    const growHex = { q: -3, r: 2 };
    expect(state.board[coordKey(growHex)]).toBeNull();
    const grown = play(state, { t: 'Sprout', card: 1002, coord: growHex });
    expect(grown.sproutsThisTurn).toBe(1);
    expect(legalActions(viewFor(grown, 0)).some((a) => a.t === 'MegaBomb' && coordKey(a.target) === coordKey(target))).toBe(true);

    const blasted = play(state, { t: 'MegaBomb', cards: [1000, 1001], target });
    expect(blasted.sproutsThisTurn).toBe(0);
    expect(legalActions(viewFor(blasted, 0)).some((a) => a.t === 'Sprout')).toBe(true);
  });
});

describe('Futasaku 0.4 end-of-game strength tie-break', () => {
  it('higher score still wins before strengths matter', () => {
    expect(deckExhaustionResult([7, 5], null, 'deck_exhaustion', [1, 99]).winner).toBe(0);
  });

  it('equal score: higher total tile strength wins', () => {
    expect(deckExhaustionResult([6, 6], null, 'deck_exhaustion', [10, 4]).winner).toBe(0);
    expect(deckExhaustionResult([6, 6], null, 'deck_exhaustion', [3, 9]).winner).toBe(1);
  });

  it('equal score and equal strengths: a real draw', () => {
    expect(deckExhaustionResult([4, 4], null, 'deck_exhaustion', [8, 8])).toEqual({
      winner: null,
      reason: 'deck_exhaustion',
      scores: [4, 4],
      strengths: [8, 8],
    });
  });

  it('parked leftover-card path still uses deadwood then P2', () => {
    expect(deckExhaustionResult([6, 6], [4, 9]).winner).toBe(0);
    expect(deckExhaustionResult([6, 6], [5, 5]).winner).toBe(1);
  });

  it('strengthTotal sums non-root tile strengths', () => {
    const s = newGame(11);
    const board = { ...s.board };
    board[coordKey({ q: -1, r: 1 })] = { owner: 0, strength: 5 };
    board[coordKey({ q: -1, r: 2 })] = { owner: 0, strength: 3 };
    board[coordKey({ q: 1, r: -1 })] = { owner: 1, strength: 9 };
    const ctx = { ...s, board };
    expect(strengthTotal(ctx, 0)).toBe(8);
    expect(strengthTotal(ctx, 1)).toBe(9);
    expect(strengths(ctx)).toEqual([8, 9]);
  });
});

describe('Futasaku 0.4 difficulty and starter lottery', () => {
  it('is the three training tiers, each with its own bot-level range', () => {
    expect(DIFFICULTIES.map((c) => [c.id, c.label, c.level, c.levels])).toEqual([
      ['easy', 'EASY', 3, [3, 4]],
      ['medium', 'MEDIUM', 5, [5, 6, 7]],
      ['hard', 'HARD', 8, [8, 9]],
    ]);
  });

  it('starter lottery is deterministic and independent of the difficulty level', () => {
    let bothSides = false;
    for (let seed = 0; seed < 64; seed++) {
      const starts = startingPlayerFor(seed) === 1;
      // A tier's level is fixed for the next game — the carry-over only ever moves AFTER a finished
      // game, never at the moment a match starts — so it cannot correlate with the lottery.
      expect(stepAfterGame('easy', 3, 'win')).toBe(4);
      expect(stepLevelFor({ id: 'medium', level: 6 }, 'medium')).toBe(6);
      expect(typeof starts).toBe('boolean');
      expect(startingPlayerFor(seed) === 1).toBe(starts);
      if (starts) bothSides = true;
    }
    expect(bothSides || startingPlayerFor(1) !== startingPlayerFor(2)).toBe(true);
    // Across seeds, the lottery picks both seats and the tier's level never moves with it.
    const pairs = Array.from({ length: 32 }, (_, seed) => [startingPlayerFor(seed) === 1, DIFFICULTIES[0]!.level] as const);
    expect(new Set(pairs.map(([a, b]) => `${a}:${b}`)).size).toBe(2);
  });

  it('homes are never destroyed by Blast', () => {
    const { state, target } = blastPosition();
    const after = play(state, { t: 'MegaBomb', cards: [1000, 1001], target });
    expect(after.board[coordKey(homeCoord(0, state.config))]?.root).toBe(true);
    expect(after.board[coordKey(homeCoord(1, state.config))]?.root).toBe(true);
  });
});
