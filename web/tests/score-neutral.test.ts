// The score's digits are NEUTRAL (owner, 2026-10-20). Green/red on the points read as good/bad
// or as two colour-coded teams, so both players' numbers take one cream and are told apart by
// position and the separator. Ownership colour (tiles, territory, the marks) keeps its meaning.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIGHT_TONES } from '../src/player/light.js';
import { SCORE_INK, SCORE_SEPARATOR_INK, ledLayout } from '../src/player/led-cells.js';
import { PLAYER_CSS } from '../src/player/player-css.js';

const style = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const cssRule = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the score read-out is not colour-coded', () => {
  it('both players’ LED digits are the one ivory, in the same run of dots', () => {
    expect(SCORE_INK).toBe('ivory');
    const dots = ledLayout('27:12', false, 'score', 1).dots;
    const owned = dots.filter(dot => dot.tone === 'green' || dot.tone === 'red');
    expect(owned).toHaveLength(0);
    // The digits either side of the separator are the same tone: only position says whose is whose.
    const colon = ledLayout('27:12', false, 'score', 1);
    expect(colon.dots.every(dot => dot.tone === SCORE_INK || dot.tone === SCORE_SEPARATOR_INK)).toBe(true);
    expect(LIGHT_TONES[SCORE_INK].core).toBe('#f5ead1');
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
    const scores = cssRule(PLAYER_CSS, '.gm-you b,');
    expect(scores).toContain('color: var(--c-text)');
    expect(scores).not.toContain('--c-you');
    expect(scores).not.toContain('--c-bot');
    // The turn word is not a score digit: it may still say whose turn it is in colour.
    expect(PLAYER_CSS).toContain('.gm-turn.you b');
  });
});
