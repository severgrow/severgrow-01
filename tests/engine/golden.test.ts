// Eight archived GreedyBot games keep the exact frozen Test2 rules and final-state hashes.
// They remain regression fixtures; the Futasaku 0.3 default has unlimited Strengthen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREVIOUS_RULES_VERSION, apply, newGame, rulesConfig, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { stateHash } from '../hash.js';

type Golden = { seed: number; actions: Action[]; stateHash: string; historyHash: string };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/golden.json', import.meta.url), 'utf8')) as { rules: string; games: Golden[] };

describe('golden games', () => {
  it('were recorded on the frozen Test2 rules version, 8 games', () => {
    expect(fixture.rules).toBe(PREVIOUS_RULES_VERSION);
    expect(fixture.games.map((g) => g.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  for (const g of fixture.games) {
    it(`seed ${g.seed}: Test2 rules replay byte-identically, and GreedyBot picks the same moves`, () => {
      let s: State = newGame(g.seed, rulesConfig(fixture.rules)!);
      for (const a of g.actions) {
        expect(GreedyBot.chooseAction(viewFor(s, s.actor))).toEqual(a);
        s = apply(s, a);
      }
      expect(s.phase).toBe('GAME_OVER');
      const { history, ...rest } = s;
      // Keep Main's original fixtures. Only disabled Lab metadata is normalized.
      expect(rest.config.board).toBeNull();
      expect(rest.config.reshuffleDiscard).toBe(false);
      const { board, reshuffleDiscard, ...classicConfig } = rest.config;
      expect(stateHash({ ...rest, config: classicConfig })).toBe(g.stateHash);
      expect(stateHash(history)).toBe(g.historyHash);
    });
  }
});
