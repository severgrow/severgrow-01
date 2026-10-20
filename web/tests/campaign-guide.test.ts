import { describe, expect, it } from 'vitest';
import { campaignOpening, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { campaignCue, campaignGuidanceBand, invalidCampaignHex } from '../src/logic/campaign-guide.js';
import { parseSettings } from '../src/logic/settings.js';

const moment = (number: number) => {
  const level = CAMPAIGN_LEVELS[number - 1]!;
  let state = campaignOpening(level);
  for (let i = 0; state.actor === 1 && state.phase !== 'GAME_OVER' && i < 12; i++) {
    const action = chooseLevelAction(viewFor(state, 1), level.botLevel,
      botSeed(state.seed, level.botLevel, state.turnNumber, state.history?.length ?? 0));
    state = apply(state, action);
  }
  const view = viewFor(state, 0);
  return { state, view, legal: legalActions(view) };
};

describe('level guidance derives from authoritative legal state', () => {
  it('fades through the requested bands and can be disabled without changing a move', () => {
    expect([1, 4, 8, 11, 16].map(campaignGuidanceBand)).toEqual(['high', 'medium', 'targeted', 'low', 'optional']);
    const start = moment(1);
    expect(campaignCue({ level: 1, enabled: true, ...start, cardSelected: false, kindSelected: false })).toEqual({ text: 'DRAW A CARD', focus: 'deck' });
    expect(campaignCue({ level: 1, enabled: false, ...start, cardSelected: false, kindSelected: false }).text).toBe('');
    expect(campaignCue({ level: 16, enabled: true, ...moment(16), cardSelected: false, kindSelected: false }).text).toBe('');
    expect(parseSettings('{"guidedLevels":false}').guidedLevels).toBe(false);
    expect(parseSettings(null).guidedLevels).toBe(true);
  });

  it('moves from Draw to actual Grow targets without constraining alternative legal moves', () => {
    const start = moment(1);
    const draw = start.legal.find(action => action.t === 'Draw')!;
    const state = apply(start.state, draw);
    const view = viewFor(state, 0);
    const legal = legalActions(view);
    const sprouts = legal.filter(action => action.t === 'Sprout');
    expect(sprouts.length).toBeGreaterThan(1);
    expect(apply(state, sprouts[0]!).board).not.toEqual(apply(state, sprouts.at(-1)!).board);
    expect(campaignCue({ level: 1, enabled: true, state, view, legal, cardSelected: false, kindSelected: false }).focus).toBe('hand');
    expect(campaignCue({ level: 1, enabled: true, state, view, legal, cardSelected: true, kindSelected: false }).focus).toBe('targets');
    expect(invalidCampaignHex({ state: start.state, view: start.view, legal: start.legal, key: '0,0', selected: false })).toBe('DRAW FIRST');
  });

  it('explains a rock only when it exists and does not invent a legal Bomb or Bloom', () => {
    const opening = moment(12);
    const state = apply(opening.state, opening.legal.find(action => action.t === 'Draw')!);
    const view = viewFor(state, 0);
    const legal = legalActions(view);
    expect(invalidCampaignHex({ state, view, legal, key: '-2,0', selected: true })).toBe('BLOCKED BY ROCK');
    expect(moment(8).view.hand.some(card => card.suit === null)).toBe(true);
    expect(campaignCue({ level: 8, enabled: true, ...moment(8), cardSelected: false, kindSelected: false }).text).toBe('');
    const bloomStart = moment(9);
    const bloomState = apply(bloomStart.state, bloomStart.legal.find(action => action.t === 'Draw')!);
    const bloomView = viewFor(bloomState, 0);
    const bloomLegal = legalActions(bloomView);
    expect(bloomLegal.some(action => action.t === 'Bloom')).toBe(true);
    expect(campaignCue({ level: 9, enabled: true, state: bloomState, view: bloomView, legal: bloomLegal, cardSelected: false, kindSelected: false }).focus).toBe('bloom');
  });
});
