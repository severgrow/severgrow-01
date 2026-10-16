// The world map's SURFACE, locked at the source so it cannot silently drift again.
//
// Owner (2026-10-16): "the background behind it should use the same grained background we have
// under main menu etc ... everything alligned really well, consistent with menu and the duel game".
//
// The page background is ONE global element (`#texture` in web/src/style.css) which paints the soil
// radial gradient and the vignette at z-index 0. Every `.screen` is transparent over it, which is
// exactly how the main menu and the game screen rest on it. The world map screen used to paint its
// own flat `var(--c-bg)` fill at z-index 3, covering that surface on that one screen (measured:
// background luminance sd 0.42 vs 3.80 on the same patch of the menu).
//
// The GRAIN moved OFF this element on 2026-10-16 (owner: "always on top top top layer - even when we
// add new things"). It is now the analogue film, `#futa04-film-grain` in web/src/player/atmosphere.ts,
// which sits above every layer - so it covers the interface, instead of the interface being cut out
// of it. It must NOT come back here: #texture sets a z-index, so it is a stacking context, and grain
// inside it could only ever rise above the background, never above the app.
// `tests/grain-on-top.test.ts` owns the layering rule; this file owns the surface.
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
const worldView = read('../src/online/world-view.ts');
const atmosphereTs = read('../src/player/atmosphere.ts');
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

  it('the world map defines no grain of its own (there is ONE definition, on the film)', () => {
    expect(onlineCss, 'online-css.ts must not carry a noise data-URI').not.toContain('feTurbulence');
    expect(onlineCss, 'online-css.ts must not carry an inline SVG background').not.toContain('data:image/svg+xml');
  });

  it('the grain lives ONCE, on the film above everything, and NOT on the background', () => {
    // The ONE page-surface element, in the page markup.
    expect((html.match(/id="texture"/g) ?? []).length, 'exactly one #texture element').toBe(1);
    // The surface must NOT carry the grain any more. Same strength as before: the grain rule must
    // still exist with the same noise and the same opacity, it has simply moved UP a layer.
    expect(
      bodyOf(styleCss, "[data-theme='soil'] #texture::before"),
      'the background must not paint the grain again - it would be cut out by the interface',
    ).toBeNull();
    const grain = bodyOf(atmosphereTs, '#futa04-film-grain');
    expect(grain, 'the film grain rule must exist').not.toBeNull();
    expect(grain!, 'the grain is the same SVG noise it always was').toContain('feTurbulence');
    expect(grain!, 'and the same opacity, 12% below what it was').toContain('.141');
    // The page surface itself is unchanged: fixed, and at the bottom under every screen.
    const texture = bodyOf(styleCss, '#texture');
    expect(texture, 'the #texture rule must exist').not.toBeNull();
    expect(texture!).toContain('position: fixed');
    expect(texture!, 'the page surface sits at z-index 0, under every screen').toContain('z-index: 0');
  });

  it('the world screen applies the safe-area inset EXACTLY ONCE', () => {
    // REGRESSION (owner's iPhone 15 Pro, 2026-10-16): the shared `.screen` rule pads by
    // env(safe-area-inset-*) and the world's own `.online-inner` pads by the same insets again. Both
    // were in force, so on a notched phone the column started 59px down AND was 100dvh tall, putting
    // its bottom at 911 on an 852px screen - and `.online-world` is `overflow: hidden`, so the last
    // 59px was silently cut. The owner saw it as "choose a tile to see who holds it is not visible".
    // So the screen must NOT reserve the insets; the inner owns them.
    const world = bodyOf(onlineCss, '.online-world');
    expect(world, 'the .online-world rule must exist').not.toBeNull();
    expect(world!.replace(/\s+/g, ''), 'the screen must not pad by the safe-area insets - that double-counts them')
      .toContain('padding:0');
    const inner = bodyOf(onlineCss, '.online-world .online-inner');
    expect(inner, 'the world column rule must exist').not.toBeNull();
    expect(inner!, 'the column is where the insets belong').toContain('env(safe-area-inset-top)');
    expect(inner!, 'and the bottom one too').toContain('env(safe-area-inset-bottom)');
  });

  it('the world wordmark sits where the live game puts it', () => {
    // The game's #hud-brand is align-self:start + margin-top:18px (not centred in its row), so its
    // top is safe-top + 18. Centring it in the world's 44px row instead put it 7px low.
    const brand = bodyOf(onlineCss, '.online-world .online-head > .online-brand');
    expect(brand, 'the world wordmark rule must exist').not.toBeNull();
    expect(brand!, 'must not centre in the row').toContain('align-self: start');
    expect(brand!.replace(/\s+/g, ''), 'must carry the game own 18px offset').toContain('margin-top:18px');
  });

  it('the map keeps its contained window (a bounded inset surface, not a bare area)', () => {
    const grid = bodyOf(onlineCss, '.world-grid');
    expect(grid, 'the .world-grid window rule must exist').not.toBeNull();
    expect(grid!, 'the window keeps its corner').toContain('border-radius: 14px');
    expect(grid!, 'the window keeps its own inset surface').toContain('radial-gradient');
    expect(grid!, 'the window keeps its inset shadow').toContain('inset');
  });

  it('the map window FILLS the column’s height (a fixed CSS ratio would letterbox again)', () => {
    // Owner, 2026-10-16. First the map letterboxed INSIDE a taller window (65px of band at 360x640,
    // 144px at 390x844); the fix then sized the window to the map's aspect, which moved the void
    // OUTSIDE the window. He chose a bigger map, so the window now takes the column's whole height
    // and the view is framed to the WINDOW in JS instead. A CSS `aspect-ratio` here would pin the
    // window to the map's shape again — exactly the letterboxing this replaced — so its absence is
    // the point, and the flex must genuinely grow.
    const grid = bodyOf(onlineCss, '.world-grid');
    expect(grid, 'the .world-grid window rule must exist').not.toBeNull();
    expect(grid!, 'the window must take the column’s leftover height').toMatch(/flex:\s*1 1 0/);
    expect(grid!, 'a fixed CSS ratio would letterbox the map again').not.toMatch(/aspect-ratio\s*:/);
    expect(grid!, 'the height must not be clamped to the map’s own shape').not.toMatch(/max-height:\s*calc\([^)]*\*[^)]*\)/);
  });

  it('the world geometry drives the width cap, and the framing lives in the view', () => {
    // Mirrors the viewBox `web/src/online/world-view.ts` builds from the cells: R = 10, X = sqrt(3),
    // and a 6-unit pad on every side. If the world's shape ever changes, this fails and the cap has
    // to move with it. (The view itself is framed by the WINDOW’s aspect at runtime, which is why
    // the ratio appears in the dvh cap and in world-view.ts, and no longer as a CSS aspect-ratio.)
    const R = 10;
    const X = Math.sqrt(3);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { q, r } of WORLD_CELLS) {
      const x = X * (q + r / 2) * R;
      const y = 1.5 * r * R;
      minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R);
      minY = Math.min(minY, y - R); maxY = Math.max(maxY, y + R);
    }
    const svgRatio = (maxX - minX + 12) / (maxY - minY + 12);
    expect(svgRatio, `the world is nearly square: ${svgRatio.toFixed(4)}`).toBeGreaterThan(0.99);

    const grid = bodyOf(onlineCss, '.world-grid')!;
    const cap = /calc\(\(100dvh - \d+px\) \* ([\d.]+) \/ ([\d.]+)\)/.exec(grid);
    expect(cap, 'the width cap must express the map ratio against the viewport height').toBeTruthy();
    const capRatio = Number(cap![1]) / Number(cap![2]);
    expect(Math.abs(capRatio - svgRatio), `cap ${capRatio.toFixed(4)} vs world ${svgRatio.toFixed(4)}`).toBeLessThan(0.002);

    // The framing rule: the view is sized to the WINDOW’s aspect, and the framed view is BOTH zoom
    // limits, so zooming out can never widen the box back to the world and letterbox it.
    expect(worldView, 'the view must frame itself to the window').toContain('boundsFor');
    expect(worldView, 'the window’s aspect must come from its measured box')
      .toMatch(/getBoundingClientRect\(\)[\s\S]{0,120}width \/ .{0,40}height/);
    expect(worldView, 'zoom-out must stop at the framed view, not the whole world')
      .toMatch(/Math\.max\(frame\[2\] \/ 4, Math\.min\(frame\[2\], bw \/ scale\)\)/);
    expect(worldView, 'a resize must re-frame the view').toContain('ResizeObserver');
  });

  it('no focus state may paint a default ring, and the keyboard indicator stays ours', () => {
    // Owner, 2026-10-16: a pointer click on a tabindex=0 hex focuses it WITHOUT matching
    // :focus-visible, so a :focus-visible-only rule left the browser painting its own rounded blue
    // ring — the "weird" bracket he photographed. Every focus state must be ring-free, and the
    // keyboard marker must be OUR hex-following stroke (turning the outline off alone would have
    // taken the only focus indicator away from keyboard users).
    const anyFocus = bodyOf(onlineCss, '.world-hex:focus');
    expect(anyFocus, '.world-hex:focus must exist (a pointer click focuses a hex)').not.toBeNull();
    expect(anyFocus!, 'no focus state may keep the browser ring').toContain('outline: none');
    const visible = bodyOf(onlineCss, '.world-hex:focus-visible');
    expect(visible, '.world-hex:focus-visible must exist').not.toBeNull();
    expect(visible!, 'the keyboard marker must be ours').toMatch(/stroke:\s*#[0-9a-f]{3,8}/i);
    expect(visible!, 'and a slight bump, so it is visible').toMatch(/stroke-width:\s*[\d.]+/);
  });

  it('tile shading comes from the owner colour, so no new colour enters the palette', () => {
    // Owner, 2026-10-16: "add some gradient ... but restrained ... FUTASAKU style". Each tile's fill
    // is a gradient built in world-view.ts from the colour the server already sends, so the palette
    // stays closed: the CSS must carry no new hex fill for the tiles, and the territory colour must
    // still drive the stroke.
    expect(worldView, 'the gradient must be derived from the owner colour').toContain('const shade');
    expect(worldView, 'and built as an SVG linearGradient').toContain('linearGradient');
    expect(worldView, 'the empty tiles need their own recessive face').toMatch(/EMPTY_FACE = face\(/);
    const held = bodyOf(onlineCss, '.world-hex.held');
    expect(held, '.world-hex.held must exist').not.toBeNull();
    expect(held!, 'owned tiles still derive their edge from --territory').toContain('var(--territory)');
    expect(held!, 'the gradient does the shading, so this rule paints no fill').not.toMatch(/fill\s*:/);
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
