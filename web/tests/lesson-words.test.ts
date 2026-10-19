// The lessons' words: labels, not paragraphs, and one word list everywhere.
import { describe, expect, it } from 'vitest';
import { LESSON } from '../../src/strings.js';

const words = (t: string) => t.replace(/[»:]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const entries = Object.entries(LESSON).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as const] : []));
/**
 * The reason lines are the `…Line` keys and the finish card's one line (it says how you won);
 * everything else is a short label (instruction, answer, title).
 */
const FINISH_LINES = new Set(['wonOnPoints', 'wonByKo', 'goldDecided']);
const isReason = (k: string) => k.endsWith('Line') || FINISH_LINES.has(k);

describe('lesson words', () => {
  it('instructions and answers are 6 words or fewer', () => {
    for (const [k, v] of entries.filter(([k]) => !isReason(k))) expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(6);
    expect(words(LESSON.tooWeak(9, 9)).length).toBeLessThanOrEqual(6);
  });
  // Owner, 2026-10-19: reason lines are full sentences; the rule is now "fits in two lines" on the
  // smallest phone (320 px) rather than 12 words. 72 characters is the longest measured to fit two
  // lines there at the lesson window's 12 px (web/e2e/lessons-3.ts measures the real window).
  // Two lines are shown with a title in front: "You grew." and "Pile almost empty.".
  const SHOWN_AFTER: Record<string, string> = { youGrewLine: 'You grew. ', pileLowLine: 'Pile almost empty. ' };
  it('reason lines fit in two lines (72 characters, with any title shown in front)', () => {
    for (const [k, v] of entries.filter(([k]) => k.endsWith('Line'))) {
      const shown = (SHOWN_AFTER[k] ?? '') + v;
      expect(shown.length, `${k}: ${shown}`).toBeLessThanOrEqual(72);
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
