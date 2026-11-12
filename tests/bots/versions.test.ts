// Bot versions (bots-v0.12): the rivals (10-12) arrived on top of bots-v0.11 (keeps-growing), and
// levels 1-9 did not change (levels-frozen.test.ts). Proofs issued under v0.10 or v0.11 must still
// verify after the deploy, and must never be able to name a rival, which neither version had.
import { describe, expect, it } from 'vitest';
import { newMatch, viewFor } from '../../src/engine/index.js';
import { BOT_VERSIONS, CURRENT_BOT_VERSION, PREVIOUS_BOT_VERSION, botFor, chooseBotAction } from '../../src/bots/versions.js';
import { BOT_LEVELS, chooseLevelAction, isBotLevel, ladderLevel } from '../../src/bots/levels.js';
import { chooseKeepsGrowing } from '../../src/bots/keeps-growing.js';

describe('bot versions', () => {
  it('the current version is bots-v0.13, it plays the rivals, and the game plays it', () => {
    expect(CURRENT_BOT_VERSION).toBe('bots-v0.13');
    expect(PREVIOUS_BOT_VERSION).toBe('bots-v0.12');
    expect(chooseBotAction).toBe(chooseKeepsGrowing);
    const s = newMatch(1);
    const v = viewFor(s, s.actor);
    for (const level of [10, 11, 12] as const) expect(() => botFor(CURRENT_BOT_VERSION)!(v, level, 7)).not.toThrow();
  });

  it('v0.10 and v0.11 stay accepted and make exactly the moves they always made (levels 1-9)', () => {
    expect(Object.keys(BOT_VERSIONS).sort()).toEqual(['bots-v0.10', 'bots-v0.11', 'bots-v0.12', 'bots-v0.13']);
    for (const seed of [42, 43]) {
      const s = newMatch(seed);
      const v = viewFor(s, s.actor);
      for (const level of [1, 5, 7, 8, 9] as const) {
        expect(botFor('bots-v0.10')!(v, level, 99)).toEqual(chooseLevelAction(v, level, 99));
        expect(botFor('bots-v0.11')!(v, level, 99)).toEqual(chooseKeepsGrowing(v, level, 99));
        expect(botFor('bots-v0.12')!(v, level, 99)).toEqual(chooseKeepsGrowing(v, level, 99));
        expect(botFor('bots-v0.13')!(v, level, 99)).toEqual(chooseKeepsGrowing(v, level, 99));
      }
    }
  });

  it('neither older version ever plays a rival: a proof that claims one is refused', () => {
    const s = newMatch(1);
    const v = viewFor(s, s.actor);
    for (const version of ['bots-v0.10', 'bots-v0.11']) {
      for (const level of [10, 11, 12] as const) expect(() => botFor(version)!(v, level, 7)).toThrow(new RegExp(version));
    }
  });

  it('an unknown version has no bot', () => {
    expect(botFor('bots-v0.9')).toBeNull();
    expect(botFor('toString')).toBeNull();
  });

  it('the rivals are bots 10-12, and the game shows and counts them as level 9', () => {
    expect([...BOT_LEVELS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([0, 13, 1.5, Number.NaN].some(isBotLevel)).toBe(false);
    expect([10, 11, 12].map((l) => ladderLevel(l as 10))).toEqual([9, 9, 9]);
    expect([1, 7, 9].map((l) => ladderLevel(l as 1))).toEqual([1, 7, 9]);
  });
});
