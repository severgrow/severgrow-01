// Golden games: 8 GreedyBot-vs-GreedyBot games on the current default rules, recorded with
// their final-state hashes. Any accidental rules or bot change breaks these. Re-record
// (tests/fixtures/make-golden.ts) ONLY when the rules are changed on purpose.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { stateHash } from '../hash.js';

type Golden = { seed: number; actions: Action[]; stateHash: string; historyHash: string };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/golden.json', import.meta.url), 'utf8')) as { rules: string; games: Golden[] };

describe('golden games', () => {
  it('were recorded on the current rules version, 8 games', () => {
    expect(fixture.rules).toBe(CURRENT_RULES_VERSION);
    expect(fixture.games.map((g) => g.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  for (const g of fixture.games) {
    it(`seed ${g.seed}: the default rules replay byte-identically, and GreedyBot picks the same moves`, () => {
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
