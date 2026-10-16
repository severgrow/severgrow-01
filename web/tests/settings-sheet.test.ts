// The Settings sheet, locked at the source (owner, 2026-10-16): "there are too many settings in
// settings — strip down to what's actually needed / very useful".
//
// The rule the screen follows now: FOLD AND ORGANISE BEFORE YOU DELETE. Nothing is removed from the
// model (settings.test.ts still pins every value); the controls a player reaches for are plain
// rows, and the niche extras sit in one collapsed `details` group each — available, not in the way.
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
const section = html.slice(html.indexOf('<section id="sheet-settings"'), html.indexOf('</section>', html.indexOf('<section id="sheet-settings"')));

const idsIn = (chunk: string): string[] => [...chunk.matchAll(/data-setting="([^"]+)"/g)].map((m) => m[1]!);
const settingIds = idsIn(section).sort();

/** Every setting id that lives inside a collapsed `<details>` group (the Lab holds none). */
const folded = new Set<string>();
for (const group of section.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)) for (const id of idsIn(group[1] ?? '')) folded.add(id);

const groupIds = [...section.matchAll(/<details\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]!).sort();
const copyKeys = [...section.matchAll(/data-copy="([^"]+)"/g)].map((m) => m[1]!);

describe('Settings sheet: few rows on the surface, the niche extras folded', () => {
  it('keeps every setting the model has — nothing was removed', () => {
    expect(settingIds).toEqual([
      'autoSkip', 'coach', 'eyeCandy', 'largeText', 'music',
      'placementList', 'reduceMotion', 'sound', 'vibration', 'weakPulse', 'weakSpots',
    ]);
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

  it('the teaching aids are folded into one group, with Coach kept on the surface', () => {
    expect(folded.has('coach'), 'Coach is the main one — it stays visible').toBe(false);
    for (const id of ['placementList', 'weakSpots', 'weakPulse']) expect(folded.has(id), id).toBe(true);
  });

  it('the look, sound, motion and help groups exist (and the Lab keeps its own id)', () => {
    expect(groupIds).toEqual(['settings-help', 'settings-lab', 'settings-look', 'settings-motion', 'settings-sound']);
  });

  it('the labels are short, not paragraphs', () => {
    expect(SETTINGS.eyeCandy).toBe('Decorative effects'); // was a whole sentence of four effects
    expect(SETTINGS.eyeCandy.length).toBeLessThanOrEqual(24);
    expect(SETTINGS.autoSkip).toBe('Auto-skip empty turns');
    expect(SETTINGS.music).toBe('Music'); // the "(quiet hum)" aside is gone
    expect(section, 'the old four-effect paragraph must not come back').not.toContain('opening splash, home heartbeat');
  });

  it('every word comes from src/strings.ts (SETTINGS), and every key it names exists', () => {
    expect(copyKeys.length).toBeGreaterThan(20);
    const table = SETTINGS as unknown as Record<string, unknown>;
    for (const key of copyKeys) {
      expect(Object.prototype.hasOwnProperty.call(table, key), `SETTINGS is missing "${key}"`).toBe(true);
      expect(String(table[key]).length, `SETTINGS.${key} must not be empty`).toBeGreaterThan(0);
    }
  });
});
