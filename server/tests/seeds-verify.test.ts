import { describe, expect, it } from 'vitest';
import { campaignOpening, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { apply, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { verifyCampaignProof, verifyOfflineMatch } from '../src/seeds/verify.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { BETA_PAYOUT_MULTIPLIER, campaignSeedReward } from '../src/seeds/config.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord, Storage } from '../src/storage/types.js';

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

describe('level 33 (chapter IV, the owner\'s level) pays its 20 Seeds', () => {
  // Owner report, 2026-10-25: "I'm on level 33 and haven't been getting seeds." Level 33 is a
  // hand-authored board (rock `Outliers`, gold through the centre). This pins BOTH halves: the real
  // game verifies against that exact board, and the 21-40 band pays 20 once, then answers `replayed`.
  //
  // The winning line needs a salt sweep here (unlike an early level): the board is wide open, so the
  // first salt's line is a LOSS. Several salts, first win wins — never a fabricated result.
  const thirtyThree = CAMPAIGN_LEVELS.find((l) => l.number === 33)!;
  // One line, computed once: a genuine game is expensive to play, and the asserts below only read it.
  let cached: Action[] | null = null;
  const winningLine = (): Action[] => {
    if (cached) return cached;
    for (const salt of [0x9e3779b9, 0x1234567, 0x7f4a7c15, 0x2545f491]) {
      let state = campaignOpening(thirtyThree);
      const actions: Action[] = [];
      while (state.phase !== 'GAME_OVER' && actions.length < 400) {
        const actor = state.actor;
        const botLevel = actor === 0 ? 9 : thirtyThree.botLevel;
        const action = chooseLevelAction(viewFor(state, actor), botLevel,
          botSeed(state.seed ^ (actor === 0 ? salt : 0), botLevel, state.turnNumber, state.history?.length ?? 0));
        actions.push(action);
        state = apply(state, action);
      }
      if (state.result?.winner === 0) { cached = actions; return actions; }
    }
    throw new Error('no winning line found on c4-33');
  };

  it('is the hand-authored Outliers board, and a genuine win on it verifies', () => {
    expect(thirtyThree.id).toBe('c4-33');
    expect(thirtyThree.chapter).toBe(4);
    expect(thirtyThree.botLevel).toBe(9);
    expect(thirtyThree.config.board).toBeDefined();
    const actions = winningLine();
    const verified = verifyCampaignProof('c4-33', actions, CURRENT_BOT_VERSION);
    expect(verified?.winner).toBe(0);
    // A cut-short line is not a win, and an unknown bot version cannot claim it.
    expect(verifyCampaignProof('c4-33', actions.slice(0, -1), CURRENT_BOT_VERSION)).toBeNull();
    expect(verifyCampaignProof('c4-33', actions, 'imaginary-bot')).toBeNull();
  });

  it('pays the owner\'s 20 on the first clear and never twice', async () => {
    const player = { id: '00000000-0000-4000-8000-000000000033' } as PlayerRecord;
    const matches = { hitRateLimit: async () => ({ ok: true }) } as unknown as Storage;
    const economy = new WorldEconomyService(new MemoryWorldEconomyStore(), matches);
    // The band's figure is 20; the BETA multiplier scales what is credited, so the two numbers are
    // pinned separately and a revert is one constant (see `BETA_PAYOUT_MULTIPLIER`).
    const paid = 20 * BETA_PAYOUT_MULTIPLIER;
    expect(campaignSeedReward(33)!.firstWin).toBe(20);
    const first = await economy.campaign(player, 'c4-33', winningLine(), CURRENT_BOT_VERSION);
    expect(first.awarded).toBe(paid);
    expect(first.wallet.balance).toBe(paid);
    const again = await economy.campaign(player, 'c4-33', winningLine(), CURRENT_BOT_VERSION);
    expect(again.replayed).toBe(true);
    expect(again.wallet.balance).toBe(paid);
  });
});
