// OWNER, 2026-11-20: "the color intensity of suits inside cards difference in hand during GROW
// and THROW selection. im talking red purple green inside etc. during grow the colors should be
// more vibrant, during throw insensity colors way lower, and then as it is now the selected one
// grey scale. we have system for that but it isnt set good".
//
// What was there: the step already owned the hand's LIGHT (the Grow glow vs the quieter Throw glow,
// pinned by card-contour.test.ts), but the printed face itself was byte-identical in both steps —
// so the suit glyphs' colour never answered the step. What is added: ONE static alpha veil over the
// printed face, written only as `--card-ink` by `data-step`, so GROW is the vibrant hand and THROW
// is the quiet one. The picked card keeps its existing greyscale and no veil.
import { describe, expect, it } from 'vitest';
import { CARD_INK, CARDS_CSS } from '../src/player/cards.js';
import { INFORMATION_CSS } from '../src/player/information.js';

type Rule = { selector: string; body: string };
const rules = (src: string): Rule[] =>
  [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.replace(/\s+/g, ' ').trim(),
    body: m[2]!.replace(/\s+/g, ' ').trim(),
  }));

const inkRule = (step: 'grow' | 'throw', extra = ''): Rule | undefined =>
  rules(CARDS_CSS).find((r) => r.selector.includes(`[data-step='${step}']`) && r.selector.includes('#hand .card') && r.selector.endsWith(`.card${extra}`));

describe('the suit ink answers the step (GROW vibrant, THROW quiet)', () => {
  it('THROW is turned down and GROW is not: the veil is the only state value', () => {
    expect(CARD_INK.grow).toBe(0); // full ink: nothing over the printed face
    expect(CARD_INK.throw).toBeGreaterThan(0.2);
    expect(CARD_INK.throw).toBeLessThan(0.5); // "way lower", but never grey
    expect(CARD_INK.throw).toBeGreaterThan(CARD_INK.grow);
    // The picked card is exactly as it is now: its greyscale filter is the whole treatment.
    expect(CARD_INK.picked).toBe(0);
  });

  it('one static veil over the printed face, in the card\'s shadow tone, alpha from --card-ink', () => {
    const veil = rules(CARDS_CSS).find((r) => r.selector.endsWith('.card > .futa04-card-art::after'));
    expect(veil, 'the veil belongs to the printed face').toBeTruthy();
    expect(veil!.body).toContain('position:absolute');
    expect(veil!.body).toContain('inset:0');
    expect(veil!.body).toContain('pointer-events:none');
    expect(veil!.body).toMatch(/background:rgb\([^)]*\/ var\(--card-ink, 0\)\)/);
    // Never a filter: this node sits inside the breathing hand (see player/smart-cockpit.ts).
    expect(veil!.body).not.toContain('filter');
    expect(veil!.body).not.toContain('animation');
  });

  it('both steps set the one property, scoped to the hand, and the picked card opts out', () => {
    const grow = inkRule('grow');
    const thrown = inkRule('throw');
    const picked = inkRule('throw', '.futa04-throw-picked');
    expect(grow, 'a GROW rule exists').toBeTruthy();
    expect(thrown, 'a THROW rule exists').toBeTruthy();
    expect(picked, 'the picked card opts out').toBeTruthy();
    expect(grow!.body).toContain(`--card-ink:${CARD_INK.grow}`);
    expect(thrown!.body).toContain(`--card-ink:${CARD_INK.throw}`);
    expect(picked!.body).toContain(`--card-ink:${CARD_INK.picked}`);
    // Scoped to #hand: the flyer and the piles wear the same .card class and must not be veiled.
    for (const rule of [grow!, thrown!, picked!]) {
      expect(rule.selector).toContain('#hand');
      expect(rule.body).not.toContain('filter');
      expect(rule.body).not.toContain('animation');
    }
  });

  it('the picked card still greyscales (owner: "as it is now the selected one grey scale")', () => {
    const picked = rules(INFORMATION_CSS).find((r) => r.selector.includes('.card.futa04-throw-picked') && r.body.includes('filter'));
    expect(picked).toBeTruthy();
    expect(picked!.body).toMatch(/filter:\s*grayscale\(1\)/);
  });
});
