import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The board and the piles are drawn, not computed, so these are the invariants the owner's
// 2026-11-14 report ("cards still look trimmed", "on draw pile the corners look wrong", "random
// thing above the 9 stone") is held by. Each was a real, measured fault; a source assertion keeps
// the next edit from quietly putting it back.
const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const rule = (src: string, selector: string) => {
  const start = src.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf('}', start) + 1);
};

describe('board and dock layering, 0.86 fixes', () => {
  it('fits a rock picture inside its own hex, so it cannot sit on a neighbour', () => {
    // The sprite boxes run to ~62.2 x 59.06 board units where a hex is 60 x 51.96.
    const board = read('ui/defaultArtBoard.ts');
    const scale = Number(/const ROCK_ART_SCALE = ([\d.]+);/.exec(board)?.[1]);
    expect(scale).toBeGreaterThan(0);
    // Tallest rock picture (rock-04, 59.062 units) at the chosen scale, against the hex (51.96).
    expect(59.062 * scale).toBeLessThanOrEqual(52);
    expect(board).toContain('cellScale(key) * ROCK_ART_SCALE');
  });

  it('draws a gold rim at the cell\u2019s own scale and never masks it with a spill outline', () => {
    const frames = read('ui/goldframes.ts');
    expect(frames).toContain('const k = cellScale(key);');
    expect(frames).toContain('S * 2.02 * k');
    const board = read('ui/defaultArtBoard.ts');
    // The traced spill outline is drawn a little OUTSIDE the tree and the smoke, so masking the rim
    // with it deleted a band no art covers. The home's own layer already covers the rim.
    expect(board).not.toMatch(/drawGoldFrame\([^)]*\)\.setAttribute\('mask'/);
  });

  it('gives every pile layer, on both piles, the printed card\u2019s corner', () => {
    const cards = read('player/cards.ts');
    const pile = rule(cards, '.futa04-cards .dock :is(#deck,#discard) :is(.pile-card');
    expect(pile).toContain('border-radius:5.9% / 4.2%');
    expect(pile).toContain('.pile-stack::before');
    expect(pile).toContain('.pile-stack::after');
    expect(pile).toContain('.pile-top.card');
    // Only the deck's top card wears the back: a back painted into the slabs put extra printed
    // frames inside the pile.
    expect(cards).not.toMatch(/#deck \.pile-stack::(before|after)\s*\{\s*\n?\s*background-image/);
  });

  it('keeps the hand fan inside the hand\u2019s own slot', () => {
    const css = read('style.css');
    const hand = rule(css, '  margin-left: min(calc(var(--slice, 40px) - var(--cw))');
    expect(hand).toContain('100%');
    expect(hand).toContain('var(--n)');
  });
});
