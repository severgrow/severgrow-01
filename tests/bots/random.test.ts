import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { createRandomBot } from '../../src/bots/RandomBot.js';

describe('RandomBot (spec 16)', () => {
  it('only plays legal actions and finishes games', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const bots = [createRandomBot(seed), createRandomBot(seed + 1000)];
      let s = newGame(seed);
      for (let i = 0; i < 5000 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        const a = bots[s.actor]!.chooseAction(v);
        expect(legalActions(v)).toContainEqual(a);
        s = apply(s, a);
      }
      expect(s.phase).toBe('GAME_OVER');
    }
  });

  it('is seeded: the same seed makes the same choices', () => {
    const v = viewFor(newGame(3), 0);
    const a = createRandomBot(7);
    const b = createRandomBot(7);
    for (let i = 0; i < 50; i++) expect(a.chooseAction(v)).toEqual(b.chooseAction(v));
  });

  it('is roughly uniform over the legal actions', () => {
    const v = viewFor(newGame(3), 0); // DRAW: deck or discard
    const counts = { deck: 0, discard: 0 };
    const bot2 = createRandomBot(12);
    for (let i = 0; i < 2000; i++) {
      const a = bot2.chooseAction(v);
      if (a.t === 'Draw') counts[a.from]++;
    }
    expect(counts.deck).toBeGreaterThan(900);
    expect(counts.discard).toBeGreaterThan(900);
  });
});
