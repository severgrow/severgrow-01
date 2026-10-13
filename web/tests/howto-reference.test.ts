// The moves reference: one source of truth for the Match Intel "How to" tab (FUTASAKU) and the
// legacy How-to-play sheet. It must list every move a player can make, in the game's own rule
// words (src/strings.ts), and it must be pure text — no per-match hidden information.
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/index.js';
import { BLAST, BLOOM, FRUIT, HELP, SPROUT } from '../../src/strings.js';
import { howToReferenceHtml } from '../src/logic/howto-reference.js';

describe('moves reference (How to)', () => {
  it('explains every move a player can make', () => {
    const ref = howToReferenceHtml();
    for (const move of ['Grow', 'Bloom', 'Strengthen', 'Bomb', 'Blast', 'points', 'Stay joined', 'Win early', 'The end', 'Keyboard'])
      expect(ref, move).toContain(move);
  });

  it('uses the real shared rule sentences, not a paraphrase', () => {
    const ref = howToReferenceHtml();
    expect(ref).toContain(BLOOM.howto);
    expect(ref).toContain(SPROUT.howto);
    expect(ref).toContain(FRUIT.howto.trim());
    expect(ref).toContain(BLAST.howto.trim());
  });

  it('never mentions the Bomb by its retired name', () => {
    expect(howToReferenceHtml()).not.toMatch(/\bfruit cards?\b/i);
  });

  it('is pure: the same text every time, with no hidden match information', () => {
    const a = howToReferenceHtml();
    const b = howToReferenceHtml();
    expect(a).toBe(b);
    expect(a).not.toMatch(/seed/i);
    expect(a).not.toMatch(/opponent's hand|their hand|deck order/i);
  });

  it('follows the rules config: no Strengthen / Bomb sections when they are off', () => {
    const config = { ...newGame(1).config, allowStrengthen: false, fruitCardCount: 0 };
    const ref = howToReferenceHtml(config);
    expect(ref).not.toContain('<b>Strengthen:</b>');
    expect(ref).not.toContain(FRUIT.howto.trim());
  });

  it('keeps the tab label in one place (src/strings.ts)', () => {
    expect(HELP.howToTab).toBe('How to');
    expect(HELP.intelTab).toBe('Match Intel');
    expect(HELP.howToTitle).toBe('How to play');
  });
});
