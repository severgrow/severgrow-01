import { describe, expect, it } from 'vitest';
import { MAX_TURNS, runPropertyGame } from '../../src/sim/invariants.js';

// Section 15. `npm run check` runs a few hundred games; `npm run properties` runs 10,000+.
const GAMES = Number(process.env.PROPERTY_GAMES ?? 300);
const GREEDY_GAMES = Number(process.env.PROPERTY_GREEDY_GAMES ?? 40);

describe(`property games (${GAMES} RandomBot games, section 15 invariants after every action)`, () => {
  it('no invariant ever fails', () => {
    let actions = 0;
    for (let seed = 1; seed <= GAMES; seed++) {
      const r = runPropertyGame(seed);
      actions += r.actions.length;
      expect(r.state.phase).toBe('GAME_OVER');
    }
    expect(actions).toBeGreaterThan(GAMES * 20);
  }, 600_000);

  it('also holds with corner roots and other configs', () => {
    for (const config of [{ rootStyle: 'corner' as const }, { copiesPerCard: 1 }, { fruitCardCount: 6 }, { knockGivesFinalTurn: false }]) {
      for (let seed = 1; seed <= 25; seed++) expect(runPropertyGame(seed, config).state.phase).toBe('GAME_OVER');
    }
  }, 600_000);
});

describe(`GreedyBot property games (${GREEDY_GAMES} games, at most ${MAX_TURNS.greedy} turns)`, () => {
  it('no invariant ever fails', () => {
    for (let seed = 1; seed <= GREEDY_GAMES; seed++) {
      expect(runPropertyGame(seed, {}, { bot: 'greedy' }).state.phase).toBe('GAME_OVER');
    }
  }, 600_000);
});
