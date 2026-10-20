// The lesson's lit breath: which targets take it, and that it is transform-only.
import { describe, expect, it } from 'vitest';
import { LESSON_BREATH, breathesWithLesson } from '../src/player/lesson-breath.js';

describe('the lesson breath', () => {
  it('breathes on a card, a pile or a control key', () => {
    // Owner, 2026-10-20: the lit thing must never stop breathing — "pills (Draw pile, Throw pile,
    // Bloom button, end-turn) and CARDS must breathe, not only hexes".
    expect(breathesWithLesson('card')).toBe(true);
    expect(breathesWithLesson('pill')).toBe(true);
  });

  it('never doubles a hex (it already breathes on the board) and never touches the display', () => {
    expect(breathesWithLesson('hex')).toBe(false);
    expect(breathesWithLesson('none')).toBe(false);
  });

  it('is one slow 3% scale: enough to see, never a bounce', () => {
    expect(LESSON_BREATH).toEqual({ ms: 1800, scale: 1.03 });
    expect(LESSON_BREATH.ms).toBeGreaterThan(1500);
    expect(LESSON_BREATH.ms).toBeLessThan(2500);
  });
});
