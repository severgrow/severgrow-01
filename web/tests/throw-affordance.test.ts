// The Throw step's affordance (owner, 2026-10-25).
//
// Once a card is picked, the player must see where it can go: the Throw pile is never dimmed
// during the throw, and it swells once on selection. The swell is transform-only (no reflow, the
// hand cannot move), centred on its own box (never the deck's), and static under Reduce motion.
// This pins the CSS contract; futa04-swipe-throw.ts proves it in a real browser.
import { describe, expect, it } from 'vitest';
import { INFORMATION_CSS } from '../src/player/information.js';

const rule = (selector: string): string => {
  const start = INFORMATION_CSS.indexOf(selector);
  expect(start, `the stylesheet has ${selector}`).toBeGreaterThanOrEqual(0);
  const open = INFORMATION_CSS.indexOf('{', start);
  const close = INFORMATION_CSS.indexOf('}', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return INFORMATION_CSS.slice(open + 1, close).replace(/\s+/g, ' ');
};

const scaleOf = (body: string): number => {
  const match = /transform:\s*scale\(([\d.]+)\)/.exec(body);
  expect(match, `transform: scale(…) in "${body}"`).toBeTruthy();
  return Number(match![1]);
};

describe('the Throw pile during a throw', () => {
  it('is never dimmed: the deck recedes, the pile stays fully opaque and brighter', () => {
    const pile = rule("html.futa04-information[data-step='throw'] #futa04-box #discard");
    expect(pile).toContain('opacity: 1');
    expect(pile).toMatch(/filter: brightness\(1\.\d+\)/);
    expect(pile).not.toContain('!important');

    const deck = rule("html.futa04-information[data-step='throw'] #futa04-box #deck");
    expect(deck).toContain('opacity: .48');
    expect(deck).toContain('grayscale');
  });

  it('swells once on selection, within 1.06-1.12, with transform only', () => {
    const target = rule('html.futa04-information #futa04-box #discard.futa04-throw-target');
    const scale = scaleOf(target);
    expect(scale).toBeGreaterThanOrEqual(1.06);
    expect(scale).toBeLessThanOrEqual(1.12);
    // A scale property would compose independently of the boomerang's rect; the owner asked for
    // transform, which is also what getBoundingClientRect() reports to the flight.
    expect(target).not.toMatch(/(^|;)\s*scale:/);
    expect(target).toContain('opacity: 1');
  });

  it("scales about the pile's own centre and uses the interface-motion tokens", () => {
    // Its own origin, not the page's: the swell is centred on the pile, so it cannot shift or
    // borrow space from the neighbouring deck.
    const origin = rule("html.futa04-information:not([data-step='draw']) #futa04-box #discard");
    expect(origin).toContain('transform-origin: 50% 50%');

    const target = rule('html.futa04-information #futa04-box #discard.futa04-throw-target');
    expect(target).toContain('var(--ix-open)');
    expect(target).toContain('var(--ix-ease-open)');
    // One calm arrival, never a loop.
    expect(target).not.toContain('animation');
    expect(target).not.toContain('infinite');
  });

  it('lights the existing edge rather than inventing a second one', () => {
    const halo = rule('html.futa04-information #futa04-box #discard.futa04-throw-target .gd-halo');
    expect(halo).toContain('opacity: 1');
    expect(halo).toMatch(/box-shadow:/);
  });

  it('drops the scale under Reduce motion and keeps the light', () => {
    const still = rule('html.futa04-information.reduce-motion #futa04-box #discard.futa04-throw-target');
    expect(still).toContain('transform: none');
    // The static emphasis is the brighter filter, not a smaller animation.
    expect(INFORMATION_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*html\.futa04-information #futa04-box #discard\.futa04-throw-target \{ transform: none; \}/,
    );
  });
});
