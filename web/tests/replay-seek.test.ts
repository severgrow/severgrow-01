// SEEKING AND SCRUBBING (owner brief, 2026-10-25: "it must actually seek — painting the correct
// board state at that point, not just the clock").
//
// The player paints `frames[i].board` while scrubbing. This suite proves that board is the REAL
// position, by rebuilding it a second, independent way — from the start of the log with the engine's
// own `apply` — for every frame of two real games, from both seats.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { REPLAY_PACING, buildReplay, screenBoard } from '../src/replay/timeline.js';
import type { ReplayInput, ReplayModel } from '../src/replay/timeline.js';
import { boardAtIndex, clampIndex, frameAtTime, progressOf, scoresAtIndex, seekTo, stateAfter } from '../src/replay/seek.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;

/** The same real 12-action production duel the timeline suite pins (RYK – JadeBadger). */
const REAL_SEED = 234_649_283;
const REAL_ACTIONS: Action[] = [
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 69, coord: { q: -1, r: 1 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 18 },
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 7, coord: { q: 1, r: -2 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 1 },
  { t: 'Draw', from: 'deck' },
  { t: 'Bloom', cards: [13, 49, 66], hexes: [{ q: 0, r: 0 }, { q: 1, r: -2 }, { q: 1, r: -1 }] },
  { t: 'Bloom', cards: [39, 41, 42], hexes: [{ q: 2, r: -3 }, { q: 3, r: -3 }, { q: 3, r: -2 }] },
  { t: 'Sprout', card: 9, coord: { q: 2, r: -1 } },
];

const baseInput = (actions: readonly Action[], seed: number, me: 0 | 1 = 0): ReplayInput => ({
  seed,
  rulesVersion: CURRENT_RULES_VERSION,
  config: CONFIG,
  startingPlayer: 0,
  actions,
  names: ['RYK', 'JadeBadger'],
  me,
});

const randomGame = (seed: number, maxActions = 4000): Action[] => {
  const rand = mulberry32(seed ^ 0x5eed);
  let state: State = newGame(seed);
  const actions: Action[] = [];
  for (let i = 0; i < maxActions && state.phase !== 'GAME_OVER'; i++) {
    const legal = legalActions(viewFor(state, state.actor));
    const next = legal[Math.floor(rand() * legal.length)]!;
    actions.push(next);
    state = apply(state, next);
  }
  return actions;
};

const models: { name: string; input: ReplayInput; model: ReplayModel }[] = [
  { name: 'a real 12-action duel (seat 0)', input: baseInput(REAL_ACTIONS, REAL_SEED), model: buildReplay(baseInput(REAL_ACTIONS, REAL_SEED)) },
  { name: 'a real 12-action duel (seat 1)', input: baseInput(REAL_ACTIONS, REAL_SEED, 1), model: buildReplay(baseInput(REAL_ACTIONS, REAL_SEED, 1)) },
  { name: 'a long generated game', input: baseInput(randomGame(4), 4), model: buildReplay(baseInput(randomGame(4), 4)) },
];

describe('seeking lands on the real position', () => {
  for (const { name, input, model } of models) {
    it(`every beat of ${name} equals a fresh replay of the log up to that beat`, () => {
      expect(model.frames.length).toBeGreaterThan(3);
      for (const frame of model.frames) {
        expect(boardAtIndex(input, model, frame.index)).toEqual(frame.board);
        expect(scoresAtIndex(input, model, frame.index)).toEqual(frame.scores);
      }
    });

    it(`the last beat of every action of ${name} is the engine's own board`, () => {
      for (const frame of model.frames) {
        const next = model.frames[frame.index + 1];
        if (next && next.action === frame.action) continue;
        const truth = screenBoard(stateAfter(input, frame.action + 1).board, model.me);
        expect(frame.board).toEqual(truth);
      }
    });
  }

  it('the position at a frame is not the previous frame (the board really moves)', () => {
    const { model } = models[0]!;
    const boards = new Set(model.frames.map((f) => JSON.stringify(f.board)));
    expect(boards.size).toBeGreaterThan(2);
  });

  it('stateAfter rebuilds mid-turn and turn-boundary positions, not just the end', () => {
    const input = models[0]!.input;
    const afterSprout = stateAfter(input, 2);
    expect(afterSprout.board['-1,1']).toEqual({ owner: 0, strength: 8 });
    expect(afterSprout.turnPlayer).toBe(0); // still RYK's turn: the throw has not happened
    const afterThrow = stateAfter(input, 4);
    expect(afterThrow.turnPlayer).toBe(1); // the throw handed the turn over
  });
});

describe('the scrub bar', () => {
  it('maps a time to exactly one frame, and the frame boundaries are consistent', () => {
    const { model } = models[0]!;
    for (const [i, frame] of model.frames.entries()) {
      expect(frameAtTime(model, frame.at)).toBe(i);
      if (i > 0) expect(frameAtTime(model, frame.at - 1)).toBe(i - 1);
      expect(frameAtTime(model, frame.at + frame.duration - 1)).toBe(i);
    }
    // Before the first beat and after the last one it clamps instead of going blank.
    expect(frameAtTime(model, -500)).toBe(0);
    expect(frameAtTime(model, model.totalMs + 5_000)).toBe(model.frames.length - 1);
  });

  it('a fraction of the bar seeks to a frame, and seeking back is exact', () => {
    const { model } = models[1]!;
    const seen: number[] = [];
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const { index, ms } = seekTo(model, p);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(model.frames.length);
      expect(ms).toBe(model.frames[index]!.at);
      seen.push(index);
    }
    // Monotonic: dragging the bar forwards never jumps backwards.
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    // Middle and back again land on the same frame.
    const middle = seekTo(model, 0.5);
    const end = seekTo(model, 1);
    const back = seekTo(model, 0.5);
    expect(back.index).toBe(middle.index);
    expect(end.index).toBe(model.frames.length - 1);
  });

  it('progress is 0 at the first beat and never past 1', () => {
    const { model } = models[2]!;
    expect(progressOf(model, 0)).toBe(0);
    expect(progressOf(model, model.frames.length - 1)).toBeLessThanOrEqual(1);
    expect(progressOf(model, -1)).toBe(0);
  });

  it('clamps an out-of-range index instead of throwing', () => {
    const { model } = models[0]!;
    expect(clampIndex(model, -9)).toBe(0);
    expect(clampIndex(model, 9_999)).toBe(model.frames.length - 1);
    expect(boardAtIndex(models[0]!.input, model, -9)).toEqual(model.frames[0]!.board);
  });

  it('the last frame holds for the whole end pause', () => {
    const { model } = models[0]!;
    const last = model.frames.at(-1)!;
    expect(model.totalMs).toBe(last.at + last.duration + REPLAY_PACING.endHold);
    expect(frameAtTime(model, model.totalMs - 1)).toBe(last.index);
  });
});
