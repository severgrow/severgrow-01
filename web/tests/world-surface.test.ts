// The world map's SURFACE, locked at the source so it cannot silently drift again.
//
// Owner (2026-10-16): "the background behind it should use the same grained background we have
// under main menu etc ... everything alligned really well, consistent with menu and the duel game".
//
// The page background is ONE global element (`#texture` in web/src/style.css) which paints the soil
// radial gradient, the SVG grain and the vignette at z-index 0. Every `.screen` is transparent over
// it, which is exactly how the main menu and the game screen rest on it. The world map screen used
// to paint its own flat `var(--c-bg)` fill at z-index 3, covering the grain on that one screen
// (measured: background luminance sd 0.42 vs 3.80 on the same patch of the menu).
//
// `web/e2e/world-map-header.ts` measures the built page, pixels included. This test guards the CSS
// that produces it, so a rename or a stray override fails `npm run check` immediately instead of
// waiting for the next visual pass.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const styleCss = read('../src/style.css');
const onlineCss = read('../src/online/online-css.ts');
const html = read('../index.html');

/** Every flat rule of a stylesheet, preludes tidied (comments removed, whitespace collapsed). */
const rules = (css: string): { prelude: string; body: string }[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({
      prelude: (m[1] ?? '').slice((m[1] ?? '').lastIndexOf('*/') + 2).replace(/\s+/g, ' ').trim(),
      body: m[2] ?? '',
    }))
    .filter((r) => !r.prelude.startsWith('@') && r.prelude !== '');

/** The selector list of a rule, split so a multi-line list matches each selector exactly. */
const selectorsOf = (prelude: string): string[] => prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim());

/** The declaration body of the rule whose selector list contains EXACTLY `selector`. */
const bodyOf = (css: string, selector: string): string | null =>
  rules(css).find((r) => selectorsOf(r.prelude).includes(selector))?.body ?? null;

describe('the world map rests on the ONE shared page surface', () => {
  it('the world screen paints NO background of its own (the grain shows through)', () => {
    const body = bodyOf(onlineCss, '.online-world');
    expect(body, 'the .online-world base rule must exist').not.toBeNull();
    expect(body!, 'the world screen must declare background: none').toContain('background: none');
    expect(body!, 'no opaque fill may be re-added to the world screen').not.toMatch(/background:\s*(var\(--c-bg\)|#[0-9a-f]{3,8}|rgb)/i);
  });

  it('the other online screens KEEP their opaque fill (this change is the world map only)', () => {
    // The hub / waiting / join centre a narrow column and are asserted opaque by
    // web/e2e/online-lobby-overlay.ts; only the world map stands on the shared surface.
    for (const selector of ['.online-hub', '.online-waiting', '.online-join']) {
      const body = bodyOf(onlineCss, selector);
      expect(body, `${selector} base rule must exist`).not.toBeNull();
      expect(body!, `${selector} must stay opaque`).toContain('background: var(--c-bg)');
    }
  });

  it('the shared .screen rule stays transparent, so EVERY screen inherits the grain', () => {
    const body = bodyOf(styleCss, '.screen');
    expect(body, 'the shared .screen rule must exist').not.toBeNull();
    expect(body!, '.screen must not paint a background').not.toMatch(/background\s*:/);
  });

  it('the world map defines no grain of its own (there is ONE definition, in style.css)', () => {
    expect(onlineCss, 'online-css.ts must not carry a noise data-URI').not.toContain('feTurbulence');
    expect(onlineCss, 'online-css.ts must not carry an inline SVG background').not.toContain('data:image/svg+xml');
  });

  it('the global grain still lives once on #texture, on the soil theme', () => {
    // The ONE element, in the page markup.
    expect((html.match(/id="texture"/g) ?? []).length, 'exactly one #texture element').toBe(1);
    // The grain itself: the soil treatment of that element's ::before pseudo.
    const grain = bodyOf(styleCss, "[data-theme='soil'] #texture::before");
    expect(grain, "the soil grain rule must exist").not.toBeNull();
    expect(grain!).toContain('feTurbulence');
    expect(grain!).toContain('0.16');
    // Painted by the one global element, under everything else.
    const texture = bodyOf(styleCss, '#texture');
    expect(texture, 'the #texture rule must exist').not.toBeNull();
    expect(texture!).toContain('position: fixed');
    expect(texture!, 'the page surface sits at z-index 0, under every screen').toContain('z-index: 0');
  });

  it('the map keeps its contained window (a bounded inset surface, not a bare area)', () => {
    const grid = bodyOf(onlineCss, '.world-grid');
    expect(grid, 'the .world-grid window rule must exist').not.toBeNull();
    expect(grid!, 'the window keeps its corner').toContain('border-radius: 14px');
    expect(grid!, 'the window keeps its own inset surface').toContain('radial-gradient');
    expect(grid!, 'the window keeps its inset shadow').toContain('inset');
  });
});
