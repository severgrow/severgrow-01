// The player's profile (owner brief, 2026-10-21) — a SKELETON with exactly five read-only lines.
//
// "if logged in it says name on it - clicked shows a draft of players profile - built just skeleton
//  for it now, showing basic info about the player"
//
// These tests pin the facts that matter and cannot be checked by eye in a diff:
//   1. exactly five lines, in the owner's order: name, sign-in status, Seeds, tiles, matches won;
//   2. an unknown value is an EM DASH — never a made-up 0. A real 0 is shown as 0;
//   3. the sheet is a read-out (no editing, no sign-out, no avatar) in the pause panel's language;
//   4. Seeds and tiles read the SAME remembered pair the Territory entry uses, and matches won has
//      no player-facing source in this build (so it is unknown, not invented).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU, PROFILE } from '../../src/strings.js';
import { installProfileUI, profileRows } from '../src/accounts/profile.js';
import { SEEDS_WORD } from '../src/online/seed-icon.js';
import type { ProfileFacts } from '../src/accounts/profile.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mountSource = read('../src/accounts/mount.ts');
const cacheSource = read('../src/online/territory-cache.ts');
const lobbySource = read('../src/online/lobby-ui.ts');
const styleCss = read('../src/style.css');

const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));
const profileSection = html.slice(html.indexOf('<section id="sheet-profile"'), html.indexOf('</section>', html.indexOf('<section id="sheet-profile"')));

const facts = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  name: 'Ann #7QK2',
  signedIn: true,
  seeds: 128,
  tiles: 3,
  matchesWon: null,
  ...over,
});

describe('the profile is exactly five lines, in the owner’s order', () => {
  it('names the five lines from the one strings module', () => {
    expect(PROFILE.name).toBe('Name');
    expect(PROFILE.signIn).toBe('Sign-in');
    // The currency's word lives with the wallet's own wording (web/src/online/seed-icon.ts): the
    // strings module and the page markup stay free of it (web/tests/seed-words.test.ts).
    expect(SEEDS_WORD).toBe('Seeds');
    expect(PROFILE.tiles).toBe('Tiles');
    expect(PROFILE.matchesWon).toBe('Matches won');
    expect(profileRows(facts()).map((r) => r.label)).toEqual(['Name', 'Sign-in', SEEDS_WORD, 'Tiles', 'Matches won']);
  });

  it('shows the player’s name (with its #TAG) and the sign-in state', () => {
    const rows = profileRows(facts());
    expect(rows[0]!.value).toBe('Ann #7QK2');
    expect(rows[1]!.value).toBe(PROFILE.signedIn);
    expect(profileRows(facts({ signedIn: false }))[1]!.value).toBe(PROFILE.guest);
  });

  it('has no sixth line, no control and no sign-out in the sheet', () => {
    // The markup's five value nodes are the whole content; Close is the only control.
    expect(profileSection.match(/class="sp-row"/g) ?? []).toHaveLength(5);
    for (const id of ['profile-name', 'profile-signin', 'profile-seeds', 'profile-tiles', 'profile-wins']) {
      expect(profileSection).toContain(`id="${id}"`);
    }
    expect(profileSection).not.toMatch(/<input|<textarea|<select|contenteditable/i);
    expect(profileSection).not.toMatch(/sign out|delete|avatar|upload/i);
    expect(profileSection.match(/<button/g) ?? []).toHaveLength(1);
  });
});

describe('an unknown value is an em dash — never a made-up 0', () => {
  it('uses the em dash for a missing name or count', () => {
    expect(PROFILE.unknown).toBe('—');
    const rows = profileRows(facts({ name: null, seeds: null, tiles: null, matchesWon: null }));
    expect(rows.map((r) => r.value)).toEqual(['—', PROFILE.signedIn, '—', '—', '—']);
    expect(profileRows(facts({ name: '   ' }))[0]!.value).toBe('—');
  });

  it('rejects values that cannot be a count (NaN, negative, Infinity) instead of printing them', () => {
    const rows = profileRows(facts({ seeds: Number.NaN, tiles: -2, matchesWon: Number.POSITIVE_INFINITY }));
    expect(rows[2]!.value).toBe('—');
    expect(rows[3]!.value).toBe('—');
    expect(rows[4]!.value).toBe('—');
  });

  it('shows a REAL zero as 0: an empty wallet is a fact, not an unknown', () => {
    const rows = profileRows(facts({ seeds: 0, tiles: 0, matchesWon: 0 }));
    expect(rows[2]!.value).toBe('0');
    expect(rows[3]!.value).toBe('0');
    expect(rows[4]!.value).toBe('0');
  });
});

describe('the numbers are the Territory entry’s own reads, reused', () => {
  it('is fed by the shared Territory cache, not a second request in the account module', () => {
    expect(mountSource).toContain("import { cachedTerritory, readTerritory } from '../online/territory-cache.js'");
    expect(mountSource).toMatch(/const pair = cachedTerritory\(identity\.playerId\)/);
    expect(mountSource).toMatch(/seeds: pair\?\.seeds \?\? null/);
    expect(mountSource).toMatch(/tiles: pair\?\.tiles \?\? null/);
    // An empty cache asks the registered reader ONCE; it never fetches on its own.
    expect(mountSource).toMatch(/void readTerritory\(s\.identity\.playerId\)/);
    expect(mountSource).not.toMatch(/seedWallet|worldMap/);
  });

  it('keeps the cached pair tied to the identity it was read for', () => {
    expect(cacheSource).toMatch(/remembered\?\.playerId === playerId/);
    expect(lobbySource).toMatch(/rememberTerritory\(id\.playerId, counts\)/);
    expect(lobbySource).toContain('registerTerritoryReader');
  });

  it('never invents a matches-won counter: there is no player-facing source in this build', () => {
    // The lobby's match list carries recent matches only; the server's win count is an admin read.
    // The skeleton therefore says "unknown" and the panel shows an em dash, which is a fact.
    expect(mountSource).toMatch(/matchesWon: null/);
    expect(profileRows(facts())[4]!.value).toBe('—');
  });
});

describe('the sheet speaks the pause panel’s language', () => {
  it('is a non-modal dialog labelled by its own title', () => {
    expect(profileSection).toMatch(/id="sheet-profile" class="sheet" role="dialog" aria-labelledby="profile-title"/);
    // It traps nothing: no aria-modal on the profile.
    expect(profileSection).not.toContain('aria-modal');
    expect(profileSection).toContain('id="profile-title"');
  });

  it('reuses hairlines, small tracked caps and neutral digits, with no new colour', () => {
    const block = /\/\* ---------- the player's profile[\s\S]*?\/\* Short screens/.exec(styleCss)?.[0] ?? '';
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('--sp-hair: color-mix(in srgb, var(--c-line) 58%, transparent)');
    expect(block).toMatch(/\.sp-row \+ \.sp-row \{\s*border-top: 1px solid var\(--sp-hair\)/);
    expect(block).toContain('font-variant-numeric: lining-nums tabular-nums');
    // No new colour is coined: every colour is an existing token.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});

describe('the footer row is two keys: the account key left, Settings right', () => {
  it('keeps LOG IN out of the column and puts the pair in one group at the end', () => {
    expect(menuSection).toContain('id="menu-foot"');
    expect(MENU.footerLabel).toBe('Account and settings');
    expect(menuSection).toMatch(/id="menu-foot"[^>]*role="group"/);
    const foot = menuSection.slice(menuSection.indexOf('id="menu-foot"'));
    expect(foot).toContain('id="menu-login"');
    expect(foot).toContain('id="menu-settings"');
    expect(foot.indexOf('id="menu-login"')).toBeLessThan(foot.indexOf('id="menu-settings"'));
    // The footer is the column's last child, so its keys share the column's gap (owner, 2026-10-21:
    // equal spacing between every key). It still comes after TERRITORY in the DOM and in tab order.
    expect(menuSection.indexOf('menu-footer')).toBeGreaterThan(menuSection.indexOf('id="menu-world"'));
    const columnOpen = menuSection.indexOf('<div class="menu-buttons">');
    expect(columnOpen).toBeGreaterThan(-1);
    expect(menuSection.indexOf('menu-footer')).toBeGreaterThan(columnOpen);
  });

  it('is the last thing in tab order (DOM order is tab order)', () => {
    const ids = [...menuSection.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.slice(-2)).toEqual(['menu-login', 'menu-settings']);
    expect(ids.at(-1)).toBe('menu-settings');
  });

  it('the account key’s label carries the name and the key is the only sign-in path', () => {
    expect(PROFILE.open('Ann #7QK2')).toBe('Ann #7QK2. Your profile');
    expect(mountSource).toMatch(/menuLogin\.setAttribute\('aria-label', name \? PROFILE\.open\(name\) : MENU\.login\)/);
    expect(mountSource.match(/start\('menu', menuLogin, null\)/g) ?? []).toHaveLength(1);
  });
});

describe('the profile UI opens, updates and closes without trapping focus', () => {
  it('is inert when its markup is absent (never throws on another build)', () => {
    const ui = installProfileUI({ getElementById: () => null } as unknown as Document);
    expect(ui.isOpen()).toBe(false);
    ui.open(facts());
    ui.close();
    expect(ui.isOpen()).toBe(false);
  });
});
