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

  it('keeps the hand fan inside the hand\u2019s own slot', () => {
    const css = read('style.css');
    const hand = rule(css, '  margin-left: min(calc(var(--slice, 40px) - var(--cw))');
    expect(hand).toContain('100%');
    expect(hand).toContain('var(--n)');
  });

  it('paints the pile\u2019s two slabs behind the card back, so the back is the visible face', () => {
    // THE OWNER'S BUG (2026-11-14): "the back of the cards - draw pile is broken - no skin".
    // `.pile-stack` carries the card-back art, but the ::before/::after slabs were opaque
    // `--c-surface` and, because a pseudo-element always paints above its own element's
    // background, they covered it completely: the pile read as plain grey slabs with a diagonal
    // hatch. `z-index:-1` puts them behind the stack's own fill but in front of the (isolated)
    // card box, so the offsets show as card thickness. A DOM is needed to *see* this, so the
    // source text is pinned; web/e2e/futa04-pile-back.ts measures the computed styles and pixels.
    const css = read('style.css');
    // `.pile-stack::before,\n.pile-stack::after` also appears inside the shared first rule, so the
    // block is matched with a regex that requires the slab-only declarations to be present.
    const slabs = /\.pile-stack::before,\s*\.pile-stack::after \{[^}]*content: '[^']*'[^}]*z-index: -1;[^}]*\}/s.exec(css);
    expect(slabs, 'the slab rule carries z-index: -1').not.toBeNull();
    // The negative layer needs its own stacking context to stay inside the card box.
    expect(rule(css, '.pile-card {')).toContain('isolation: isolate;');
    // The hatch faked a pattern on a blank slab; with the real back in front it only shows as a
    // few stray ticks on a 4px edge, so it is gone.
    expect(rule(css, '.pile-stack::after {')).not.toContain('repeating-linear-gradient');
  });
});
