// THE REPLAY'S BIGGEST MOMENTS (owner, 2026-10-26): "include 2-4 biggest actions on timeline rather
// than more". The scrub bar used to carry one hair per hand-over (dozens of them on a long match).
// It now carries only the few plays that moved the match most, measured from the match's own data:
// how far a play swung the score between the two players, plus the tiles it cut off. Never a guess.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { buildReplay, MAX_HIGHLIGHTS } from '../src/replay/timeline.js';
import type { ReplayFrame, ReplayModel } from '../src/replay/timeline.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;

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

const modelOf = (seed: number, me: 0 | 1 = 0): ReplayModel =>
  buildReplay({
    seed,
    rulesVersion: CURRENT_RULES_VERSION,
    config: CONFIG,
    startingPlayer: 0,
    actions: randomGame(seed),
    names: ['RYK', 'KAT-WHAT'],
    me,
  });

/** The swing of one action, recomputed independently from the frames: |Δ(me − opponent)|. */
const swingOf = (model: ReplayModel, action: number): number => {
  const own = model.frames.filter((f) => f.action === action);
  const before: ReplayFrame | undefined = model.frames[own[0]!.index - 1];
  const from = before ? before.scores : model.from.scores;
  const to = own.at(-1)!.scores;
  return Math.abs(to[0] - to[1] - (from[0] - from[1]));
};

describe('the replay highlights', () => {
  const seeds = [3, 7, 12, 21, 40, 77];

  it('marks between two and four plays on a real match, never one per hand-over', () => {
    for (const seed of seeds) {
      const model = modelOf(seed);
      const handovers = model.frames.filter((f) => f.kind === 'turn').length;
      expect(handovers).toBeGreaterThan(MAX_HIGHLIGHTS);
      expect(model.highlights.length).toBeGreaterThanOrEqual(2);
      expect(model.highlights.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
    }
  });

  it('are the plays that moved the match most, in time order, each on a real beat of that play', () => {
    for (const seed of seeds) {
      const model = modelOf(seed);
      const actions = [...new Set(model.frames.map((f) => f.action))];
      const impact = (a: number) => swingOf(model, a) + model.highlights.find((h) => h.action === a)!.cut;
      const chosen = new Set(model.highlights.map((h) => h.action));
      for (const h of model.highlights) {
        const frame = model.frames[h.frame]!;
        expect(frame.action).toBe(h.action);
        expect(frame.kind).not.toBe('turn');
        expect(frame.seat).toBe(h.seat);
        expect(h.swing).toBe(swingOf(model, h.action));
        expect(h.impact).toBe(impact(h.action));
      }
      // No play left off the bar swung the score further than the weakest one on it, cuts aside.
      const weakestSwing = Math.min(...model.highlights.map((h) => h.swing + h.cut));
      for (const a of actions) {
        if (chosen.has(a) || model.turningPoint?.action === a) continue;
        expect(swingOf(model, a)).toBeLessThanOrEqual(weakestSwing);
      }
      const order = model.highlights.map((h) => h.frame);
      expect(order).toEqual([...order].sort((x, y) => x - y));
    }
  });

  it('always includes the turning point when the match has one', () => {
    for (const seed of seeds) {
      const model = modelOf(seed);
      if (!model.turningPoint) continue;
      expect(model.highlights.some((h) => h.action === model.turningPoint!.action)).toBe(true);
    }
  });

  it('is the same story from either phone, with the seats mirrored', () => {
    const a = modelOf(12, 0);
    const b = modelOf(12, 1);
    expect(b.highlights.map((h) => h.action)).toEqual(a.highlights.map((h) => h.action));
    expect(b.highlights.map((h) => 1 - h.seat)).toEqual(a.highlights.map((h) => h.seat));
  });

  it('marks nothing on a match too short to have a story', () => {
    const model = buildReplay({
      seed: 5,
      rulesVersion: CURRENT_RULES_VERSION,
      config: CONFIG,
      startingPlayer: 0,
      actions: [{ t: 'Draw', from: 'deck' }],
      names: ['RYK', 'KAT-WHAT'],
    });
    expect(model.highlights).toEqual([]);
  });
});
