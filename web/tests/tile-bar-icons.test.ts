// THE TILE BAR'S ICON KEYS (owner, 2026-11-01: "grow a tile/challenge/sell a tile/see profile etc
// in territory should be all icons in buttons rather than text buttons").
//
// With the words gone, two things become load-bearing and are pinned here without a browser:
//
//   1. EACH ACTION IS A DIFFERENT SHAPE. Grow (sprout), sell (coin), challenge (crossed swords) and
//      profile (head and shoulders) must be distinguishable at 20 px; a test that lets two of them
//      share a drawing would fail the owner's request even if it looked fine in code.
//   2. THE WORDS ARE STILL THERE — as the key's aria-label and title, from the one strings module.
//      The key keeps its 44 px target and the MENU row's focus ring (the browser suite measures it).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TILE_BAR_ICONS } from '../src/online/tile-bar-icons.js';
import { SWORD_PATH } from '../src/online/swords-glyph.js';
import { ONLINE } from '../../src/strings.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const source = read('../src/online/world-view.ts');
const icons = read('../src/online/tile-bar-icons.ts');
const css = read('../src/online/online-css.ts');

const NAMES = ['grow', 'sell', 'challenge', 'profile', 'confirm'] as const;

describe('one icon per action, and no two alike', () => {
  it('has all five drawings', () => {
    expect(Object.keys(TILE_BAR_ICONS).sort()).toEqual([...NAMES].sort());
  });

  it('no two actions share a drawing (they are read at 20 px)', () => {
    const bodies = NAMES.map((name) => TILE_BAR_ICONS[name]);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('grow is a sprout on a ground line, not a circle', () => {
    expect(TILE_BAR_ICONS.grow).toContain('M12 20.6V10.8');
    expect(TILE_BAR_ICONS.grow).toContain('M7 20.6h10');
    // Two opposed leaves, each a closed curve — the organic silhouette.
    expect(TILE_BAR_ICONS.grow.match(/class="line"/g)?.length).toBe(4);
    expect(TILE_BAR_ICONS.grow).not.toContain('<circle');
  });

  it('sell is a coin: one bold circle with a plus, the currency the player receives', () => {
    expect(TILE_BAR_ICONS.sell).toContain('<circle class="line" cx="12" cy="12" r="8.2"/>');
    expect(TILE_BAR_ICONS.sell).toContain('M12 7.9v8.2M7.9 12h8.2');
    // Nothing leaf-like leaks in: the ONLY round mark on the bar's sprout is this one.
    expect(TILE_BAR_ICONS.sell).not.toContain('M12 20.6');
  });

  it('challenge is the map’s own crossed swords, so one glyph means challenge everywhere', () => {
    expect(TILE_BAR_ICONS.challenge).toContain(SWORD_PATH);
    expect(icons).toContain("import { SWORD_PATH } from './swords-glyph.js'");
  });

  it('profile is the only human silhouette (head over shoulders)', () => {
    expect(TILE_BAR_ICONS.profile).toContain('<circle class="line" cx="12" cy="8.2" r="3.5"/>');
    expect(TILE_BAR_ICONS.profile).toContain('M4.9 20.1c.5-3.9 3.3-6.1 7.1-6.1s6.6 2.2 7.1 6.1');
  });

  it('confirm is a tick, used only for the armed second press', () => {
    expect(TILE_BAR_ICONS.confirm).toContain('M5.2 12.7l4.4 4.3L18.8 7.2');
  });

  it('every drawing is the MENU keys’ own icon language (24 grid, line/fill classes)', () => {
    for (const name of NAMES) {
      const body = TILE_BAR_ICONS[name];
      expect(body, name).toContain('<svg class="world-key-icon"');
      expect(body, name).toContain('aria-hidden="true"');
      expect(body, name).toMatch(/class="(line|fill)"/);
      // No hard-coded stroke attributes: the shared `.world-key-icon .line` rule owns the weight.
      expect(body, name).not.toMatch(/stroke-width|stroke="#/);
    }
    expect(css).toContain('.world-key-icon .line { fill: none; stroke: currentColor; stroke-width: 1.5;');
  });
});

describe('the keys speak, because their text is gone', () => {
  it('every action takes its words from src/strings.ts', () => {
    expect(ONLINE.worldGrowKey).toBe('Grow a tile');
    expect(ONLINE.worldGrowConfirm).toBe('Confirm grow');
    expect(ONLINE.worldSellConfirm).toBe('Confirm sell');
    expect(ONLINE.worldSeeProfile).toBe('See profile');
    expect(source).toContain('ONLINE.worldGrowKey');
    expect(source).toContain('ONLINE.worldGrowConfirm');
    expect(source).toContain('ONLINE.worldSeeProfile');
    // Nothing is spelled in the component: no literal label was introduced with this change.
    expect(source).not.toMatch(/label:\s*'(Grow a tile|Confirm grow|See profile)'/);
  });

  it('sets BOTH the aria-label and the title from the action’s label', () => {
    expect(source).toMatch(/key\.setAttribute\('aria-label', action\.label\)/);
    expect(source).toMatch(/key\.title = action\.label/);
  });

  it('a visible text node is no longer written into the tile bar key', () => {
    const paint = source.slice(source.indexOf('private paintSelection()'), source.indexOf('private async claim()'));
    expect(paint).not.toMatch(/key\.(textContent|innerText)\s*=/);
    expect(paint).not.toMatch(/key\.textContent\s*=/);
  });

  it('the key keeps the old class (handlers/tests) and joins the MENU key family', () => {
    expect(source).toContain("key.className = 'world-claim-button world-key'");
    expect(source).toMatch(/key\.dataset\.action = action\.kind/);
  });
});

describe('44 px at every size, and the same focus ring', () => {
  it('pins the touch minimum on the bar key itself', () => {
    const block = /\.world-selection \.world-claim-button \{[\s\S]*?\}/.exec(css)?.[0] ?? '';
    expect(block).not.toBe('');
    for (const size of ['width: 44px', 'height: 44px', 'min-width: 44px', 'min-height: 44px']) {
      expect(block).toContain(size);
    }
    // It sits in the bar's flow, not absolutely placed like the MENU row's keys.
    expect(block).toContain('position: relative');
  });

  it('the cream focus ring is the MENU row’s own', () => {
    expect(css).toContain('.world-claim-button:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 2px; }');
    // The shared hardware key still provides the 44px plate and the supplied frame.
    expect(css).toContain('width: 44px; height: 44px; min-width: 44px; min-height: 44px;');
    expect(css).toContain("url('./hardware/button-frame-supplied.webp')");
  });

  it('the armed key turns red and swaps its glyph for the tick', () => {
    expect(source).toContain('action.armed ? TILE_BAR_ICONS.confirm : TILE_BAR_ICONS[action.kind]');
    expect(css).toContain('.world-claim-button.armed {');
  });
});

describe('the action set is the same one the bar already had, plus a rival’s profile', () => {
  it('a rival’s tile offers See profile; your own never does', () => {
    expect(source).toMatch(/if \(!mine\) actions\.push\(\{ kind: 'profile'/);
    // No profile key is pushed on own ground (the menu's account key already opens that).
    const ownBranch = source.slice(source.indexOf('} else if (mine && !this.busy'), source.indexOf('} else if (!mine && this.isFrontier'));
    expect(ownBranch).not.toContain("kind: 'profile'");
  });

  it('the grow/sell two-step and the challenge sheet are unchanged', () => {
    expect(source).toContain('this.growArmed = cellId');
    expect(source).toContain('void this.claim()');
    expect(source).toContain('this.sellArmed = cellId');
    expect(source).toContain('void this.sell(cellId)');
    expect(source).toContain('this.openSendSheet(cellId)');
    expect(source).toContain('this.openChallengeSheet(challenge)');
  });

  it('the row is rebuilt only when the action signature changes', () => {
    expect(source).toMatch(/actions\.map\(\(a\) => `\$\{a\.kind\}:\$\{a\.label\}:\$\{a\.armed \? 1 : 0\}`\)/);
  });
});
