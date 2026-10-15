// THE FINISH CARD'S OWN RULES (owner direction, 2026-10-16). The card is shared by every mode, so
// what it leads with, what it keeps on screen and what waits behind "More" is pinned here — the
// layout measurement itself (no scrolling at 360x640 in each mode) is asserted in a real browser by
// `web/e2e/finish-fit.ts`, because only a browser has a layout to measure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, RESULT } from '../../src/strings.js';
import { CAMPAIGN_LEVELS, nextCampaignLevel } from '../../src/campaign/index.js';
import { finishLead } from '../src/logic/finish-actions.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const goCard = html.slice(html.indexOf('<div class="go-card">'), html.indexOf('</section>', html.indexOf('<div class="go-card">')));
const goButtons = html.slice(html.indexOf('<div class="go-buttons">'), html.indexOf('</div>', html.indexOf('<div class="go-buttons">')));

describe('which action leads the finish card, per mode', () => {
  it('online always leads with the rematch it has always had', () => {
    const online = { online: true, campaign: false, won: true, hasNext: false };
    expect(finishLead(online)).toBe('rematch');
    expect(finishLead({ ...online, won: false })).toBe('rematch'); // a loss offers it too
  });

  it('a WON campaign level leads with the next level', () => {
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: true })).toBe('next-level');
    expect(CAMPAIGN.nextLevel).toBe('Next level');
  });

  it('the last built level has no next level, so the same slot is the honest way out', () => {
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: false })).toBe('back-to-campaign');
    // Never a dead "Next level": the word is the level list's own, which really does something.
    expect(CAMPAIGN.back).toBe('Back to campaign');
  });

  it('a LOSS never offers the next level (the win flow is the win flow)', () => {
    expect(finishLead({ online: false, campaign: true, won: false, hasNext: true })).toBe('try-again');
    expect(finishLead({ online: false, campaign: false, won: false, hasNext: false })).toBe('try-again');
  });

  it('a plain offline game keeps its own two words', () => {
    expect(finishLead({ online: false, campaign: false, won: true, hasNext: false })).toBe('play-again');
  });
});

describe('the last level is decided by the DATA, never a hardcoded count', () => {
  it('the next-level lookup answers from the level list itself', () => {
    // The campaign worker is adding levels (>10) as this lands, so the count is read, never assumed.
    expect(CAMPAIGN_LEVELS.length).toBeGreaterThanOrEqual(10);
    const last = CAMPAIGN_LEVELS.at(-1)!;
    expect(nextCampaignLevel(last.number)).toBeNull();
    expect(nextCampaignLevel(CAMPAIGN_LEVELS[0]!.number)).not.toBeNull();
  });

  it('main.ts asks the level data, so a growing campaign needs no change here', () => {
    expect(mainSource).toMatch(/const lead = finishLead\(\{ online: false, campaign: !!campaign, won, hasNext: !!next \}\)/);
    expect(mainSource).toMatch(/const next = campaign && won \? nextCampaignLevel\(campaign\.number\) : null/);
    expect(mainSource).not.toMatch(/campaign\.number\s*===?\s*(10|30)\b/);
  });

  it('the leading button really starts that next level', () => {
    expect(mainSource).toMatch(/if \(campaignLevel && wonNow\) \{[\s\S]{0,200}const next = nextCampaignLevel\(campaignLevel\.number\)/);
    expect(mainSource).toMatch(/if \(next\) return startCampaignLevel\(next\)/);
  });
});

describe('the card is one screen: the result leads, the rest waits behind "More"', () => {
  it('keeps the outcome, the final score and the one reason always on the card', () => {
    for (const id of ['go-title', 'go-score', 'go-reason']) {
      expect(goCard, `${id} must not be behind the disclosure`).toContain(`id="${id}"`);
      expect(goCard).not.toMatch(new RegExp(`id="${id}"[^>]*data-go-extra`));
    }
    // And the one way forward, plus the way out, are never behind it either.
    expect(goButtons).not.toMatch(/id="go-rematch"[^>]*data-go-extra/);
    expect(goButtons).not.toMatch(/id="go-other"[^>]*data-go-extra/);
    expect(goButtons).not.toMatch(/id="go-menu"[^>]*data-go-extra/);
  });

  it('the detail lines and the extra actions are behind it, hidden by default', () => {
    // `go-board` is deliberately NOT here: it is how a player looks at the final position, and the
    // documented way for a suite to put the card away (`web/e2e/smoke.ts` uses `#go-board:visible`).
    for (const id of ['go-break', 'go-moves', 'go-highlights', 'go-stats', 'go-share', 'go-cut']) {
      expect(goCard, `${id} is a detail line or an extra action`).toMatch(new RegExp(`id="${id}"[^>]*data-go-extra`));
      expect(goCard, `${id} starts hidden`).toMatch(new RegExp(`id="${id}"[^>]*data-go-extra[^>]*hidden|id="${id}"[^>]*hidden[^>]*data-go-extra`));
    }
    expect(goCard).not.toMatch(/id="go-board"[^>]*data-go-extra/);
    expect(RESULT.more).toBe('More');
    expect(RESULT.less).toBe('Less');
  });

  it('there are only FOUR action rows before the disclosure: lead, secondary, board, More', () => {
    // The owner's rule was "six is too many". Count what is visible before anyone taps anything.
    const firstIds = [...goButtons.matchAll(/<button id="([^"]+)"([^>]*)>/g)]
      .filter((m) => !/data-go-extra/.test(m[2]!))
      .map((m) => m[1]!);
    expect(firstIds).toEqual(['go-rematch', 'go-other', 'go-board', 'go-more', 'go-menu']);
  });

  it('is driven by one disclosure in main.ts, shared by every mode', () => {
    expect(mainSource).toMatch(/function syncGoExtras\(\)/);
    expect(mainSource).toMatch(/document\.querySelectorAll<HTMLElement>\('#gameover \[data-go-extra\]'\)/);
    expect(mainSource).toMatch(/more\.hidden = available\.length === 0/);
    // The online and offline branches both go through it, so the three modes cannot drift.
    expect((mainSource.match(/setGoExtrasOpen\(false\)/g) ?? []).length).toBe(2);
    expect((mainSource.match(/else syncGoExtras\(\);/g) ?? []).length).toBe(2);
    // A mode with nothing to offer marks it unavailable rather than showing a dead control.
    expect(mainSource).toMatch(/setGoExtra\('go-cut', false\)/);
    expect(mainSource).toMatch(/setGoExtra\('go-moves', !!moves\)/);
  });
});

describe('after the tutorial, the player lands in a level (never back at a menu)', () => {
  const start = mainSource.indexOf('function completeTutorial()');
  const complete = mainSource.slice(start, start + 1800);

  it('hands off through the campaign entry point, not the menu', () => {
    expect(complete).toMatch(/if \(FEATURES\.campaign\) return enterCampaign\(\)/);
    // The legacy channels (no campaign) keep the menu they always had — they have no levels.
    expect(complete).toMatch(/showScreen\('menu'\)/);
  });

  it('the campaign entry point is the ONE way to start a level', () => {
    const entry = mainSource.slice(mainSource.indexOf('function enterCampaign()'), mainSource.indexOf('function completeTutorial()'));
    expect(entry).toMatch(/const resume = campaignResume\(\);\s*\n\s*if \(resume\) return continueCampaignMatch\(resume\)/);
    expect(entry).toMatch(/startCampaignLevel\(currentLevel\(campaignProgress\)\)/);
    // The campaign screen's own leading button goes through it too: no second path.
    expect(mainSource).toContain("bind('campaign-continue', () => enterCampaign())");
  });

  it('a new player starts at LEVEL 1, a progressed player at their own level', () => {
    // `currentLevel(progress)` is the existing campaign getter: an untouched progress is level 1.
    expect(mainSource).not.toMatch(/startCampaignLevel\(CAMPAIGN_LEVELS\[0\]/);
    expect(mainSource).toMatch(/enterCampaign\(\)/);
  });
});
