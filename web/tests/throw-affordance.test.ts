// The Throw step's affordance (owner, 2026-10-25; resized 2026-10-30).
//
// Once a card is picked, the player must see where it can go: the Throw pile is never dimmed
// during the throw, and it swells once on selection. The swell is transform-only (no reflow, the
// hand cannot move), centred on its own box (never the deck's).
//
// OWNER, 2026-10-30: "make the pile bigger after player selects a card to throw". The swell was
// 1.08, which read as a rounding difference; it is now the largest step the cockpit plate allows
// (the pile sits in a 104 px plate on a wide screen), on the game's acknowledgement beat
// (`--dur-ack` / `--ease-standard`) rather than a second, interface-motion duration. Under Reduce
// motion the pile still ENDS bigger — the size is information; only the transition goes.
// This pins the CSS contract; futa04-swipe-throw.ts and throw-pile-presentation.ts prove it in a
// real browser.
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

  it('swells once on selection — clearly bigger (1.16-1.20), with transform only', () => {
    const target = rule('html.futa04-information #futa04-box #discard.futa04-throw-target');
    const scale = scaleOf(target);
    // Bigger than the old 1.08 swell, and bounded by the cockpit plate it grows inside.
    expect(scale).toBeGreaterThan(1.08);
    expect(scale).toBeGreaterThanOrEqual(1.16);
    expect(scale).toBeLessThanOrEqual(1.2);
    // A scale property would compose independently of the boomerang's rect; the owner asked for
    // transform, which is also what getBoundingClientRect() reports to the flight.
    expect(target).not.toMatch(/(^|;)\s*scale:/);
    expect(target).toContain('opacity: 1');
  });

  it("scales about the pile's own centre and uses the game's acknowledgement beat", () => {
    // Its own origin, not the page's: the swell is centred on the pile, so it cannot shift or
    // borrow space from the neighbouring deck.
    const origin = rule("html.futa04-information:not([data-step='draw']) #futa04-box #discard");
    expect(origin).toContain('transform-origin: 50% 50%');

    const target = rule('html.futa04-information #futa04-box #discard.futa04-throw-target');
    // The selection is an acknowledgement: the same 96 ms beat a completed tap uses, never a
    // hand-picked duration of its own.
    expect(target).toMatch(/transform var\(--dur-ack\) var\(--ease-standard\)/);
    // One calm arrival, never a loop.
    expect(target).not.toContain('animation');
    expect(target).not.toContain('infinite');
  });

  it('lights the existing edge rather than inventing a second one', () => {
    const halo = rule('html.futa04-information #futa04-box #discard.futa04-throw-target .gd-halo');
    expect(halo).toContain('opacity: 1');
    expect(halo).toMatch(/box-shadow:/);
  });

  it('keeps its bigger size under Reduce motion, dropping only the transition', () => {
    const grown = scaleOf(rule('html.futa04-information #futa04-box #discard.futa04-throw-target'));
    const still = rule('html.futa04-information.reduce-motion #futa04-box #discard.futa04-throw-target');
    // The size is the information: it still ends bigger. Only the movement is dropped.
    expect(scaleOf(still)).toBe(grown);
    expect(still).toContain('transition: none');
    const blocks = [...INFORMATION_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => /html\.futa04-information #futa04-box #discard\.futa04-throw-target \{([^}]*)\}/.exec(m[1]!))
      .find((m) => m !== null);
    expect(blocks, 'the prefers-reduced-motion rule for the target').toBeTruthy();
    expect(scaleOf(blocks![1]!)).toBe(grown);
    expect(blocks![1]).toContain('transition: none');
  });
});
