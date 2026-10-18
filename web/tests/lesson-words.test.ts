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
  it('reasons are 12 words or fewer', () => {
    for (const [k, v] of entries.filter(([k]) => isReason(k))) expect(words(v).length, `${k}: ${v}`).toBeLessThanOrEqual(12);
  });
  it('never "set" or "run" for a Bloom, never Fruit, Campaign or bot, never a tile colour', () => {
    // "runs out" / "ran out" is the Draw pile's clock (SPEC), not the Bloom word.
    const banned = /\b(sets?|fruit|campaign|bots?|green|red|blue|yellow)\b|\bruns?\b(?!\s+out)/i;
    for (const [k, v] of entries) expect(banned.test(v), `${k}: ${v}`).toBe(false);
  });
});
