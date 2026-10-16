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
// corners exactly like the in-game header, and "THE WORLD MAP" must ALWAYS read on ONE line.
// Follow-up (same day): the area BEHIND the map's contained window must be the SAME grained surface
// the main menu rests on, and the column must use the viewport well.
//
// What this suite proves, at 320 (narrower than the owner's phone), 360 and 390px wide, plus a
// 1280px-wide screen where the HEIGHT is the limiting dimension:
//   1. the title is ONE line — one range rect, the box exactly one line-height tall, and its ink
//      narrower than the column so nowrap can never clip or ellipsise it;
//   2. the back chevron and the wordmark share the title's top line (tops within 2px), so the header
//      reads as one row of corner chrome, not three floating pieces;
//   3. the world map carries the SAME small in-game wordmark (#hud-brand asset) in its top-right
//      corner, at the same small size the game HUD uses;
//   4. the surface behind the window is the MENU's: the screen paints no fill of its own, and a
//      background patch measures the same grain as the identical patch on the main menu (pixel sd);
//   5. the map FILLS its window — the window carries the world's own aspect ratio, so the only
//      margin is the fit box's symmetric 6-unit padding and there is no letterbox band (this was
//      65px at 360x640 and 144px at 390x844 before the fit), and the hexes are not stretched;
//   6. the column uses the viewport — the map renders at the column's full width, the side gutters
//      are the menu's own 16px, the controls anchor to the bottom edge, and there is no dead band;
//   7. the map window keeps its contained surface (14px corner, radial inset surface, inset shadow).
// It writes docs/screens/world/world-header-*.png (the screen) and world-surface-menu-*.png (the
// main menu, for the side-by-side surface comparison) for the visual pass.
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
    claims: ['0,0', '1,0', '0,1', '-1,1', '-1,0'].map((cellId, index) => ({
      cellId, ownerId: index % 2 ? 'b' : 'a', ownerName: index % 2 ? 'WillowBirch' : 'BloomHeron',
      ownerTag: index % 2 ? '1002' : '1001', colour: index % 2 ? 'hsl(220 34% 49%)' : 'hsl(80 34% 49%)',
      claimedAt: Date.now() - index * 60_000,
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
      const titleInkWidth = range.getBoundingClientRect().width;
      const titleInkHeight = range.getBoundingClientRect().height;
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
        summary: box('#online-world-summary'),
        wallet: box('#online-world-wallet'),
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
        texture: (() => {
          const el = document.getElementById('texture') as HTMLElement;
          if (!el) return null;
          const s = getComputedStyle(el);
          const before = getComputedStyle(el, '::before');
          return {
            display: s.display,
            z: s.zIndex,
            grain: before.backgroundImage === 'none' ? 'none' : 'data-uri',
            grainOpacity: Number.parseFloat(before.opacity) || 0,
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
          const svg = w.querySelector('svg') as SVGSVGElement | null;
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

    // 1. ONE line: the title box is exactly one line-height tall, its text does not overflow, and it
    //    does not wrap into several client rects.
    check(`[${tag}] the title is ONE line (no wrap)`, m.titleLineRects === 1 && m.titleNowrap <= m.titleClient + 1,
      `lineRects=${m.titleLineRects} scroll=${m.titleNowrap} client=${m.titleClient} font=${m.titleFont}`);
    // The ink really FITS: it is narrower than the column with a margin, so nowrap can never clip.
    check(`[${tag}] the title's ink fits the column with room to spare`, m.titleInkWidth <= m.titleClient - 4,
      `ink=${m.titleInkWidth.toFixed(1)} client=${m.titleClient} slack=${(m.titleClient - m.titleInkWidth).toFixed(1)}`);
    check(`[${tag}] the title box is one line-height tall`, Math.abs((m.title?.height ?? 0) - m.titleLineHeight) <= 2,
      `h=${m.title?.height?.toFixed(1)} line=${m.titleLineHeight.toFixed(1)}`);
    check(`[${tag}] the title reads "THE WORLD MAP" in full`, (m.titleText ?? '').trim().toUpperCase() === 'THE WORLD MAP', m.titleText ?? '');

    // 2. The corner chrome shares the title's top line.
    const titleTop = m.title?.y ?? 0;
    const backTop = m.backIcon?.y ?? m.back?.y ?? 0;
    const brandTop = m.brand?.y ?? 0;
    check(`[${tag}] the chevron ink top aligns with the title top`, Math.abs(backTop - titleTop) <= 2,
      `chevron y=${backTop.toFixed(1)} title y=${titleTop.toFixed(1)} (Δ${(backTop - titleTop).toFixed(1)})`);
    check(`[${tag}] the wordmark top aligns with the title top`, Math.abs(brandTop - titleTop) <= 2,
      `brand y=${brandTop.toFixed(1)} title y=${titleTop.toFixed(1)} (Δ${(brandTop - titleTop).toFixed(1)})`);
    const spread = Math.max(backTop, titleTop, brandTop) - Math.min(backTop, titleTop, brandTop);
    check(`[${tag}] chevron, title and wordmark share ONE top edge`, spread <= 2,
      `spread=${spread.toFixed(1)}px (chevron ${backTop.toFixed(1)} · title ${titleTop.toFixed(1)} · mark ${brandTop.toFixed(1)})`);

    // 3. ONE deliberate column. The header -> summary -> Seeds -> map steps share the column's own
    //    rhythm. The selection bar is the ONE deliberate break: it is anchored to the BOTTOM edge
    //    (owner, 2026-10-16), so its distance from the window is whatever the viewport leaves and is
    //    measured by the bottom-anchor check below, not by this rhythm. An empty notice leaves no
    //    dead row at the very bottom.
    const bottom = (b: Box | null) => (b ? b.y + b.height : 0);
    const steps = [
      (m.summary?.y ?? 0) - bottom(m.head),
      (m.wallet?.y ?? 0) - bottom(m.summary),
      (m.grid?.y ?? 0) - bottom(m.wallet),
    ];
    const stepSpread = Math.max(...steps) - Math.min(...steps);
    check(`[${tag}] the header → summary → Seeds → map steps are ONE rhythm`, stepSpread <= 1,
      `steps=${steps.map((s) => s.toFixed(1)).join(', ')} column gap=${m.gap}`);
    check(`[${tag}] the controls sit below the map window`, (m.selection?.y ?? 0) >= bottom(m.grid),
      `selection y=${m.selection?.y?.toFixed(1)} window ends ${bottom(m.grid).toFixed(1)}`);
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
    check(`[${tag}] the ONE global grain is still painting the background`,
      !!m.texture && m.texture.display !== 'none' && m.texture.grain === 'data-uri' && m.texture.grainOpacity > 0.05,
      m.texture ? `z=${m.texture.z} grain=${m.texture.grain} opacity=${m.texture.grainOpacity}` : 'missing #texture');
    check(`[${tag}] the surface behind the window is GRAINED, not flat`, worldPatch.sd >= 1.5,
      `world patch sd=${worldPatch.sd} (flat would be <0.5)`);
    check(`[${tag}] that grain is the MENU's grain (same patch, same surface)`,
      menuPatch.sd > 0 && worldPatch.sd / menuPatch.sd >= 0.5 && Math.abs(worldPatch.mean - menuPatch.mean) <= 2,
      `world sd=${worldPatch.sd}/mean=${worldPatch.mean} vs menu sd=${menuPatch.sd}/mean=${menuPatch.mean} (ratio ${(worldPatch.sd / menuPatch.sd).toFixed(2)})`);

    // 6. THE MAP FILLS ITS WINDOW (owner, 2026-10-16). The window carries the map's OWN aspect
    //    ratio, so the SVG fills it instead of letterboxing; the only margin left is the fit box's
    //    own 6-unit padding (2.2%), and it is SYMMETRIC. This is the regression that used to cost
    //    65px of band at 360x640 and 144px at 390x844.
    const fit = m.fit;
    check(`[${tag}] the map window carries the map's own aspect ratio`, !!fit && Math.abs(fit.windowAspect - fit.viewBoxAspect) <= 0.01,
      fit ? `window ${fit.windowAspect.toFixed(4)} vs map ${fit.viewBoxAspect.toFixed(4)}` : 'no viewBox');
    const topBand = fit ? fit.bandTop / (m.grid?.height ?? 1) : 1;
    const bottomBand = fit ? fit.bandBottom / (m.grid?.height ?? 1) : 1;
    check(`[${tag}] there is NO letterbox band above or below the map`, topBand <= 0.04 && bottomBand <= 0.04,
      `top ${(topBand * 100).toFixed(1)}% (${fit?.bandTop.toFixed(1)}px), bottom ${(bottomBand * 100).toFixed(1)}% (${fit?.bandBottom.toFixed(1)}px)`);
    check(`[${tag}] the remaining margin is SYMMETRIC (a frame, not a band)`, !!fit && Math.abs(fit.bandTop - fit.bandBottom) <= 1.5,
      fit ? `top ${fit.bandTop.toFixed(1)}px vs bottom ${fit.bandBottom.toFixed(1)}px` : 'n/a');
    check(`[${tag}] the map fills the window's width too`, !!fit && m.grid !== null && fit.bandLeft <= m.grid.width * 0.06 && fit.bandRight <= m.grid.width * 0.06 && Math.abs(fit.bandLeft - fit.bandRight) <= 1.5,
      fit && m.grid ? `left ${fit.bandLeft.toFixed(1)}px, right ${fit.bandRight.toFixed(1)}px of ${m.grid.width.toFixed(1)}px` : 'n/a');
    // Uniform only: the hexes keep their true shape. A stretched map would show it here (the map is
    // very nearly square, so a non-square INK box means the hexes were distorted).
    check(`[${tag}] the map is not stretched (the hexes keep their shape)`, !!fit && Math.abs(fit.inkWidth / fit.inkHeight - fit.viewBoxAspect) <= 0.02,
      fit ? `ink ${fit.inkWidth.toFixed(1)}x${fit.inkHeight.toFixed(1)} = ${(fit.inkWidth / fit.inkHeight).toFixed(4)} vs ${fit.viewBoxAspect.toFixed(4)}` : 'n/a');

    // 7. The column still USES the screen (owner: "using nicely most of screen, especially on
    //    mobile"). The window hugs the map now, so on a TALL phone the width is the limiting
    //    dimension and the window spans the column; on a WIDE screen the height limits it and the
    //    window is centred instead. Both are the same rule (the map's aspect), so both are measured;
    //    either way the column spans the viewport with the controls on the bottom edge.
    const viewportGap = m.vh - bottom(m.selection);
    const gx = m.grid?.x ?? 0;
    const gw = m.grid?.width ?? 0;
    const rightMargin = m.vw - (gx + gw);
    check(`[${tag}] the map renders at the column's full width`, !!fit && m.grid !== null && fit.inkWidth >= m.grid.width * 0.9,
      fit && m.grid ? `map ${fit.inkWidth.toFixed(1)} of column ${m.grid.width.toFixed(1)} (${((fit.inkWidth / m.grid.width) * 100).toFixed(1)}%)` : 'n/a');
    const spansColumn = gw >= m.vw - 32 - 1;
    check(`[${tag}] the window either spans the column or is centred by the height`,
      spansColumn ? Math.abs(gx - 16) <= 1 && Math.abs(rightMargin - 16) <= 1 : Math.abs(gx - rightMargin) <= 1,
      spansColumn ? `width-limited: ${gw.toFixed(1)} = the column (gutters ${gx.toFixed(1)}/${rightMargin.toFixed(1)})`
        : `height-limited: ${gw.toFixed(1)} wide, centred (margins ${gx.toFixed(1)}/${rightMargin.toFixed(1)})`);
    check(`[${tag}] the column reaches the bottom padding (no dead band)`, viewportGap >= 0 && viewportGap <= 32,
      `${viewportGap.toFixed(1)}px below the selection bar`);

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
      m.window.radius === '14px' && m.window.image === 'gradient' && m.window.shadow === 'shadow',
      JSON.stringify(m.window));

    await page.screenshot({ path: join(OUT, `world-header-${tag}.png`) });
    console.log(`    screenshot: docs/screens/world/world-header-${tag}.png (+ world-surface-menu-${tag}.png)`);
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
console.log('\nThe world map is one line in a corner-anchored header, fitted to its window, on the menu\'s grained surface.');

type SVGWrap = SVGSVGElement;
