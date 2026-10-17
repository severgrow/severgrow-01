// Two builds now serve the same levels on different boards: the released campaign at
// futasaku.com (levels 4-10 on the 37-hex map) and the onboarding line at /2/ (the same levels on the
// 19-hex map). One Edge function pays both, so a proof from EITHER board must verify — otherwise a
// win on /2/ would be silently refused and the Seeds lost.
import { describe, expect, it } from 'vitest';
import { apply, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, RulesConfig, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import {
  ALTERNATE_OPENINGS,
  CAMPAIGN_LEVELS,
  campaignLevelById,
  campaignOpening,
} from '../../src/campaign/index.js';
import { verifyCampaignProof, verifyOfflineMatch } from '../../server/src/seeds/verify.js';

/** A full deterministic game: the human side plays as level 9, the bot as the level's own bot. */
const play = (seed: number, config: Partial<RulesConfig>, botLevel: number): { end: State; actions: Action[] } => {
  let s = newMatch(seed, config);
  const actions: Action[] = [];
  while (s.phase !== 'GAME_OVER' && actions.length < 1600) {
    const level = s.actor === 1 ? botLevel : 9;
    const action = chooseLevelAction(
      viewFor(s, s.actor),
      level as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      botSeed(s.seed, level, s.turnNumber, s.history?.length ?? 0),
    );
    actions.push(action);
    s = apply(s, action);
  }
  return { end: s, actions };
};

const proofOf = (actions: readonly Action[]) => ({ actions, botVersion: CURRENT_BOT_VERSION });

describe('a level played on two boards pays on both', () => {
  it('records an alternate opening only for the levels the /2/ line plays smaller', () => {
    expect(Object.keys(ALTERNATE_OPENINGS).sort()).toEqual([
      'c1-04', 'c1-05', 'c1-06', 'c1-07', 'c1-08', 'c1-09', 'c1-10',
    ]);
    for (const id of Object.keys(ALTERNATE_OPENINGS)) {
      const alternate = ALTERNATE_OPENINGS[id]!;
      expect(alternate.boardRadius, id).toBe(2);
      expect(alternate.board.cells, id).toHaveLength(19);
      // The released campaign plays these levels on the big map, so the two really do differ.
      expect(campaignLevelById(id)!.config.boardRadius, id).toBe(3);
    }
  });

  it('still pays a win played on the released (large) board', () => {
    const level = campaignLevelById('c1-05')!;
    const game = play(level.seed, level.config, level.botLevel);
    expect(game.end.result?.winner).toBe(0);
    expect(verifyOfflineMatch(campaignOpening(level), level.botLevel, proofOf(game.actions))).not.toBeNull();
    expect(verifyCampaignProof(level.id, game.actions)).not.toBeNull();
  });

  it('pays a win played on the /2/ (small) board through the alternate opening', () => {
    const level = campaignLevelById('c1-05')!;
    const alternate = ALTERNATE_OPENINGS[level.id]!;
    const game = play(level.seed, { ...level.config, ...alternate }, level.botLevel);
    expect(game.end.result?.winner).toBe(0);

    // The divergence is real: the same actions do not replay on the released board.
    expect(verifyOfflineMatch(campaignOpening(level), level.botLevel, proofOf(game.actions))).toBeNull();
    // ...and the campaign verifier still pays it, via the alternate opening.
    expect(verifyCampaignProof(level.id, game.actions)?.winner).toBe(0);
  });

  it('refuses a truncated log on either board', () => {
    const level = campaignLevelById('c1-05')!;
    const alternate = ALTERNATE_OPENINGS[level.id]!;
    const large = play(level.seed, level.config, level.botLevel);
    const small = play(level.seed, { ...level.config, ...alternate }, level.botLevel);
    expect(verifyCampaignProof(level.id, large.actions.slice(0, -1))).toBeNull();
    expect(verifyCampaignProof(level.id, small.actions.slice(0, -1))).toBeNull();
  });

  it('keeps every campaign level reproducible on its current opening', () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(campaignOpening(level).seed, level.id).toBe(level.seed);
    }
  });
});
