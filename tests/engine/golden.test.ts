// Golden games (v0.4 defaults): replaying the recorded moves must give exactly the
// recorded final state, and GreedyBot must still choose exactly those moves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { stateHash } from '../hash.js';

type Golden = { seed: number; actions: Action[]; stateHash: string; historyHash: string };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/golden-v04.json', import.meta.url), 'utf8')) as { games: Golden[] };

describe('golden games on the default rules', () => {
  it('the defaults are the ones chosen in Part 4 (cards 1-9, Sprout on, 2 copies), with a plain random deal (no combo guarantee)', () => {
    expect(DEFAULT_CONFIG).toMatchObject({ maxRank: 9, sproutsPerTurn: 1, guaranteeOpeningMeld: false, copiesPerCard: 2 });
  });

  it('has 5 recorded games', () => expect(fixture.games.map((g) => g.seed)).toEqual([1, 2, 3, 4, 5]));

  for (const g of fixture.games) {
    it(`seed ${g.seed}: replay gives the recorded final state, and GreedyBot picks the same moves`, () => {
      let s: State = newGame(g.seed);
      for (const a of g.actions) {
        expect(GreedyBot.chooseAction(viewFor(s, s.actor))).toEqual(a);
        s = apply(s, a);
      }
      expect(s.phase).toBe('GAME_OVER');
      const { history, ...rest } = s;
      expect(stateHash(rest)).toBe(g.stateHash);
      expect(stateHash(history)).toBe(g.historyHash);
    });
  }
});
