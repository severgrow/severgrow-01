// Campaign learning is presentation over the ordinary engine. Every cue below is derived from
// the current phase and legal actions; it never gates input or manufactures a move.
import type { Action, State, View } from '../../../src/engine/index.js';

export type CampaignFocus = 'deck' | 'hand' | 'targets' | 'bloom' | 'bomb' | 'none';
export type CampaignCue = { text: string; focus: CampaignFocus };
export const NO_CAMPAIGN_CUE: CampaignCue = { text: '', focus: 'none' };

export const campaignGuidanceBand = (level: number): 'high' | 'medium' | 'targeted' | 'low' | 'optional' =>
  level <= 3 ? 'high' : level <= 7 ? 'medium' : level <= 10 ? 'targeted' : level <= 15 ? 'low' : 'optional';

/** This is a learning objective, not a promise that one forced move will occur. */
export const CAMPAIGN_LESSONS: Readonly<Record<number, string>> = Object.freeze({
  1: 'Draw, Grow, Throw', 2: 'Repeat the turn', 3: 'Choose a legal path',
  4: 'Keep territory connected', 5: 'Strengthen a tile', 6: 'Defend a connection',
  7: 'Cut an opposing link', 8: 'Use a Bomb', 9: 'Make a Bloom',
  10: 'Gold scores twice', 11: 'Explore the larger board', 12: 'Rocks block routes',
  13: 'Find another route', 14: 'Contest valuable ground', 15: 'Combine your options',
  16: 'Play independently', 17: 'React to the opponent', 18: 'Adapt to new terrain',
  19: 'Use everything learned', 20: 'Master the fundamentals',
});

const cue = (text: string, focus: CampaignFocus): CampaignCue => ({ text, focus });

/** One current, truthful cue. A choice that has already been demonstrated stops asking for it. */
export const campaignCue = (input: {
  level: number; enabled: boolean; state: State; view: View;
  legal: readonly Action[]; cardSelected: boolean; kindSelected: boolean;
}): CampaignCue => {
  const { level, enabled, state, view, legal, cardSelected, kindSelected } = input;
  if (!enabled || level > 20 || state.actor !== 0 || state.phase === 'GAME_OVER') return NO_CAMPAIGN_CUE;
  const band = campaignGuidanceBand(level);
  if (band === 'optional') return NO_CAMPAIGN_CUE;
  const seen = (type: string) => state.history?.some(event => event.t === type && 'player' in event && event.player === 0) ?? false;
  if (band === 'high') {
    if (view.phase === 'DRAW') return cue('DRAW A CARD', 'deck');
    if (view.phase === 'DISCARD') return cue('TAP A CARD TO THROW', 'hand');
    if (view.phase === 'ACT') {
      if (cardSelected || kindSelected) return cue('TAP A GLOWING HEX', 'targets');
      if (legal.some(action => action.t === 'Sprout')) return cue(level === 1 ? 'GROW FROM YOUR TREE' : 'CHOOSE A CARD TO GROW', 'hand');
      return cue('NO GROW? USE SKIP', 'none');
    }
  }
  if (view.phase !== 'ACT') return NO_CAMPAIGN_CUE;
  if (level === 5 && !seen('Strengthen') && legal.some(action => action.t === 'Sprout' && view.board[`${action.coord.q},${action.coord.r}`]?.owner === 0)) {
    return cardSelected ? cue('STRENGTHEN YOUR TILE', 'targets') : cue('HIGHER CARD STRENGTHENS', 'hand');
  }
  if (level === 7 && !seen('Overgrow') && legal.some(action => action.t === 'Sprout' && view.board[`${action.coord.q},${action.coord.r}`]?.owner === 1)) {
    return cardSelected ? cue('TAKE THEIR LINK', 'targets') : cue('TAKE THEIR LINK', 'hand');
  }
  if (cardSelected || kindSelected) return cue('TAP A GLOWING HEX', 'targets');
  if (level === 4 && !seen('Sprout')) return cue('KEEP GROWTH CONNECTED', 'hand');
  if (level === 6 && state.turnNumber < 5) return cue('KEEP YOUR LINK STRONG', 'hand');
  if (level === 8 && !seen('FruitCard') && legal.some(action => action.t === 'PlayFruit')) return cue('BOMB A TOUCHING ENEMY TILE', 'bomb');
  if (level === 9 && !seen('Bloom') && legal.some(action => action.t === 'Bloom')) return cue('THREE CARDS. ONE BLOOM.', 'bloom');
  if (level === 10 && state.turnNumber < 5) return cue('GOLD TILES COUNT TWICE', 'none');
  if (level === 11 && state.turnNumber < 3) return cue('THE FIELD IS BIGGER NOW', 'none');
  if (level === 12 && state.turnNumber < 5) return cue('ROCKS BLOCK GROWTH', 'none');
  if (level === 13 && state.turnNumber < 5) return cue('FIND A WAY AROUND', 'none');
  if (level === 14 && state.turnNumber < 5) return cue('GOLD IS WORTH TWO', 'none');
  if (level === 15 && state.turnNumber < 5) return cue('GROW OR STRENGTHEN', 'none');
  return NO_CAMPAIGN_CUE;
};

/** Why a tapped hex did not accept a move. These are facts from terrain/phase/legal actions. */
export const invalidCampaignHex = (input: {
  state: State; view: View; legal: readonly Action[]; key: string; selected: boolean;
}): string | null => {
  const { state, view, legal, key, selected } = input;
  if (state.actor !== 0) return null;
  if (view.phase === 'DRAW') return 'DRAW FIRST';
  if (view.phase === 'DISCARD') return 'THROW A CARD';
  if (view.phase !== 'ACT') return null;
  if (view.terrain[key] === 'rock') return 'BLOCKED BY ROCK';
  if (!selected) {
    return legal.some(action => action.t === 'Sprout' && `${action.coord.q},${action.coord.r}` === key)
      ? 'PICK A CARD FIRST' : 'CONNECT TO YOUR TREE';
  }
  const tile = view.board[key];
  if (tile?.root) return 'HOME IS PROTECTED';
  if (!tile && !legal.some(action => action.t === 'Sprout' && `${action.coord.q},${action.coord.r}` === key)) return 'CONNECT TO YOUR TREE';
  return 'NOT A LEGAL TARGET';
};
