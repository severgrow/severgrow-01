// Golden games. The v0.4 games replay byte-for-byte on the previous rules version
// (v0.4-defaults-2) with the frozen bots-v0.5: the v0.5 code with Fruit and Strengthen off is
// identical to the old game. (Fields added in v0.5 are left out, and the two fields removed
// with the opening guarantee are put back at their old fixed values, before hashing.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, RULES_VERSIONS, apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot as GreedyV05 } from '../../src/bots/v05/GreedyBot.js';
import { stateHash } from '../hash.js';

type Golden = { seed: number; actions: Action[]; stateHash: string; historyHash: string };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/golden-v04.json', import.meta.url), 'utf8')) as { games: Golden[] };

const V05_CONFIG_KEYS = ['unbiasedShuffle', 'allowStrengthen', 'strengthenLimitPerGame', 'fruitSacrifice', 'fruitOnlyWhenBehind'];
const asV04 = (s: State) => {
  const { history: _h, strengthenUsed: _s, ...rest } = s;
  const config: Record<string, unknown> = { ...s.config, guaranteeOpeningMeld: false };
  for (const k of V05_CONFIG_KEYS) delete config[k];
  return { ...rest, config, dealAttempt: 0 };
};

describe('golden games', () => {
  it('the card and Sprout defaults are the ones chosen in Part 4 (cards 1-9, Sprout on, 2 copies)', () => {
    expect(DEFAULT_CONFIG).toMatchObject({ maxRank: 9, sproutsPerTurn: 1, copiesPerCard: 2 });
  });

  it('has 5 recorded v0.4 games', () => expect(fixture.games.map((g) => g.seed)).toEqual([1, 2, 3, 4, 5]));

  for (const g of fixture.games) {
    it(`v0.4 seed ${g.seed}: on rules v0.4-defaults-2 the replay is byte-identical, and the frozen bot picks the same moves`, () => {
      let s: State = newGame(g.seed, RULES_VERSIONS['v0.4-defaults-2']);
      for (const a of g.actions) {
        expect(GreedyV05.chooseAction(viewFor(s, s.actor))).toEqual(a);
        s = apply(s, a);
      }
      expect(s.phase).toBe('GAME_OVER');
      expect(stateHash(asV04(s))).toBe(g.stateHash);
      expect(stateHash(s.history)).toBe(g.historyHash);
    });
  }
});
