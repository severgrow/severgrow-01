// THE LEVEL FLOW (owner, 2026-10-24): the player's PLACE is the level they are working on, and no
// replay may move it.
//
// The report: level 23 was lost, the finish card's "Back to levels" opened the chapter list, level 1
// was replayed from that list, and from then on the game offered "Resume" for level 1 — the replay's
// own save had become the thing the campaign entry pointed at. The rule these tests pin:
//
//   * the place is `currentLevel(progress)` — derived, never stored;
//   * a saved match at any level BEHIND the place is a replay, and a replay can neither be offered
//     as the entry's match nor change the progress record;
//   * the Tutorial (Settings) plays the very same campaign levels 1-9 by reference, and writes
//     nothing: not the record, not the resume save, not a reward.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CAMPAIGN_LEVELS,
  campaignOpening,
  currentLevel,
  recordCampaignResult,
  serializeProgress,
} from '../../src/campaign/index.js';
import type { CampaignProgress } from '../../src/campaign/index.js';
import {
  TUTORIAL_LEVEL_COUNT,
  campaignEntry,
  isReplay,
  progressAfterMatch,
  resumeOffersPlace,
  tutorialLevel,
  tutorialLevels,
  writesCampaignRecord,
} from '../src/logic/campaign.js';

/** A player who has won every level below `n`; `n` itself is the level they are working on. */
const placeAt = (n: number): CampaignProgress => ({
  version: 1,
  unlocked: n,
  completed: CAMPAIGN_LEVELS.slice(0, n - 1).map((level) => level.id),
  best: {},
});
const lvl = (n: number) => CAMPAIGN_LEVELS[n - 1]!;

describe("a replay never moves the player's place", () => {
  it('winning a replay of level 1 leaves the place on level 23', () => {
    const before = placeAt(23);
    const after = recordCampaignResult(before, lvl(1), { won: true, score: 12, turns: 20 });
    expect(currentLevel(after)).toBe(lvl(23));
    // Nothing was re-unlocked or re-locked: the completed list is the same list.
    expect(after.completed).toEqual(before.completed);
    expect(after.unlocked).toBe(23);
    // Only the replay's own best attempt changed.
    expect(after.best[lvl(1).id]).toEqual({ won: true, score: 12, turns: 20 });
  });

  it('losing a replay changes no progression at all (a loss never removes progress either)', () => {
    const before = placeAt(23);
    const after = recordCampaignResult(before, lvl(1), { won: false, score: 3, turns: 7 });
    expect(currentLevel(after)).toBe(lvl(23));
    expect(after.completed).toEqual(before.completed);
    expect(after.unlocked).toBe(23);
  });

  it('the place moves forward only when the place itself is won', () => {
    const after = recordCampaignResult(placeAt(23), lvl(23), { won: true, score: 9, turns: 18 });
    expect(currentLevel(after)).toBe(lvl(24));
  });

  it('a level behind the place is a replay; the place itself and anything after are not', () => {
    const p = placeAt(23);
    expect(isReplay(p, lvl(1))).toBe(true);
    expect(isReplay(p, lvl(22))).toBe(true);
    expect(isReplay(p, lvl(23))).toBe(false);
    expect(isReplay(p, lvl(24))).toBe(false);
    // Winning the place turns it into a replay, because the place has moved on.
    expect(isReplay(recordCampaignResult(p, lvl(23), { won: true, score: 9, turns: 18 }), lvl(23))).toBe(true);
  });
});

describe('the entry is anchored on the place, not on the last level opened', () => {
  it('an unfinished replay save never becomes the match the entry opens', () => {
    // The bug: the level-1 replay's save made the campaign entry ask to resume level 1.
    expect(campaignEntry(placeAt(23), lvl(1))).toEqual({ kind: 'start', level: lvl(23) });
    expect(campaignEntry(placeAt(23), lvl(22))).toEqual({ kind: 'start', level: lvl(23) });
  });

  it('a save on the place itself still asks (the 2026-10-19 decision is unchanged)', () => {
    expect(campaignEntry(placeAt(23), lvl(23))).toEqual({ kind: 'ask', next: lvl(23), saved: lvl(23) });
  });

  it('with every built level complete the entry is the list, whatever is saved', () => {
    const done = placeAt(CAMPAIGN_LEVELS.length + 1);
    expect(campaignEntry(done, null)).toEqual({ kind: 'list' });
    expect(campaignEntry(done, lvl(1))).toEqual({ kind: 'list' });
  });

  it('the resume offer is only the place, so the list cannot say "Resume" for a replay', () => {
    expect(resumeOffersPlace(placeAt(23), lvl(1))).toBe(false);
    expect(resumeOffersPlace(placeAt(23), lvl(23))).toBe(true);
  });
});

describe('the Tutorial is an entry point to the same campaign levels', () => {
  it('is the first nine levels, by reference — no copy of the level data exists', () => {
    const levels = tutorialLevels();
    expect(TUTORIAL_LEVEL_COUNT).toBe(9);
    expect(levels.map((level) => level.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    levels.forEach((level, i) => expect(level, `level ${level.number} is the campaign's own object`).toBe(CAMPAIGN_LEVELS[i]));
  });

  it('a tutorial level opens exactly the campaign position: same seed, same config', () => {
    for (const level of tutorialLevels()) {
      expect(tutorialLevel(level.number)).toBe(level);
      const fromTutorial = campaignOpening(level);
      const fromCampaign = campaignOpening(CAMPAIGN_LEVELS[level.number - 1]!);
      expect(fromTutorial.seed).toBe(fromCampaign.seed);
      expect(fromTutorial.config).toEqual(fromCampaign.config);
      expect(fromTutorial.board).toEqual(fromCampaign.board);
      expect(fromTutorial.hands).toEqual(fromCampaign.hands);
    }
  });

  it('has no level past the ninth: the Tutorial cannot reach the campaign beyond it', () => {
    expect(tutorialLevel(10)).toBeNull();
    expect(tutorialLevel(0)).toBeNull();
  });
});

describe('a tutorial replay is inert', () => {
  it('completing one leaves CampaignProgress byte-identical, win or loss', () => {
    const before = placeAt(23);
    const raw = serializeProgress(before);
    expect(progressAfterMatch(before, 'tutorial', lvl(1), { won: true, score: 12, turns: 20 })).toBe(before);
    expect(serializeProgress(progressAfterMatch(before, 'tutorial', lvl(1), { won: false, score: 2, turns: 5 }))).toBe(raw);
  });

  it('a campaign match still writes the record as before', () => {
    const before = placeAt(23);
    const after = progressAfterMatch(before, 'campaign', lvl(23), { won: true, score: 9, turns: 18 });
    expect(after).not.toBe(before);
    expect(currentLevel(after)).toBe(lvl(24));
  });

  it('only a campaign match is saved: a tutorial replay never overwrites the resume save', () => {
    expect(writesCampaignRecord('campaign')).toBe(true);
    expect(writesCampaignRecord('tutorial')).toBe(false);
  });
});

describe('the Tutorial entry is wired to the campaign, not to a copy', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const html = read('../index.html');
  const main = read('../src/main.ts');

  it('lives in Settings and opens its own sheet', () => {
    expect(html).toContain('id="settings-tutorial"');
    expect(html).toContain('data-copy="tutorial"');
    expect(html).toContain('data-copy="tutorialLevels"');
    expect(html).toContain('id="sheet-tutorial"');
    expect(html).toContain('id="tutorial-levels"');
    // It is a product row, not one of the classic-only nodes the essentials pass removes.
    const tag = html.slice(html.indexOf('<button id="settings-tutorial"'), html.indexOf('>', html.indexOf('<button id="settings-tutorial"')));
    expect(tag).not.toContain('data-only="classic"');
  });

  it('builds its tiles from tutorialLevels() and starts the same level object', () => {
    expect(main).toMatch(/function renderTutorialSheet\(\)[\s\S]{0,400}tutorialLevels\(\)\.map/);
    expect(main).toMatch(/startGame\(level\.seed, level\.botLevel, null, level, null, true\)/);
    // No second level list: the Tutorial only ever names the campaign's own objects.
    expect(main).not.toMatch(/TUTORIAL_LEVELS\s*=/);
  });

  it('is hidden where there is no campaign, and its finish card goes back to the Tutorial', () => {
    expect(main).toMatch(/\$\('settings-tutorial'\)\.hidden = !FEATURES\.campaign;/);
    expect(main).toMatch(/if \(tutorialReplay\) \{[\s\S]{0,320}sheet\('sheet-tutorial'\)/);
    expect(main).toMatch(/finishLead\(\{ online: false, campaign: !!campaign, won, hasNext: !!next, tutorial, replay \}\)/);
  });

  it('writes nothing: no progress, no resume save, no lesson notes, no proof', () => {
    // save() stands down for the replay, so the campaign resume key is never written.
    expect(main).toMatch(/if \(tutorialReplay\) return;/);
    // The progress record goes through the pure gate: a tutorial run returns the same object.
    expect(main).toMatch(/const kind: CampaignMatchKind = tutorialReplay \? 'tutorial' : 'campaign';/);
    expect(main).toMatch(/progressAfterMatch\(campaignProgress, kind, campaignLevel/);
    // And no campaign seed proof is ever built for one.
    expect(main).toMatch(/campaignLevel && !lessonNow && !tutorialReplay && p\.after\.result\.winner === HUMAN/);
  });
});
