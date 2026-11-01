// THE AMBIENT MOTES ARE SOFT, AND SOFTNESS COSTS NOTHING (owner, 2026-11-01: "in the main menu we
// have those light white lights/dots flying upwards kinda - like them, dont change much but blurr
// them just slightly so it looks more natural").
//
// The obvious way to blur a dot is `filter: blur()`, and on this codebase that is exactly the
// wrong answer: a filter on an element that animates re-rasterises every frame. The Territory fog
// layer measured 80 ms of GPU paint with its blur against 33 ms without, and 188 raster-queue calls
// against 0 — the fog stutter the owner reported and we removed.
//
// So the mote is soft in its PAINT instead: a radial gradient from the text colour out to
// transparent. A gradient is rasterised once and then only the compositor's transform moves it, so
// the drift stays a transform-only animation. These tests exist to stop a future "let's just add a
// blur" from quietly putting the cost back.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const css = read('../src/style.css');

/** The `#spores i` rule, from its selector to the closing brace. */
const moteRule = (): string => {
  const start = css.indexOf('#spores i {');
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
};

describe('the drifting motes are soft, not blurry', () => {
  it('paints the softness as a radial gradient', () => {
    const rule = moteRule();
    expect(rule).toMatch(/background:\s*radial-gradient\(/);
    // The falloff reaches full transparency: a gradient that stops short leaves a visible rim.
    expect(rule).toContain('transparent');
    expect(rule).toMatch(/border-radius:\s*50%/);
  });

  it('never uses a filter on the animated mote (that is the cost we removed)', () => {
    const rule = moteRule();
    expect(rule).not.toMatch(/filter:/);
    expect(rule).not.toContain('blur(');
    // The whole ambient layer must not reintroduce it either.
    const layer = css.slice(css.indexOf('#spores {'), css.indexOf('@keyframes drift'));
    expect(layer).not.toMatch(/filter\s*:/);
  });

  it('keeps the drift a transform-only animation on its own layer', () => {
    const rule = moteRule();
    expect(rule).toContain('will-change: transform');
    expect(rule).toMatch(/animation:\s*drift\b/);
    const drift = css.slice(css.indexOf('@keyframes drift'), css.indexOf('@keyframes drift') + 400);
    // Every frame moves with transform; nothing animates a paint property.
    expect(drift).toMatch(/transform:\s*translate/);
    expect(drift).not.toMatch(/(box-shadow|filter|background|border-radius)\s*:/);
  });

  it('is still the same faint speck, and still respects Reduce motion', () => {
    const rule = moteRule();
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(rule)?.[1]);
    // Faint by design: a soft dot at roughly a seventh of full strength.
    expect(opacity).toBeGreaterThan(0.05);
    expect(opacity).toBeLessThan(0.3);
    expect(css).toMatch(/\.reduce-motion #spores\s*\{\s*display:\s*none/);
  });

  it('the terrarium spores use the same soft fill, not a hard disc', () => {
    const main = read('../src/main.ts');
    // One gradient, referenced by every spore in the terrarium art.
    expect(main).toContain('id="tr-spore-soft"');
    const sporeFill = main.match(/class="tr-spore[^"]*"[^>]*fill="([^"]+)"/g) ?? [];
    expect(sporeFill.length).toBe(3);
    for (const tag of sporeFill) expect(tag).toContain('url(#tr-spore-soft)');
  });
});
