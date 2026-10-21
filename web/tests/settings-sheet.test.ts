// The Settings sheet, locked at the source.
//
// Owner, 2026-10-16: "there are too many settings in settings — strip down to what's actually
// needed / very useful". Owner, 2026-10-17, after using it on a phone: "settings should hold only
// essentials" — and the Coach switch should go, because its advice is always on in Match Intel.
//
// The rule the screen follows now: a short surface of the things a player changes while playing,
// and EVERYTHING else behind two folded groups — "More options" (look, motion and volume detail)
// and "More playing options" (the teaching aids). Only the Coach switch was removed from the model
// (the advice is always on); every other setting still exists and is still reachable.
//
// Two things are NON-NEGOTIABLE and this file fails if they move:
//   * Reduce motion and Large text are accessibility, so they stay visible, OUTSIDE every group.
//   * Sound, Music and Vibration are the basics every game has, so they stay visible too.
//
// The words all come from src/strings.ts (SETTINGS) via `data-copy` keys, so a rename is a one-line
// change and the markup can be re-organised without hunting for copy.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SETTINGS } from '../../src/strings.js';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const styleCss = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
const section = html.slice(html.indexOf('<section id="sheet-settings"'), html.indexOf('</section>', html.indexOf('<section id="sheet-settings"')));

const idsIn = (chunk: string): string[] => [...chunk.matchAll(/data-setting="([^"]+)"/g)].map((m) => m[1]!);
const settingIds = idsIn(section).sort();

/** Every setting id that lives inside a collapsed `<details>` group (the Lab holds none). */
const folded = new Set<string>();
for (const group of section.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)) for (const id of idsIn(group[1] ?? '')) folded.add(id);

const groupIds = [...section.matchAll(/<details\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]!).sort();
const copyKeys = [...section.matchAll(/data-copy="([^"]+)"/g)].map((m) => m[1]!);

describe('Settings sheet: essentials on the surface, everything else in two groups', () => {
  it('the Coach switch is gone (its advice is always on), every other setting stays', () => {
    expect(settingIds).toEqual([
      'autoSkip', 'eyeCandy', 'largeText', 'music',
      'placementList', 'reduceMotion', 'sound', 'vibration', 'weakPulse', 'weakSpots',
    ]);
    expect(section, 'no Coach row may come back').not.toContain('data-setting="coach"');
  });

  it('accessibility stays visible, outside every group (Reduce motion, Large text)', () => {
    for (const id of ['reduceMotion', 'largeText']) {
      expect(settingIds, `${id} must still be here`).toContain(id);
      expect(folded.has(id), `${id} is accessibility — it must stay a plain row, not folded away`).toBe(false);
    }
  });

  it('Sound, Music and Vibration stay visible (the basics every game has)', () => {
    for (const id of ['sound', 'music', 'vibration']) expect(folded.has(id), id).toBe(false);
  });

  it('Confirm moves and Auto-skip stay on the surface (the two playing choices)', () => {
    expect(section, 'the Confirm moves row must be a plain row').toContain('id="confirm-seg"');
    expect(folded.has('autoSkip'), 'autoSkip stays visible').toBe(false);
  });

  it('the extras are folded into two groups: More options and More playing options', () => {
    expect(groupIds).toEqual(['settings-help', 'settings-lab', 'settings-look']);
    // the look/motion/volume detail
    for (const id of ['eyeCandy']) expect(folded.has(id), id).toBe(true);
    for (const seg of ['detail-seg', 'glow-seg', 'speed-seg', 'effects-seg']) {
      expect(section.indexOf(seg), `${seg} must exist`).toBeGreaterThan(-1);
      const look = section.slice(section.indexOf('id="settings-look"'), section.indexOf('</details>', section.indexOf('id="settings-look"')));
      expect(look, `${seg} belongs to the "More options" group`).toContain(seg);
    }
    // the teaching aids
    for (const id of ['placementList', 'weakSpots', 'weakPulse']) expect(folded.has(id), id).toBe(true);
  });

  it('the labels are short, not paragraphs', () => {
    expect(SETTINGS.eyeCandy).toBe('Decorative effects'); // was a whole sentence of four effects
    expect(SETTINGS.eyeCandy.length).toBeLessThanOrEqual(24);
    expect(SETTINGS.autoSkip).toBe('Auto-skip empty turns');
    expect(SETTINGS.music).toBe('Music'); // the "(quiet hum)" aside is gone
    expect(section, 'the old four-effect paragraph must not come back').not.toContain('opening splash, home heartbeat');
  });

  it('every choice control in the sheet is a 44px touch target (0.6 polish)', () => {
    // The 36px segmented pills were the one interactive control below the 44px floor. The rule is
    // scoped to #sheet-settings so the compact segment elsewhere is untouched.
    const scoped = /#sheet-settings \.seg-btn,\s*#sheet-settings \.btn\.small\s*\{[^}]*min-height:\s*44px/s;
    expect(styleCss, 'Settings choices must be at least 44px tall').toMatch(scoped);
    // And the base control is still the compact one the other surfaces rely on.
    expect(styleCss).toMatch(/\.seg-btn \{\s*min-height: var\(--h-compact\);/);
  });

  it('every word comes from src/strings.ts (SETTINGS), and every key it names exists', () => {
    expect(copyKeys.length).toBeGreaterThan(18);
    const table = SETTINGS as unknown as Record<string, unknown>;
    for (const key of copyKeys) {
      expect(Object.prototype.hasOwnProperty.call(table, key), `SETTINGS is missing "${key}"`).toBe(true);
      expect(String(table[key]).length, `SETTINGS.${key} must not be empty`).toBeGreaterThan(0);
    }
  });
});
