import { apply, newMatch, viewFor } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { botSeed } from '../../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { campaignLevelById, campaignOpening, legacyCampaignLevelById } from '../../../src/campaign/index.js';

export type OfflineProof = { actions: readonly Action[]; botVersion: string };
export type VerifiedOffline = { winner: 0 | 1 | null; actionCount: number; result: State['result'] };
const MAX_ACTIONS = 1600;

/**
 * Replays human actions against the *actual deterministic bot*, never a browser result flag.
 * No client-supplied opening state, board, hand, difficulty or outcome is accepted.
 */
export const verifyOfflineMatch = (
  opening: State,
  botLevel: number,
  proof: OfflineProof,
): VerifiedOffline | null => {
  if (!Array.isArray(proof.actions) || proof.actions.length < 3 || proof.actions.length > MAX_ACTIONS) return null;
  const bot = botFor(proof.botVersion);
  if (!bot || !Number.isInteger(botLevel) || botLevel < 1 || botLevel > 9) return null;
  let state = opening;
  try {
    for (const action of proof.actions) {
      if (state.phase === 'GAME_OVER') return null;
      if (state.actor === 1) {
        const expected = bot(viewFor(state, 1), botLevel as 1|2|3|4|5|6|7|8|9,
          botSeed(state.seed, botLevel, state.turnNumber, state.history?.length ?? 0));
        if (JSON.stringify(action) !== JSON.stringify(expected)) return null;
      }
      state = apply(state, action);
    }
  } catch {
    return null;
  }
  if (state.phase !== 'GAME_OVER' || !state.result) return null;
  return { winner: state.result.winner, actionCount: proof.actions.length, result: state.result };
};

export const verifyCampaignProof = (levelId: string, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION, openingVersion: 1 | 2 = 1): VerifiedOffline | null => {
  const level = openingVersion === 1 ? legacyCampaignLevelById(levelId) : campaignLevelById(levelId);
  return level ? verifyOfflineMatch(campaignOpening(level), level.botLevel, { actions, botVersion }) : null;
};

export const verifyTrainingProof = (seed: number, botLevel: number, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION): VerifiedOffline | null =>
  verifyOfflineMatch(newMatch(seed), botLevel, { actions, botVersion });
