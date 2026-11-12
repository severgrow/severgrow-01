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

/**
 * THE PREFIX CACHE: the state after the first n actions of ONE replay, filled as far as has been
 * asked for.
 *
 * Why (measured, 2026-10-26): a scrub drag calls `stateAfter` once per pointer move, and every move
 * re-applied the whole log from the opening. On a 49-beat practice replay the rebuild alone cost
 * 0.30 ms at 2% of the bar but 4.50 ms at 98% — it grew with how far the drag had gone, and it
 * would keep growing with the length of the match. A drag is a walk along ONE log, so the prefix
 * that was already applied is the same prefix the next move needs: keeping it makes the rebuild
 * O(new actions) instead of O(all actions), and the numbers no longer depend on where the bar is.
 *
 * Correctness: this is a pure function memoised, never a shortcut. `apply` is deterministic and the
 * engine state is immutable, so `states[n]` IS what a fold from the opening would produce; the
 * suite (`replay-seek.test.ts`, "the seek rebuild does not repeat work") asks in a scrambled order
 * and compares every answer against a fresh fold. The key is the `ReplayInput` object itself, so
 * two matches can never share a chain and a closed replay's cache is garbage-collected with it.
 */
type PrefixChain = { actions: readonly unknown[]; states: State[] };
const prefixCache = new WeakMap<ReplayInput, PrefixChain>();

/** An action count as a whole number inside `[0, actions.length]` (a negative or absent count is 0). */
const prefixLength = (input: ReplayInput, count: number): number => {
  if (!Number.isFinite(count)) return count === Number.POSITIVE_INFINITY ? input.actions.length : 0;
  return Math.min(input.actions.length, Math.max(0, Math.trunc(count)));
};

/** The state after the first `count` actions of the match. */
export const stateAfter = (input: ReplayInput, count: number): State => {
  const wanted = prefixLength(input, count);
  const cached = prefixCache.get(input);
  // A chain is only usable while it still describes THIS log: the same array, and never longer than
  // the log itself (an array swapped or cut short starts again from the opening).
  const usable = cached !== undefined && cached.actions === input.actions && cached.states.length - 1 <= input.actions.length;
  const states: State[] = cached !== undefined && usable ? cached.states : [openingOf(input)];
  if (cached === undefined || !usable) prefixCache.set(input, { actions: input.actions, states });
  // Grow the chain only as far as this question needs; each new step applies exactly one action.
  let state = states[states.length - 1]!;
  for (let i = states.length - 1; i < wanted; i++) {
    state = apply(state, input.actions[i]!);
    states.push(state);
  }
  return states[wanted]!;
};

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
