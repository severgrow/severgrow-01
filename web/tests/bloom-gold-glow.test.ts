// The Bloom-completing gold on the Throw pile (owner, 2026-10-30):
//
//   "the gold glow around discard pile when it makes bloom - i dont like the color, its to
//    mustardy, make it more like heavenly gold glow"
//
// Mustard is a low-brightness, high-chroma yellow-green ring: the old rim was rgba(212,175,55) /
// rgba(196,152,42) — hue 45-49 with its chroma concentrated at the card's edge, so the whole ring
// read as khaki. Heavenly gold is the OPPOSITE shape: a near-white cream CORE, with the metal
// reading coming from a richer gold that lives in the MIDDLE of the falloff, not on the rim.
//
// This pins the colour algebra; web/e2e/throw-pile-glow.ts proves the painted pixels behave the
// same way (peak lightness at the core, peak saturation in the falloff).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SMART_COCKPIT_CSS } from '../src/player/smart-cockpit.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const cockpit = read('../src/player/smart-cockpit.ts');

const SELECTOR = "html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-top.card {";
const body = (): string => {
  const start = cockpit.indexOf(SELECTOR);
  expect(start, 'the Bloom-completing gold rule').toBeGreaterThanOrEqual(0);
  return cockpit.slice(start, cockpit.indexOf('}', start)).replace(/\s+/g, ' ');
};

type RGB = readonly [number, number, number];

/** `rgba(r, g, b, a)` → [r, g, b] (every colour in the rule is written without spaces). */
const rgb = (token: string): RGB => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(token);
  expect(m, `a colour in "${token}"`).toBeTruthy();
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

/** HSV, the measure that tracks "how yellow it reads": HSL saturation of a pale tint is always
 *  near 1 and would call cream the most saturated pixel, which is the trap this change is about. */
const hsv = ([r, g, b]: RGB) => {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rf) h = 60 * ((((gf - bf) / d) % 6) + 6) % 360;
    else if (max === gf) h = 60 * ((bf - rf) / d + 2);
    else h = 60 * ((rf - gf) / d + 4);
  }
  return { h: Math.round(h), s: max === 0 ? 0 : d / max, v: max };
};

/** The glow's box-shadow layers, innermost first, as {rgb, blur, spread}. The pile's own drop
 *  shadow (`0 2px 4px rgba(0,0,0,.45)`) is not light: it has a vertical offset and is skipped. */
const layers = (): { rgb: RGB; blur: number; spread: number; token: string }[] => {
  const css = body();
  const shadow = /box-shadow:\s*([^;]+);/.exec(css)?.[1];
  expect(shadow, 'box-shadow in the gold rule').toBeTruthy();
  return shadow!
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter((part) => /^0\s+0\s/.test(part))
    .map((part) => {
      const m = /0\s+0\s+(\d+)px(?:\s+(\d+)px)?\s+(rgba?\([^)]+\))/.exec(part);
      expect(m, `a 0 0 <blur> <colour> layer in "${part}"`).toBeTruthy();
      return { rgb: rgb(m![3]!), blur: Number(m![1]), spread: Number(m![2] ?? 0), token: m![3]! };
    });
};

describe('the Bloom-completing gold is metal, not mustard', () => {
  it('the core is pale cream: near-white, almost no chroma', () => {
    const inner = layers()[0]!;
    const { h, s, v } = hsv(inner.rgb);
    expect(v).toBeGreaterThanOrEqual(0.96);
    expect(s).toBeLessThanOrEqual(0.22);
    expect(h).toBeGreaterThan(30);
    expect(h).toBeLessThan(50);
    // The owner's own words for the highlight, as a value the stylesheet must carry.
    expect(body()).toContain('rgba(255,246,214');
  });

  it('the gold lives in the falloff — the most chroma is not at the rim', () => {
    const list = layers();
    const rim = hsv(list[0]!.rgb);
    const all = list.map((layer) => ({ ...layer, ...hsv(layer.rgb) }));
    const mostSaturated = all.reduce((a, b) => (b.s > a.s ? b : a));
    const brightest = all.reduce((a, b) => (b.v > a.v ? b : a));
    // Peak brightness sits at the cream core; peak chroma sits further out, in a soft (blurred) layer.
    expect(brightest.v).toBeGreaterThan(mostSaturated.v);
    expect(mostSaturated.s).toBeGreaterThan(rim.s);
    expect(mostSaturated.s).toBeGreaterThanOrEqual(0.55);
    expect(mostSaturated.blur).toBeGreaterThanOrEqual(6);
    expect(mostSaturated.v).toBeLessThan(1);
    // And the gold is warm, not the greenish cast mustard had: hue of the rich layer, 35-45.
    expect(mostSaturated.h).toBeGreaterThanOrEqual(34);
    expect(mostSaturated.h).toBeLessThanOrEqual(46);
  });

  it('the rim and the border are cream, and the old mustard literals are gone', () => {
    const css = body();
    expect(css).not.toContain('212,175,55');
    expect(css).not.toContain('196,152,42');
    const border = rgb(/border-color:\s*(rgba?\([^)]+\))/.exec(css)![1]!);
    expect(hsv(border).v).toBeGreaterThanOrEqual(0.96);
    expect(hsv(border).s).toBeLessThanOrEqual(0.25);
  });

  it('stays inside the existing budget: no filter, no blur animation, no new timer', () => {
    const css = body();
    expect(css).not.toMatch(/filter\s*:/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/blur\(/);
    expect(css).not.toMatch(/animation\s*:/);
    // Still one shadow transition on the acknowledgement beat, as before.
    expect(css).toContain('transition:transform var(--dur-ack) var(--ease-standard)');
    // Scoped to the Throw pile's Bloom, so the tile gold frames are untouched.
    expect(SMART_COCKPIT_CSS).toContain(SELECTOR.slice(0, -2));
    expect(/--c-gold\s*:/.test(cockpit)).toBe(false);
  });
});
