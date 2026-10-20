// CAMPAIGN MODE — progress saves/restores, an unfinished campaign match resumes, and introducing
// the campaign does NOT disturb an existing classic offline save.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import {
  CAMPAIGN_LEVELS,
  campaignLevelById,
  legacyCampaignLevelById,
  freshProgress,
  parseProgress,
  recordCampaignResult,
  serializeProgress,
} from '../../src/campaign/index.js';
import { campaignOpening } from '../../src/campaign/index.js';
import {
  CAMPAIGN_SAVE_KEY,
  LAST_MODE_KEY,
  decodeCampaignSave,
  encodeCampaignSave,
  offlineSaveKey,
  parseLastMode,
} from '../src/logic/campaign.js';
import { SAVE_KEY, decodeSave, encodeSave } from '../src/logic/persist.js';
import { STATS_KEY, parseStats } from '../src/logic/stats.js';

/** Plays one legal move as the human on seat 0 (enough to make a resume non-trivial). */
const firstMove = (level: (typeof CAMPAIGN_LEVELS)[number]): Action => {
  const state = campaignOpening(level);
  const legal = legalActions(viewFor(state, state.actor));
  const action = legal[0]!;
  return action;
};

describe('campaign progress: saves and restores', () => {
  it('round-trips through storage text, and a fresh record is level 1 only', () => {
    const p = recordCampaignResult(freshProgress(), CAMPAIGN_LEVELS[0]!, { won: true, score: 8, turns: 15 });
    const restored = parseProgress(serializeProgress(p));
    expect(restored).toEqual(p);
    expect(restored.unlocked).toBe(2);
    expect(restored.completed).toEqual([CAMPAIGN_LEVELS[0]!.id]);
  });

  it('never throws on garbage and never invents progress', () => {
    for (const raw of [null, '', 'not json', '{}', '{"unlocked":-3}', '{"completed":"x"}', '[]', 'null']) {
      const p = parseProgress(raw);
      expect(p.unlocked, String(raw)).toBeGreaterThanOrEqual(1);
      expect(p.completed).toEqual([]);
    }
    expect(parseProgress('{"version":1,"unlocked":3,"completed":["c1-01","c1-01",5]}').completed).toEqual(['c1-01']);
    expect(parseProgress('{"unlocked":3,"best":{"c1-01":{"won":true,"score":4,"turns":9},"bad":7}}').best)
      .toEqual({ 'c1-01': { won: true, score: 4, turns: 9 } });
  });

  it('progress and its keys are separate from the classic stats record', () => {
    expect(CAMPAIGN_SAVE_KEY).not.toBe(SAVE_KEY);
    const stats = parseStats('{"played":5,"wins":3,"losses":2,"best":12,"winsByLevel":[3,0,0,0,0,0,0,0,0]}');
    expect(stats.winsByLevel).toHaveLength(9);
    // The campaign never writes the stats record: its own save is a different key, and recording a
    // campaign result through the campaign module leaves a classic Stats object untouched.
    const before = JSON.stringify(stats);
    void recordCampaignResult(freshProgress(), CAMPAIGN_LEVELS[0]!, { won: true, score: 9, turns: 10 });
    expect(JSON.stringify(stats)).toBe(before);
    expect(STATS_KEY).not.toBe(CAMPAIGN_SAVE_KEY);
  });
});

describe('an unfinished campaign match resumes as its level', () => {
  it('the campaign save carries the level id and the offline match save', () => {
    const level = CAMPAIGN_LEVELS[5]!;
    const opening = campaignOpening(level);
    const move = firstMove(level);
    const after = apply(opening, move);
    const match = encodeSave({ seed: level.seed, actions: [move], coach: null, level: level.botLevel, base: opening });
    const raw = encodeCampaignSave(level.id, match);
    const decoded = decodeCampaignSave(raw)!;
    expect(decoded.levelId).toBe(level.id);
    expect(decoded.openingVersion).toBe(2);
    expect(campaignLevelById(decoded.levelId)).toBe(level);
    // The classic decoder replays the match against the CAMPAIGN base, so the board is the level's.
    const loaded = decodeSave<null>(decoded.match)!;
    expect(loaded.state.board).toEqual(after.board);
    expect(loaded.state.terrain).toEqual(after.terrain);
    expect(loaded.state.hands).toEqual(after.hands);
    expect(loaded.state.config.board!.rock).toEqual(level.config.board!.rock);
  });

  it('preserves the original opening revision when an older saved level resumes', () => {
    const oldLevel = legacyCampaignLevelById(CAMPAIGN_LEVELS[0]!.id)!;
    const oldOpening = campaignOpening(oldLevel);
    const raw = JSON.stringify({ v: 1, levelId: oldLevel.id,
      match: encodeSave({ seed: oldLevel.seed, actions: [], coach: null, level: oldLevel.botLevel, base: oldOpening }) });
    const decoded = decodeCampaignSave(raw)!;
    expect(decoded.openingVersion).toBe(1);
    expect(decodeSave(decoded.match)?.state.terrain).toEqual(oldOpening.terrain);
    expect(oldOpening.config.board!.gold).not.toEqual(CAMPAIGN_LEVELS[0]!.config.board!.gold);
    expect(decodeCampaignSave(encodeCampaignSave(CAMPAIGN_LEVELS[0]!.id, 'new-match'))?.openingVersion).toBe(2);
  });

  it('rejects anything unreadable, so a broken campaign save is simply no campaign save', () => {
    for (const raw of [null, '', '{}', '{"v":2,"levelId":"c1-01","match":"x"}', '{"v":1,"match":"x"}', '{"v":1,"levelId":"","match":"x"}']) {
      expect(decodeCampaignSave(raw), String(raw)).toBeNull();
    }
  });

  it('the mode marker decides which match Continue resumes', () => {
    expect(parseLastMode(null)).toBe('classic');
    expect(parseLastMode('classic')).toBe('classic');
    expect(parseLastMode('campaign')).toBe('campaign');
    expect(parseLastMode('nonsense')).toBe('classic');
    expect(LAST_MODE_KEY).not.toBe(SAVE_KEY);
    expect(LAST_MODE_KEY).not.toBe(CAMPAIGN_SAVE_KEY);
  });
});

describe('an existing classic offline save survives the campaign', () => {
  it('the classic save is written and read under its own key, untouched by campaign writes', () => {
    const level = CAMPAIGN_LEVELS[0]!;
    // An existing classic save, exactly as the classic game writes it (no campaign involvement).
    const classicLevel = 7 as const;
    const classic = encodeSave({ seed: 1234, actions: [], coach: null, level: classicLevel });
    expect(decodeSave<null>(classic)).not.toBeNull();
    // Now a campaign match saves. The classic text is a different key and is not passed through it.
    const campaignRaw = encodeCampaignSave(level.id, encodeSave({ seed: level.seed, actions: [], coach: null, level: level.botLevel, base: campaignOpening(level) }));
    expect(campaignRaw).not.toBe(classic);
    expect(decodeSave<null>(classic)).not.toBeNull();
    expect(decodeSave<null>(classic)!.level).toBe(classicLevel);
    // And the two keys are distinct, so the campaign write cannot have overwritten the classic one.
    expect(offlineSaveKey(level)).not.toBe(offlineSaveKey(null));
  });

  it('a legacy-rules classic save still decodes (the campaign adds no migration of its own)', () => {
    const legacy = JSON.stringify({ v: 7, rules: 'v0.8-fruit-sprout', seed: 99, actions: [], coach: null, level: 3 });
    const loaded = decodeSave<null>(legacy);
    expect(loaded).not.toBeNull();
    expect(loaded!.level).toBe(3);
    expect(loaded!.state.phase).toBe('DRAW');
  });
});
