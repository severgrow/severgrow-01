// THE BUILD GUARD for the shipped Daily Puzzles: every puzzle is PROVEN again on every build — it
// has an answer, at most a handful of equivalent ones, its goal is the best the turn allows, and
// the obvious moves (ending at once, the level-7 computer's own turn) do not meet it. A rules change
// that breaks a puzzle fails here, before any player can meet an unsolvable day.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { exploreTurn, goalMet, playTurn, prove } from '../../src/daily/core.js';
import { dailyPuzzle, dailyPuzzleCount } from '../../src/daily/puzzles.js';
import { DAILY_COUNT } from '../../src/daily/schedule.js';

const levelTurn = (start: State, seed: number): Action[] => {
  const out: Action[] = [];
  let s = start;
  for (let i = 0; s.phase === 'ACT' && i < 40; i++) {
    const a = chooseLevelAction(viewFor(s, s.actor), 7, botSeed(seed, 7, s.turnNumber, 900 + i));
    if (a.t === 'Discard') break;
    out.push(a);
    s = apply(s, a);
  }
  return out;
};

describe('the shipped daily puzzles', () => {
  it('the schedule announces exactly the puzzles that ship', () => {
    expect(dailyPuzzleCount()).toBe(DAILY_COUNT);
    expect(dailyPuzzle(0)).toBeNull();
    expect(dailyPuzzle(DAILY_COUNT + 1)).toBeNull();
  });

  for (let no = 1; no <= DAILY_COUNT; no++) {
    it(`#${no} is a fair puzzle`, () => {
      const p = dailyPuzzle(no)!;
      expect(p.no).toBe(no);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(0);
      // the player is always seat 0, at the start of their Grow step
      expect(p.start.phase).toBe('ACT');
      expect(p.start.turnPlayer).toBe(0);
      expect(p.start.actor).toBe(0);
      const proof = prove(p, 50_000, 6);
      expect(proof.ok).toBe(true);
      if (!proof.ok) return;
      expect(goalMet(p.goal, playTurn(p.start, proof.solution))).toBe(true);
      // the goal is the best the turn allows (nothing beats it)
      const all = [...exploreTurn(p.start).endings.values()].map((e) => e.outcome);
      if (p.goal.kind === 'points') expect(Math.max(...all.filter((o) => !o.won).map((o) => o.gain))).toBe(p.goal.n);
      if (p.goal.kind === 'cut') expect(Math.max(...all.map((o) => o.cut))).toBe(p.goal.n);
      // ending at once fails, and so does the computer's own turn
      const end = legalActions(viewFor(p.start, 0)).find((a) => a.t === 'EndAct')!;
      expect(goalMet(p.goal, playTurn(p.start, [end]))).toBe(false);
      let botSolves = false;
      try {
        botSolves = goalMet(p.goal, playTurn(p.start, levelTurn(p.start, p.start.seed)));
      } catch {
        botSolves = false;
      }
      expect(botSolves).toBe(false);
    }, 30_000);
  }
});
