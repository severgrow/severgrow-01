// Bot versions (bots-v0.11): the rivals (10-12) arrived, and bots 1-9 did not change (pinned by
// levels-frozen.test.ts). So a Training ticket or a Campaign proof issued under bots-v0.10 must
// still verify after the deploy, and must never be able to name a rival, which v0.10 did not have.
import { describe, expect, it } from 'vitest';
import { newMatch, viewFor } from '../../src/engine/index.js';
import { BOT_VERSIONS, CURRENT_BOT_VERSION, botFor } from '../../src/bots/versions.js';
import { BOT_LEVELS, chooseLevelAction, isBotLevel, ladderLevel } from '../../src/bots/levels.js';

describe('bot versions', () => {
  it('the current version is bots-v0.11, and it plays the rivals', () => {
    expect(CURRENT_BOT_VERSION).toBe('bots-v0.11');
    const s = newMatch(1);
    const v = viewFor(s, s.actor);
    for (const level of [10, 11, 12] as const) expect(() => botFor(CURRENT_BOT_VERSION)!(v, level, 7)).not.toThrow();
  });

  it('bots-v0.10 is still accepted and makes exactly the moves it always made (levels 1-9)', () => {
    expect(Object.keys(BOT_VERSIONS).sort()).toEqual(['bots-v0.10', 'bots-v0.11']);
    const old = botFor('bots-v0.10')!;
    let s = newMatch(42);
    const v = viewFor(s, s.actor);
    for (const level of [1, 5, 7, 8, 9] as const) expect(old(v, level, 99)).toEqual(chooseLevelAction(v, level, 99));
    s = newMatch(43);
    expect(old(viewFor(s, s.actor), 9, 5)).toEqual(chooseLevelAction(viewFor(s, s.actor), 9, 5));
  });

  it('bots-v0.10 never plays a rival: a proof that claims one is refused', () => {
    const s = newMatch(1);
    const v = viewFor(s, s.actor);
    for (const level of [10, 11, 12] as const) expect(() => botFor('bots-v0.10')!(v, level, 7)).toThrow(/bots-v0.10/);
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
