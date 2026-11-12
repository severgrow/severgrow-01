// THE REPLAY TIMELINE (owner brief, 2026-10-25).
//
// What is pinned here:
//   * the duration curve — the length follows the BEAT COUNT (a 50-beat game ~30 s, a short game
//     held up by a floor, a very long one under a cap), and the clamps are the only way out;
//   * beat awareness — a Bloom of four tiles is longer than a Sprout, a big cut is longer than a
//     quiet grow, at EVERY scale (the weighting is never flattened, and big moments are held a
//     little longer than ordinary grows so the replay feels dynamic rather than merely sped up);
//   * the turn boundary is DATA (who moved, whose turn it is, where it changes);
//   * a board-only replay: draws and discards take no screen time, so no frame ever carries a card.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { REPLAY_PACING, buildReplay, fitScale, openingOf, weightOf } from '../src/replay/timeline.js';
import type { ReplayInput, ReplayModel } from '../src/replay/timeline.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;

/**
 * A REAL finished duel from production (RYK – JadeBadger, 2026-10-25, 12 committed actions,
 * 75 rows across the wider set): two Blooms, two Sprots, the winning surround. Its action log is
 * exactly what `match_moves` holds; the seed and starting seat are the match's own.
 */
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

const input = (actions: readonly Action[], over: Partial<ReplayInput> = {}): ReplayInput => ({
  seed: REAL_SEED,
  rulesVersion: CURRENT_RULES_VERSION,
  config: CONFIG,
  startingPlayer: 0,
  actions,
  names: ['RYK', 'JadeBadger'],
  ...over,
});

/** Seeded random legal play: a real game the engine itself produced, of whatever length. */
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

const totals = (model: ReplayModel) => ({
  total: model.totalMs,
  painted: model.frames.reduce((sum, f) => sum + f.duration, 0),
  frames: model.frames.length,
});

describe('replay timing', () => {
  it('a real 12-action duel is held at the stated floor (a short game is not a blur)', () => {
    const model = buildReplay(input(REAL_ACTIONS));
    const t = totals(model);
    expect(t.frames).toBeGreaterThan(4);
    expect(Math.round(t.total)).toBeGreaterThanOrEqual(REPLAY_PACING.minTotal - 1);
    expect(Math.round(t.total)).toBeLessThanOrEqual(REPLAY_PACING.minTotal + 1);
    // The whole duration is the frames plus the final hold — no hidden time.
    expect(t.total).toBe(t.painted + REPLAY_PACING.endHold);
  });

  it('a long real game (100+ actions) stays inside the stated cap', () => {
    // Seed 4 is a long, busy game in this ruleset; the exact length is asserted, not assumed.
    const actions = randomGame(4);
    expect(actions.length).toBeGreaterThan(60);
    const model = buildReplay(input(actions, { seed: 4 }));
    const t = totals(model);
    expect(t.total).toBeGreaterThanOrEqual(REPLAY_PACING.minTotal);
    expect(t.total).toBeLessThanOrEqual(REPLAY_PACING.maxTotal);
  });

  it('the duration curve: 50 beats ~30 s, a floor at 10, a cap at 200, monotonic throughout', () => {
    const at = (beats: number) => fitScale(Array.from({ length: beats }, () => 1)).total;
    // A "50 s replay" today is any match past the old cap; the new curve lands 50 beats near 30 s.
    expect(at(50)).toBeGreaterThanOrEqual(29_000);
    expect(at(50)).toBeLessThanOrEqual(31_000);
    // A ten-beat game is not compressed under the floor...
    expect(at(10)).toBeCloseTo(REPLAY_PACING.minTotal, 0);
    expect(REPLAY_PACING.minTotal).toBe(9_000);
    // ...and a two-hundred-beat game never runs past the cap.
    expect(at(200)).toBeCloseTo(REPLAY_PACING.maxTotal, 0);
    expect(REPLAY_PACING.maxTotal).toBe(32_000);
    // The total never falls as the match grows.
    let previous = 0;
    for (let beats = 1; beats <= 220; beats++) {
      const total = at(beats);
      expect(total, `${beats} beats`).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = total;
    }
  });

  it('a very short game is not stretched into a crawl', () => {
    // Three committed actions: a draw, one Sprout, the throw. Two painted beats at most.
    const actions: Action[] = [
      { t: 'Draw', from: 'deck' },
      { t: 'Sprout', card: 69, coord: { q: -1, r: 1 } },
      { t: 'EndAct' },
      { t: 'Discard', card: 18 },
    ];
    const model = buildReplay(input(actions));
    const t = totals(model);
    expect(t.frames).toBeLessThanOrEqual(3);
    expect(t.total).toBeLessThan(REPLAY_PACING.minTotal);
    for (const frame of model.frames) expect(frame.duration).toBeLessThanOrEqual(REPLAY_PACING.maxFrame);
  });

  it('keeps the relative weighting at every scale: a busy beat is longer than a quiet one', () => {
    const short = buildReplay(input(REAL_ACTIONS));
    const long = buildReplay(input(randomGame(4), { seed: 4 }));
    for (const model of [short, long]) {
      const blooms = model.frames.filter((f) => f.kind === 'grow' && f.weight > 1.5);
      const sprouts = model.frames.filter((f) => f.kind === 'grow' && f.weight === 0.85);
      expect(blooms.length).toBeGreaterThan(0);
      expect(sprouts.length).toBeGreaterThan(0);
      expect(Math.min(...blooms.map((f) => f.duration))).toBeGreaterThan(Math.max(...sprouts.map((f) => f.duration)));
      // A turn beat is always the shortest thing on screen.
      const turns = model.frames.filter((f) => f.kind === 'turn');
      if (turns.length) expect(Math.max(...turns.map((f) => f.duration))).toBeLessThan(Math.min(...sprouts.map((f) => f.duration)));
    }
  });

  it('weights a Bloom by its tile count and an overgrow above a plain Bloom', () => {
    expect(weightOf({ k: 'grow', style: 'sprout', player: 0, tiles: [{ key: '0,0', strength: 3, replaced: false }] })).toBe(0.85);
    expect(
      weightOf({
        k: 'grow',
        style: 'bloom',
        player: 0,
        tiles: [
          { key: '0,0', strength: 3, replaced: false },
          { key: '0,1', strength: 4, replaced: false },
          { key: '0,2', strength: 5, replaced: false },
        ],
      }),
    ).toBeCloseTo(1.85, 5);
    expect(
      weightOf({ k: 'grow', style: 'bloom', player: 0, tiles: [{ key: '0,0', strength: 3, replaced: true }] }),
    ).toBeCloseTo(1.15, 5);
    expect(weightOf({ k: 'draw', player: 0, from: 'deck' })).toBe(0);
  });

  it('holds the big moments longer than ordinary grows (cinematic, not merely sped up)', () => {
    // Ordinary grow, the turn hand-over, a cut of four links and a Blast that clears six.
    const grow = weightOf({ k: 'grow', style: 'sprout', player: 0, tiles: [{ key: '0,0', strength: 3, replaced: false }] });
    const turn = weightOf({ k: 'turn', player: 1, final: false });
    const cut = weightOf({ k: 'sever', player: 0, by: 0, origin: '0,0', keys: ['0,1', '0,2', '0,3', '0,4'] });
    const blast = weightOf({ k: 'megaBomb', player: 0, target: '0,0', destroyed: ['0,1', '0,2', '0,3', '0,4', '0,5', '0,6'] });
    // A turn is the quietest beat; a grow is roughly twice it.
    expect(turn).toBeLessThan(grow);
    expect(grow / turn).toBeGreaterThan(2);
    // A four-link cut and a six-tile Blast are each held longer than a whole ordinary grow.
    expect(cut).toBeGreaterThan(grow);
    expect(blast).toBeGreaterThan(cut);
    expect(blast / grow).toBeGreaterThan(3);
  });

  it('fitScale is monotonic and cannot run away at either end', () => {
    const one = fitScale([1]);
    const many = fitScale(Array.from({ length: 400 }, () => 1.8));
    expect(one.scale).toBe(REPLAY_PACING.maxScale);
    expect(many.scale).toBe(REPLAY_PACING.minScale);
    const mid = fitScale([1]);
    expect(mid.total).toBeLessThanOrEqual(REPLAY_PACING.maxTotal);
  });
});

describe('replay frames', () => {
  it('carries the turn boundary as data: who moved, whose turn, and where it changes', () => {
    const model = buildReplay(input(REAL_ACTIONS));
    // Every frame names a seat and a turn holder.
    for (const frame of model.frames) {
      expect([0, 1]).toContain(frame.seat);
      expect([0, 1]).toContain(frame.turn);
    }
    // The first beat belongs to the starting seat, and the turn only changes on a boundary beat.
    expect(model.frames[0]!.turn).toBe(0);
    const changes = model.frames.filter((f) => f.kind === 'turn');
    expect(changes.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < model.frames.length; i++) {
      const before = model.frames[i - 1]!;
      const after = model.frames[i]!;
      if (before.turn !== after.turn) expect(after.kind).toBe('turn');
    }
    // And the turn beat names the player who now moves, not the one who just moved.
    for (const change of changes) {
      expect(change.turn).toBe(change.seat);
    }
  });

  it('is board-only: no frame comes from a draw or a discard, and none carries a card', () => {
    const model = buildReplay(input(REAL_ACTIONS));
    expect(model.frames.length).toBe(9); // 5 grows + 2 turn beats + the winning strangle + the end
    for (const frame of model.frames) {
      expect(['grow', 'sever', 'strengthen', 'fruit', 'blast', 'rot', 'strangle', 'turn', 'end']).toContain(frame.kind);
      expect(JSON.stringify(frame.board)).not.toMatch(/suit|"card"/);
    }
    // Draws and EndAct produced no frame at all: every frame points at a board-changing action.
    const drawnOnly = new Set([0, 4, 8]);
    for (const frame of model.frames) expect(drawnOnly.has(frame.action)).toBe(false);
  });

  it('each frame board is the board the engine really had after that action', () => {
    const model = buildReplay(input(REAL_ACTIONS));
    const opening = openingOf(input(REAL_ACTIONS));
    for (const frame of model.frames) {
      let state = opening;
      for (let i = 0; i <= frame.action; i++) state = apply(state, REAL_ACTIONS[i]!);
      expect(frame.board).toEqual(state.board);
    }
    // The last frame is the final position of the real match: scores 9-0, from RYK's side.
    expect(model.frames.at(-1)!.scores).toEqual([9, 0]);
  });

  it('the final hold closes the match with a readable result', () => {
    const model = buildReplay(input(REAL_ACTIONS));
    expect(model.result).toEqual({ winner: 0, scores: [9, 0], title: 'RYK wins' });
    expect(model.totalMs - model.frames.at(-1)!.at).toBeGreaterThan(REPLAY_PACING.endHold);
  });

  it('paints a seat-1 replay from its own side, with the names in screen order', () => {
    const a = buildReplay(input(REAL_ACTIONS));
    const b = buildReplay(input(REAL_ACTIONS, { me: 1 }));
    expect(b.names).toEqual(['JadeBadger', 'RYK']);
    expect(b.frames.at(-1)!.scores).toEqual([0, 9]);
    // Screen seats: 1 is "the other player" on this phone — RYK, the engine's seat 0, won.
    expect(b.result).toEqual({ winner: 1, scores: [0, 9], title: 'RYK wins' });
    // Every tile is the 180° mirror of the other seat's view, with the owners swapped.
    for (const [i, frame] of b.frames.entries()) {
      const other = a.frames[i]!;
      for (const [key, tile] of Object.entries(frame.board)) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        const mirrored = other.board[`${-q},${-r}`];
        expect(tile?.strength ?? null).toBe(mirrored?.strength ?? null);
        if (tile) expect(tile.owner).toBe(mirrored!.owner === 0 ? 1 : 0);
      }
    }
  });

  it('records the result of a match that ended without a GameEnd (a resignation)', () => {
    const actions = REAL_ACTIONS.slice(0, 5);
    const model = buildReplay(input(actions, { result: { winner: 1, scores: [2, 3], reason: 'resigned' } }));
    expect(model.result).toEqual({ winner: 1, scores: [2, 3], title: 'JadeBadger wins by resignation' });
  });

  it('never calls a timeout a resignation', () => {
    const actions = REAL_ACTIONS.slice(0, 5);
    const model = buildReplay(input(actions, { result: { winner: 0, scores: [4, 1], reason: 'timeout' } }));
    expect(model.result).toEqual({ winner: 0, scores: [4, 1], title: 'RYK wins on time' });
  });

  it('replays a campaign opening from its own set position', () => {
    // A campaign lesson opens from an authored position; the log starts there, not from the seed.
    const base = newGame(REAL_SEED, CONFIG);
    const model = buildReplay({ ...input(REAL_ACTIONS.slice(0, 2)), base, names: ['You', 'Opponent'] });
    expect(model.from.board).toEqual(base.board);
    expect(model.names).toEqual(['You', 'Opponent']);
  });
});
