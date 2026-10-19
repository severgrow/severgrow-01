// The lessons' words: an action on the display, an explanation in the info box, one word list.
import { describe, expect, it } from 'vitest';
import { LESSON } from '../../src/strings.js';

const words = (t: string) => t.replace(/[»:]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const entries = Object.entries(LESSON).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as const] : []));

/**
 * The DISPLAY carries the action: a short line, never a lone word. The INFO BOX carries an
 * explanation: one full sentence (the `…Line` keys), shown once. Answers and finish titles are
 * short labels of their own.
 */
const DISPLAY = [
  'tapDraw', 'tapThrowPile', 'chooseCard', 'tapTile', 'tapTiles', 'throwCard', 'tapThrow', 'tapSkip',
  'tapBloom', 'tapBlast', 'chooseBomb', 'bombTile', 'tapTheirTile', 'tapLastSide',
  'bloomHello', 'bombHello', 'theirTurn', 'lastCards', 'lastTurn',
] as const;

const FINISH_LINES = new Set(['wonOnPoints', 'wonByKo', 'goldDecided']);

describe('lesson words', () => {
  it('the four core explanations are the owner’s sentences, exactly', () => {
    expect(LESSON.theirHomeLine).toBe('To win: surround the opponent’s home by placing cards on the board, or have more tiles on the board when the Draw pile runs out.');
    expect(LESSON.tapDrawLine).toBe('You start every turn by drawing 1 card from the Draw pile or Throw pile.');
    expect(LESSON.growLine).toBe('Grow: drag one of your cards from your hand onto the board, or tap it to select and then place on the board.');
    expect(LESSON.throwLine).toBe('Throw: swipe up, drag it to the Throw pile, or double tap to discard a card and finish your turn.');
  });

  it('the piles use the game’s own names everywhere: Draw pile and Throw pile, never "discard pile"', () => {
    for (const [k, v] of entries) {
      expect(v, `${k}: ${v}`).not.toMatch(/discard pile/i);
      // A lowercase pile name reads as a common noun, not the game's name for a place on the board.
      expect(v, `${k}: ${v}`).not.toMatch(/\b(draw|throw) pile/);
    }
  });

  it('the display says what to do, never a lone word', () => {
    for (const k of DISPLAY) {
      const n = words(LESSON[k]).length;
      expect(n, `${k}: ${LESSON[k]}`).toBeGreaterThanOrEqual(2);
      expect(n, `${k}: ${LESSON[k]}`).toBeLessThanOrEqual(6);
    }
  });

  it('answers and finish titles are 6 words or fewer', () => {
    const short = entries.filter(([k]) => !k.endsWith('Line') && !FINISH_LINES.has(k) && !(DISPLAY as readonly string[]).includes(k));
    for (const [k, v] of short) expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(6);
    expect(words(LESSON.tooWeak(9, 9)).length).toBeLessThanOrEqual(6);
  });

  // The box has room for a full sentence (the owner's four are 100-140 characters). Four lines at
  // 12.5 px on a 320 px phone is the layout budget; web/e2e/lessons-3.ts measures the real box.
  it('explanations are full sentences that fit four lines on the smallest phone', () => {
    for (const [k, v] of entries.filter(([k]) => k.endsWith('Line'))) {
      expect(v.length, `${k}: ${v}`).toBeLessThanOrEqual(160);
      expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(28);
      expect(v.endsWith('.'), `${k}: ${v}`).toBe(true);
      expect(/^[A-Z]/.test(v), `${k}: ${v}`).toBe(true);
    }
  });

  it('finish lines are 12 words or fewer', () => {
    for (const [k, v] of entries.filter(([k]) => FINISH_LINES.has(k))) expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(12);
  });

  it('never "set" or "run" for a Bloom, never Fruit, Campaign, bot, tree or take over, never a tile colour', () => {
    // "runs out" / "ran out" is the Draw pile's clock (SPEC), not the Bloom word.
    // Owner, 2026-10-19: it is your HOME, never your tree; never "take over" (cut / disconnect).
    const banned = /\b(sets?|fruit|campaign|bots?|green|red|blue|yellow|tree)\b|\bruns?\b(?!\s+out)|\btakes?\s+over\b/i;
    for (const [k, v] of entries) expect(banned.test(v), `${k}: ${v}`).toBe(false);
  });
});
