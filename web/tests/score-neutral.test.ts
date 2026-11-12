// The score's digits are NEUTRAL (owner, 2026-10-20). Green/red on the points read as good/bad
// or as two colour-coded teams, so both players' numbers take one cream and are told apart by
// position and the separator. Ownership colour (tiles, territory, the marks) keeps its meaning.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIGHT_TONES } from '../src/player/light.js';
import { SCORE_INK_OPP, SCORE_INK_YOU, SCORE_SEPARATOR_INK, ledLayout } from '../src/player/led-cells.js';

const style = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const cssRule = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the score read-out is not colour-coded', () => {
  it('each player’s LED digits take their own ink, split at the separator', () => {
    // Owner (2026-10-21) reversed the interim neutral pass: you are green, they are red. The split
    // is by POSITION (left of the colon vs right), so a colour-blind player still reads it.
    expect(SCORE_INK_YOU).toBe('green');
    expect(SCORE_INK_OPP).toBe('red');
    const layout = ledLayout('27:12', false, 'score', 1);
    const colon = 2; // the third glyph in "27:12"
    expect(LIGHT_TONES[SCORE_INK_YOU].core).toBe('#a9d886');
    expect(LIGHT_TONES[SCORE_INK_OPP].core).toBe('#e4705e');
    // Only three inks may appear: my digits, the punctuation, their digits.
    const allowed = new Set([SCORE_INK_YOU, SCORE_SEPARATOR_INK, SCORE_INK_OPP]);
    expect(layout.dots.every(dot => allowed.has(dot.tone))).toBe(true);
    expect(colon).toBeGreaterThan(0);
  });

  it('the header score numbers are the page’s text cream, not --c-you / --c-bot', () => {
    const rule = cssRule(style, '.score.you .num,');
    expect(rule).toContain('color: var(--c-text)');
    expect(rule).not.toContain('--c-you');
    expect(rule).not.toContain('--c-bot');
    // The marks beside the numbers still carry the ownership colours (that is their job).
    expect(style).toContain('.mark.you {');
    expect(style).toContain('.mark.bot {');
  });

  it('the pause menu’s score numbers are neutral too, while its turn line keeps its colour', () => {
    // The pause panel's read-out lives in style.css (`#sheet-menu .gm-readout`) since the panel was
    // rebuilt as one machine face; the digits are neutral there, and whose is whose is said by
    // position and the separator, never by hue.
    const scores = cssRule(style, '#sheet-menu .gm-you b,');
    expect(scores).toContain('color: var(--c-text)');
    expect(scores).not.toContain('--c-you');
    expect(scores).not.toContain('--c-bot');
    expect(cssRule(style, '#sheet-menu .gm-bot b')).toContain('color: var(--c-text)');
    // The turn word is not a score digit: it may still say whose turn it is in colour.
    expect(style).toContain('.gm-turn');
  });
});
