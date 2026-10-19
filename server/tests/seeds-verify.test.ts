import { describe, expect, it } from 'vitest';
import { campaignOpening, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { apply, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { verifyCampaignProof, verifyOfflineMatch } from '../src/seeds/verify.js';

const level = CAMPAIGN_LEVELS[0]!;
const genuineWin = (level = CAMPAIGN_LEVELS[0]!): Action[] => {
  let state = campaignOpening(level);
  const actions: Action[] = [];
  while (state.phase !== 'GAME_OVER' && actions.length < 300) {
    const actor = state.actor;
    const botLevel = actor === 0 ? 9 : level.botLevel;
    const action = chooseLevelAction(viewFor(state, actor), botLevel,
      botSeed(state.seed ^ (actor === 0 ? 0x9e3779b9 : 0), botLevel, state.turnNumber, state.history?.length ?? 0));
    actions.push(action);
    state = apply(state, action);
  }
  expect(state.result?.winner).toBe(0);
  return actions;
};

describe('offline replay verification', () => {
  it('accepts a full genuine win and rejects a fabricated result declaration', () => {
    const actions = genuineWin();
    expect(verifyCampaignProof(level.id, actions, CURRENT_BOT_VERSION)?.winner).toBe(0);
    expect(verifyCampaignProof(level.id, actions.slice(0, -1), CURRENT_BOT_VERSION)).toBeNull();
    expect(verifyOfflineMatch(campaignOpening(level), level.botLevel, { actions, botVersion: 'imaginary-bot' })).toBeNull();
  });
  it('rejects changed bot actions and arbitrary client openings', () => {
    const actions = genuineWin();
    const state = campaignOpening(level);
    const botMove = state.actor === 1 ? 0 : actions.findIndex((_, i) => i > 0 && i < 10);
    const altered = [...actions];
    altered[botMove] = { t: 'EndAct' };
    expect(verifyCampaignProof(level.id, altered, CURRENT_BOT_VERSION)).toBeNull();
    expect(verifyCampaignProof('c1-99', actions, CURRENT_BOT_VERSION)).toBeNull();
  });
});

describe('levels 11+ after the /3/ lessons', () => {
  // On /3/, levels 1-10 are authored lessons that pay no Seeds and send no proof. Level 11 and up must
  // be claimable exactly as before, whatever was cleared locally: a proof is checked on its own level.
  it('a genuine level 11 win still verifies on its own opening', () => {
    const eleven = CAMPAIGN_LEVELS.find((l) => l.number === 11)!;
    const actions = genuineWin(eleven);
    expect(verifyCampaignProof(eleven.id, actions, CURRENT_BOT_VERSION)?.winner).toBe(0);
  });
});
