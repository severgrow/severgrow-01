// A Campaign win is paid only if its actions replay on the level's own opening. When levels 4-10
// moved onto the small map (2026-10-17) the opening changed under proofs that were already earned:
// a proof queued on a device, or one produced by a server bundle built before the change, replays
// the OLD board. These tests pin the archive that keeps those wins payable — and pin that the
// current board still verifies a current win.
import { describe, expect, it } from 'vitest';
import { apply, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, RulesConfig, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { campaignLevelById, campaignOpening, FROZEN_OPENINGS } from '../../src/campaign/index.js';
import { verifyCampaignProof, verifyOfflineMatch } from '../../server/src/seeds/verify.js';

/** The verifier needs the bot version inside the proof; `verifyCampaignProof` supplies its default. */
const proofOf = (actions: readonly Action[]) => ({ actions, botVersion: CURRENT_BOT_VERSION });

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

const changed = Object.keys(FROZEN_OPENINGS);

describe('frozen level openings keep already-earned Seed proofs payable', () => {
  it('archives an opening only for the levels whose terrain changed, and it is the product hexagon', () => {
    expect(changed.sort()).toEqual(['c1-04', 'c1-05', 'c1-06', 'c1-07', 'c1-08', 'c1-09', 'c1-10']);
    for (const id of changed) {
      const frozen = FROZEN_OPENINGS[id]!;
      expect(frozen.boardRadius, id).toBe(3);
      expect(frozen.board.cells, id).toHaveLength(37);
      // The level exists and its CURRENT board is the smaller one.
      expect(campaignLevelById(id)!.config.boardRadius, id).toBe(2);
    }
  });

  it('a win recorded on the frozen board still verifies, even though the current board is different', () => {
    const level = campaignLevelById('c1-05')!;
    const frozen = FROZEN_OPENINGS[level.id]!;
    const game = play(level.seed, { ...level.config, ...frozen }, level.botLevel);
    expect(game.end.result?.winner).toBe(0); // the level-9 side beats bot 2

    // Proof that the divergence is real: the same actions do NOT replay on today's small board.
    expect(verifyOfflineMatch(campaignOpening(level), level.botLevel, proofOf(game.actions))).toBeNull();
    // And proof of the fix: the campaign verifier falls back to the archived opening.
    expect(verifyCampaignProof(level.id, game.actions)).not.toBeNull();
    expect(verifyCampaignProof(level.id, game.actions)!.winner).toBe(0);
  });

  it('a win recorded on today’s board verifies on the first try (no archive needed)', () => {
    const level = campaignLevelById('c1-06')!;
    const game = play(level.seed, level.config, level.botLevel);
    expect(game.end.result?.winner).toBe(0);
    expect(verifyOfflineMatch(campaignOpening(level), level.botLevel, proofOf(game.actions))).not.toBeNull();
    expect(verifyCampaignProof(level.id, game.actions)).not.toBeNull();
  }, 120_000);

  it('a tampered win is still refused on both openings', () => {
    const level = campaignLevelById('c1-05')!;
    const frozen = FROZEN_OPENINGS[level.id]!;
    const game = play(level.seed, { ...level.config, ...frozen }, level.botLevel);
    // Drop the last action: the log no longer reaches GAME_OVER.
    const short = game.actions.slice(0, -1);
    expect(verifyCampaignProof(level.id, short)).toBeNull();
  });
});
