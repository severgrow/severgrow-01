// The Throw pile's presentation in the product (owner, 2026-10-30):
//
//   "when throwing, remove the outer contour rectangle around discard pile - but make the pile
//    bigger after player selects a card to throw."
//
// Two contracts, both pinned here as CSS source shape (the same way the repo's other CSS tests
// pin it), then proved in a real browser by web/e2e/throw-pile-presentation.ts:
//
//   1. NO CONTOUR IN THE THROW STEP. The contour was the hard, zero-blur ring in the pile's
//      `.gd-halo` box-shadow (`0 0 0 1px` / `0 0 0 1.5px`) — a rounded rectangle drawn just
//      outside the card. The soft falloff under it stays: the pile is still lit, it just has no
//      outline. The other steps keep their own light (the Draw step's cream glow, and the base
//      `.gd-halo` ring the classic copies still use) — the owner only complained about Throw.
//
//   2. THE PILE GROWS WHEN A CARD IS PICKED. A real size change on ONE node, by transform only,
//      on the acknowledgement beat the game already uses (`--dur-ack` / `--ease-standard`).
//      Reduce motion still ENDS bigger — the size is information, only the transition goes.
import { describe, expect, it } from 'vitest';
import { INFORMATION_CSS } from '../src/player/information.js';
import { PLAYER_CSS } from '../src/player/player-css.js';

/** The body of the first rule whose selector is `<selector> {`. */
const rule = (src: string, selector: string): string => {
  const start = src.indexOf(selector);
  expect(start, `the stylesheet has ${selector}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', start);
  const close = src.indexOf('}', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return src.slice(open + 1, close).replace(/\s+/g, ' ').trim();
};

/** Every rule body in `src` whose selector mentions all of `parts`. */
const rulesWith = (src: string, ...parts: string[]): { selector: string; body: string }[] => {
  const out: { selector: string; body: string }[] = [];
  for (const match of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.replace(/\s+/g, ' ').trim();
    if (parts.every((p) => selector.includes(p))) out.push({ selector, body: match[2]!.replace(/\s+/g, ' ').trim() });
  }
  return out;
};

const scaleOf = (body: string): number => {
  const match = /transform:\s*scale\(([\d.]+)\)/.exec(body);
  expect(match, `transform: scale(…) in "${body}"`).toBeTruthy();
  return Number(match![1]);
};

const THROW_HALO = "html.futa04-information[data-step='throw'] #discard .gd-halo";
const TARGET_HALO = 'html.futa04-information #futa04-box #discard.futa04-throw-target .gd-halo';
const TARGET = 'html.futa04-information #futa04-box #discard.futa04-throw-target';

describe('the Throw pile has no contour while throwing', () => {
  it('the resting throw light is a falloff, not a ring', () => {
    const halo = rule(INFORMATION_CSS, THROW_HALO);
    // The contour was a spread-only layer: `0 0 0 <n>px <colour>` paints a hard rectangle.
    expect(halo).not.toMatch(/box-shadow:[^;]*\b0 0 0 /);
    // The soft ember light is still there (this is not "remove the glow").
    expect(halo).toMatch(/box-shadow:[^;]*0 0 22px 2px rgba\(173,64,47,\.32\)/);
  });

  it('the picked pile lights the same way, with no ring either', () => {
    const halo = rule(INFORMATION_CSS, TARGET_HALO);
    expect(halo).not.toMatch(/box-shadow:[^;]*\b0 0 0 /);
    expect(halo).toMatch(/box-shadow:[^;]*0 0 26px 4px rgba\(190,80,60,\.42\)/);
    expect(halo).toContain('opacity: 1');
  });

  it('no other throw-step rule paints a box ring on the Throw pile', () => {
    // `.gd-halo`/`.gd-ring`/`.pile-card`/`#discard` covers every layer that could trace the card.
    for (const { selector, body } of rulesWith(INFORMATION_CSS, "#discard")) {
      if (!selector.includes("throw") && !selector.includes('futa04-throw-target')) continue;
      expect(body, selector).not.toMatch(/\b0 0 0 [\d.]+px/);
      expect(body, selector).not.toMatch(/\boutline:\s*(?!none)/);
    }
  });

  it('leaves the other steps alone: the Draw glow and the classic ring are untouched', () => {
    // Draw: the cockpit's soft cream light, which was already ringless.
    expect(rule(INFORMATION_CSS, 'html.futa04-information .dock #futa04-box .gd-halo'))
      .toContain('box-shadow: 0 0 24px 2px rgba(var(--gd-cream), .72)');
    // The shared base halo (classic copies, other steps) keeps its cream ring.
    const base = rule(PLAYER_CSS, '.gd-halo {');
    expect(base).toContain('0 0 0 1.5px rgba(var(--gd-cream), 0.7)');
    expect(base).toContain('0 0 27px 2px rgba(var(--gd-cream), 0.75)');
  });
});

describe('the Throw pile grows when a card is picked to throw', () => {
  it('is meaningfully bigger than its resting size, and than the old 1.08 swell', () => {
    const target = rule(INFORMATION_CSS, TARGET);
    const scale = scaleOf(target);
    // A real size step: the old swell was 1.08, and the value the browser suite measures must be
    // comfortably above it, so the pile reads as the target rather than as a rounding difference.
    expect(scale).toBeGreaterThan(1.08);
    expect(scale).toBeGreaterThanOrEqual(1.16);
    // It cannot grow past the cockpit: the pile sits in a 104px-tall plate on a wide screen.
    expect(scale).toBeLessThanOrEqual(1.2);
  });

  it('grows on the acknowledgement beat, by transform on one node', () => {
    const target = rule(INFORMATION_CSS, TARGET);
    expect(target).toMatch(/transition:[^;]*transform var\(--dur-ack\) var\(--ease-standard\)/);
    // Transform only: no reflow, so the hand and the neighbouring deck cannot move.
    expect(target).not.toMatch(/(^|;)\s*(width|height|padding|margin|font-size)\s*:/);
    expect(target).not.toMatch(/will-change/);
    expect(target).not.toMatch(/animation:/);
    // And the resting pile carries no scale of its own.
    expect(rule(INFORMATION_CSS, "html.futa04-information:not([data-step='draw']) #futa04-box #discard"))
      .not.toMatch(/transform:\s*scale/);
  });

  it('still ends bigger under Reduce motion — only the transition goes', () => {
    const grown = scaleOf(rule(INFORMATION_CSS, TARGET));
    const still = rule(INFORMATION_CSS, 'html.futa04-information.reduce-motion #futa04-box #discard.futa04-throw-target');
    expect(scaleOf(still)).toBe(grown);
    expect(still).toContain('transition: none');
    // The same holds through the media query, for a player who never toggles the setting.
    const blocks = [...INFORMATION_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => /html\.futa04-information #futa04-box #discard\.futa04-throw-target \{([^}]*)\}/.exec(m[1]!))
      .find((m) => m !== null);
    expect(blocks, 'a prefers-reduced-motion rule for the target').toBeTruthy();
    expect(scaleOf(blocks![1]!)).toBe(grown);
    expect(blocks![1]).toContain('transition: none');
  });
});
