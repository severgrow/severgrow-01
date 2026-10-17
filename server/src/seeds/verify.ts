import { apply, newMatch, viewFor } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { botSeed } from '../../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { ALTERNATE_OPENINGS, campaignLevelById, campaignOpening } from '../../../src/campaign/index.js';

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

export const verifyCampaignProof = (levelId: string, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION): VerifiedOffline | null => {
  const level = campaignLevelById(levelId);
  if (!level) return null;
  // The level's CURRENT opening first. Then the alternate one: since 2026-10-17 both the released
  // campaign and the /2/ onboarding line are live against this single Edge function, and they play
  // levels 4-10 on different boards. See src/campaign/frozen.ts.
  const current = verifyOfflineMatch(campaignOpening(level), level.botLevel, { actions, botVersion });
  if (current) return current;
  const alternate = ALTERNATE_OPENINGS[level.id];
  if (!alternate) return null;
  return verifyOfflineMatch(newMatch(level.seed, { ...level.config, ...alternate }), level.botLevel, { actions, botVersion });
};

export const verifyTrainingProof = (seed: number, botLevel: number, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION): VerifiedOffline | null =>
  verifyOfflineMatch(newMatch(seed), botLevel, { actions, botVersion });
