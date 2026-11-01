// The tutorial's lesson names (owner, 2026-11-01: "in tutorial in settings in level 1-9 give each
// lesson a short name", then "make the names of lessons match the action they re teaching in each").
// ONE frozen map in src/strings.ts, keyed by lesson number; the Settings tutorial list reads it and
// never carries a name of its own.
//
// THE RULE THE OWNER SET (second direction, same day): a name NAMES THE ACTION the lesson drills, in
// the player's own words. It is deliberately NOT a poetic chapter title — the first set was
// ("First Steps", "The Ninth Falls") and the owner replaced it, because a player scanning Settings
// needs to see which lesson teaches the move they are stuck on. So a name may be one word when the
// action is one word ("Bloom", "Bomb", "Blast").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LESSON, TUTORIAL_REPLAY } from '../../src/strings.js';

const names = LESSON.names;
const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const html = read('../index.html');
const scripts = read('../../docs/LESSON-SCRIPTS.md');

/** The nine lessons, pinned: changing one is a deliberate copy edit, not a refactor. */
const PINNED: Readonly<Record<number, string>> = Object.freeze({
  1: 'Draw and Throw',
  2: 'Strengthen',
  3: 'Rock and Gold',
  4: 'Cut the Link',
  5: 'Bloom',
  6: 'Surround',
  7: 'Bomb',
  8: 'Blast',
  9: 'Throw Pile',
});

/**
 * The action words each lesson's own script heading drills (docs/LESSON-SCRIPTS.md). A name has to
 * contain at least one of them, so "The Ninth Falls" could never come back as the Bomb lesson.
 */
const ACTIONS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  1: ['draw', 'grow', 'throw'],
  2: ['strengthen', 'take', 'number', 'higher', 'win'],
  3: ['rock', 'gold'],
  4: ['cut', 'cutting', 'link', 'branch'],
  5: ['bloom'],
  6: ['surround', 'knock', 'home'],
  7: ['bomb'],
  8: ['blast'],
  9: ['throw', 'pile'],
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

  it('each is 1-3 words and Title Case, with no full stop', () => {
    // Title Case as the game's own level names use it: every word capitalised except the small
    // joining words ("Stone and Gold"). One word is allowed, because the action itself may be one
    // word ("Bloom", "Bomb", "Blast"). A name is not a sentence, so it carries no full stop.
    const minor = new Set(['and', 'of', 'in', 'the', 'a', 'on', 'to', 'at', 'by', 'for']);
    for (const [number, name] of Object.entries(names)) {
      const words = name.split(' ');
      expect(words.length, `${number}: ${name}`).toBeGreaterThanOrEqual(1);
      expect(words.length, `${number}: ${name}`).toBeLessThanOrEqual(3);
      for (const [index, word] of words.entries()) {
        const bare = word.replace(/,$/, ''); // "Draw," keeps its comma on screen, not in the check
        const allowed = index > 0 && minor.has(bare) ? /^[a-z]+$/ : /^[A-Z][a-z]+$/;
        expect(bare, `${number}: "${name}" is not Title Case at "${word}"`).toMatch(allowed);
      }
      expect(name, `${number}: ${name} must not end on a full stop`).not.toMatch(/[.!]$/);
    }
  });

  it('every name is distinct', () => {
    const values = Object.values(names);
    expect(new Set(values).size).toBe(values.length);
  });

  it('NAMES THE ACTION each lesson drills (owner, 2026-11-01, second direction)', () => {
    // "make the names of lessons match the action they re teaching in each". This is the inverse of
    // the first pass's rule, which kept a name from echoing the finish card's "YOU LEARNED" line:
    // the owner replaced chapter poetry with the action itself, so the action word is now REQUIRED.
    for (const [number, name] of Object.entries(names)) {
      const words = name.toLowerCase().split(/[\s,]+/).filter(Boolean);
      const allowed = ACTIONS[Number(number)]!;
      expect(
        words.some((word) => allowed.includes(word)),
        `${number}: "${name}" names none of the lesson's actions (${allowed.join(', ')})`,
      ).toBe(true);
    }
    // Every lesson's script heading carries the action, so the map above is grounded in the doc.
    for (const [number, heading] of [
      [1, 'LEVEL 1'], [2, 'LEVEL 2'], [3, 'LEVEL 3'], [4, 'LEVEL 4'], [5, 'LEVEL 5'],
      [6, 'LEVEL 6'], [7, 'LEVEL 7'], [8, 'LEVEL 8'], [9, 'LEVEL 9'],
    ] as const) {
      expect(scripts, `docs/LESSON-SCRIPTS.md must still have ${heading}`).toContain(heading);
    }
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
    // Only MULTI-WORD names can be checked this way. A one-word action name ("Bloom", "Bomb") is the
    // game's own vocabulary — main.ts passes 'Bloom' around as an action — so the meaningful rule for
    // those is structural, and the next test already proves it: the tile's label comes from
    // LESSON.names rather than from any literal. Here we only guard the distinctive copy.
    for (const name of Object.values(PINNED)) {
      if (name.split(' ').length < 2) continue;
      expect(main, `main.ts must not hard-code the lesson name "${name}"`).not.toContain(name);
      expect(html, `index.html must not hard-code the lesson name "${name}"`).not.toContain(name);
    }
    // And every name, including the one-word ones, reaches the screen ONLY through the map.
    expect(main).toMatch(/const name = LESSON\.names\[level\.number\]/);
  });

  it('the spoken label names the lesson when it has one, and stays clean at level 10', () => {
    expect(TUTORIAL_REPLAY.levelAria(3, 'Stone and Gold')).toBe('Level 3. Stone and Gold. Play the tutorial lesson.');
    expect(TUTORIAL_REPLAY.levelAria(10)).toBe('Level 10. Play the tutorial lesson.');
  });
});
