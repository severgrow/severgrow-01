// NAMES IN TERRITORY (owner, 2026-10-30), three rules:
//
//   8. "after clicking someone's tile - it still shows it's tag id. make the account names be max 8
//       characters and make sure in territory the name and level is always visible"
//
// What this file gates:
//   * a tapped tile's VISIBLE line carries no `#tag`, while the tag is kept in the title (the
//     ranking row and the territory chat already do exactly that);
//   * the always-on wallet line names the player and their level;
//   * the 8-character rule lives in ONE place on the server and the client input mirrors it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorldMapPayload } from '../../server/src/protocol.js';
import { meLine, ownerLine, ownerSpokenLine } from '../src/online/world-selection.js';

type Claim = WorldMapPayload['world']['claims'][number];

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const claim = (over: Partial<Claim> = {}): Claim => ({
  cellId: '0,0',
  ownerId: 'p1',
  ownerName: 'RYK',
  ownerLevel: 22,
  ownerTag: 'VJJM',
  colour: 'hsl(216 74% 53%)',
  claimedAt: 0,
  ...over,
});

describe('the tapped tile line never prints the tag', () => {
  it('a rival name is just the name and the level', () => {
    expect(ownerLine(claim(), false)).toBe('RYK · LEVEL 22');
    expect(ownerLine(claim(), false)).not.toContain('#');
  });

  it('my own ground adds LEVEL and YOURS — still no tag', () => {
    expect(ownerLine(claim(), true, 23)).toBe('RYK · LEVEL 23 · YOURS');
    expect(ownerLine(claim(), true, 23)).not.toContain('#');
  });

  it('the tag is kept for the accessible name / title, the way ranking and chat keep it', () => {
    expect(ownerSpokenLine(claim(), false)).toBe('RYK #VJJM · LEVEL 22');
    expect(ownerSpokenLine(claim(), true, 23)).toBe('RYK #VJJM · LEVEL 23 · YOURS');
  });

  it('a player with no recorded level shows no made-up number (and still no tag)', () => {
    expect(ownerLine(claim({ ownerLevel: null }), false)).toBe('RYK');
    expect(ownerSpokenLine(claim({ ownerLevel: null }), false)).toBe('RYK #VJJM');
  });

  it('the map paints the visible line and puts the spoken one in the title', () => {
    const view = read('../src/online/world-view.ts');
    expect(view).toContain('spoken = ownerSpokenLine(tile, mine, mine ? this.myLevel() : null)');
    expect(view).toMatch(/text\.textContent = line/);
    expect(view).toMatch(/text\.title = spoken/);
    // The visible line is built by `ownerLine` (tag-free); the map's hex aria-label keeps the tag.
    const selection = view.slice(view.indexOf('private paintSelection()'), view.indexOf('private async claim()'));
    expect(selection).not.toMatch(/#\$\{/);
  });
});

describe('my name and level are always on the Territory screen', () => {
  it('the line is NAME · LEVEL n, or only what is known', () => {
    expect(meLine('RYK', 22)).toBe('RYK · LEVEL 22');
    expect(meLine('BloomHeron', 23)).toBe('BloomHeron · LEVEL 23');
    expect(meLine('RYK', null)).toBe('RYK');
    expect(meLine(null, 22)).toBe('LEVEL 22');
    expect(meLine(null, null)).toBeNull();
    expect(meLine('   ', null)).toBeNull();
  });

  it('the wallet line paints it at every viewport, not inside a pane', () => {
    const view = read('../src/online/world-view.ts');
    const paint = view.slice(view.indexOf('private paintWallet()'), view.indexOf('private paintSignatureOf'));
    expect(paint).toContain('meLine(storedDisplayName(identity.playerId), this.myLevel())');
    expect(paint).toContain("who.className = 'world-me'");
    const css = read('../src/online/online-css.ts');
    expect(css).toMatch(/\.world-wallet\.has-me \{[^}]*justify-content: space-between/);
    expect(css).toMatch(/\.world-me \{[^}]*text-overflow: ellipsis/);
  });
});

describe('account names are at most 8 characters on the way in', () => {
  it('the client input uses the server constant, never a second number', () => {
    const mount = read('../src/accounts/mount.ts');
    expect(mount).toContain('input.maxLength = DISPLAY_NAME_MAX');
    expect(mount).toMatch(/import \{ DISPLAY_NAME_MAX \} from '\.\.\/\.\.\/\.\.\/server\/src\/display-name\.js'/);
  });

  it('the error copy names the same bound', () => {
    const strings = read('../../src/strings.ts');
    expect(strings).toMatch(/nicknameError: "That name cannot be used\. Use 1 to 8 /);
  });
});
