// SEEKING A REPLAY (owner brief, 2026-10-25: "a scrub bar … it must actually seek — painting the
// correct board state at that point, not just the clock").
//
// Two independent paths meet here, and a test holds them together:
//
//   * the TIMELINE precomputes every beat's board on the way through the log (`buildReplay`);
//   * `boardAtIndex` rebuilds the SAME position from the start of the log for any beat — the
//     engine's own `apply` for every earlier action, then the same `buildSteps` for the action the
//     beat belongs to — with no help from the timeline.
//
// Playback and scrubbing paint the frames (O(1) per seek, so a drag never re-runs the match); the
// second path exists so the suite can prove the frames are the real positions, not merely
// self-consistent.
import { apply, scores } from '../../../src/engine/index.js';
import type { Player, State } from '../../../src/engine/index.js';
import { applyStep, buildSteps } from '../logic/anim.js';
import type { Board } from '../logic/anim.js';
import { mapStepToScreen, openingOf, screenBoard } from './timeline.js';
import type { ReplayInput, ReplayModel } from './timeline.js';

/** The state after the first `count` actions of the match. */
export const stateAfter = (input: ReplayInput, count: number): State =>
  input.actions.slice(0, Math.max(0, count)).reduce<State>((state, action) => apply(state, action), openingOf(input));

/** [me, opponent] from an engine score pair. */
export const scorePair = (pair: readonly [number, number], me: Player): [number, number] =>
  me === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];

/**
 * The board a seek to `index` must show, rebuilt from the log: the position after every action
 * before this beat, plus this beat's own step. Screen-mapped for `me`.
 */
export const boardAtIndex = (input: ReplayInput, model: ReplayModel, index: number): Board => {
  const frame = model.frames[clampIndex(model, index)];
  if (!frame) return model.from.board;
  const me = model.me;
  const before = stateAfter(input, frame.action);
  let board = screenBoard(before.board, me);
  const after = apply(before, input.actions[frame.action]!);
  const steps = buildSteps(before, input.actions[frame.action]!, after, 0);
  for (let i = 0; i <= frame.step && i < steps.length; i++) {
    board = applyStep(board, mapStepToScreen(steps[i]!, me));
  }
  // A beat that ends its action ends on the engine's own board (see `buildReplay`).
  const nextFrame = model.frames[frame.index + 1];
  const endsAction = !nextFrame || nextFrame.action !== frame.action;
  return endsAction ? screenBoard(after.board, me) : board;
};

/** The score read-out a seek to `index` must show, rebuilt the same way. */
export const scoresAtIndex = (input: ReplayInput, model: ReplayModel, index: number): [number, number] => {
  const frame = model.frames[clampIndex(model, index)];
  if (!frame) return model.from.scores;
  return scorePair(scores(stateAfter(input, frame.action + 1)), model.me);
};

export const clampIndex = (model: ReplayModel, index: number): number =>
  model.frames.length === 0 ? -1 : Math.min(Math.max(0, Math.round(index)), model.frames.length - 1);

/**
 * The frame on screen at `ms`. Before the first frame it is frame 0 (a seek to the start shows the
 * opening beat, not a blank board); after the last frame it is the last one, which holds for the
 * end pause.
 */
export const frameAtTime = (model: ReplayModel, ms: number): number => {
  const frames = model.frames;
  if (frames.length === 0) return -1;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.at <= Math.max(0, ms)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/**
 * A seek position from a fraction of the scrub bar, snapped to the START of the frame it lands in,
 * so play resumes showing that beat rather than jumping straight past it.
 */
export const seekTo = (model: ReplayModel, fraction: number): { index: number; ms: number } => {
  const f = Math.min(Math.max(fraction, 0), 1);
  const index = frameAtTime(model, f * model.totalMs);
  if (index < 0) return { index, ms: 0 };
  return { index, ms: model.frames[index]!.at };
};

/** How far through the whole replay a frame starts (0..1), for the scrub bar. */
export const progressOf = (model: ReplayModel, index: number): number =>
  model.totalMs <= 0 || index < 0 ? 0 : Math.min(1, model.frames[index]!.at / model.totalMs);
