// RETIRED OPENINGS (2026-11-12). Fixing a shipped level — a new board for a duplicate, or a new seed so
// the shipped deal fits the level's role — must never invalidate a win already earned on the old one
// (a proof queued on a device, or produced by a bundle built before the change). Every change keeps
// the opening it replaced, and the verifier still pays a game played on it.
import { describe, expect, it } from 'vitest';
import { apply, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, RulesConfig, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import type { BotLevel } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { RETIRED_OPENINGS, campaignLevelById, campaignOpening } from '../../src/campaign/index.js';
import { verifyCampaignProof, verifyOfflineMatch } from '../../server/src/seeds/verify.js';

const play = (seed: number, config: Partial<RulesConfig>, botLevel: BotLevel): { end: State; actions: Action[] } => {
  let s = newMatch(seed, config);
  const actions: Action[] = [];
  while (s.phase !== 'GAME_OVER' && actions.length < 1600) {
    const level: BotLevel = s.actor === 1 ? botLevel : 7;
    const action = chooseLevelAction(viewFor(s, s.actor), level, botSeed(s.seed ^ (s.actor === 0 ? 0x51ed : 0), level, s.turnNumber, s.history?.length ?? 0));
    actions.push(action);
    s = apply(s, action);
  }
  return { end: s, actions };
};

describe('a fixed level still pays a game played on the opening it replaced', () => {
  it('records the openings retired by the 2026-11-12 fixes, each really different from today\'s', () => {
    expect(Object.keys(RETIRED_OPENINGS).length).toBeGreaterThan(0);
    for (const [id, retired] of Object.entries(RETIRED_OPENINGS)) {
      const level = campaignLevelById(id)!;
      expect(level, id).not.toBeNull();
      expect(retired.length, id).toBeGreaterThan(0);
      for (const r of retired) {
        const sameSeed = r.seed === level.seed;
        const sameBoard = JSON.stringify(r.config.board) === JSON.stringify(level.config.board);
        expect(sameSeed && sameBoard, `${id}: a retired opening identical to the current one`).toBe(false);
      }
    }
    // The two duplicate boards replaced by tier 1 (59 = 60 in stone, 66 ~ 68).
    expect(RETIRED_OPENINGS['c6-60']).toBeDefined();
    expect(RETIRED_OPENINGS['c7-68']).toBeDefined();
  });

  it('pays a game on a retired opening, which does not replay on the current one', () => {
    for (const id of ['c6-60', 'c7-68']) {
      const level = campaignLevelById(id)!;
      const old = RETIRED_OPENINGS[id]![0]!;
      const game = play(old.seed, old.config, level.botLevel);
      expect(game.end.phase, id).toBe('GAME_OVER');
      const proof = { actions: game.actions, botVersion: CURRENT_BOT_VERSION };
      // The divergence is real ...
      expect(verifyOfflineMatch(campaignOpening(level), level.botLevel, proof), id).toBeNull();
      // ... and the campaign verifier still settles it, through the retired opening.
      expect(verifyCampaignProof(id, game.actions), id).toEqual(verifyOfflineMatch(newMatch(old.seed, old.config), level.botLevel, proof));
      expect(verifyCampaignProof(id, game.actions), id).not.toBeNull();
      // A truncated log is refused on any opening.
      expect(verifyCampaignProof(id, game.actions.slice(0, -1)), id).toBeNull();
    }
  }, 120_000);
});
