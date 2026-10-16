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
// What this suite proves, at 320 (narrower than the owner's phone), 360 and 390px wide:
//   1. the title is ONE line — one range rect, the box exactly one line-height tall, and its ink
//      narrower than the column so nowrap can never clip or ellipsise it;
//   2. the back chevron and the wordmark share the title's top line (tops within 2px), so the header
//      reads as one row of corner chrome, not three floating pieces;
//   3. the world map carries the SAME small in-game wordmark (#hud-brand asset) in its top-right
//      corner, at the same small size the game HUD uses;
//   4. the surface behind the window is the MENU's: the screen paints no fill of its own, and a
//      background patch measures the same grain as the identical patch on the main menu (pixel sd);
//   5. the column uses the viewport (the window owns most of the height, the selection bar reaches
//      the bottom padding, no dead band), and the map window keeps its contained surface.
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
    { w: 320, h: 568 }, // narrower than the owner's phone: the title must still fit on one line
    { w: 360, h: 640 },
    { w: 390, h: 844 },
  ] as const) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
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

    // 3. ONE deliberate column: header → summary → Seeds → map → selection share one rhythm, and an
    //    empty notice leaves no dead row at the bottom.
    const bottom = (b: Box | null) => (b ? b.y + b.height : 0);
    const steps = [
      (m.summary?.y ?? 0) - bottom(m.head),
      (m.wallet?.y ?? 0) - bottom(m.summary),
      (m.grid?.y ?? 0) - bottom(m.wallet),
      (m.selection?.y ?? 0) - bottom(m.grid),
    ];
    const stepSpread = Math.max(...steps) - Math.min(...steps);
    check(`[${tag}] the column's vertical steps are ONE rhythm`, stepSpread <= 1,
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
    check(`[${tag}] the ONE global grain is still painting the background`,
      !!m.texture && m.texture.display !== 'none' && m.texture.grain === 'data-uri' && m.texture.grainOpacity > 0.05,
      m.texture ? `z=${m.texture.z} grain=${m.texture.grain} opacity=${m.texture.grainOpacity}` : 'missing #texture');
    check(`[${tag}] the surface behind the window is GRAINED, not flat`, worldPatch.sd >= 1.5,
      `world patch sd=${worldPatch.sd} (flat would be <0.5)`);
    check(`[${tag}] that grain is the MENU's grain (same patch, same surface)`,
      menuPatch.sd > 0 && worldPatch.sd / menuPatch.sd >= 0.5 && Math.abs(worldPatch.mean - menuPatch.mean) <= 2,
      `world sd=${worldPatch.sd}/mean=${worldPatch.mean} vs menu sd=${menuPatch.sd}/mean=${menuPatch.mean} (ratio ${(worldPatch.sd / menuPatch.sd).toFixed(2)})`);

    // 6. The column USES the viewport (owner: "using nicely most of screen, especially on mobile"):
    //    the window owns most of the height, it spans the column, the selection bar reaches the
    //    bottom padding, and there is no dead band under it.
    const viewportGap = m.vh - bottom(m.selection);
    check(`[${tag}] the map window owns most of the viewport height`, (m.grid?.height ?? 0) / m.vh >= 0.6,
      `window ${m.grid?.height?.toFixed(1)} of ${m.vh} = ${((m.grid?.height ?? 0) / m.vh * 100).toFixed(1)}%`);
    check(`[${tag}] the map window spans the column`, (m.grid?.width ?? 0) >= m.vw - 28,
      `window ${m.grid?.width?.toFixed(1)} of ${m.vw}`);
    check(`[${tag}] the column reaches the bottom padding (no dead band)`, viewportGap >= 0 && viewportGap <= 32,
      `${viewportGap.toFixed(1)}px below the selection bar`);

    // 7. The map keeps its CONTAINED window (owner: "let's keep as it is").
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
console.log('\nThe world map header is one line and corner-anchored, on the menu\'s own grained surface.');

type SVGWrap = SVGSVGElement;
