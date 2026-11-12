// THE CHAPTER LIST'S NUMERALS — the unit half of `web/e2e/campaign-chapters.ts`.
//
// The level list is built from `CAMPAIGN_CHAPTERS`, so it grows to ten chapters when chapters VIII-X
// land; today it renders seven. The browser suite therefore proves the headers that EXIST read the
// right numerals, and this test proves the mapping the list will use for 8, 9 and 10 — VIII, IX, X —
// without waiting for the boards. A player finishing chapter VII must see "Chapter VIII" next, not
// "Chapter 8" (the function's fallback for an unmapped number).
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_CHAPTERS } from '../../src/campaign/index.js';
import { CAMPAIGN } from '../../src/strings.js';

/** The ten Roman numerals the list is designed to read, in order. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

/** The numeral alone, without the "Chapter " prefix. */
const numeral = (chapter: number): string => CAMPAIGN.chapterName(chapter).replace(/^Chapter /, '');

describe('the chapter list reads in Roman numerals up to X', () => {
  it('every built chapter names itself in order', () => {
    CAMPAIGN_CHAPTERS.forEach((chapter, index) => {
      expect(CAMPAIGN.chapterName(chapter.number)).toBe(`Chapter ${ROMAN[index]}`);
    });
  });

  it('the chapters after the built list are already mapped: VIII, IX and X', () => {
    // Owned by the browser suite's growth to ten: when chapters VIII-X land, these are the names the
    // list paints. The assertion is on the NUMERAL, so a fallback to "Chapter 8" fails loudly.
    expect(numeral(8)).toBe('VIII');
    expect(numeral(9)).toBe('IX');
    expect(numeral(10)).toBe('X');
    expect(CAMPAIGN.chapterName(8)).toBe('Chapter VIII');
    expect(CAMPAIGN.chapterName(9)).toBe('Chapter IX');
    expect(CAMPAIGN.chapterName(10)).toBe('Chapter X');
  });

  it('no numeral repeats, so two chapters can never read the same', () => {
    const numerals = ROMAN.map((_, index) => numeral(index + 1));
    expect(new Set(numerals).size).toBe(numerals.length);
  });
});
