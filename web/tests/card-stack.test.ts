// ONE DECK, TWO PLACES. The pre-game ritual handles a nine-card stack and the dock's draw pile is
// the same object once those cards are back in it (owner, 2026-11-14: "make the draw pile look
// exactly like the pile in ritual at the end when cards coming back together in middle screen").
// `ui/card-stack.ts` is the single definition of that stack; this suite holds both painters to it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARD_STACK_BOX, CARD_STACK_FAN, CARD_STACK_TILT, cardStackPose, cardStackPosePx, cardStackShadow,
} from '../src/ui/card-stack.js';
import { CARDS_CSS } from '../src/player/cards.js';

const STYLE_CSS = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rule = (src: string, selector: string): string => {
  const start = src.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf('}', start) + 1).replace(/\s+/g, ' ');
};

describe('a face-down stack is one fan shape', () => {
  it('keeps the ritual\u2019s shipped nine-card fan exactly', () => {
    // Measured on the live overlay at 390x844 before this module existed: the bottom card of the
    // ritual deck sat 2.4px right, 5.76px down and 1.04\u00b0 against the top one.
    expect(cardStackPosePx(9, 8)).toEqual({ x: 2.4, y: 5.76, rot: -1.04 });
    expect(cardStackPosePx(9, 0)).toEqual({ x: 0, y: 0, rot: 0 });
    // The fan is a share of the card box, so it travels with the deck at any size.
    expect(CARD_STACK_FAN.x / 100 * CARD_STACK_BOX.width).toBeCloseTo(2.4, 2);
    expect(CARD_STACK_FAN.y / 100 * CARD_STACK_BOX.height).toBeCloseTo(5.76, 2);
  });

  it('deepens monotonically: every card under the face sits further right, down and tilted', () => {
    let previous = cardStackPose(9, 0);
    for (let depth = 1; depth < 9; depth++) {
      const pose = cardStackPose(9, depth);
      expect(pose.x).toBeGreaterThan(previous.x);
      expect(pose.y).toBeGreaterThan(previous.y);
      expect(pose.rot).toBeLessThan(previous.rot);
      previous = pose;
    }
    // Nine cards, one fan: the last step lands on the whole fan, never past it.
    expect(previous.x).toBeCloseTo(CARD_STACK_FAN.x, 3);
    expect(previous.rot).toBeCloseTo(-CARD_STACK_TILT, 3);
    // A single card is square — no fan to spread over.
    expect(cardStackPose(1, 0)).toEqual({ x: 0, y: 0, rot: 0 });
  });
});

describe('the draw pile draws the ritual\u2019s deck', () => {
  const near = cardStackPose(3, 1);
  const far = cardStackPose(3, 2);

  it('fans its two layers with the shared poses, not hand-typed offsets', () => {
    expect(rule(CARDS_CSS, '.pile-stack::after { translate:'))
      .toContain(`translate:${near.x}% ${near.y}%; rotate:${near.rot}deg`);
    expect(rule(CARDS_CSS, '.pile-stack::before { translate:'))
      .toContain(`translate:${far.x}% ${far.y}%; rotate:${far.rot}deg`);
  });

  it('prints the card back on every layer, at the printed corner, with no slab or frame', () => {
    const layers = CARDS_CSS.slice(CARDS_CSS.indexOf('.futa04-cards .card.back,'), CARDS_CSS.indexOf('.futa04-cards .card.back {'));
    expect(layers).toContain('#deck .pile-stack::before');
    expect(layers).toContain('#deck .pile-stack::after');
    expect(layers).toContain('background-image:url(');
    expect(layers).toContain('border-color:transparent');
    // The old grey slab: an opaque surface fill plus its own hairline behind the face.
    const layerBase = rule(CARDS_CSS, '.futa04-cards #deck .pile-stack::after { border:0;');
    expect(layerBase).toContain('background-color:transparent');
    expect(layerBase).toContain('border:0');
    // No hard edge may fake thickness: a zero-offset/zero-blur ring is the banned contour.
    for (const selector of ['.pile-stack::before { translate:', '.pile-stack::after { translate:']) {
      expect(rule(CARDS_CSS, selector)).not.toMatch(/box-shadow:[^;]*\b0 0 0 /);
    }
    // Every layer of both piles still wears the printed card corner (player/cards.ts).
    expect(rule(CARDS_CSS, '.futa04-cards .dock :is(#deck,#discard) :is(.pile-card')).toContain('border-radius:5.9% / 4.2%');
  });

  it('casts one contact shadow under the lowest visible card, the ritual\u2019s own', () => {
    // The ritual paints its stack shadow in style.css; that copy must be the same share of the box.
    expect(rule(STYLE_CSS, ".ritual-deck-layer[data-i='0']"))
      .toContain('box-shadow: 0 18px 40px rgba(0, 0, 0, .45)');
    expect(cardStackShadow(CARD_STACK_BOX)).toBe('0 18px 40px rgba(0,0,0,0.45)');
    // The pile scales it by its own height, so a phone pile and a desktop pile cast the same shadow.
    expect(CARDS_CSS).toContain('calc(var(--pile-h, 71px) * 0.148)');
    expect(CARDS_CSS).toContain('calc(var(--pile-h, 71px) * 0.328)');
    // Only the lowest visible layer: one card has none to cast, and 3+ cards put it on the far layer.
    expect(CARDS_CSS).toContain("#deck[data-layers='2'] .pile-stack::after { box-shadow:");
    expect(CARDS_CSS).toContain("#deck:is([data-layers='3'],[data-layers='4']) .pile-stack::before { box-shadow:");
    // The face itself never carries a shadow any more (it used to, and the layers below it had none).
    expect(CARDS_CSS).not.toMatch(/#deck \.pile-stack \{[^}]*box-shadow/);
  });

  it('keeps the base layer geometry off the old slab (fill and hairline live on the face only)', () => {
    const base = rule(STYLE_CSS, '.pile-stack,\n.pile-stack::before,');
    expect(base).not.toContain('--c-surface');
    expect(base).not.toContain('--c-line');
    expect(rule(STYLE_CSS, '.pile-stack {')).toContain('background: var(--c-surface)');
    expect(rule(STYLE_CSS, '.pile-stack::after {\n  content:')).toContain('z-index: -1');
  });
});
