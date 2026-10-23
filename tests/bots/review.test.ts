// GAME REVIEW (owner, 2026-10-23: one of the three things that make it feel like the best strategy
// game). After a game, the review finds the player's TURNING POINT: the one move where what they
// played fell furthest short of the best move they had, judged by the same eye the opponent uses
// (GreedyBot's full evaluation), from the player's own view of the board at that moment (no hidden
// cards are read). It is pure and deterministic, so the same game always gets the same review.
import { describe, expect, it } from 'vitest';
import { apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { REVIEW_MIN_GAIN, findTurningPoint } from '../../src/bots/review.js';

/** A whole game between a careless player 0 (level 1) and a careful player 1 (level 7). */
const playGame = (seed: number, p0: 1 | 7 = 1): { start: State; log: Action[] } => {
  const start = newGame(seed);
  const log: Action[] = [];
  let s = start;
  for (let i = 0; s.phase !== 'GAME_OVER' && i < 2000; i++) {
    const level = s.actor === 0 ? p0 : 7;
    const a = chooseLevelAction(viewFor(s, s.actor), level, seed * 1000 + i);
    log.push(a);
    s = apply(s, a);
  }
  return { start, log };
};

const ME: Player = 0;
const BOARD = new Set(['Bloom', 'Sprout', 'PlayFruit', 'MegaBomb', 'EndAct']);

describe('the turning point', () => {
  const games = [11, 12, 13].map((seed) => playGame(seed));

  it('a careless game has one, at a move the player really made, with a better move they really had', () => {
    for (const { start, log } of games) {
      const t = findTurningPoint(start, log, ME);
      expect(t).not.toBeNull();
      // The moment is real: replaying the log reaches exactly that state, with the player to act.
      let s = start;
      for (let i = 0; i < t!.index; i++) s = apply(s, log[i]!);
      expect(s).toEqual(t!.before);
      expect(s.actor).toBe(ME);
      expect(log[t!.index]).toEqual(t!.played);
      expect(BOARD.has(t!.played.t)).toBe(true);
      // The better move is legal there, and it is different from what was played.
      expect(() => apply(s, t!.better)).not.toThrow();
      expect(JSON.stringify(t!.better)).not.toBe(JSON.stringify(t!.played));
      expect(t!.gain).toBeGreaterThanOrEqual(REVIEW_MIN_GAIN);
      expect(t!.turn).toBe(s.turnNumber);
    }
  });

  it('it is the BIGGEST gap of the game (no other move of the player fell further short)', () => {
    const { start, log } = games[0]!;
    const t = findTurningPoint(start, log, ME)!;
    const all = findTurningPoint(start, log, ME, { all: true })!;
    expect(all.gaps.length).toBeGreaterThan(1);
    expect(Math.max(...all.gaps.map((g) => g.gain))).toBe(t.gain);
  });

  it('is deterministic: the same game always gets the same review', () => {
    const { start, log } = games[1]!;
    expect(findTurningPoint(start, log, ME)).toEqual(findTurningPoint(start, log, ME));
  });

  it('never looks at the opponent: their moves are never the turning point', () => {
    for (const { start, log } of games) {
      const t = findTurningPoint(start, log, 1);
      if (t) expect(t.before.actor).toBe(1);
    }
  });

  it('a log that does not replay (an online seat keeps only its own moves) gives no review, never a throw', () => {
    const { start, log } = games[2]!;
    expect(findTurningPoint(start, log.filter((_, i) => i % 3 !== 0), ME)).toBeNull();
  });

  it('a game with no real slip says so (null), rather than inventing a mistake', () => {
    // The careful bot reviewing its own play: its moves ARE the evaluation's best, so no gap reaches the bar.
    const { start, log } = playGame(14, 7);
    expect(findTurningPoint(start, log, ME)).toBeNull();
  });
});

describe('the review only ever reviews THIS game', () => {
  it('a log replayed from the wrong start (a board it does not end on) gives no review', () => {
    const { start, log } = playGame(11);
    let end = start;
    for (const a of log) end = apply(end, a);
    expect(findTurningPoint(start, log, ME, { end })).not.toBeNull();
    const other = { ...end, board: {} };
    expect(findTurningPoint(start, log, ME, { end: other })).toBeNull();
  });
});
