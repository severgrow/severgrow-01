import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, campaignOpening } from '../../src/campaign/index.js';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { playLevelGame } from '../../src/sim/level-game.js';

describe('progressive Levels remain ordinary completable engine matches', () => {
  for (const level of CAMPAIGN_LEVELS.slice(0, 20)) {
    it(`Level ${level.number} reaches a genuine result without a teaching gate`, () => {
      const opening = campaignOpening(level);
      expect(opening.config.board?.cells).toHaveLength(level.number <= 10 ? 19 : 37);
      const result = playLevelGame(level.seed, [Math.min(level.botLevel + 2, 9) as typeof level.botLevel, level.botLevel], level.config);
      expect(result.state.phase).toBe('GAME_OVER');
      expect(result.state.result).toBeTruthy();
      expect(result.turns).toBeGreaterThan(0);
    });
  }

  it('the Bloom lesson has an ordinary legal combination in its opening hand', () => {
    const level = CAMPAIGN_LEVELS[8]!;
    const opening = campaignOpening(level);
    expect(opening.hands[0].length).toBeGreaterThanOrEqual(3);
    // The action becomes playable after Draw; it does not rely on a scripted UI permission.
    expect(legalActions(viewFor(opening, opening.actor)).some(action => action.t === 'Draw')).toBe(true);
  });

  it('the strength, sever and Bomb lessons have attainable legal moments', () => {
    for (const number of [5, 7, 8]) {
      const level = CAMPAIGN_LEVELS[number - 1]!;
      let state = campaignOpening(level);
      let strength = false;
      let bomb = false;
      for (let step = 0; state.phase !== 'GAME_OVER' && step < 1000; step++) {
        const view = viewFor(state, state.actor);
        const legal = legalActions(view);
        if (state.actor === 0) {
          strength ||= legal.some(action => action.t === 'Sprout' && view.board[`${action.coord.q},${action.coord.r}`]?.owner === 0);
          bomb ||= legal.some(action => action.t === 'PlayFruit');
        }
        const tier = state.actor === 0 ? Math.min(level.botLevel + 2, 9) as typeof level.botLevel : level.botLevel;
        const action = chooseLevelAction(view, tier, botSeed(state.seed, tier, state.turnNumber, state.history?.length ?? 0));
        state = apply(state, action);
      }
      if (number === 5) expect(strength).toBe(true);
      if (number === 7) expect(state.history?.some(event => event.t === 'Sever' && event.player === 0)).toBe(true);
      if (number === 8) expect(bomb).toBe(true);
    }
  });
});
