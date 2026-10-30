// The Territory menu entry's two read-outs (owner brief, 2026-10-20).
//
// "work on TERRITORY button in menu and on side of it inside it show n seeds on one side and n
//  tiles on the other one - showing how much seeds and tiles on territory current player have"
//
// These tests pin THREE things a later edit could quietly break, without measuring a browser:
//   1. the NUMBERS are the server's wallet and the player's OWN cells (never every filled tile);
//   2. the PAIR is all-or-nothing, so the entry can never show one side, a made-up 0, or a number
//      that belongs to a previous identity;
//   3. the MARKUP/CSS keep the label centred with both read-outs hidden, and the menu-show read is
//      a single wallet + single map fetch (no poll, no per-render request).
// The live DOM is measured by web/e2e/menu-territory.ts (real values, failure states, symmetry).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorldMapPayload } from '../../server/src/protocol.js';
import type { SeedWallet } from '../../server/src/seeds/types.js';
import { MENU, ONLINE } from '../../src/strings.js';
import { seedBalanceLabel } from '../src/online/seed-icon.js';
import { territoryCounts } from '../src/online/menu-territory.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const lobbySource = read('../src/online/lobby-ui.ts');
const moduleSource = read('../src/online/menu-territory.ts');
const worldSource = read('../src/online/world-view.ts');
const stringsSource = read('../../src/strings.ts');
const styleCss = read('../src/style.css');

const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));

const wallet = (balance: number): SeedWallet => ({
  balance,
  lifetimeEarned: Math.max(0, balance),
  lifetimeSpent: 0,
  worldInvitationSeen: true,
});

type World = WorldMapPayload['world'];
const world = (owners: { cellId: string; ownerId: string }[]): World => ({
  version: 1,
  revision: 7,
  cost: 100,
  // A challenge is its own purchase (owner, 2026-10-24): 50, not a tile's 100.
  challengeStake: 50,
  cells: [
    { id: '0,0', q: 0, r: 0 },
    { id: '1,0', q: 1, r: 0 },
  ],
  claims: owners.map((claim, index) => ({
    cellId: claim.cellId,
    ownerId: claim.ownerId,
    ownerName: null,
    ownerLevel: null,
    ownerTag: String(index),
    colour: 'hsl(200 34% 49%)',
    claimedAt: 0,
  })),
});

describe('the two read-outs show the server wallet and the player’s OWN tiles', () => {
  it('reads Seeds from the wallet balance exactly (no rounding of a real balance)', () => {
    expect(territoryCounts(wallet(128), world([]), 'me')).toEqual({ seeds: 128, tiles: 0, cells: 2, waiting: 0 });
    expect(territoryCounts(wallet(0), world([]), 'me')).toEqual({ seeds: 0, tiles: 0, cells: 2, waiting: 0 });
  });

  it('counts only claims owned by this player, never every filled tile', () => {
    const map = world([
      { cellId: 'a', ownerId: 'me' },
      { cellId: 'b', ownerId: 'someone-else' },
      { cellId: 'c', ownerId: 'me' },
      { cellId: 'd', ownerId: 'someone-else' },
    ]);
    expect(territoryCounts(wallet(40), map, 'me')).toEqual({ seeds: 40, tiles: 2, cells: 2, waiting: 0 });
    // The same map seen by the other player is THEIR two tiles, not the world's four.
    expect(territoryCounts(wallet(10), map, 'someone-else')).toEqual({ seeds: 10, tiles: 2, cells: 2, waiting: 0 });
  });

  it('counts a cell once, matching the view’s `own` set (a repeated claim cannot inflate it)', () => {
    const map = world([
      { cellId: 'a', ownerId: 'me' },
      { cellId: 'a', ownerId: 'me' },
      { cellId: 'b', ownerId: 'me' },
    ]);
    expect(territoryCounts(wallet(1), map, 'me')?.tiles).toBe(2);
  });

  it('is all-or-nothing: either read missing or malformed means BOTH numbers are unknown', () => {
    expect(territoryCounts(null, world([]), 'me')).toBeNull();
    expect(territoryCounts(wallet(5), null, 'me')).toBeNull();
    expect(territoryCounts(wallet(5), world([]), null)).toBeNull();
    expect(territoryCounts(wallet(Number.NaN), world([]), 'me')).toBeNull();
    expect(territoryCounts(wallet(-1), world([]), 'me')).toBeNull();
    // A payload without a claims array is not an empty map: it must not be read as 0 tiles.
    const broken = { ...world([]), claims: undefined } as unknown as World;
    expect(territoryCounts(wallet(5), broken, 'me')).toBeNull();
  });

  it('speaks with the game’s existing words: the wallet’s SEEDS and the screen’s tiles grown', () => {
    // No new noun and no new sentence lives in strings.ts (owner decision, 2026-10-20): the label
    // is composed from `MENU.world`, the wallet's own balance wording and `ONLINE.worldHeld`.
    expect(MENU.world).toBe('Territory');
    expect(seedBalanceLabel(128)).toBe('128 SEEDS');
    expect(ONLINE.worldHeld(3, 183)).toBe('3 of 183 tiles grown');
    // The wording lives in the ONE place the Territory screen reads it from.
    expect(worldSource).toMatch(/seedBalanceLabel\((this|s)\.wallet\.balance\)/);
    expect(moduleSource).toContain('seedBalanceLabel(counts.seeds)');
    expect(moduleSource).toContain('ONLINE.worldHeld(counts.tiles, counts.cells)');
    // And the noun is never re-coined in the copy or the read-out module: the game says tiles.
    for (const file of [moduleSource, stringsSource]) {
      expect(file).not.toMatch(/\bpatches\b|\bplots\b/i);
    }
    expect(ONLINE.worldEmpty).toContain('tiles');
  });
});

describe('the entry ships the read-outs hidden, either side of a label that never moves', () => {
  it('is still the one top-level TERRITORY button, in the same place, as a quiet ghost', () => {
    expect(menuSection).toMatch(/<button id="menu-world" class="[^"]*ghost[^"]*"[^>]*hidden>/);
    expect(menuSection).not.toContain('id="menu-world" class="btn primary');
    // Its label is its own node, between the two read-outs in source order.
    const seeds = menuSection.indexOf('id="menu-world-seeds"');
    const label = menuSection.indexOf('id="menu-world-label"');
    const tiles = menuSection.indexOf('id="menu-world-tiles"');
    expect(seeds).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(seeds);
    expect(tiles).toBeGreaterThan(label);
  });

  it('starts with BOTH read-outs hidden and a value node each', () => {
    expect(menuSection).toMatch(/id="menu-world-seeds"[^>]*hidden/);
    expect(menuSection).toMatch(/id="menu-world-tiles"[^>]*hidden/);
    expect(menuSection).toContain('id="menu-world-seeds-value"');
    expect(menuSection).toContain('id="menu-world-tiles-value"');
  });

  it('reuses the game’s glyphs: the authored seed and the shared tile icon, not new art', () => {
    expect(moduleSource).toContain('seedIcon(16)');
    expect(menuSection).toMatch(/id="menu-world-tiles"[\s\S]*?data-icon="tile"/);
  });

  it('places the three cells explicitly, so hiding a side cannot pull the label off centre', () => {
    expect(styleCss).toMatch(/#menu \.menu-buttons \.btn\.menu-territory \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
    expect(styleCss).toMatch(/\.menu-territory-label \{ grid-area: 1 \/ 2; \}/);
    expect(styleCss).toMatch(/\.menu-territory-seeds \{ grid-area: 1 \/ 1; justify-self: start; \}/);
    expect(styleCss).toMatch(/\.menu-territory-tiles \{ grid-area: 1 \/ 3; justify-self: end; \}/);
    // Equal outer inset for both halves is the grid's own doing: both end cells are 1fr.
    expect(styleCss).toMatch(/\.menu-territory-side \{[^}]*font-variant-numeric: lining-nums tabular-nums/);
  });

  it('has NO divider between a read-out and the label (removed outright, not hidden)', () => {
    // Owner, 2026-10-20: the small cream hairline went. It must be GONE — no pseudo-element, no
    // leftover rule, no dead markup — because the two halves are balanced by the equal grid cells
    // and the shared gaps alone. A hidden divider would still reserve width and drift the halves.
    const ink = /\/\* ---------- the Territory entry's instrument read-outs[\s\S]*?@media \(max-width: 340px\)/.exec(styleCss)?.[0] ?? '';
    expect(ink.length).toBeGreaterThan(0);
    expect(ink).not.toContain('menu-territory-seeds::after');
    expect(ink).not.toContain('menu-territory-tiles::before');
    expect(ink).not.toContain('--fu-cream-22');
    // Nothing in the entry's markup could have been the divider either.
    const button = menuSection.slice(menuSection.indexOf('id="menu-world"'), menuSection.indexOf('id="menu-login"'));
    expect(button).not.toMatch(/\bdivider\b|<hr\b/i);
    // And no other rule elsewhere in the sheet still paints one on these sides.
    expect(styleCss).not.toMatch(/\.menu-territory-(seeds|tiles)::?(?:after|before)/);
  });

  it('keeps the shared menu-key height and tap floor (the numbers add no height)', () => {
    // Owner brief (2026-10-21): every menu key is 50px, from ONE token. The Territory rule only
    // changes padding and layout; it must not carry a height of its own.
    const territory = /#menu \.menu-buttons \.btn\.menu-territory \{([^}]*)\}/.exec(styleCss)?.[1] ?? '';
    expect(territory).not.toMatch(/(^|;)\s*height\s*:/);
    expect(territory).not.toMatch(/(^|;)\s*min-height\s*:/);
    expect(styleCss).toMatch(/--menu-key-h: 50px/);
    expect(styleCss).toMatch(/#menu \.menu-buttons \.btn,\s*#menu \.menu-footer \.btn,\s*#play-menu \.menu-buttons \.btn \{\s*min-height: var\(--menu-key-h\);\s*height: var\(--menu-key-h\);/);
  });

  it('animates only a real change, on opacity, with the shared tokens and a static reduced mode', () => {
    expect(moduleSource).toMatch(/duration: MOTION\.ack, easing: EASE\.standard/);
    expect(moduleSource).toMatch(/\[\{ opacity: 0\.55 \}, \{ opacity: 1 \}\]/);
    expect(moduleSource).toContain("classList.contains('reduce-motion')");
    expect(moduleSource).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    // No hand-picked duration/easing anywhere in the read-out module.
    expect(moduleSource).not.toMatch(/\b\d+_?ms\b|cubic-bezier/);
  });
});

describe('the menu show pays ONE wallet read and ONE map read, never a poll', () => {
  it('writes the label into its own node, so a layout pass cannot wipe the numbers', () => {
    expect(mainSource).toContain("$('menu-world-label').textContent = MENU.world");
    expect(mainSource).not.toContain("$('menu-world').textContent = MENU.world");
  });

  it('runs the read from the menu event, single-flight, and only while the menu is on show', () => {
    expect(lobbySource).toContain("window.addEventListener('futasaku:menu', () => { void refreshMenu(); })");
    expect(lobbySource).toMatch(/if \(menuEl\?\.hidden !== false\) return Promise\.resolve\(\)/);
    expect(lobbySource).toMatch(/if \(menuPass\) return menuPass/);
    // One Promise.all for the pair (plus the challenge count the entry's lamp reads), from the same
    // menu pass that offers the invitation. Still ONE read of each, never a poll.
    expect(lobbySource).toMatch(/Promise\.all\(\[\s*client\.seedWallet\(id\.token\),\s*client\.worldMap\(\),\s*[\s\S]{0,220}?client\.worldChallenges\(id\.token\)/);
    // And no timer/interval/rAF drives it.
    expect(moduleSource).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(lobbySource.slice(lobbySource.indexOf('const refreshMenu ='), lobbySource.indexOf("window.addEventListener('futasaku:menu'"))).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });

  it('hides BOTH numbers on a failed or unknown read, and keeps the stale pair out of another identity', () => {
    // Failure nulls both reads (so `territoryCounts` answers null) and paints null.
    expect(lobbySource).toMatch(/catch \{\s*\/\/[^\n]*\n\s*wallet = null;\s*\n\s*world = null;/);
    expect(lobbySource).toMatch(/territoryUI\.paint\(counts\)/);
    expect(lobbySource).toMatch(/territoryUI\.paint\(null\)/);
    // The cached pair carries the identity it was read for, and is only reused for that identity.
    // The one cache is shared with the profile (owner brief, 2026-10-21), so it lives in
    // territory-cache.ts and both surfaces read the same fact.
    const cacheSource = read('../src/online/territory-cache.ts');
    expect(cacheSource).toMatch(/remembered\?\.playerId === playerId/);
    expect(lobbySource).toMatch(/rememberTerritory\(id\.playerId, counts\)/);
    expect(lobbySource).toContain("import { cachedTerritory, registerTerritoryReader, rememberTerritory } from './territory-cache.js'");
    expect(lobbySource).toMatch(/territoryUI\.paint\(cachedTerritory\(identity\.peek\(\)\?\.playerId \?\? null\)\)/);
  });
});
