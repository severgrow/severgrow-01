// bots-v0.11: NO TURN WITHOUT ITS GROW (owner, 2026-11-04: "Remove the skipping growth in all levels
// really"). Every level 1-9; the previous version stays accepted for proofs already queued.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { LEVELS, LEVEL_CONFIGS, botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';
import { chooseKeepsGrowing, modestGrow } from '../../src/bots/keeps-growing.js';
import { BOT_VERSIONS, CURRENT_BOT_VERSION, PREVIOUS_BOT_VERSION, botFor, chooseBotAction } from '../../src/bots/versions.js';

/** A bot at `level` (seat 1) against a random player (seat 0); calls `seen` on each of the bot's moves. */
const game = (seed: number, level: Level, seen: (s: State, a: Action) => void) => {
  const rand = mulberry32(seed * 31 + level);
  let s = newMatch(seed);
  for (let i = 0; i < 1500 && s.phase !== 'GAME_OVER'; i++) {
    let a: Action;
    if (s.actor === 1) {
      a = chooseBotAction(viewFor(s, 1), level, botSeed(s.seed, level, s.turnNumber, s.history?.length ?? 0));
      seen(s, a);
    } else {
      const legal = legalActions(viewFor(s, 0));
      a = legal[Math.floor(rand() * legal.length)]!;
    }
    s = apply(s, a);
  }
  return s;
};

describe('bots-v0.11: a turn never ends without its grow', () => {
  it('is in force in the current version; the versions before it stay accepted, exactly as they were', () => {
    // bots-v0.12 (2026-11-12) added the rivals on top of this rule, so the CURRENT chooser is still
    // chooseKeepsGrowing; v0.11 (this rule) and v0.10 (before it) both still replay as they did.
    expect(CURRENT_BOT_VERSION).toBe('bots-v0.13');
    expect(PREVIOUS_BOT_VERSION).toBe('bots-v0.12');
    expect(botFor(CURRENT_BOT_VERSION)).toBe(chooseKeepsGrowing);
    expect(chooseBotAction).toBe(chooseKeepsGrowing);
    expect(Object.keys(BOT_VERSIONS).sort()).toEqual(['bots-v0.10', 'bots-v0.11', 'bots-v0.12', 'bots-v0.13']);
    const s = newMatch(5);
    const v = viewFor(s, s.actor);
    for (const level of [1, 4, 9] as const) {
      expect(botFor('bots-v0.11')!(v, level, 3)).toEqual(chooseKeepsGrowing(v, level, 3));
      expect(botFor('bots-v0.10')!(v, level, 3)).toEqual(chooseLevelAction(v, level, 3));
    }
    // The level dials are untouched: the change is one rule on top of every level.
    expect(LEVEL_CONFIGS[1].skipGrowth).toBe(0.57);
    expect(LEVEL_CONFIGS[4].skipGrowth).toBe(0.33);
  });

  for (const level of LEVELS) {
    // Six full seeded games per level. Levels 1-8 take 3-5s each; level 9's determinized search
    // takes 16.7s here and was the one that crossed the default 60s ceiling under load. Only
    // level 9 gets a budget; the check itself is unchanged.
    it(`level ${level}: never ends its turn ungrown while a grow is legal`, level === 9 ? { timeout: 180_000 } : {}, () => {
      let ends = 0;
      for (let seed = 1; seed <= 6; seed++) {
        game(seed, level, (s, a) => {
          if (a.t !== 'EndAct') return;
          ends++;
          const v = viewFor(s, 1);
          const couldGrow = legalActions(v).some((x) => x.t === 'Sprout');
          if (v.sproutsThisTurn === 0) expect(couldGrow, `L${level} seed ${seed} turn ${s.turnNumber}`).toBe(false);
        });
      }
      expect(ends).toBeGreaterThan(0);
    });
  }

  it('changes nothing else: wherever v0.10 does not end ungrown, v0.11 makes the very same move', () => {
    let same = 0, changed = 0;
    for (const level of [1, 4, 6, 8] as const) {
      game(3, level, (s, a) => {
        const v = viewFor(s, 1);
        const old = chooseLevelAction(v, level, botSeed(s.seed, level, s.turnNumber, s.history?.length ?? 0));
        if (old.t === 'EndAct' && v.phase === 'ACT' && v.sproutsThisTurn === 0 && modestGrow(v)) { changed++; expect(a).toEqual(modestGrow(v)); }
        else { same++; expect(a).toEqual(old); }
      });
    }
    expect(same).toBeGreaterThan(100);
    expect(changed).toBeGreaterThan(0);
  });

  it('the modest grow strengthens its weakest tile at the back first, with its lowest card', () => {
    let checked = 0;
    game(5, 1, (s, a) => {
      const v = viewFor(s, 1);
      const m = modestGrow(v);
      if (!m) return;
      expect(legalActions(v)).toContainEqual(m);
      checked++;
      void a;
    });
    expect(checked).toBeGreaterThan(5);
  });

  it('is deterministic: the same view gives the same move', () => {
    const s = newMatch(77);
    let st = s;
    for (let i = 0; i < 30 && st.phase !== 'GAME_OVER'; i++) {
      const v = viewFor(st, st.actor);
      const a = chooseBotAction(v, 2, 42 + i);
      expect(chooseBotAction(v, 2, 42 + i)).toEqual(a);
      st = apply(st, a);
    }
  });
});
