// The Daily Puzzle's rules side (src/daily/core.ts): a turn is measured exactly, forged turns are
// refused, and a puzzle's "exactly one answer" is proven by exhaustive search on real positions.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { newMatch } from '../../src/engine/match.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { DailyTurnError, exploreTurn, goalMet, leadOf, playTurn, prove, solvingEndings } from '../../src/daily/core.js';
import type { DailyGoal } from '../../src/daily/core.js';

/** Grow-step starts (right after a Draw) from a level-7 vs level-7 game. */
const growSteps = (seed: number, from = 6): State[] => {
  const out: State[] = [];
  let s = newMatch(seed);
  let lastWasDraw = false;
  for (let i = 0; s.phase !== 'GAME_OVER' && i < 3000; i++) {
    if (s.phase === 'ACT' && lastWasDraw && s.turnNumber >= from) out.push(s);
    const a = chooseLevelAction(viewFor(s, s.actor), 7, botSeed(seed, 7, s.turnNumber, i));
    lastWasDraw = a.t === 'Draw';
    s = apply(s, a);
  }
  return out;
};

/** The first real Grow step whose best lead gain (4+) is reached by exactly one ending. */
const findUniqueBest = (): { start: State; best: number } => {
  for (let seed = 1; seed < 40; seed++) {
    for (const start of growSteps(seed)) {
      const space = exploreTurn(start, 20_000);
      if (space.capped) continue;
      const gains = [...space.endings.values()].map((e) => e.outcome.gain);
      const best = Math.max(...gains);
      if (best >= 4 && gains.filter((g) => g === best).length === 1) return { start, best };
    }
  }
  throw new Error('no unique-best position found');
};

const endAct = (s: State): Action => legalActions(viewFor(s, s.actor)).find((a) => a.t === 'EndAct')!;

describe('the daily puzzle core', () => {
  const start = growSteps(3)[0]!;

  it('measures a played turn: ending the Grow step at once gains nothing and cuts nothing', () => {
    const o = playTurn(start, [endAct(start)]);
    expect(o.end.phase).toBe('DISCARD');
    expect(o.gain).toBe(0);
    expect(o.cut).toBe(0);
    expect(o.won).toBe(false);
  });

  it('accepts the throw after the Grow step, and nothing after the throw', () => {
    const afterEnd = apply(start, endAct(start));
    const discard = legalActions(viewFor(afterEnd, afterEnd.actor)).find((a) => a.t === 'Discard')!;
    expect(() => playTurn(start, [endAct(start), discard])).not.toThrow();
    expect(() => playTurn(start, [endAct(start), discard, discard])).toThrow(DailyTurnError);
  });

  it('refuses a turn that is unfinished, draws, is illegal, or is not a Grow step', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as DailyTurnError).code;
      }
      return null;
    };
    expect(code(() => playTurn(start, []))).toBe('UNFINISHED');
    expect(code(() => playTurn(start, [{ t: 'Draw', from: 'deck' }, endAct(start)]))).toBe('DRAW_IN_PUZZLE');
    expect(code(() => playTurn(start, [{ t: 'Sprout', card: -1, coord: { q: 0, r: 0 } }, endAct(start)]))).toBe('ILLEGAL');
    expect(code(() => playTurn(apply(start, endAct(start)), []))).toBe('NOT_A_GROW_STEP');
    expect(code(() => playTurn(start, Array.from({ length: 41 }, () => endAct(start))))).toBe('TOO_LONG');
  });

  it('every ending the search finds is reproduced exactly by replaying its path', () => {
    const space = exploreTurn(start, 20_000);
    expect(space.capped).toBe(false);
    expect(space.endings.size).toBeGreaterThan(0);
    for (const { actions, outcome } of [...space.endings.values()].slice(0, 40)) {
      const replayed = playTurn(start, actions);
      expect(replayed.gain).toBe(outcome.gain);
      expect(replayed.cut).toBe(outcome.cut);
      expect(leadOf(replayed.end, start.turnPlayer)).toBe(leadOf(outcome.end, start.turnPlayer));
    }
  });

  it('the search is deterministic', () => {
    const a = exploreTurn(start, 20_000);
    const b = exploreTurn(start, 20_000);
    expect([...a.endings.keys()]).toEqual([...b.endings.keys()]);
    expect(a.visited).toBe(b.visited);
  });

  it('proves a real one-answer position, and its solution meets the goal when replayed', () => {
    const { start: s, best } = findUniqueBest();
    const goal: DailyGoal = { kind: 'points', n: best };
    const proof = prove({ start: s, goal });
    expect(proof.ok).toBe(true);
    if (!proof.ok) return;
    expect(goalMet(goal, playTurn(s, proof.solution))).toBe(true);
    // ending at once does not solve it
    expect(goalMet(goal, playTurn(s, [endAct(s)]))).toBe(false);
  });

  it('rejects a goal several endings meet, and a goal no ending meets', () => {
    const { start: s, best } = findUniqueBest();
    const easy = prove({ start: s, goal: { kind: 'points', n: 0 } });
    expect(easy).toMatchObject({ ok: false, reason: 'SEVERAL_SOLUTIONS' });
    expect(prove({ start: s, goal: { kind: 'points', n: best + 1 } })).toMatchObject({ ok: false, reason: 'NO_SOLUTION' });
    expect(solvingEndings(exploreTurn(s), { kind: 'points', n: best })).toHaveLength(1);
  });

  it('rejects a turn too large to search fully', () => {
    expect(prove({ start, goal: { kind: 'points', n: 1 } }, 5)).toMatchObject({ ok: false, reason: 'TOO_LARGE' });
  });
});
