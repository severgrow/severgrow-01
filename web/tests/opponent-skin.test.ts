// THE OPPONENT SKIN SEAM. Every campaign chapter wears today's skin, so resolving a chapter's
// opponent look is a no-op for the render. These tests pin that: all ten chapter numbers answer,
// chapters whose levels do not exist yet still answer, and an unknown/absent chapter falls back
// instead of throwing. (When a chapter gets its own art, only `OPPONENT_SKIN_IDS` and the resolver
// change; these tests will name the expected ids.)
import { describe, expect, it } from 'vitest';
import {
  CURRENT_OPPONENT_SKIN,
  LAST_SKIN_CHAPTER,
  OPPONENT_SKIN_IDS,
  opponentSkinForChapter,
} from '../src/player/opponent-skin.js';

describe('the per-chapter opponent skin seam', () => {
  it('answers the current skin for every supported chapter, 1 through 10', () => {
    expect(LAST_SKIN_CHAPTER).toBe(10);
    for (let chapter = 1; chapter <= LAST_SKIN_CHAPTER; chapter++) {
      expect(opponentSkinForChapter(chapter), `chapter ${chapter}`).toBe(CURRENT_OPPONENT_SKIN);
    }
  });

  it('answers for chapters whose levels do not exist yet (8, 9, 10)', () => {
    for (const chapter of [8, 9, 10]) {
      expect(() => opponentSkinForChapter(chapter)).not.toThrow();
      expect(opponentSkinForChapter(chapter)).toBe(CURRENT_OPPONENT_SKIN);
    }
  });

  it('falls back to the current skin for an unknown or absent chapter, never throws', () => {
    const absent = [undefined, null, '', 'two'] as unknown as number[];
    for (const chapter of [0, -1, 11, 999, 1.5, Number.NaN, Infinity, ...absent]) {
      expect(() => opponentSkinForChapter(chapter), String(chapter)).not.toThrow();
      expect(opponentSkinForChapter(chapter), String(chapter)).toBe(CURRENT_OPPONENT_SKIN);
    }
  });

  it('names exactly one skin today, and it is the current one', () => {
    expect(OPPONENT_SKIN_IDS).toEqual(['default']);
    expect(CURRENT_OPPONENT_SKIN).toBe('default');
  });
});
