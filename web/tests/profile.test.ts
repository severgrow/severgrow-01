// The player's profile (owner brief, 2026-10-21; redesigned 2026-11-01).
//
// Owner, 2026-11-01: "keep NAME but say NAME & TAG and remove sign in signed in - that's silly",
// "matches won should be summary of any matches ever - keep seeds and tiles", "3 on top become
// offline and 3 bottom online", "the sections changed to games / win rate / longest streak",
// "remove text from the bottom that now says 'against the computer on this device'", "add a flag of
// the country they're at", "add 1 tile with their chosen colour", "make sure futasaku logo is
// visible somewhere where it makes sense".
//
// These tests pin what a diff cannot show by eye:
//   1. four identity lines in the owner's order — name & tag, Seeds, tiles, matches won — and NO
//      sign-in line;
//   2. two record rows of the SAME three tiles, offline above online, each labelled down its edge;
//   3. an unknown value is an EM DASH; a real 0 is 0;
//   4. the flag and the colour tile are decoration: absent when unknown, never a placeholder;
//   5. the sheet stays a read-out in the pause panel's language, with the Futasaku mark in it.
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
  country: 'PL',
  colour: { css: 'hsl(341 42% 53%)', name: 'Rose' },
  seeds: 128,
  tiles: 3,
  matchesWon: 9,
  offline: { games: 24, wins: 14, longestStreak: 7 },
  online: { games: 9, wins: 4, longestStreak: 3 },
  ...over,
});

describe('the identity block is four lines, in the owner’s order', () => {
  it('names the lines from the one strings module', () => {
    expect(PROFILE.nameTag).toBe('Name & tag');
    // The currency's word lives with the wallet's own wording (web/src/online/seed-icon.ts): the
    // strings module and the page markup stay free of it (web/tests/seed-words.test.ts).
    expect(SEEDS_WORD).toBe('Seeds');
    expect(PROFILE.tiles).toBe('Tiles');
    expect(PROFILE.matchesWon).toBe('Matches won');
    expect(profileRows(facts()).map((r) => r.label)).toEqual(['Name & tag', SEEDS_WORD, 'Tiles', 'Matches won']);
  });

  it('shows the name with its #TAG', () => {
    expect(profileRows(facts())[0]!.value).toBe('Ann #7QK2');
  });

  it('has dropped the sign-in line completely (owner: "that’s silly")', () => {
    // Not hidden — gone: no label, no value node, no markup, no PROFILE string. (ACCOUNT keeps its
    // own "signed in" wording for Settings; that is a different surface saying a different thing.)
    expect(profileRows(facts()).map((r) => r.label)).not.toContain('Sign-in');
    expect(profileSection).not.toContain('profile-signin');
    expect(profileSection).not.toMatch(/Sign-in/i);
    const strings = read('../../src/strings.ts');
    const profileStrings = strings.slice(strings.indexOf('export const PROFILE'), strings.indexOf('export const PRIVACY'));
    expect(profileStrings).not.toMatch(/signIn:|signedIn:|guest:/);
  });

  it('has no fifth line, no control and no sign-out in the sheet', () => {
    expect(profileSection.match(/class="sp-row[ "]/g) ?? []).toHaveLength(4);
    for (const id of ['profile-name', 'profile-seeds', 'profile-tiles', 'profile-wins']) {
      expect(profileSection).toContain(`id="${id}"`);
    }
    expect(profileSection).not.toMatch(/<input|<textarea|<select|contenteditable/i);
    expect(profileSection).not.toMatch(/sign out|delete|avatar|upload/i);
    expect(profileSection.match(/<button/g) ?? []).toHaveLength(1);
  });
});

describe('two records: offline on top, online below, the same three tiles', () => {
  it('keeps one row of three for each half, each labelled down its edge', () => {
    const rows = profileSection.match(/class="sp-play-row"/g) ?? [];
    expect(rows).toHaveLength(2);
    const offlineAt = profileSection.indexOf('profile-play-offline');
    const onlineAt = profileSection.indexOf('profile-play-online');
    expect(offlineAt).toBeGreaterThan(-1);
    expect(onlineAt).toBeGreaterThan(offlineAt); // offline ABOVE online
    expect(profileSection).toContain('id="profile-play-offline-label"');
    expect(profileSection).toContain('id="profile-play-online-label"');
    // The row word is a label for the tiles, never a fourth tile.
    expect(profileSection).toMatch(/class="sp-play-side"/g);
  });

  it('uses the same three metrics for both halves, and no other section', () => {
    expect(PROFILE.games).toBe('Games');
    expect(PROFILE.winRate).toBe('Win rate');
    expect(PROFILE.longestStreak).toBe('Longest streak');
    expect([PROFILE.offline, PROFILE.online]).toEqual(['Offline', 'Online']);
    // The tiles the owner no longer shows are gone from the strings, not merely unrendered.
    const strings = read('../../src/strings.ts');
    expect(strings).not.toMatch(/bestScore|favourite|longestBloom|streakBest|tilesCount/);
  });

  it('has removed the old footer note and put nothing in its place', () => {
    expect(profileSection).not.toContain('profile-play-note');
    expect(profileSection).not.toMatch(/against the computer/i);
    expect(styleCss).not.toContain('.sp-play-note');
    expect(profileSection).not.toMatch(/sp-play-note/);
  });

  it('reads the two halves from the one row builder (so they cannot drift)', () => {
    const source = read('../src/accounts/profile.ts');
    expect(source).toContain("import { recordRows } from '../logic/match-record.js'");
    const calls = source.match(/recordRows\(/g) ?? [];
    expect(calls).toHaveLength(1); // one builder, used for BOTH grids
  });
});

describe('an unknown value is an em dash — never a made-up 0', () => {
  it('uses the em dash for a missing name or count', () => {
    expect(PROFILE.unknown).toBe('—');
    const rows = profileRows(facts({ name: null, seeds: null, tiles: null, matchesWon: null }));
    expect(rows.map((r) => r.value)).toEqual(['—', '—', '—', '—']);
    expect(profileRows(facts({ name: '   ' }))[0]!.value).toBe('—');
  });

  it('rejects values that cannot be a count (NaN, negative, Infinity) instead of printing them', () => {
    const rows = profileRows(facts({ seeds: Number.NaN, tiles: -2, matchesWon: Number.POSITIVE_INFINITY }));
    expect(rows[1]!.value).toBe('—');
    expect(rows[2]!.value).toBe('—');
    expect(rows[3]!.value).toBe('—');
  });

  it('shows a REAL zero as 0: an empty wallet is a fact, not an unknown', () => {
    const rows = profileRows(facts({ seeds: 0, tiles: 0, matchesWon: 0 }));
    expect(rows[1]!.value).toBe('0');
    expect(rows[2]!.value).toBe('0');
    expect(rows[3]!.value).toBe('0');
  });
});

describe('the flag and the colour tile are decoration, never a placeholder', () => {
  it('has a place for both, inside the name line', () => {
    const nameRow = profileSection.slice(profileSection.indexOf('sp-row-name'), profileSection.indexOf('profile-seeds'));
    expect(nameRow).toContain('id="profile-flag"');
    expect(nameRow).toContain('id="profile-colour"');
    // Both start hidden: nothing is drawn until the client knows what to draw.
    expect(nameRow).toMatch(/id="profile-flag"[^>]*hidden/);
    expect(nameRow).toMatch(/id="profile-colour"[^>]*hidden/);
  });

  it('hides each mark when its fact is unknown', () => {
    const source = read('../src/accounts/profile.ts');
    expect(source).toMatch(/flag\.hidden = glyph === ''/);
    expect(source).toMatch(/swatch\.hidden = !facts\.colour/);
    // The colour is painted through one custom property, so the swatch shares the map's colour.
    expect(source).toMatch(/swatch\.style\.setProperty\('--tile', facts\.colour\.css\)/);
  });

  it('draws the Futasaku mark with the game’s own asset, not a new logo', () => {
    expect(profileSection).toContain('id="profile-brand"');
    const source = read('../src/accounts/profile.ts');
    expect(source).toContain("import { createEmblemMark } from '../player/branding.js'");
    expect(source).toMatch(/createEmblemMark\('futasaku-profile-white'\)/);
    // aria-hidden in the markup: the sheet already says Profile, a logo read aloud is noise.
    expect(profileSection).toMatch(/id="profile-brand"[^>]*aria-hidden="true"/);
  });
});

describe('the numbers are the Territory entry’s own reads, reused', () => {
  it('is fed by the shared Territory cache, not a second request in the account module', () => {
    expect(mountSource).toContain("import { cachedTerritory, readTerritory } from '../online/territory-cache.js'");
    expect(mountSource).toMatch(/const pair = cachedTerritory\(identity\.playerId\)/);
    expect(mountSource).toMatch(/seeds: pair\?\.seeds \?\? null/);
    expect(mountSource).toMatch(/tiles: pair\?\.tiles \?\? null/);
    // An empty cache asks the registered reader ONCE; it never fetches on its own.
    expect(mountSource).toMatch(/void readTerritory\(identity\.playerId\)/);
    expect(mountSource).not.toMatch(/seedWallet|worldMap/);
  });

  it('keeps the cached pair tied to the identity it was read for', () => {
    expect(cacheSource).toMatch(/remembered\?\.playerId === playerId/);
    expect(lobbySource).toMatch(/rememberTerritory\(id\.playerId, counts\)/);
    expect(lobbySource).toContain('registerTerritoryReader');
  });

  it('builds the all-time win total from both halves, and says unknown when one is missing', () => {
    expect(mountSource).toContain('matchesWonEver(facts.offline, facts.online)');
    expect(mountSource).not.toMatch(/matchesWon: null\s*,\s*\n\s*offline/); // no longer hard-coded
  });

  it('asks the account for its offline record once per open, and never polls', () => {
    expect(mountSource).toContain("apiPost('/v1/players/me/offline'");
    expect(mountSource).toContain("apiGet('/v1/players/me/offline'");
    // The offline push happens on a finished game and on open — never on a timer.
    expect(mountSource).not.toMatch(/setInterval\([^)]*offline/i);
    expect(mountSource).toContain("addEventListener('futasaku:offline-game'");
  });
});

describe('the sheet speaks the pause panel’s language', () => {
  it('is a non-modal dialog labelled by its own title', () => {
    // Read the ATTRIBUTES, never one literal string (2026-10-22). The contract is "a sheet, a
    // dialog, labelled by profile-title, not modal" — the byte order of those attributes is not
    // part of it.
    const tag = /<section\b[^>]*\bid="sheet-profile"[^>]*>/.exec(profileSection)?.[0] ?? '';
    expect(tag, 'the profile is a <section> with its own id').not.toBe('');
    const attr = (name: string): string | null =>
      new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
    expect(attr('class')?.split(/\s+/)).toContain('sheet');
    expect(attr('role')).toBe('dialog');
    expect(attr('aria-labelledby')).toBe('profile-title');
    // It traps nothing: no aria-modal on the profile.
    expect(attr('aria-modal')).toBeNull();
    expect(profileSection).not.toContain('aria-modal');
    expect(profileSection).toContain('id="profile-title"');
  });

  it('reuses hairlines, small tracked caps and neutral digits, with no new colour', () => {
    const block = /\/\* ---------- the player's profile[\s\S]*?\/\* Short screens/.exec(styleCss)?.[0] ?? '';
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('--sp-hair: color-mix(in srgb, var(--c-line) 58%, transparent)');
    expect(block).toMatch(/\.sp-row \+ \.sp-row \{\s*border-top: 1px solid var\(--sp-hair\)/);
    expect(block).toContain('font-variant-numeric: lining-nums tabular-nums');
    // No new colour is coined: every colour is an existing token (the swatch reads --tile).
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
    // Painted by the one shared function (accounts/menu-key.ts), which the accounts module calls.
    const keySource = readFileSync(fileURLToPath(new URL('../src/accounts/menu-key.ts', import.meta.url)), 'utf8');
    expect(keySource).toMatch(/btn\.setAttribute\('aria-label', name \? PROFILE\.open\(name\) : MENU\.login\)/);
    expect(mountSource).toContain('paintAccountKey(menuLogin, name)');
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
