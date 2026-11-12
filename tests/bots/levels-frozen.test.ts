// Bots 1-9 are FROZEN. The rival bots (10-12) were added beside them, and outstanding Training
// tickets and Campaign proofs are re-played with the bot version they were issued under
// (`src/bots/versions.ts`). So every decision bots 1-9 make must stay byte-identical: this test
// pins a hash of their choices over a fixed set of real positions, on the classic generated board
// and on two authored campaign boards (the authored-board search caps are part of what is pinned).
//
// The hashes below were recorded on the code BEFORE bots 10-12 existed (bots-v0.10). If this test
// fails, a change has altered bots 1-9; that needs a new bot version, not a new hash.
import { describe, expect, it } from 'vitest';
import { apply, newMatch, viewFor } from '../../src/engine/index.js';
import type { RulesConfig, View } from '../../src/engine/index.js';
import { RIVAL_CONFIGS, RIVAL_CONFIGS_V012, botSeed, chooseLevelAction, chooseLevelActionV012 } from '../../src/bots/levels.js';
import type { BotLevel } from '../../src/bots/levels.js';
import { campaignLevelByNumber } from '../../src/campaign/index.js';
import { stateHash } from '../hash.js';

/** Views met along a level-7 vs level-7 game: every `every`-th decision, up to `max`. */
const positions = (seed: number, config: Partial<RulesConfig>, every: number, max: number): View[] => {
  let s = newMatch(seed, config);
  const out: View[] = [];
  for (let i = 0; s.phase !== 'GAME_OVER' && out.length < max; i++) {
    const v = viewFor(s, s.actor);
    if (i % every === 0) out.push(v);
    s = apply(s, chooseLevelAction(v, 7, botSeed(s.seed, 7, s.turnNumber, s.history?.length ?? 0)));
  }
  return out;
};

const board = (n: number) => campaignLevelByNumber(n)!.config;
const SETS: Array<{ name: string; views: View[] }> = [
  { name: 'classic', views: [...positions(4101, {}, 2, 30), ...positions(4102, {}, 2, 30), ...positions(4103, {}, 2, 30)] },
  { name: 'campaign 40', views: positions(96040, board(40), 2, 30) },
  { name: 'campaign 70', views: positions(96070, board(70), 2, 30) },
];

const choices = (level: BotLevel, views: readonly View[], choose = chooseLevelAction) =>
  views.map((v, i) => choose(v, level, botSeed(v.turnNumber * 31 + i, level, v.turnNumber, i)));

// Recorded on bots-v0.10 (before bots 10-12). Order: levels 1..9.
const FROZEN: Record<string, readonly string[]> = {
  classic: ['1681ec8bf61529f2', '30a450a70bddb557', 'f9b867df0d20e834', '7db1bb0750f87ff1', 'ef4f65936b118135', '5fedf0837e296b29', 'a3570a67ea2fc252', '83dcce39d0b2a2ce', '6669c9e6057a4621'],
  'campaign 40': ['4a1dc01e79204f9b', '55818123c81b7730', '41e43880c6e9cd8f', '8a79a054dc14b33d', '1fa3770ef9ef632c', '765553914ff1c840', 'e083e01e1a7823db', '3569286553d43136', '3defe1647e625c48'],
  'campaign 70': ['4f4e8f74d2360248', '2792c7022584e54f', '4cef89862e264dbd', '3e17696258f47dac', '7347b7fee2436ae8', '5e1964affac6a29c', 'c0f2b37eaa096d49', 'b21d4030b2dd6b71', '7b4c61d881d33d4a'],
};

describe('bots 1-9 are frozen (byte-identical to bots-v0.10)', () => {
  for (const set of SETS) {
    it(`${set.name}: ${set.views.length} positions, every level 1-9 makes the same choices`, () => {
      const got = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((l) => stateHash(choices(l, set.views)).slice(0, 16));
      if (process.env.PRINT_FROZEN) console.log(`FROZEN ${set.name} ${JSON.stringify(got)}`);
      expect(got).toEqual(FROZEN[set.name]);
    }, 120_000);
  }
});

// The rivals are pinned the same way: a campaign proof on levels 74-100 is replayed against them, so a
// change to what they choose needs a new bot version, not a new hash. Order: 10, 11, 12.
// bots-v0.12 (recorded 2026-11-12, frozen as RIVAL_CONFIGS_V012):
const RIVALS_FROZEN: Record<string, readonly string[]> = {
  'campaign 40': ['8085bb334df2a11e', '60d49a82d8cdee4d', 'c78bbf984f083a0e'],
  'campaign 70': ['ca9e0c788c55660e', 'ae89520f8449ffa5', '764ae28ad559a4eb'],
};

// bots-v0.13 (recorded 2026-11-12): the same rivals at level 9's search cost.
const RIVALS_V013: Record<string, readonly string[]> = {
  'campaign 40': ['994767a90568025c', '7d10df0a5d4e801f', 'd12392e72b888f21'],
  'campaign 70': ['852a55252770176b', 'cbfdad3956fb36fb', '0941243d1cb2a507'],
};

describe('the rivals are frozen too', () => {
  for (const set of SETS.filter((x) => x.name !== 'classic')) {
    it(`${set.name}: bots-v0.12's rivals still make the same choices`, () => {
      const got = ([10, 11, 12] as const).map((l) => stateHash(choices(l, set.views.slice(0, 16), chooseLevelActionV012)).slice(0, 16));
      expect(got).toEqual(RIVALS_FROZEN[set.name]);
    }, 120_000);
    it(`${set.name}: bots-v0.13's rivals make the same choices`, () => {
      const got = ([10, 11, 12] as const).map((l) => stateHash(choices(l, set.views.slice(0, 16))).slice(0, 16));
      if (process.env.PRINT_FROZEN) console.log(`RIVALS13 ${set.name} ${JSON.stringify(got)}`);
      expect(got).toEqual(RIVALS_V013[set.name]);
    }, 120_000);
  }

  it('the three rivals have three different ways of playing, and now search like level 9', () => {
    expect(new Set([10, 11, 12].map((l) => RIVAL_CONFIGS[l as 10].style))).toEqual(new Set(['fortress', 'siege', 'patient']));
    for (const l of [10, 11, 12] as const) {
      expect(RIVAL_CONFIGS[l].fullSearch, String(l)).toBeUndefined();
      expect(RIVAL_CONFIGS[l].candidates, String(l)).toBeUndefined();
      expect(RIVAL_CONFIGS[l].searchIterations, String(l)).toBe(6);
      expect(RIVAL_CONFIGS_V012[l].fullSearch, String(l)).toBe(true);
    }
  });
});
