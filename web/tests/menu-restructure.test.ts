// The FUTASAKU 0.5 main-menu restructure (owner direction, 2026-10-15), locked at the source.
//
// The owner deliberately replaces the flat product menu with LOG IN + PLAY, and MOVES the offline
// modes and the duel lobby behind PLAY rather than duplicating them. These assertions pin the
// structure so a later edit cannot quietly drop an entry, a doorway, or the LEVEL <n> progress
// label — and so the carry-over's tier table (difficulty.test.ts) and this menu cannot drift apart.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU } from '../../src/strings.js';
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

  it('keeps the world map entry, revealed only by the online build', () => {
    expect(MENU.world).toBe('The world map');
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
    expect(mainSource).toMatch(/const PLAY_MENU_ENTRIES = \['menu-online', 'menu-campaign', 'menu-new'\] as const/);
    expect(mainSource).toMatch(/if \(FEATURES\.campaign\) \{[\s\S]*?actions\.append\(\$\(id\)\)/);
    // Each entry keeps its ONE id, so there is no second copy of the online or campaign wiring.
    expect(menuSection.match(/id="menu-online"/g) ?? []).toHaveLength(1);
    expect(html.match(/id="menu-online"/g) ?? []).toHaveLength(1);
    expect(html.match(/id="menu-campaign"/g) ?? []).toHaveLength(1);
    expect(html.match(/id="menu-new"/g) ?? []).toHaveLength(1);
  });
});

describe('the campaign entry reads LEVEL <n> from the player progress', () => {
  it('formats exactly LEVEL 1 / LEVEL 25', () => {
    expect(MENU.level(1)).toBe('LEVEL 1');
    expect(MENU.level(25)).toBe('LEVEL 25');
  });

  it('is driven by the existing campaign progress getter', () => {
    // The level NUMBER comes from the campaign progress getter, and that number is what the label
    // formats: `currentLevel(campaignProgress).number` → `MENU.level(current)`.
    expect(mainSource).toMatch(/\$\('menu-campaign'\)[\s\S]{0,600}const current = currentLevel\(campaignProgress\)\.number/);
    // The label is the campaign entry's visible text AND its spoken name.
    expect(mainSource).toMatch(/cmp\.textContent = MENU\.level\(current\)/);
    expect(mainSource).toMatch(/cmp\.setAttribute\('aria-label', `\$\{MENU\.level\(current\)\}/);
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

  it('hides LOG IN whenever signedIn() is true', () => {
    expect(accountsSource).toMatch(/if \(menuLogin\) menuLogin\.hidden = signedIn\(\) !== null/);
  });
});
