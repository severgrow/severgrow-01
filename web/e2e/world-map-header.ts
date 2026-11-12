// FUTASAKU 0.5 — the WORLD MAP screen: a one-line corner-anchored header, on the shared surface.
//
//   CHANNEL=futa04 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 npm run web:build
//   npx tsx web/e2e/world-map-header.ts [--dist=web/dist]
//
// The world entry only exists when the build carries a duel API URL, so the suite needs that stub
// host; it answers every API call itself (no network, no real project, no quota). CI runs it in the
// `world-header` job, which builds exactly that way.
//
// Owner direction (2026-10-16): in the world map the menu control and the logo must sit in the top
// corners exactly like the in-game header, and "TERRITORY" must ALWAYS read on ONE line.
// Follow-up (same day): the area BEHIND the map's contained window must be the SAME grained surface
// the main menu rests on, and the column must use the viewport well.
//
// What this suite proves, at 320 (narrower than the owner's phone), 360, 390, a landscape phone and
// a 1280px-wide screen:
//   1. the title is ONE line — one range rect, the box exactly one line-height tall, and its ink
//      narrower than the column so nowrap can never clip or ellipsise it;
//   2. the back chevron and the wordmark share the title's top line (tops within 2px), so the header
//      reads as one row of corner chrome, not three floating pieces;
//   3. the world map carries the SAME small in-game wordmark (#hud-brand asset) in its top-right
//      corner, at the same small size the game HUD uses;
//   4. the surface behind the window is the MENU's: the screen paints no fill of its own, and a
//      background patch measures the same grain as the identical patch on the main menu (pixel sd);
//   5. the map FILLS its window — the view's aspect is the window's own, so there is no letterbox
//      band, the hexes are never stretched (one hex is a true hexagon), and the surplus is cropped
//      and pannable;
//   6. no focus state paints a default ring (every hex is tabindex=0, so a pointer click focuses one
//      without matching :focus-visible), and each tile is shaded by its own gradient with unclaimed
//      ground the quietest of the three;
//   7. the column uses the viewport — the side gutters are the menu's own 16px, the column reaches
//      its bottom edge with or without a notice line, and the window never overflows the viewport;
//   8. the map window keeps its contained surface (14px corner, radial inset surface, inset shadow).
// It writes docs/screens/world/world-header-*.png (the screen at rest), world-select-*.png (a tile
// selected) and world-surface-menu-*.png (the main menu, for the side-by-side surface comparison).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { WORLD_CELLS } from '../../server/src/world.js';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = new URL('../../docs/screens/world/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const { server, url: BASE } = await serveStaticDist(DIST);

const SAMPLE = {
  ok: true,
  world: { version: 1, revision: 5, cost: 100, cells: WORLD_CELLS,
    // ONE colour for every claim, on purpose: the owner's own tiles and another player's are then
    // directly comparable, so "my territory is the brighter glass" is a real assertion rather than a
    // comparison of two different hues. Two are mine (ownerId 'stub', the guest the stub API mints),
    // three are another player's.
    claims: ['0,0', '1,0', '0,1', '-1,1', '-1,0'].map((cellId, index) => ({
      cellId, ownerId: index < 2 ? 'stub' : 'other',
      ownerName: index < 2 ? 'Me' : 'WillowBirch', ownerTag: index < 2 ? '1001' : '1002',
      // My own tile reports a level; the other player's does not, so the selection line can be
      // checked both with and without it.
      ownerLevel: index < 2 ? 22 : null,
      colour: 'hsl(200 34% 49%)', claimedAt: Date.now() - index * 60_000,
    })) },
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// `PW_CHROMIUM` when a machine pins its own Chrome; otherwise playwright-core's own browser, so the
// suite also runs in CI (`npx playwright-core install chromium`) with no local path baked in.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);

type Box = { x: number; y: number; width: number; height: number };

// The WORLD's own drawn ink, derived from the frozen geometry exactly as `world-view.ts` draws it:
// a hex reaches X/2*R in x and a full R in y (R = 10, X = sqrt(3)). The drawn cluster is very nearly
// square, so this is the ratio the rendered ink box must reproduce — a stretch would move it.
const WORLD_INK_RATIO = ((): number => {
  const R = 10;
  const X = Math.sqrt(3);
  const xs = WORLD_CELLS.map((c) => X * (c.q + c.r / 2) * R);
  const ys = WORLD_CELLS.map((c) => 1.5 * c.r * R);
  const w = Math.max(...xs) - Math.min(...xs) + X * R;
  const h = Math.max(...ys) - Math.min(...ys) + 2 * R;
  return w / h;
})();

// A patch of the screen OUTSIDE the world's window and outside the menu's column: the shared page
// surface and nothing else. Identical on both screens, so the two measurements are comparable.
const PATCH = { x: 2, y: 300, width: 9, height: 200 };

/**
 * Mean and standard deviation of luminance over a freshly captured PNG patch. The page grain is
 * SVG noise, so it reads as a real spread (sd); a flat background fill reads as ~0. This is the
 * measurement that tells "the same grained surface as the menu" from "an opaque block".
 */
const decoder = await browser.newPage();
const patchStats = async (png: Buffer): Promise<{ mean: number; sd: number }> => {
  await decoder.setContent(`<img id="i" src="data:image/png;base64,${png.toString('base64')}">`);
  await decoder.waitForFunction(`document.getElementById('i').complete`);
  // Built as a STRING: tsx/esbuild would otherwise rewrite the closure with a `__name` helper that
  // does not exist in the page.
  return decoder.evaluate(`(() => {
    const img = document.getElementById('i');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sum = 0, sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++; sum += lum; sum2 += lum * lum;
    }
    const mean = sum / n;
    return { mean: +mean.toFixed(3), sd: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(3) };
  })()`) as Promise<{ mean: number; sd: number }>;
};

try {
  for (const size of [
    { w: 320, h: 568, touch: true }, // narrower than the owner's phone: the title must still fit
    { w: 360, h: 640, touch: true },
    { w: 390, h: 844, touch: true },
    { w: 844, h: 390, touch: true }, // a landscape phone: the column's chrome is a large share here
    { w: 1280, h: 800, touch: false }, // a WIDE screen: here the height, not the width, is limiting
  ] as const) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch, isMobile: size.touch });
    await page.addInitScript(() => localStorage.clear());
    // tsx/esbuild rewrites named inner functions with a `__name` helper that does not exist in the
    // page; define it up front so `page.evaluate` closures with inner arrow functions run.
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    await page.route('**/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
    await page.route('**/v1/seeds/wallet', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, wallet: { balance: 150, lifetimeEarned: 150, lifetimeSpent: 0, worldInvitationSeen: true },
    }) }));
    await page.route('**/v1/guests*', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now(),
    }) }));

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
    // Let the menu SETTLE before measuring its surface. Fonts arrive late and the beta line is added
    // by a dynamic import, so a patch read during boot can catch a half-painted frame (it measured
    // flat at 320x568 on the first iteration until this wait). The grain is the subject, so the
    // measurement has to read the finished screen — the same reason online-lobby-check.ts waits here.
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
    await page.waitForSelector('#menu-beta', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    // The main menu, on the same surface: the reference shot and the reference measurement.
    const menuPatch = await patchStats(await page.screenshot({ clip: PATCH, type: 'png' }));
    await page.screenshot({ path: join(OUT, `world-surface-menu-${size.w}x${size.h}.png`) });
    // The menu column's own edges, so the world column can be held against them (the owner's ask:
    // "consistent with menu"). #menu .menu-inner is `width: min(420px, 100% - 32px)`, i.e. a 16px
    // gutter on a phone and a 420px centred column on a wide screen.
    const menuColumn = await page.evaluate(() => {
      const el = document.querySelector('#menu .menu-inner') as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, width: r.width };
    });
    await page.click('#menu-world');
    await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
    await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(700);
    const worldPatch = await patchStats(await page.screenshot({ clip: PATCH, type: 'png' }));

    const tag = `${size.w}x${size.h}`;
    const rect = (b: Box | null) => (b ? `x${b.x.toFixed(1)} y${b.y.toFixed(1)} w${b.width.toFixed(1)} h${b.height.toFixed(1)}` : 'none');

    const m = await page.evaluate(() => {
      const box = (sel: string): Box | null => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const title = document.getElementById('online-world-title') as HTMLElement;
      // The title's TRUE single-line ink width: force nowrap for one read, then restore.
      const prevWrap = title.style.whiteSpace;
      title.style.whiteSpace = 'nowrap';
      const titleNowrap = title.scrollWidth;
      title.style.whiteSpace = prevWrap;
      const range = document.createRange();
      range.selectNodeContents(title);
      const titleLineRects = range.getClientRects().length;
      // The INK rect (not the element box): the line box carries leading above the glyphs, and the
      // owner's alignment request is about what the eye sees, so the top edge is compared in ink.
      const titleInkRect = range.getBoundingClientRect();
      const titleInkWidth = titleInkRect.width;
      const titleInkHeight = titleInkRect.height;
      const titleInkTop = titleInkRect.top;
      range.detach();
      const back = document.getElementById('online-world-back') as HTMLElement;
      const backIcon = back?.querySelector<SVGGraphicsElement>('.i, .i svg, svg');
      const brand = document.getElementById('online-brand') as unknown as SVGWrap | null;
      const font = getComputedStyle(title);
      return {
        title: box('#online-world-title'),
        titleScroll: title.scrollWidth,
        titleClient: title.clientWidth,
        titleNowrap,
        titleLineRects,
        titleInkWidth,
        titleInkHeight,
        titleInk: { y: titleInkTop, height: titleInkHeight },
        titleHeight: title.getBoundingClientRect().height,
        titleLineHeight: Number.parseFloat(font.lineHeight) || (Number.parseFloat(font.fontSize) * 1.15),
        titleFont: font.fontSize,
        titleFamily: font.fontFamily,
        titleText: title.textContent ?? '',
        back: box('#online-world-back'),
        backIcon: backIcon ? (() => { const r = backIcon.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() : null,
        brand: brand ? (() => { const r = brand.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() : null,
        brandHref: brand?.querySelector('image')?.getAttribute('href') ?? '',
        head: box('.online-world .online-head'),
        wallet: box('#online-world-wallet'),
        // No bar between the wallet and the map any more (owner, 2026-10-28: one menu key on the
        // map's foot); a bar, if one ever returns, is one more item in the same rhythm.
        bar: box('#online-world-bar'),
        grid: box('#online-world-grid'),
        selection: box('#online-world-selection'),
        notice: box('#online-world-notice'),
        gap: Number.parseFloat(getComputedStyle(document.querySelector('.online-world .online-inner') as HTMLElement).gap) || 0,
        // The column's own side gutters (the owner aligned them to the menu's 16px).
        gutters: (() => {
          const s = getComputedStyle(document.querySelector('.online-world .online-inner') as HTMLElement);
          return { left: Number.parseFloat(s.paddingLeft) || 0, right: Number.parseFloat(s.paddingRight) || 0 };
        })(),
        // The shared page surface: the screen must paint nothing of its own, and the ONE global
        // grain element must still be there painting it.
        screenSurface: (() => {
          const s = getComputedStyle(document.getElementById('online-world-screen') as HTMLElement);
          return { color: s.backgroundColor, image: s.backgroundImage };
        })(),
        // The ONE grain: it is the analogue film, painted above every layer (it used to be a
        // `::before` on #texture, which put it BEHIND the interface - owner, 2026-10-16). What this
        // check cares about is that the grained surface is still painted at all, so the patch
        // measurement below distinguishes "the same grained surface as the menu" from "an opaque
        // block", which was the original bug.
        texture: (() => {
          const el = document.getElementById('futa04-film-grain') as HTMLElement;
          if (!el) return null;
          const s = getComputedStyle(el);
          return {
            display: s.display,
            z: s.zIndex,
            grain: s.backgroundImage === 'none' ? 'none' : 'data-uri',
            grainOpacity: Number.parseFloat(s.opacity) || 0,
          };
        })(),
        // The map's contained window: it must keep its own bounded surface.
        window: (() => {
          const w = document.getElementById('online-world-grid') as HTMLElement;
          const s = getComputedStyle(w);
          return {
            radius: s.borderTopLeftRadius,
            image: s.backgroundImage === 'none' ? 'none' : 'gradient',
            shadow: s.boxShadow === 'none' ? 'none' : 'shadow',
          };
        })(),
        // Is the map FITTED to its window? The window must carry the map's own aspect ratio (so the
        // SVG fills it exactly) and the rendered hexes must leave no letterbox band. The world's own
        // bounding box is what the SVG's viewBox is, so that is the ratio to compare against.
        fit: (() => {
          const w = document.getElementById('online-world-grid') as HTMLElement;
          const svg = w.querySelector('svg.world-map-svg') as SVGSVGElement | null;
          const vb = (svg?.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
          const viewBoxAspect = vb.length === 4 ? vb[2]! / vb[3]! : 0;
          const wr = w.getBoundingClientRect();
          const hexes = [...w.querySelectorAll('.world-hex')].map((e) => e.getBoundingClientRect());
          if (!hexes.length || !viewBoxAspect) return null;
          const left = Math.min(...hexes.map((h) => h.left));
          const top = Math.min(...hexes.map((h) => h.top));
          const right = Math.max(...hexes.map((h) => h.right));
          const bottom = Math.max(...hexes.map((h) => h.bottom));
          return {
            viewBoxAspect,
            windowAspect: wr.width / wr.height,
            inkWidth: right - left,
            inkHeight: bottom - top,
            // ONE hexagon's own box. A regular pointy-top hex is sqrt(3)/2 as wide as it is tall, so
            // this is the direct proof the map was not stretched: a non-uniform scale moves it.
            hexRatio: (() => {
              const one = w.querySelector('.world-hex');
              if (!one) return 0;
              const r = one.getBoundingClientRect();
              return r.height > 0 ? r.width / r.height : 0;
            })(),
            hexWidth: (w.querySelector('.world-hex') as Element | null)?.getBoundingClientRect().width ?? 0,
            // The margin between the drawn map and its window, on the axis the letterboxing showed on.
            bandTop: top - wr.top,
            bandBottom: wr.bottom - bottom,
            bandLeft: left - wr.left,
            bandRight: wr.right - right,
          };
        })(),
        vh: innerHeight,
        vw: innerWidth,
      };
    });

    console.log(`\n[${tag}]`, JSON.stringify(m, null, 2));

    // The things that need their own evaluation: the tile gradients, the focus ring, and the view's
    // aspect against the window's (the fill proof).
    const extra = await page.evaluate(() => {
      const grid = document.getElementById('online-world-grid') as HTMLElement;
      const svg = grid.querySelector('svg.world-map-svg') as SVGSVGElement;
      const vb = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      const wr = grid.getBoundingClientRect();
      const hexes = [...grid.querySelectorAll('.world-hex')] as SVGGraphicsElement[];
      // The tile FILL is painted by the .world-hex-face layer, not the .world-hex edge layer (two
      // layers since 2026-10-16, so a neighbour's fill cannot bury an edge); the edge layer carries
      // focus and geometry. Probe the faces for the gradient, the edges for the focus ring.
      const faces = [...grid.querySelectorAll('.world-hex-face')] as SVGGraphicsElement[];
      const stopsOf = (el?: SVGGraphicsElement | null) => {
        const fill = el ? getComputedStyle(el).fill : '';
        const id = /url\("#?([^")]+)"?\)/.exec(fill)?.[1];
        const g = id ? document.getElementById(id) : null;
        return { fill, stops: g ? [...g.querySelectorAll('stop')].map((s) => getComputedStyle(s).stopColor) : [] };
      };
      // Focus a hex and read its paint, then blur so the screenshots stay at rest.
      const probe = hexes[0]!;
      probe.focus();
      const fs = getComputedStyle(probe);
      const focus = { outlineStyle: fs.outlineStyle, outlineWidth: fs.outlineWidth, stroke: fs.stroke };
      probe.blur();
      const boxes = hexes.map((h) => h.getBoundingClientRect());
      return {
        viewBoxAspect: vb[2]! / vb[3]!,
        windowAspect: wr.width / wr.height,
        focus,
        gradientCount: grid.querySelectorAll('defs linearGradient').length,
        empty: stopsOf(faces.find((h) => !h.classList.contains('held') && !h.classList.contains('mine'))),
        held: stopsOf(faces.find((h) => h.classList.contains('held'))),
        mine: stopsOf(faces.find((h) => h.classList.contains('mine'))),
        windowTop: wr.top, windowBottom: wr.bottom,
        vh: innerHeight,
        hexesInView: boxes.filter((b) => b.left < wr.right && b.right > wr.left && b.top < wr.bottom && b.bottom > wr.top).length,
      };
    });
    const luma = (rgb: string): number => {
      const [r = 0, g = 0, b = 0] = (rgb.match(/\d+/g) ?? []).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const avgLuma = (stops: string[]) => stops.reduce((n, s) => n + luma(s), 0) / Math.max(1, stops.length);
    const stopSpread = (stops: string[]) => Math.max(...stops.map(luma)) - Math.min(...stops.map(luma));

    // 1. ONE line: the title box is exactly one line-height tall, its text does not overflow, and it
    //    does not wrap into several client rects.
    check(`[${tag}] the title is ONE line (no wrap)`, m.titleLineRects === 1 && m.titleNowrap <= m.titleClient + 1,
      `lineRects=${m.titleLineRects} scroll=${m.titleNowrap} client=${m.titleClient} font=${m.titleFont}`);
    // The ink really FITS: it is narrower than the column with a margin, so nowrap can never clip.
    check(`[${tag}] the title's ink fits the column with room to spare`, m.titleInkWidth <= m.titleClient - 4,
      `ink=${m.titleInkWidth.toFixed(1)} client=${m.titleClient} slack=${(m.titleClient - m.titleInkWidth).toFixed(1)}`);
    check(`[${tag}] the title box is one line-height tall`, Math.abs((m.title?.height ?? 0) - m.titleLineHeight) <= 2,
      `h=${m.title?.height?.toFixed(1)} line=${m.titleLineHeight.toFixed(1)}`);
    check(`[${tag}] the title reads "TERRITORY" in full`, (m.titleText ?? '').trim().toUpperCase() === 'TERRITORY', m.titleText ?? '');

    // 2. The title and the wordmark share the SAME top edge (owner, 2026-10-16: "the world map top
    //    border is aligned with right top logo's top border"). The chevron is deliberately NOT in
    //    this group: in the game's own header #hud-menu sits at the row top while #hud-brand is
    //    pushed 18px down, so the leading control is higher than the mark - this screen matches that.
    //    The title's BOX top differs from its INK top by the line box's leading, so the comparison
    //    uses the measured ink rect, which is what the eye actually sees.
    const titleInkTop = m.titleInk?.y ?? m.title?.y ?? 0;
    const brandTop = m.brand?.y ?? 0;
    check(`[${tag}] the wordmark's top edge aligns with the title's`, Math.abs(brandTop - titleInkTop) <= 1,
      `brand y=${brandTop.toFixed(1)} title ink y=${titleInkTop.toFixed(1)} (Δ${(brandTop - titleInkTop).toFixed(1)})`);
    // ...and the leading control stays vertically centred in the 44px row, so it cannot drift.
    const backTop = m.backIcon?.y ?? m.back?.y ?? 0;
    const backBottom = m.backIcon ? m.backIcon.y + m.backIcon.height : (m.back ? m.back.y + m.back.height : 0);
    const rowMid = (m.head?.y ?? 0) + (m.head?.height ?? 0) / 2;
    const backMid = (backTop + backBottom) / 2;
    check(`[${tag}] the chevron is centred in the header row`, Math.abs(backMid - rowMid) <= 1.5,
      `chevron mid ${backMid.toFixed(1)} row mid ${rowMid.toFixed(1)} (Δ${(backMid - rowMid).toFixed(1)})`);
    check(`[${tag}] the header row keeps the in-game HUD's 44px height`, Math.abs((m.head?.height ?? 0) - 44) <= 1,
      `head h=${m.head?.height?.toFixed(1)}`);

    // 3. ONE deliberate column. The header -> Seeds -> map steps share the column's own rhythm.
    //    The old "N / 183 grown" caption that used to sit between the header and the Seeds wallet was
    //    REMOVED (owner, 2026-10-16), so the first step starts at the wallet. The selection bar is the
    //    ONE deliberate break: it is anchored to the BOTTOM edge (owner, 2026-10-16), so its distance
    //    from the window is whatever the viewport leaves and is measured by the bottom-anchor check
    //    below, not by this rhythm. An empty notice leaves no dead row at the very bottom.
    const bottom = (b: Box | null) => (b ? b.y + b.height : 0);
    // THE DESKTOP STAGE (owner, 2026-10-28: "make the map bigger, use the space better"): on a wide
    // screen the map fills everything under the header and the words float over it as centred pills,
    // so the column checks below become stage checks there.
    const stage = m.vw >= 960 && m.vh >= 560 && m.vw / m.vh >= 1.25;
    const centredIn = (b: Box | null, outer: Box | null) => !!b && !!outer &&
      Math.abs((b.x - outer.x) - (outer.x + outer.width - b.x - b.width)) <= 1.5;
    const inside = (b: Box | null, outer: Box | null) => !!b && !!outer &&
      b.y >= outer.y - 0.5 && b.y + b.height <= outer.y + outer.height + 0.5;
    if (stage) {
      check(`[${tag}] the stage starts one step under the header`, Math.abs((m.grid?.y ?? 0) - bottom(m.head) - m.gap) <= 1.5,
        `header ends ${bottom(m.head).toFixed(1)}, stage starts ${m.grid?.y.toFixed(1)} (gap ${m.gap})`);
      check(`[${tag}] Seeds float over the stage's top, centred`, inside(m.wallet, m.grid) && centredIn(m.wallet, m.grid) &&
        (m.wallet?.y ?? 0) - (m.grid?.y ?? 0) <= 24, `wallet ${rect(m.wallet)} in ${rect(m.grid)}`);
    }
    // THE TILE BAR floats over the map's foot on EVERY size since 2026-10-28 ("tapping empty tile
    // should NOT open the menu and still have option to grow/sell/challenge"); it used to sit in the
    // column under the map on a phone. Measured whenever a tile is selected.
    if ((m.selection?.height ?? 0) > 0) {
      check(`[${tag}] the selected tile floats over the map's foot, centred`, inside(m.selection, m.grid) && centredIn(m.selection, m.grid) &&
        bottom(m.grid) - bottom(m.selection) <= 90, `selection ${rect(m.selection)} in ${rect(m.grid)}`);
    }
    const steps = m.bar
      ? [(m.wallet?.y ?? 0) - bottom(m.head), m.bar.y - bottom(m.wallet), (m.grid?.y ?? 0) - bottom(m.bar)]
      : [(m.wallet?.y ?? 0) - bottom(m.head), (m.grid?.y ?? 0) - bottom(m.wallet)];
    const stepSpread = Math.max(...steps) - Math.min(...steps);
    if (!stage) check(`[${tag}] the header → Seeds → map steps are ONE rhythm`, stepSpread <= 1,
      `steps=${steps.map((s) => s.toFixed(1)).join(', ')} column gap=${m.gap}`);
    check(`[${tag}] an empty notice leaves no dead row`, (m.notice?.height ?? 0) === 0,
      `notice ${m.notice?.height ?? 0}x${m.notice?.width ?? 0}`);

    // 4. The world map carries the small in-game mark in the top-right corner.
    check(`[${tag}] the small in-game wordmark is in the header`, (m.brand?.height ?? 0) >= 14 && (m.brand?.height ?? 0) <= 30,
      `brand ${rect(m.brand)}`);

    // 5. THE SHARED SURFACE (owner, 2026-10-16). The screen paints no fill of its own, the ONE
    //    global grain element is still painting it, and a patch of the background measures the same
    //    grain as the identical patch of the main menu. A flat fill collapses that sd to ~0, which
    //    is exactly the bug this replaced.
    check(`[${tag}] the world screen paints no fill of its own`,
      m.screenSurface.color === 'rgba(0, 0, 0, 0)' && m.screenSurface.image === 'none',
      `bg=${m.screenSurface.color} image=${m.screenSurface.image}`);
    check(`[${tag}] the ONE grain is still painting the surface`,
      !!m.texture && m.texture.display !== 'none' && m.texture.grain === 'data-uri' && m.texture.grainOpacity > 0.05,
      m.texture ? `z=${m.texture.z} grain=${m.texture.grain} opacity=${m.texture.grainOpacity}` : 'missing #futa04-film-grain');
    check(`[${tag}] the surface behind the window is GRAINED, not flat`, worldPatch.sd >= 1.5,
      `world patch sd=${worldPatch.sd} (flat would be <0.5)`);
    // (on the stage that patch is map, not page: the grain check above still holds the surface)
    if (!stage) check(`[${tag}] that grain is the MENU's grain (same patch, same surface)`,
      menuPatch.sd > 0 && worldPatch.sd / menuPatch.sd >= 0.5 && Math.abs(worldPatch.mean - menuPatch.mean) <= 2,
      `world sd=${worldPatch.sd}/mean=${worldPatch.mean} vs menu sd=${menuPatch.sd}/mean=${menuPatch.mean} (ratio ${(worldPatch.sd / menuPatch.sd).toFixed(2)})`);

    // 6. THE MAP FILLS ITS WINDOW (owner, 2026-10-16). He saw the previous version's void had simply
    //    moved outside the window — a square map at the top of a tall column with half the screen
    //    empty below — and chose a BIGGER map over centring, accepting a horizontal crop. So the
    //    view's aspect is now the WINDOW's own: the SVG scales both axes equally and fills it, the
    //    surplus is cropped and pannable, and there is no letterbox band anywhere.
    const fit = m.fit;
    check(`[${tag}] the view's aspect is the window's own (the map fills it)`,
      Math.abs(extra.viewBoxAspect - extra.windowAspect) <= 0.01,
      `viewBox ${extra.viewBoxAspect.toFixed(4)} vs window ${extra.windowAspect.toFixed(4)}`);
    const topBand = fit ? fit.bandTop / (m.grid?.height ?? 1) : 1;
    const bottomBand = fit ? fit.bandBottom / (m.grid?.height ?? 1) : 1;
    if (!stage) check(`[${tag}] there is NO letterbox band above or below the map`, topBand <= 0.04 && bottomBand <= 0.04,
      `top ${(topBand * 100).toFixed(1)}% (${fit?.bandTop.toFixed(1)}px), bottom ${(bottomBand * 100).toFixed(1)}% (${fit?.bandBottom.toFixed(1)}px)`);
    if (!stage) check(`[${tag}] the remaining margin is SYMMETRIC (a frame, not a band)`, !!fit && Math.abs(fit.bandTop - fit.bandBottom) <= 1.5,
      fit ? `top ${fit.bandTop.toFixed(1)}px vs bottom ${fit.bandBottom.toFixed(1)}px` : 'n/a');
    // The crop's successor to the old "fills the window's width too". On a wide screen the view IS
    // the whole world's fit box, so the only margin is that box's own symmetric 6-unit pad (~2.2% of
    // the window); on a phone the map is wider than the window and the margins go negative. So the
    // rule is: never more margin than the shared pad, always symmetric, whichever way it resolves.
    const sidePad = Math.max(fit?.bandLeft ?? 1, fit?.bandRight ?? 1) / (m.grid?.width ?? 1);
    // The stage opens close enough to read every tile, and shows a region, not a handful.
    if (stage) check(`[${tag}] the stage opens at a readable tile size (about 54px)`,
      !!fit && fit.hexWidth >= 48 && fit.hexWidth <= 60, fit ? `hex ${fit.hexWidth.toFixed(1)}px wide` : 'n/a');
    if (!stage) check(`[${tag}] the map covers the window's width (spanned, or cropped by it)`,
      !!fit && m.grid !== null && sidePad <= 0.03 && Math.abs(fit.bandLeft - fit.bandRight) <= 1.5,
      fit && m.grid ? `map ${fit.inkWidth.toFixed(1)}px over window ${m.grid.width.toFixed(1)}px, margins left ${fit.bandLeft.toFixed(1)} (${(fit.bandLeft / m.grid.width * 100).toFixed(1)}%) / right ${fit.bandRight.toFixed(1)}` : 'n/a');
    // Uniform only: the hexes keep their true shape. A regular pointy-top hexagon is sqrt(3)/2 as
    // wide as it is tall, so one hex's own box is the direct proof the map was not stretched to fit
    // (the owner's one definitely-wrong outcome); the ink box is the second, cross-check.
    const HEX_RATIO = Math.sqrt(3) / 2;
    check(`[${tag}] the hexes are unstretched (one hex is a true hexagon)`, !!fit && Math.abs(fit.hexRatio - HEX_RATIO) <= 0.02,
      fit ? `hex w/h ${fit.hexRatio.toFixed(4)} vs a regular hex ${HEX_RATIO.toFixed(4)}` : 'n/a');
    check(`[${tag}] the map's ink box reproduces the world's own geometry ratio`,
      !!fit && Math.abs(fit.inkWidth / fit.inkHeight - WORLD_INK_RATIO) <= 0.01,
      fit ? `ink ${fit.inkWidth.toFixed(1)}x${fit.inkHeight.toFixed(1)} = ${(fit.inkWidth / fit.inkHeight).toFixed(4)} vs world ${WORLD_INK_RATIO.toFixed(4)}` : 'n/a');

    // 6b. THE FOCUS RING (owner, 2026-10-16: "highlighting tiles on world map looks weird af").
    //     Every hex is tabindex=0 and a POINTER click focuses one without matching :focus-visible, so
    //     a :focus-visible-only rule left the browser painting its own rounded blue ring. No focus
    //     state may paint one; the indicator must be ours.
    check(`[${tag}] a focused hex paints NO default focus ring`, extra.focus.outlineStyle === 'none',
      `outline ${extra.focus.outlineStyle} ${extra.focus.outlineWidth}, stroke ${extra.focus.stroke}`);

    // 6c. THE TILE SHADING (owner, 2026-10-16). Each tile is shaded by its own gradient, built from
    //     the owner colour the server already sent — so territories read as coloured glass and no new
    //     colour enters the palette. Unclaimed ground must stay the quietest of the three.
    check(`[${tag}] every tile is shaded by its own gradient`,
      extra.gradientCount > 0 && /^url\(/.test(extra.empty.fill) && /^url\(/.test(extra.held.fill) && /^url\(/.test(extra.mine.fill),
      `${extra.gradientCount} gradients; empty ${extra.empty.fill}, held ${extra.held.fill}, mine ${extra.mine.fill}`);
    check(`[${tag}] the gradient stops resolve to real colours (nothing fell back to black)`,
      [...extra.empty.stops, ...extra.held.stops, ...extra.mine.stops].every((c) => /^rgb/.test(c) && c !== 'rgb(0, 0, 0)'),
      `empty [${extra.empty.stops.join(' ')}] held [${extra.held.stops.join(' ')}] mine [${extra.mine.stops.join(' ')}]`);
    check(`[${tag}] unclaimed ground stays recessive (dark, and the flattest of the three)`,
      avgLuma(extra.empty.stops) < 60 && stopSpread(extra.empty.stops) < 30 && avgLuma(extra.empty.stops) < avgLuma(extra.held.stops),
      `empty avg ${avgLuma(extra.empty.stops).toFixed(1)} spread ${stopSpread(extra.empty.stops).toFixed(1)} vs held avg ${avgLuma(extra.held.stops).toFixed(1)}`);
    // The fixture gives every claim the SAME colour, so this is a like-for-like comparison: my own
    // territory is the same hue, one step brighter, which is its whole distinguishing touch.
    check(`[${tag}] your own territory is the brighter glass of the same colour`,
      avgLuma(extra.mine.stops) > avgLuma(extra.held.stops) + 15,
      `mine avg ${avgLuma(extra.mine.stops).toFixed(1)} vs held avg ${avgLuma(extra.held.stops).toFixed(1)}`);

    // 7. The column still USES the screen. With the map larger, the window takes whatever height the
    //    chrome leaves: on a phone the width frames it and the surplus height is cropped; on a wide
    //    screen the height frames it and the whole world stays in view. Both are measured, and in
    //    both the column reaches its bottom edge.
    // The map window is the column's last element now (the tile bar floats inside it).
    const columnBottom = Math.max(bottom(m.grid), (m.notice?.height ?? 0) > 0 ? bottom(m.notice) : 0);
    const viewportGap = m.vh - columnBottom;
    const gx = m.grid?.x ?? 0;
    const gw = m.grid?.width ?? 0;
    const rightMargin = m.vw - (gx + gw);
    if (!stage) check(`[${tag}] the map renders at the column's full width`, !!fit && m.grid !== null && fit.inkWidth >= m.grid.width * 0.9,
      fit && m.grid ? `map ${fit.inkWidth.toFixed(1)} of column ${m.grid.width.toFixed(1)} (${((fit.inkWidth / m.grid.width) * 100).toFixed(1)}%)` : 'n/a');
    const spansColumn = gw >= m.vw - 32 - 1;
    check(`[${tag}] the window either spans the column or is centred in it`,
      spansColumn ? Math.abs(gx - 16) <= 1 && Math.abs(rightMargin - 16) <= 1 : Math.abs(gx - rightMargin) <= 1,
      spansColumn ? `width-limited: ${gw.toFixed(1)} = the column (gutters ${gx.toFixed(1)}/${rightMargin.toFixed(1)})`
        : `framed narrower: ${gw.toFixed(1)} wide, centred (margins ${gx.toFixed(1)}/${rightMargin.toFixed(1)})`);
    if (stage) check(`[${tag}] the stage reaches the screen's bottom edge (no dead band)`, m.vh - bottom(m.grid) >= 0 && m.vh - bottom(m.grid) <= 32,
      `${(m.vh - bottom(m.grid)).toFixed(1)}px below the stage`);
    else check(`[${tag}] the column reaches its bottom edge (no dead band)`, viewportGap >= 0 && viewportGap <= 32,
      `${viewportGap.toFixed(1)}px below the last column element`);
    // The dvh cap is a documented constant, so prove the window can never spill past the viewport —
    // on the widest screen in the matrix and on a landscape phone, where the chrome is a big share.
    check(`[${tag}] the map window never overflows the viewport`,
      extra.windowTop >= 0 && extra.windowBottom <= m.vh + 0.5,
      `window ${extra.windowTop.toFixed(1)}..${extra.windowBottom.toFixed(1)} of ${m.vh}`);

    // 8. The gutters are the MENU's 16px (owner, 2026-10-16), so the world's column edge is where
    //    #menu .menu-inner's edge is. On a phone that column is `100% - 32px`, so the two edges can
    //    be held against each other directly; on a wide screen the menu column is its own 420px
    //    centred block, so what is checked is the world's own 16px gutter.
    check(`[${tag}] the column's side gutters are the menu's 16px`,
      Math.abs(m.gutters.left - 16) <= 1 && Math.abs(m.gutters.right - 16) <= 1,
      `padding ${m.gutters.left}px / ${m.gutters.right}px`);
    const menuIsFullBleed = !!menuColumn && Math.abs(menuColumn.width - (m.vw - 32)) <= 2;
    if (menuIsFullBleed && menuColumn) {
      check(`[${tag}] the world column's left edge is the menu column's left edge`,
        spansColumn && Math.abs(gx - menuColumn.x) <= 1,
        `world ${gx.toFixed(1)} vs menu ${menuColumn.x.toFixed(1)}`);
    } else {
      check(`[${tag}] on a wide screen the menu's own column is 420px, so the gutter is the shared edge`,
        !!menuColumn && Math.abs(menuColumn.width - 420) <= 2,
        menuColumn ? `menu column ${menuColumn.width.toFixed(1)}px` : 'missing #menu .menu-inner');
    }

    // 9. The map keeps its CONTAINED window (owner: "let's keep as it is").
    check(`[${tag}] the map window keeps its own bounded surface`,
      m.window.radius === (stage ? '20px' : '14px') && m.window.image === 'gradient' && m.window.shadow === 'shadow',
      JSON.stringify(m.window));

    // 10. A NOTICE LINE. It adds ~28px of chrome below the controls — the one case that could clamp
    //     the window and reintroduce a band. Measured with a real notice showing, on every size
    //     including the landscape phone where the chrome is already a large share of the screen.
    await page.evaluate(() => {
      (document.getElementById('online-world-notice') as HTMLElement).textContent = 'The world could not refresh. Tap here to try again.';
    });
    await page.waitForTimeout(320);
    const noticed = await page.evaluate(() => {
      const grid = document.getElementById('online-world-grid') as HTMLElement;
      const wr = grid.getBoundingClientRect();
      const svg = grid.querySelector('svg.world-map-svg') as SVGSVGElement;
      const vb = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      const hexes = [...grid.querySelectorAll('.world-hex')].map((h) => h.getBoundingClientRect());
      const sel = (document.getElementById('online-world-selection') as HTMLElement).getBoundingClientRect();
      const notice = (document.getElementById('online-world-notice') as HTMLElement).getBoundingClientRect();
      return {
        viewBoxAspect: vb[2]! / vb[3]!, windowAspect: wr.width / wr.height,
        bandTop: Math.min(...hexes.map((b) => b.top)) - wr.top,
        bandBottom: wr.bottom - Math.max(...hexes.map((b) => b.bottom)),
        windowH: wr.height, windowBottom: wr.bottom, vh: innerHeight,
        columnBottom: Math.max(sel.bottom, notice.height > 0 ? notice.bottom : 0),
        noticeHeight: notice.height,
      };
    });
    if (!stage) check(`[${tag}] with a notice line the map still fills its window (no band)`,
      Math.abs(noticed.viewBoxAspect - noticed.windowAspect) <= 0.01 &&
      noticed.bandTop / noticed.windowH <= 0.04 && noticed.bandBottom / noticed.windowH <= 0.04,
      `notice ${noticed.noticeHeight.toFixed(0)}px, window ${noticed.windowH.toFixed(1)}px, band ${noticed.bandTop.toFixed(1)}/${noticed.bandBottom.toFixed(1)}px`);
    check(`[${tag}] with a notice line nothing spills past the viewport`,
      noticed.windowBottom <= noticed.vh + 0.5 && noticed.columnBottom <= noticed.vh + 0.5,
      `window bottom ${noticed.windowBottom.toFixed(1)}, column bottom ${noticed.columnBottom.toFixed(1)} of ${noticed.vh}`);

    await page.screenshot({ path: join(OUT, `world-header-${tag}.png`) });
    // The shot the owner asks for: the map with a tile SELECTED (tap the middle of the window, which
    // is inside the crop). The at-rest shot above already shows his own territory, another player's
    // and unclaimed ground together — the fixture gives every claim one colour on purpose.
    if (size.w === 360 || size.w === 390) {
      const g = m.grid!;
      await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
      await page.waitForTimeout(320);
      await page.screenshot({ path: join(OUT, `world-select-${tag}.png`) });
    }
    console.log(`    screenshot: docs/screens/world/world-header-${tag}.png${size.w === 360 || size.w === 390 ? ` (+ world-select-${tag}.png)` : ''}`);
    if (errors.length) console.log('    page errors:', errors.slice(0, 4));
    await page.close();
  }
} finally {
  await decoder.close();
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`\n${failed} world-map screen checks failed`);
  process.exit(1);
}
console.log('\nThe world map is one line in a corner-anchored header, filling its window on the menu\'s grained surface.');

type SVGWrap = SVGSVGElement;
