import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { S, SQ3 } from '../src/ui/geom.js';
import { GOLD_FRAME_SCALE, goldFrameSize } from '../src/ui/goldframe-geometry.js';

// The board and the piles are drawn, not computed, so these are the invariants the owner's
// 2026-11-14 report ("cards still look trimmed", "on draw pile the corners look wrong", "random
// thing above the 9 stone") is held by. Each was a real, measured fault. Where the value is
// reachable at runtime the assertion calls it (gold frames go through the shared geometry module);
// source text is pinned only where a DOM would be needed to observe the drawing.
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
    // BEHAVIOUR, not source text: the frame's box comes from the shared geometry module, which
    // multiplies the hex by the cell's own scale, so an outer hex on a bent board draws a smaller
    // rim rather than one whose edge overhangs the seam and gets sliced by the next cell.
    const flat = goldFrameSize(1);
    const bent = goldFrameSize(0.8);
    expect(bent.width).toBeCloseTo(flat.width * 0.8, 10);
    expect(bent.height).toBeCloseTo(flat.height * 0.8, 10);
    // The shared 5% trim is part of the same box, and keeps the frame inside its hex (the untrimmed
    // 2.02S frame is wider than the 2S hex, which is what put metal over the seam).
    expect(GOLD_FRAME_SCALE).toBeGreaterThan(0);
    expect(GOLD_FRAME_SCALE).toBeLessThan(1);
    expect(flat.width).toBeCloseTo(S * 2.02 * GOLD_FRAME_SCALE, 10);
    expect(flat.height).toBeCloseTo(S * SQ3 * 1.01 * GOLD_FRAME_SCALE, 10);
    expect(flat.width).toBeLessThan(S * 2);
    expect(flat.height).toBeLessThan(S * SQ3);
    // The drawing itself needs a DOM, so this one wiring is pinned in source: the live board hands
    // the shared module the cell's own scale (the replay canvas calls the same `goldFrameSize`), so
    // the two painters cannot drift apart.
    const frames = read('ui/goldframes.ts');
    expect(frames).toContain('goldFrameSize(cellScale(key))');
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

  it('keeps the hand fan inside its row and every card’s own centre its own', () => {
    const css = read('style.css');
    // The clamp the owner's 2026-11-14 report asked for ("cards still look trimmed"): the overlap
    // is measured against the hand's own box and the hand's real card count, so a full hand cannot
    // run out of its slot and off the screen.
    const hand = rule(css, '  margin-left: max(');
    expect(hand).toContain('100%');
    expect(hand).toContain('var(--n)');
    // 0.86, measured: that clamp alone could squeeze the step below HALF a card (33-38px against
    // 37-42px card halves), and the next card's rotated face then took this card's centre — a tap
    // on the first card hit the second, and `elementFromPoint(centre)` returned the neighbour on
    // every card but the last. The floor is the tap invariant: it may only ever WIDEN the fan
    // (never narrow it), and the row has room for a full hand at 72x102 / 84x119 / 167x237.
    expect(hand).toContain('2px - var(--cw) / 2');
    expect(hand.indexOf('max(')).toBeLessThan(hand.indexOf('min('));
  });
});
