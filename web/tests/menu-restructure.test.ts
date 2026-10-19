// The FUTASAKU 0.5 main-menu restructure (owner direction, 2026-10-15), locked at the source.
//
// The owner deliberately replaces the flat product menu with LOG IN + PLAY, and MOVES the offline
// modes and the duel lobby behind PLAY rather than duplicating them. These assertions pin the
// structure so a later edit cannot quietly drop an entry, a doorway, or the LEVEL <n> progress
// label — and so the carry-over's tier table (difficulty.test.ts) and this menu cannot drift apart.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, MENU } from '../../src/strings.js';
import { DIFFICULTIES } from '../src/logic/difficulty.js';
import { FEATURES } from '../src/channel.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const accountsSource = read('../src/accounts/mount.ts');
const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));
const playSection = html.slice(html.indexOf('<section id="play-menu"'), html.indexOf('</section>', html.indexOf('<section id="play-menu"')));

describe('the product menu is LOG IN above PLAY', () => {
  it('carries LOG IN at the top, hidden until the account module reveals it', () => {
    expect(MENU.login).toBe('LOG IN');
    expect(menuSection).toMatch(/id="menu-login"[^>]*hidden/);
    // LOG IN comes before PLAY in the column, and PLAY before the legacy Continue.
    expect(menuSection.indexOf('id="menu-login"')).toBeLessThan(menuSection.indexOf('id="menu-play"'));
    expect(menuSection.indexOf('id="menu-play"')).toBeLessThan(menuSection.indexOf('id="menu-continue"'));
  });

  it('has PLAY, hidden until main.ts reveals it on a product channel', () => {
    expect(MENU.play).toBe('Play');
    expect(menuSection).toMatch(/id="menu-play"[^>]*hidden/);
    expect(mainSource).toContain("$('menu-play').hidden = !FEATURES.campaign");
  });

  it('keeps the Territory entry, revealed only by the online build', () => {
    expect(MENU.world).toBe('Territory');
    expect(menuSection).toMatch(/id="menu-world"[^>]*hidden/);
  });
});

describe('PLAY is a real screen, not a layer on the menu', () => {
  it('is a full `.screen` section with a back button in its header and its own title', () => {
    expect(playSection).toContain('class="screen play-menu"');
    expect(playSection).toContain('id="play-back"');
    expect(playSection).toContain('id="play-title"');
    expect(playSection).toContain('id="play-actions"');
    expect(MENU.playTitle).toBe('Play');
  });

  it('hides the menu while it is open, and its back button returns to the menu', () => {
    expect(mainSource).toMatch(/function openPlayMenu\(\)[\s\S]*?\$\('menu'\)\.hidden = true/);
    expect(mainSource).toContain("bind('play-back', () => showScreen('menu'))");
    expect(mainSource).toMatch(/function showScreen[\s\S]*?closePlayMenu\(\)/);
  });
});

describe('PLAY holds exactly the three product entries, moved not copied', () => {
  it('moves Play online / LEVEL n / Training into #play-actions on a product channel', () => {
    // Three, not four: the "Levels" entry is gone (owner, 2026-10-16). The player does not get the
    // whole level list - LEVEL <n> starts the next UNCOMPLETED level and is the only way in.
    expect(mainSource).toMatch(/const PLAY_MENU_ENTRIES = \['menu-online', 'menu-campaign', 'menu-new'\] as const/);
    expect(mainSource).toMatch(/if \(FEATURES\.campaign\) \{[\s\S]*?actions\.append\(\$\(id\)\)/);
    // Each entry keeps its ONE id, so there is no second copy of the online or campaign wiring.
    for (const id of ['menu-online', 'menu-campaign', 'menu-new']) {
      expect(html.match(new RegExp(`id="${id}"`, 'g')) ?? []).toHaveLength(1);
    }
    // And the removed entry is gone from BOTH the markup and the entry list - not merely hidden, so
    // no stray node can be appended back into the submenu.
    expect(html).not.toContain('id="menu-levels"');
    expect(mainSource).not.toContain("'menu-levels'");
  });
});

describe('the campaign entry reads LEVEL <n> from the player progress', () => {
  it('formats exactly LEVEL 1 / LEVEL 25', () => {
    expect(MENU.level(1)).toBe('LEVEL 1');
    expect(MENU.level(25)).toBe('LEVEL 25');
  });

  it('is driven by the existing campaign progress getter', () => {
    // The label and the press now come from ONE decision: campaignEntry(progress, savedLevel). That
    // is what stops the old mismatch where the label said LEVEL 70 but the press resumed level 31.
    expect(mainSource).toMatch(/\$\('menu-campaign'\)[\s\S]{0,900}const entry = campaignEntry\(campaignProgress, campaignResume\(\)\?\.level \?\? null\)/);
    // The level NUMBER on the entry is the campaign's next unfinished level, formatted by MENU.level.
    expect(mainSource).toMatch(/const current = entry\.kind === 'ask' \? entry\.next\.number : entry\.level\.number/);
    expect(mainSource).toMatch(/cmp\.textContent = MENU\.level\(current\)/);
    expect(mainSource).toMatch(/cmp\.setAttribute\('aria-label', MENU\.levelAria\(current\)\)/);
    // And the words themselves are real, which the source pattern above cannot prove. Owner brief
    // 2026-10-17: the progression is never called "Campaign" where a player (or their screen
    // reader) can hear it — the game simply has LEVEL 1, LEVEL 2, …
    expect(MENU.levelAria(1)).toBe('Play level 1');
    expect(MENU.levelAria(25)).toBe('Play level 25');
  });

  it('stops claiming a level number once every level is complete', () => {
    // LEVEL 70 would promise a level; with nothing left, the entry opens the chapter list and says so.
    // This is the ONLY state in which the entry is not LEVEL <n> - while any level is unfinished it
    // stays the single way in, so the owner's "no Levels entry" rule still holds where it mattered.
    expect(MENU.levels).toBe('LEVELS');
    expect(mainSource).toMatch(/if \(entry\.kind === 'list'\) \{\s*\n\s*cmp\.textContent = MENU\.levels/);
    expect(mainSource).toMatch(/cmp\.setAttribute\('aria-label', MENU\.levelsAria\)/);
    expect(mainSource).toMatch(/if \(entry\.kind === 'list'\) return showScreen\('campaign'\)/);
  });

  it('always asks on a saved match, naming the level being entered', () => {
    // Owner decision (2026-10-19): no resume happens on entry without a question. The question
    // exists once, in one decision function, and the sheet gives each answer a button.
    expect(mainSource).toMatch(/return askCampaignStart\(entry\.next, entry\.saved\)/);
    // Same level: the two answers are continue-this-level vs start-it-over.
    expect(mainSource).toMatch(/const sameLevel = saved\.id === next\.id/);
    expect(mainSource).toMatch(/sameLevel \? CAMPAIGN\.askContinue\(saved\.number\) : CAMPAIGN\.askResume\(saved\.number\)/);
    expect(mainSource).toMatch(/sameLevel \? CAMPAIGN\.askRestart\(next\.number\) : CAMPAIGN\.askStart\(next\.number\)/);
    expect(CAMPAIGN.askTitle(31, 31)).toBe('Level 31 is unfinished.');
    expect(CAMPAIGN.askBody(31, 31)).toBe('Continue level 31 where you left off, or start it over?');
    expect(CAMPAIGN.askContinue(31)).toBe('Continue level 31');
    expect(CAMPAIGN.askRestart(31)).toBe('Start level 31 over');
    // A save on a DIFFERENT level still names both levels honestly.
    expect(CAMPAIGN.askTitle(31, 70)).toBe('Another level is unfinished.');
    expect(CAMPAIGN.askBody(31, 70)).toBe('Level 31 is still in progress. Start level 70 instead?');
    expect(CAMPAIGN.askResume(31)).toBe('Resume level 31');
    expect(CAMPAIGN.askStart(70)).toBe('Start level 70');
    // No silent resume path may remain: the press must go through the decision, not straight to a save.
    expect(mainSource).not.toMatch(/function enterCampaign\(\) \{\s*\n\s*const resume = campaignResume\(\);/);
    expect(mainSource).not.toContain("entry.kind === 'resume'");
  });

  it('cannot skip a level: the order rule is checked at BOTH doors', () => {
    // (owner, 2026-10-19) every level 1-70 must be won in order. The data layer already derives
    // access from the completed list; these two guards mean no DOM state or stale save can bypass it.
    const start = mainSource.slice(mainSource.indexOf('function startCampaignLevel('), mainSource.indexOf('function clearFreePlayBulbNudge('));
    expect(start).toMatch(/if \(!isUnlocked\(campaignProgress, level\)\) return showScreen\('campaign'\)/);
    // The resume door too: a save for a level the record has not opened is ignored, not resumed.
    const resume = mainSource.slice(mainSource.indexOf('function campaignResume('), mainSource.indexOf('function campaignTile('));
    expect(resume).toMatch(/if \(!isUnlocked\(campaignProgress, level\)\) return null/);
  });
});

describe('the Training entry opens the three tiers', () => {
  it('is named Training and opens the tier picker', () => {
    expect(MENU.training).toBe('Training');
    expect(mainSource).toMatch(/\$\('menu-new'\)[\s\S]{0,200}MENU\.training/);
    expect(mainSource).toContain("bind('menu-new', () => {");
    expect(mainSource).toMatch(/bind\('menu-new'[\s\S]{0,200}showScreen\('levels'\)/);
  });

  it('its heading is the training title on a product channel and the legacy words elsewhere', () => {
    expect(MENU.trainingTitle).toBe('Training');
    expect(mainSource).toMatch(/if \(FEATURES\.campaign\)[\s\S]*?\$\('levels-heading'\)\.textContent = MENU\.trainingTitle/);
    expect(mainSource).toMatch(/else \{[\s\S]*?\$\('levels-heading'\)\.textContent = 'Choose difficulty'/);
  });

  it('the picker renders exactly the three carry-over tiers', () => {
    expect(DIFFICULTIES.map((t) => t.label)).toEqual(['EASY', 'MEDIUM', 'HARD']);
    expect(mainSource).toMatch(/\.\.\.DIFFICULTIES\.map\(/);
    expect(FEATURES.campaign).toBe(true); // this build's channel is futa04
  });
});

describe('LOG IN reuses the one Google flow and hides itself when signed in', () => {
  it('starts the existing flow (not a second sign-in path)', () => {
    expect(accountsSource).toMatch(/const menuLogin = document\.getElementById\('menu-login'\)/);
    expect(accountsSource).toMatch(/menuLogin\?\.addEventListener\('click', \(\) => void start\('menu', menuLogin, null\)\)/);
    // Still exactly one entry point into `start` from the menu button: no second button calls it.
    expect(accountsSource.match(/id="menu-login"|getElementById\('menu-login'\)/g) ?? []).toHaveLength(1);
  });

  it('hides LOG IN whenever signedIn() is true, and always on the product menu', () => {
    expect(accountsSource).toMatch(/if \(menuLogin\) menuLogin\.hidden = FEATURES\.campaign \|\| signedIn\(\) !== null/);
    // The product menu is exactly PLAY, TERRITORY, SETTINGS (owner decision, 2026-10-19), so the
    // layout pass hides LOG IN too rather than leaving it for the async accounts probe.
    expect(mainSource).toMatch(/\$\('menu-login'\)\.hidden = FEATURES\.campaign/);
  });
});

describe('the product main menu is exactly PLAY, TERRITORY, SETTINGS', () => {
  it('hides Continue and LOG IN in the layout pass, never merely when empty', () => {
    // Owner decision (2026-10-19): no resume on the main menu. Continue is hidden even when a save
    // exists; the question belongs on entry, not here.
    expect(mainSource).toMatch(/\$\('menu-continue'\)\.hidden = FEATURES\.campaign \|\| !canContinue/);
    expect(menuSection).toMatch(/id="menu-continue"[^>]*hidden/);
    expect(menuSection).toMatch(/id="menu-login"[^>]*hidden/);
    // The three entries that DO belong are present: PLAY, the world map (TERRITORY) and Settings.
    expect(menuSection).toMatch(/id="menu-play"[^>]*hidden/);
    expect(menuSection).toMatch(/id="menu-world"[^>]*hidden/);
    expect(menuSection).toMatch(/id="menu-settings"/);
    expect(MENU.world).toBe('Territory');
  });

  it('leaves no Continue behaviour reachable from the menu', () => {
    // The button is hidden with [hidden] { display:none !important }, so no empty gap remains; and
    // its handler is ordinary legacy wiring, not a second visible control.
    expect(mainSource).toContain("bind('menu-continue', () => continueGame())");
    expect(menuSection).not.toMatch(/data-menu-continue/);
  });
});

// The saved-game resume is the ONLY way back into a match on the legacy channels, so it must never
// depend on the menu being re-rendered: a fresh boot, a reload and a return from a submenu all show
// the menu while `shownScreen` may already say 'menu' (the menu restructure made PLAY a section of
// its own that sets it back). Pinned here because the failure it prevents is silent and total: a
// player with a finished turn and no Continue button (regression guard, 2026-10-15). On the product
// channels the same recompute deliberately keeps it hidden (owner decision, 2026-10-19).
describe('the saved-game resume is recomputed on every menu show', () => {
  it('ships Continue hidden in the markup, so the layout controls whether it appears', () => {
    expect(menuSection).toMatch(/id="menu-continue"[^>]*hidden/);
  });

  it('recomputes it OUTSIDE the "the screen did not change" guard', () => {
    const body = mainSource.slice(mainSource.indexOf('function showScreen('), mainSource.indexOf("$('gameover').hidden = true;"));
    const call = body.indexOf('= syncMenuResume()');
    const gate = body.indexOf('if (!same)');
    expect(call, 'showScreen must recompute the resume').toBeGreaterThan(-1);
    expect(gate, 'the menu layout is still re-rendered only on a change').toBeGreaterThan(-1);
    expect(call, 'the resume must be recomputed before the !same gate, never inside it').toBeLessThan(gate);
  });

  it('reads the resume decision from storage, not from a cached flag', () => {
    const sync = mainSource.slice(mainSource.indexOf('function syncMenuResume('), mainSource.indexOf('function showScreen('));
    expect(sync).toMatch(/decodeSave<CoachProgress>\(store\.get\(SAVE_KEY\)\)/);
    expect(sync).toMatch(/saved\.state\.phase !== 'GAME_OVER'/);
    // The legacy channels still reveal it from storage; the product menu never does.
    expect(sync).toMatch(/const showContinue = canContinue && !FEATURES\.campaign/);
    expect(sync).toMatch(/btn\.hidden = !showContinue/);
  });
});
