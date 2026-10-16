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
import { WORLD_CELLS } from '../../server/src/world.js';

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

  it('the map window HUGS the map instead of stretching to fill the column', () => {
    // Owner, 2026-10-16: the map letterboxed inside a taller window (65px of band at 360x640, 144px
    // at 390x844). The window now carries the map's OWN aspect ratio, so the SVG fills it; the flex
    // basis must stay `auto` and the window must never GROW to take the column's spare height.
    const grid = bodyOf(onlineCss, '.world-grid');
    expect(grid, 'the .world-grid window rule must exist').not.toBeNull();
    expect(grid!, 'the window must be sized by the map ratio').toMatch(/aspect-ratio:\s*[\d.]+ \/ [\d.]+/);
    expect(grid!, 'the window must not grow to fill the column').not.toMatch(/flex:\s*1 1 auto/);
    expect(grid!, 'the height is the ratio, so it must not be stretched').not.toMatch(/flex:\s*1\s*;/);
  });

  it('that ratio IS the world geometry, so a changed map cannot silently letterbox again', () => {
    // Mirrors the viewBox `web/src/online/world-view.ts` builds from the cells: R = 10, X = sqrt(3),
    // and a 6-unit pad on every side. If the world's shape ever changes, this fails and the window's
    // ratio has to move with it.
    const R = 10;
    const X = Math.sqrt(3);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { q, r } of WORLD_CELLS) {
      const x = X * (q + r / 2) * R;
      const y = 1.5 * r * R;
      minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R);
      minY = Math.min(minY, y - R); maxY = Math.max(maxY, y + R);
    }
    const fitWidth = maxX - minX + 12;
    const fitHeight = maxY - minY + 12;
    const grid = bodyOf(onlineCss, '.world-grid')!;
    const declared = /aspect-ratio:\s*([\d.]+) \/ ([\d.]+)/.exec(grid);
    expect(declared, 'the window must declare the map ratio').toBeTruthy();
    const cssRatio = Number(declared![1]) / Number(declared![2]);
    const svgRatio = fitWidth / fitHeight;
    expect(Math.abs(cssRatio - svgRatio), `css ${cssRatio.toFixed(4)} vs world ${svgRatio.toFixed(4)}`).toBeLessThan(0.002);
    // The same pair must drive the viewport-height cap, or a wide screen would letterbox again.
    expect(grid!, 'the height cap must use the same ratio').toContain('274.49 / 272');
  });
});

describe('the world column shares the menu column edge', () => {
  it('the world column uses the menu’s 16px side gutters', () => {
    // Owner, 2026-10-16: the world's full-bleed padding was 12px against the menu column's 16px.
    const inner = bodyOf(onlineCss, '.online-world .online-inner');
    expect(inner, 'the world column rule must exist').not.toBeNull();
    const padding = /padding:\s*([^;]+);/.exec(inner!)![1]!;
    // Each side is `max(<n>px, env(safe-area-inset-<side>))`, so read the number off the side's own
    // term rather than splitting the shorthand on whitespace (the max() call contains spaces).
    const sideGutter = (side: string) =>
      Number(new RegExp(`max\\((\\d+)px,\\s*env\\(safe-area-inset-${side}\\)\\)`).exec(padding)?.[1]);
    expect(sideGutter('left'), 'the left gutter must be the menu\u2019s 16px').toBe(16);
    expect(sideGutter('right'), 'the right gutter must be the menu\u2019s 16px').toBe(16);
    // And the menu column really is a 16px gutter on a phone: `min(420px, 100% - 32px)`.
    expect(bodyOf(styleCss, '.menu-inner'), 'the menu column rule must exist').toContain('width: min(420px, 100% - 32px)');
  });

  it('the controls anchor to the bottom edge, so the shorter window cannot leave a dead band', () => {
    const selection = bodyOf(onlineCss, '.world-selection');
    expect(selection, 'the selection rule must exist').not.toBeNull();
    expect(selection!, 'the controls must anchor to the bottom').toContain('margin-top: auto');
  });
});
