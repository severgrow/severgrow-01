// v0.7 Bloom bands: levels 1-3 bloom at random (seeded) and sometimes skip a Bloom; levels 4-6
// pick by the quick look only (tiles, gold, strongest replacement, compact); levels 7-9 use the
// full evaluation, and 8-9 also hold a 3-card Bloom when the unseen cards make a 4 likely.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, createCards, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State, View } from '../../src/engine/index.js';
import { GreedyBot, rankActions } from '../../src/bots/GreedyBot.js';
import { lookBlooms } from '../../src/bots/bloomLook.js';
import { LEVEL_CONFIGS, botSeed, decideLevelAction, holdChance } from '../../src/bots/levels.js';
import { fixture } from '../helpers.js';

/** Grow-step views where level 7 (GreedyBot) would bloom. */
const bloomViews = (n: number): View[] => {
  const out: View[] = [];
  for (let seed = 1; out.length < n && seed < 400; seed++) {
    let s: State = newGame(seed);
    while (s.phase !== 'GAME_OVER' && out.length < n) {
      const v = viewFor(s, s.actor);
      if (v.phase === 'ACT' && rankActions(v)[0]?.action.t === 'Bloom') out.push(v);
      s = apply(s, GreedyBot.chooseAction(v));
    }
  }
  return out;
};
const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
const isLegal = (v: View, a: Action) => legalActions(v).some((x) => same(x, a));

describe('Bloom bands', () => {
  const views = bloomViews(12);

  it('there are positions to test with', () => {
    expect(views.length).toBe(12);
  });

  it('levels 1-3: a random legal Bloom (seeded, so repeatable), and sometimes no Bloom at all', () => {
    for (const level of [1, 2, 3] as const) {
      const picks = new Set<string>();
      let skipped = 0;
      let random = 0;
      for (const v of views) {
        for (let s = 0; s < 12; s++) {
          const d = decideLevelAction(v, level, botSeed(s, level, v.turnNumber, 0));
          expect(same(d.action, decideLevelAction(v, level, botSeed(s, level, v.turnNumber, 0)).action)).toBe(true);
          expect(isLegal(v, d.action)).toBe(true);
          if (d.reason?.startsWith('a random bloom')) {
            random++;
            expect(d.action.t).toBe('Bloom');
            picks.add(JSON.stringify(d.action));
          }
          if (d.reason?.startsWith('skipped a bloom')) {
            skipped++;
            expect(d.action.t).not.toBe('Bloom');
          }
        }
      }
      expect(random, `level ${level} random`).toBeGreaterThan(0);
      expect(skipped, `level ${level} skipped`).toBeGreaterThan(0);
      expect(picks.size, `level ${level} variety`).toBeGreaterThan(3);
    }
  });

  it('levels 4-6: when they bloom by plan, it is the best quick look', () => {
    for (const level of [4, 5, 6] as const) {
      let n = 0;
      for (const v of views) {
        for (let s = 0; s < 6; s++) {
          const d = decideLevelAction(v, level, botSeed(s, level, v.turnNumber, 0));
          if (d.reason?.startsWith('best quick look')) {
            n++;
            expect(same(d.action, lookBlooms(v)[0]!.action)).toBe(true);
          }
        }
      }
      expect(n, `level ${level}`).toBeGreaterThan(0);
    }
  });

  it('level 7 blooms exactly as the full evaluation says, with a reason', () => {
    for (const v of views) {
      const d = decideLevelAction(v, 7, 1);
      expect(same(d.action, rankActions(v)[0]!.action)).toBe(true);
      expect(d.reason).toMatch(/^full evaluation/);
    }
  });

  it('the hold chance counts the unseen cards that would make it a Bloom of 4', () => {
    const f = fixture();
    const base: View = { ...viewFor({ ...newGame(3), ...f, phase: 'ACT', actor: 0 } as State, 0), deckCount: 40, turnNumber: 3 };
    const deck = createCards(f.config);
    const real = (suit: number, rank: number, nth = 0) => deck.filter((c) => c.suit === suit && c.rank === rank)[nth]!;
    // a run 4-5-6 of one suit: the 3s and 7s of that suit (2 copies each) are all unseen
    const run = { ...base, hand: [real(0, 4), real(0, 5), real(0, 6)], discard: [] };
    const set = { ...base, hand: [real(0, 5), real(1, 5), real(2, 5)], discard: [] };
    const h = holdChance(run, run.hand);
    expect(h.outs).toBeGreaterThanOrEqual(4);
    expect(holdChance(set, set.hand).outs).toBeGreaterThanOrEqual(2);
    expect(h.outs).toBeGreaterThan(holdChance(set, set.hand).outs);
    // the outs already thrown are not counted
    expect(holdChance({ ...run, discard: [real(0, 3), real(0, 7)] }, run.hand).outs).toBeLessThan(h.outs);
    // near the end there is no time to wait
    expect(holdChance({ ...run, deckCount: 2 }, run.hand).chance).toBeLessThan(h.chance);
  });

  it('levels 8-9 sometimes hold a plain 3-card Bloom for a 4 and say why; never when it replaces or strangles', () => {
    let held = 0;
    for (const level of [8, 9] as const) {
      for (const v of views) {
        const d = decideLevelAction(v, level, botSeed(1, level, v.turnNumber, 0));
        if (d.reason?.startsWith('holds')) {
          held++;
          expect(d.action.t).not.toBe('Bloom');
          const best = rankActions(v)[0]!;
          expect(best.action.t).toBe('Bloom');
          const b = best.action as Extract<Action, { t: 'Bloom' }>;
          expect(b.cards.length).toBe(3);
          expect(b.hexes.every((h) => !v.board[coordKey(h)])).toBe(true);
        }
      }
    }
    // holding is rare (a judgement call, not a habit)
    expect(held).toBeLessThan(views.length);
  });

  it('every level config names its Bloom band', () => {
    expect([1, 2, 3].map((l) => LEVEL_CONFIGS[l as 1].bloomBand)).toEqual(['random', 'random', 'random']);
    expect([4, 5, 6].map((l) => LEVEL_CONFIGS[l as 4].bloomBand)).toEqual(['quick', 'quick', 'quick']);
    expect([7, 8, 9].map((l) => LEVEL_CONFIGS[l as 7].bloomBand)).toEqual(['full', 'full', 'full']);
    expect(LEVEL_CONFIGS[8].bloomHold && LEVEL_CONFIGS[9].bloomHold && !LEVEL_CONFIGS[7].bloomHold).toBe(true);
  });
});
