// THE TURNING POINT IN A REPLAY (owner brief, 2026-10-26): a replay that already knows its own
// story. The rule is not invented here: it is the same `biggestCut` the game review keeps — the
// play that cut off the most tiles, first on a tie. These tests pin the replay's model to a real
// Session so the two can never drift.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { Session } from '../src/logic/session.js';
import { buildReplay } from '../src/replay/timeline.js';
import type { ReplayInput } from '../src/replay/timeline.js';
import { boardAtIndex, seekTo } from '../src/replay/seek.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;
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

const input = (seed: number, actions: readonly Action[], over: Partial<ReplayInput> = {}): ReplayInput => ({
  seed,
  rulesVersion: CURRENT_RULES_VERSION,
  config: CONFIG,
  startingPlayer: 0,
  actions,
  names: ['RYK', 'JadeBadger'],
  ...over,
});

/** The same match played through the live Session, so `biggestCut` is the engine of truth. */
const sessionOf = (seed: number, actions: readonly Action[]): Session => {
  const session = new Session(newGame(seed, CONFIG), 0);
  for (const action of actions) session.play(action, session.state.actor);
  return session;
};

describe('the replay turning point', () => {
  it('is the SAME play Session.biggestCut keeps, at the beat where the cut lands', () => {
    // Seed 12 is a real 146-action game (the timeline suite's own random-play pool) with a 5-tile
    // cut; the model must name that cut rather than invent a "likely moment".
    const actions = randomGame(12);
    const session = sessionOf(12, actions);
    const cut = session.biggestCut;
    expect(cut).not.toBeNull();
    const actionIndex = session.log.indexOf(cut!.action);
    expect(actionIndex).toBeGreaterThanOrEqual(0);
    const tiles = cut!.steps.filter((step) => step.k === 'sever').reduce((n, step) => n + (step.k === 'sever' ? step.keys.length : 0), 0);
    expect(tiles).toBeGreaterThan(1);

    const model = buildReplay(input(12, actions));
    expect(model.turningPoint).not.toBeNull();
    expect(model.turningPoint!.action).toBe(actionIndex);
    expect(model.turningPoint!.tiles).toBe(tiles);
    const cutFrame = model.frames.find((frame) => frame.action === actionIndex && frame.kind === 'sever');
    expect(cutFrame).toBeDefined();
    expect(model.turningPoint!.frame).toBe(cutFrame!.index);
    expect(model.turningPoint!.seat).toBe(cutFrame!.seat);
  });

  it('lands the seek exactly on that beat, with the board rebuilt from the log', () => {
    const actions = randomGame(12);
    const model = buildReplay(input(12, actions));
    const tp = model.turningPoint!;
    const frame = model.frames[tp.frame]!;
    const landed = seekTo(model, frame.at / model.totalMs);
    expect(landed.index).toBe(tp.frame);
    expect(landed.ms).toBe(frame.at);
    // The player's seek paints `boardAtIndex`; it must be the same position the plan promises.
    expect(boardAtIndex(model.input, model, tp.frame)).toEqual(frame.board);
  });

  it('is absent when the match never cut a tile', () => {
    const model = buildReplay(input(234_649_283, REAL_ACTIONS));
    expect(model.frames.some((frame) => frame.kind === 'sever')).toBe(false);
    expect(model.turningPoint).toBeNull();
  });

  it('is absent when there is only one beat to watch', () => {
    // A real opening with exactly one painted beat: the draw, one Grow, the end of the act.
    const model = buildReplay(input(234_649_283, REAL_ACTIONS.slice(0, 3)));
    expect(model.frames.length).toBe(1);
    expect(model.turningPoint).toBeNull();
  });

  it('maps the cutting seat to the same screen seat as the beat when viewed from seat 1', () => {
    const actions = randomGame(12);
    const model = buildReplay(input(12, actions, { me: 1 }));
    const tp = model.turningPoint!;
    const frame = model.frames[tp.frame]!;
    expect(tp.seat).toBe(frame.seat);
    // The cut's actor in screen seats is the seat the beat names.
    expect(model.frames.filter((f) => f.index === tp.frame && f.kind === 'sever')).toHaveLength(1);
  });
});
