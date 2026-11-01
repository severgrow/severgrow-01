// The tutorial's lesson names (owner, 2026-11-01: "in tutorial in settings in level 1-9 give each
// lesson a short name"). ONE frozen map in src/strings.ts, keyed by lesson number; the Settings
// tutorial list reads it and never carries a name of its own.
//
// A name is a chapter title, not the rule read back: 2-3 words, Title Case, no full stop, and
// distinct from every other lesson's. Level 10 is the send-off, not a teaching beat, so it has no
// name and no placeholder.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LESSON, TUTORIAL_REPLAY } from '../../src/strings.js';

const names = LESSON.names;
const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const html = read('../index.html');

/** The nine chapters, pinned: changing one is a deliberate copy edit, not a refactor. */
const PINNED: Readonly<Record<number, string>> = Object.freeze({
  1: 'First Steps',
  2: 'Higher Ground',
  3: 'Stone and Gold',
  4: 'Severed Branch',
  5: 'First Bloom',
  6: 'The Ring Closes',
  7: 'The Ninth Falls',
  8: 'The Great Sweep',
  9: 'The Other Pile',
});

describe('tutorial lesson names', () => {
  it('is ONE frozen map with exactly the teaching lessons, 1-9', () => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(Object.keys(names).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Lesson 10 is the send-off: no name, no empty-string placeholder, no key at all.
    expect((names as Record<number, string | undefined>)[10]).toBeUndefined();
    expect(Object.values(names)).not.toContain('');
  });

  it('pins the nine names exactly', () => {
    expect(names).toEqual(PINNED);
  });

  it('each is 2-3 words, Title Case, with no full stop', () => {
    // Title Case as the game's own level names use it: every word capitalised except the small
    // joining words ("Stone in the Grass", "Heart of Stone"). A chapter title is not a sentence,
    // so it carries no full stop (checked below).
    const minor = new Set(['and', 'of', 'in', 'the', 'a', 'on', 'to', 'at', 'by', 'for']);
    for (const [number, name] of Object.entries(names)) {
      const words = name.split(' ');
      expect(words.length, `${number}: ${name}`).toBeGreaterThanOrEqual(2);
      expect(words.length, `${number}: ${name}`).toBeLessThanOrEqual(3);
      for (const [index, word] of words.entries()) {
        const allowed = index > 0 && minor.has(word) ? /^[a-z]+$/ : /^[A-Z][a-z]+$/;
        expect(word, `${number}: "${name}" is not Title Case at "${word}"`).toMatch(allowed);
      }
      expect(name, `${number}: ${name} must not end on a full stop`).not.toMatch(/[.!]$/);
    }
  });

  it('every name is distinct', () => {
    const values = Object.values(names);
    expect(new Set(values).size).toBe(values.length);
  });

  it('a name says what the lesson gives you, never the rule word for word', () => {
    // The finish cards' "YOU LEARNED" lines are the rule in one breath; a chapter title is not a
    // copy of them. This keeps "BOMB ONE TILE" from becoming a lesson name.
    const learned = new Set([
      'DRAW, GROW, THROW', 'STRONGER TILES WIN', 'GOLD COUNTS DOUBLE', 'CUT THEIR ROOT',
      'BLOOM THREE AT ONCE', 'SURROUND THEIR HOME', 'BOMB ONE TILE', 'BLAST A HOLE',
      'BLOOM FROM THE THROW PILE',
    ]);
    for (const name of Object.values(names)) expect(learned.has(name.toUpperCase())).toBe(false);
    // And the retired "seed" vocabulary never reaches the player (web/tests/seed-words.test.ts):
    // "First Seed" was the document's heading for level 1, not a name this game may show.
    for (const name of Object.values(names)) expect(name).not.toMatch(/\b(?:seeds?|plant|planted)\b/i);
  });
});

describe('Settings → Tutorial renders the names beside the lessons', () => {
  it('the sheet builds a name line from LESSON.names, not from hard-coded copy', () => {
    const from = main.indexOf('function renderTutorialSheet()');
    expect(from, 'renderTutorialSheet must exist').toBeGreaterThan(-1);
    const sheet = main.slice(from, main.indexOf('function startTutorialLevel', from));

    // The map is read for the tile's own number...
    expect(sheet).toMatch(/const name = LESSON\.names\[level\.number\]/);
    // ...and the name is the row's second line, right after the number in the same plate.
    expect(sheet).toMatch(/num\.className = 'ct-num'/);
    expect(sheet).toMatch(/label\.className = 'ct-name'/);
    expect(sheet).toMatch(/label\.textContent = name/);
    expect(sheet.indexOf("num.className = 'ct-num'")).toBeLessThan(sheet.indexOf("label.className = 'ct-name'"));
    expect(sheet).toContain('b.append(num)');
    expect(sheet).toContain('b.append(label)');
    expect(sheet.indexOf('b.append(num)')).toBeLessThan(sheet.indexOf('b.append(label)'));
    // A screen reader hears the name too: the spoken label takes it as an argument.
    expect(sheet).toMatch(/TUTORIAL_REPLAY\.levelAria\(level\.number, name\)/);
  });

  it('no component or markup carries a lesson name of its own', () => {
    for (const name of Object.values(PINNED)) {
      expect(main, `main.ts must not hard-code "${name}"`).not.toContain(name);
      expect(html, `index.html must not hard-code "${name}"`).not.toContain(name);
    }
  });

  it('the spoken label names the lesson when it has one, and stays clean at level 10', () => {
    expect(TUTORIAL_REPLAY.levelAria(3, 'Stone and Gold')).toBe('Level 3. Stone and Gold. Play the tutorial lesson.');
    expect(TUTORIAL_REPLAY.levelAria(10)).toBe('Level 10. Play the tutorial lesson.');
  });
});
