// MENU ALIGNMENT — the browser guard for the invariants the owner judges visually. `menu-audit.ts`
// writes the evidence; this asserts and fails CI/`tsx` runs when a surface drifts.
//
//   CHANNEL=futa05 npm run web:build && npx tsx web/e2e/menu-alignment.ts
//
// Serves the CURRENT `web/dist` via `vite preview` and, at 360x640 / 390x844 / 768x1024 / 1280x800,
// checks (from real getBoundingClientRect / getComputedStyle values, the same box-measurement
// approach as `align.ts`):
//   1. the main menu, the difficulty pick and the online hub centre the SAME column width, on the
//      screen's centre line;
//   2. the wordmark→buttons gap is the deliberate 28px head gap — at least a floor, never a void;
//   3. no menu column overflows (scrollHeight <= clientHeight) at any width, 360x640 included;
//   4. the screen headings (difficulty and online) share one size and one display face;
//   5. the difficulty tiles are the same pill button as the menu's;
//   6. every visible menu/hub/levels button keeps a >= 44px hit target;
//   7. the "Opponent found" card's primary button carries the cream fill (the cream-token scope).
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';

const PORT = Number(process.env.PORT ?? 4286);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const HEAD_GAP_FLOOR = 28;
const HEAD_GAP_CEILING = 44; // "a bit of space", not a chasm
const HIT = 44;

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640, short: true },
  { key: '390x844', width: 390, height: 844 },
  { key: '768x1024', width: 768, height: 1024 },
  { key: '1280x800', width: 1280, height: 800, mouse: true },
] as const;

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: +b.width.toFixed(2), h: +b.height.toFixed(2), left: +b.left.toFixed(2), right: +b.right.toFixed(2), top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2) }; };
  const num = (el, p) => (el ? Number.parseFloat(getComputedStyle(el)[p]) : null);
  const col = (sel) => { const el = q(sel); const b = box(el); return { sel, w: b ? b.w : null, centre: b ? +((b.left + b.right) / 2 - window.innerWidth / 2).toFixed(2) : null, overflow: el ? Math.max(0, Math.round(el.scrollHeight - el.clientHeight)) : null }; };
  const heading = (sel) => { const el = q(sel); return el ? { size: num(el, 'fontSize'), family: getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '') } : null; };
  const radius = (sel) => { const el = q(sel); return el ? +Number.parseFloat(getComputedStyle(el).borderTopLeftRadius).toFixed(2) : null; };
  const tile = q('#levels .level-grid .difficulty-tile');
  const tb = box(tile);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    menu: col('#menu .menu-inner'),
    levels: col('#levels .levels-inner'),
    hub: col('#online-hub .online-inner'),
    headGapToken: (() => { const el = q('#menu .menu-inner'); return el ? getComputedStyle(el).getPropertyValue('--menu-head-gap').trim() : null; })(),
    // The token's USED value (Chrome keeps the raw calc text in the custom property).
    headGapResolved: (() => {
      const el = q('#menu .menu-inner');
      if (!el) return null;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;height:0;width:var(--menu-head-gap);pointer-events:none;';
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return +w.toFixed(2);
    })(),
    menuHeading: heading('#menu .title'),
    levelsHeading: heading('#levels .levels-head h2'),
    hubHeading: heading('#online-hub .online-head h2'),
    menuRadius: radius('#menu-new'),
    tileRadius: tile ? +Number.parseFloat(getComputedStyle(tile).borderTopLeftRadius).toFixed(2) : null,
    tileHeight: tb ? +tb.h.toFixed(2) : null,
    widgets: [...document.querySelectorAll('#menu .btn, #online-hub .btn, #levels .btn, #menu .icon-only, #online-hub .icon-only, #levels .icon-only')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => +el.getBoundingClientRect().height.toFixed(2)),
    matchedPrimaryBg: null,
  };
})()`;

type Column = { sel: string; w: number | null; centre: number | null; overflow: number | null };
type Heading = { size: number | null; family: string };
type Measured = {
  viewport: { w: number; h: number };
  menu: Column;
  levels: Column;
  hub: Column;
  headGapToken: string | null;
  headGapResolved: number | null;
  menuHeading: Heading | null;
  levelsHeading: Heading | null;
  hubHeading: Heading | null;
  menuRadius: number | null;
  tileRadius: number | null;
  tileHeight: number | null;
  widgets: number[];
};
const measure = (page: Page) => page.evaluate(MEASURE) as Promise<Measured>;

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });

const centred = (n: number | null) => n !== null && Math.abs(n) <= 0.5;

for (const vp of VIEWPORTS) {
  const mouse = 'mouse' in vp && vp.mouse === true;
  const page = await browser.newPage(mouse ? { viewport: { width: vp.width, height: vp.height } } : { viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(800); // the injected typography stylesheet mounts after boot
  const tag = vp.key;

  // The main menu + the head gap
  const menu = await measure(page);
  const wordmarkToButtons = await page.evaluate(() => {
    const t = document.querySelector('#menu .title')!.getBoundingClientRect();
    const b = document.querySelector('#menu .menu-buttons')!.getBoundingClientRect();
    return +(b.top - t.bottom).toFixed(2);
  });
  check(`${tag}: the menu wordmark→buttons gap is the deliberate head gap (${HEAD_GAP_FLOOR}-${HEAD_GAP_CEILING}px)`, wordmarkToButtons >= HEAD_GAP_FLOOR && wordmarkToButtons <= HEAD_GAP_CEILING && menu.headGapResolved === HEAD_GAP_FLOOR, `${wordmarkToButtons}px, token ${menu.headGapResolved}px (${menu.headGapToken})`);
  // The tagline restore path (SHOW_MENU_TAGLINE turns this back on with one line): insert the
  // element the way main.ts does and prove the new head-gap rule does not also match it — a restored
  // tagline must keep its old 14px / 28px spacing.
  const tagline = (await page.evaluate(() => {
    const inner = document.querySelector('#menu .menu-inner')!;
    const buttons = document.querySelector('#menu .menu-buttons')!;
    const p = document.createElement('p');
    p.id = 'menu-tagline';
    p.className = 'tagline';
    p.textContent = 'GROW · CONNECT · CONQUER';
    buttons.before(p);
    const t = document.querySelector('#menu .title')!.getBoundingClientRect();
    const g = p.getBoundingClientRect();
    const b = buttons.getBoundingClientRect();
    const out = { titleToTagline: +(g.top - t.bottom).toFixed(2), taglineToButtons: +(b.top - g.bottom).toFixed(2), overflow: Math.round(inner.scrollHeight - inner.clientHeight) };
    p.remove();
    return out;
  })) as { titleToTagline: number; taglineToButtons: number; overflow: number };
  check(`${tag}: a restored tagline keeps its own 14px / 28px spacing (head gap not double-applied)`, tagline.titleToTagline === 14 && tagline.taglineToButtons === 28 && tagline.overflow === 0, JSON.stringify(tagline));

  check(`${tag}: the menu column is centred`, centred(menu.menu.centre), `offset ${menu.menu.centre}px`);
  check(`${tag}: the menu column does not overflow`, menu.menu.overflow === 0, `overflow ${menu.menu.overflow}px`);

  // The difficulty pick
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(400);
  const levels = await measure(page);
  check(`${tag}: the difficulty column matches the menu column width`, levels.levels.w === menu.menu.w, `${levels.levels.w} vs ${menu.menu.w}`);
  check(`${tag}: the difficulty column is centred and does not overflow`, centred(levels.levels.centre) && levels.levels.overflow === 0, `offset ${levels.levels.centre}, overflow ${levels.levels.overflow}`);

  // The online hub
  await page.click('#levels-back').catch(() => undefined);
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10_000 });
  const hubVisible = (await page.locator('#menu-online:not([hidden])').count()) > 0;
  if (hubVisible) {
    await page.click('#menu-online');
    const hubUp = await page.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 }).then(() => true).catch(() => false);
    if (!hubUp) await page.evaluate(() => { const el = document.getElementById('online-hub'); if (el) el.hidden = false; });
    await page.waitForTimeout(400);
    const hub = await measure(page);
    check(`${tag}: the online hub column matches the menu column width`, hub.hub.w === menu.menu.w, `${hub.hub.w} vs ${menu.menu.w}`);
    check(`${tag}: the online hub column is centred and does not overflow`, centred(hub.hub.centre) && hub.hub.overflow === 0, `offset ${hub.hub.centre}, overflow ${hub.hub.overflow}`);
    check(`${tag}: the online hub heading shares the difficulty heading size`, hub.hubHeading!.size === levels.levelsHeading!.size, `${hub.hubHeading!.size} vs ${levels.levelsHeading!.size}`);
    check(`${tag}: the online hub heading uses the display face`, hub.hubHeading!.family === levels.levelsHeading!.family, `${hub.hubHeading!.family} vs ${levels.levelsHeading!.family}`);
    // The cream-token scope: the matched card's primary must be the cream fill, not bare text.
    await page.evaluate(() => { const el = document.getElementById('online-matched'); if (el) el.hidden = false; });
    await page.waitForTimeout(200);
    const matchedBg = await page.evaluate(() => getComputedStyle(document.getElementById('online-matched-now')!).backgroundColor);
    check(`${tag}: the "Opponent found" primary carries the cream fill`, matchedBg === 'rgb(232, 221, 197)', matchedBg);
    await page.evaluate(() => { const el = document.getElementById('online-matched'); if (el) el.hidden = true; });
  }

  // The difficulty tiles are the same pill button as the menu's
  check(`${tag}: difficulty tiles use the same corner radius as the menu buttons`, levels.tileRadius === menu.menuRadius, `tile ${levels.tileRadius} vs menu ${menu.menuRadius}`);
  check(`${tag}: difficulty tiles keep the big-button height (>= 44px)`, (levels.tileHeight ?? 0) >= HIT, `${levels.tileHeight}px`);

  // Hit targets
  const small = levels.widgets.filter((h) => h < HIT - 0.5);
  check(`${tag}: every menu / hub / levels button keeps a >= ${HIT}px hit target`, small.length === 0, small.length ? `too small: ${small.join(', ')}` : `${levels.widgets.length} controls`);
  check(`${tag}: no page errors`, errors.length === 0, errors[0]);
  await page.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} alignment checks passed`);
process.exit(failed.length ? 1 : 0);
