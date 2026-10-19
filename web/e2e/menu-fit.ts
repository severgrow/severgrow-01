// THE MAIN MENU FITS EVERY SUPPORTED SCREEN (owner, 2026-10-19) — no scrolling, ever.
//
//   CHANNEL=futa05 npm run web:build && npx tsx web/e2e/menu-fit.ts
//   SHOTS=docs/screens/menu-fit npx tsx web/e2e/menu-fit.ts   (also writes one shot per size)
//
// For each size the test reads the REAL menu: the logo, the wordmark and every visible button must
// be fully inside the screen, at least 44px tall, with no page or menu scrolling. Tall screens must
// SPREAD (the free height is shared, not clustered in the middle) without stretching into a sparse
// ladder; short screens compress the gaps first. Large text is checked on the smallest phone.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = process.env.SHOTS ?? '';
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  const under = path.startsWith('/3/') ? path.slice(3) : path;
  let file = join(DIST, under || 'index.html');
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const URL3 = `http://127.0.0.1:${(server.address() as AddressInfo).port}/3/`;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const check = (ok: boolean, what: string) => { assert.ok(ok, what); console.log(`  ok  ${what}`); };

/** Everything the menu shows, measured from the real page. */
const MEASURE = `(() => {
  const menu = document.getElementById('menu');
  const inner = document.querySelector('#menu .menu-inner');
  const logo = document.getElementById('logo');
  const wordmark = document.querySelector('#menu .title');
  const buttons = [...document.querySelectorAll('#menu .menu-buttons .btn')].filter((b) => b.offsetParent !== null);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) }; };
  const ib = box(inner), lb = box(logo), wb = box(wordmark);
  const bb = buttons.map((b) => ({ id: b.id, ...box(b), label: (b.textContent || '').trim().slice(0, 24) }));
  const visible = buttons.length;
  const menuScroll = Math.max(0, menu.scrollHeight - menu.clientHeight);
  const innerScroll = Math.max(0, inner.scrollHeight - inner.clientHeight);
  const gaps = [];
  if (ib && lb && wb) {
    gaps.push(+(lb.y - ib.y).toFixed(1));
    gaps.push(+(wb.y - lb.bottom).toFixed(1));
    if (bb.length) gaps.push(+(bb[0].y - wb.bottom).toFixed(1));
    gaps.push(+(ib.bottom - bb[bb.length - 1].bottom).toFixed(1));
  }
  return {
    vw: innerWidth, vh: innerHeight,
    inner: ib, logo: lb, wordmark: wb, buttons: bb,
    gaps,
    menuScroll, innerScroll,
    docScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    docWide: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    justify: inner ? getComputedStyle(inner).justifyContent : '',
    overflowY: menu ? getComputedStyle(menu).overflowY : '',
    visible,
    allIds: [...document.querySelectorAll('#menu .menu-buttons .btn')].map((b) => b.id),
  };
})()`;

type Box = { x: number; y: number; w: number; h: number; bottom: number; right: number };
type Measure = {
  vw: number; vh: number; inner: Box; logo: Box | null; wordmark: Box | null;
  buttons: (Box & { id: string; label: string })[]; gaps: number[];
  menuScroll: number; innerScroll: number; docScroll: number; docWide: number;
  justify: string; overflowY: string; visible: number; allIds: string[];
};

const SIZES = [
  { w: 320, h: 568, name: 'small phone' },
  { w: 360, h: 640, name: 'phone' },
  { w: 390, h: 844, name: 'tall phone' },
  { w: 844, h: 390, name: 'phone landscape' },
  { w: 768, h: 1024, name: 'tablet portrait' },
  { w: 1024, h: 1366, name: 'tablet tall' },
  { w: 1440, h: 900, name: 'desktop' },
  { w: 1920, h: 1080, name: 'large desktop' },
] as const;

const openMenu = async (page: Page, largeText = false) => {
  await page.goto(URL3, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 20000 });
  if (largeText) await page.evaluate(() => document.documentElement.classList.add('large-text'));
  // The menu only ever deals with the settled layout; two frames is enough.
  await page.waitForTimeout(400);
};

const checkFit = (m: Measure, tag: string, tall: boolean) => {
  check(m.overflowY === 'hidden', `${tag}: the menu cannot scroll (overflow-y: ${m.overflowY})`);
  check(m.menuScroll <= 1 && m.innerScroll <= 1, `${tag}: no menu overflow (${m.menuScroll}/${m.innerScroll})`);
  check(m.docScroll <= 1, `${tag}: no page scroll (${m.docScroll}px)`);
  check(m.docWide <= 1, `${tag}: nothing runs off the side (${m.docWide}px)`);
  check(!!m.logo && m.logo.w > 40 && m.logo.h > 20, `${tag}: the logo is on screen (${m.logo?.w}x${m.logo?.h})`);
  check(!!m.logo && m.logo.y >= -0.5 && m.logo.bottom <= m.vh + 0.5, `${tag}: the logo is fully inside`);
  check(!!m.wordmark && m.wordmark.y >= -0.5 && m.wordmark.bottom <= m.vh + 0.5, `${tag}: the wordmark is fully inside`);
  // Entries the player actually has: the menu reveals some by device/state (Log in, Continue), so
  // the rule is that every SHOWN entry is on screen — and the core two are always shown.
  const ids = m.buttons.map((b) => b.id);
  check(ids.includes('menu-play'), `${tag}: Play is shown`);
  check(ids.includes('menu-settings'), `${tag}: Settings is shown`);
  check(m.visible >= 3, `${tag}: the whole menu is there (${m.visible} entries)`);
  for (const b of m.buttons) {
    check(b.y >= -0.5 && b.bottom <= m.vh + 0.5, `${tag}: ${b.id} is fully inside (${b.y}..${b.bottom} of ${m.vh})`);
    check(b.h >= 44, `${tag}: ${b.id} is at least 44px tall (${b.h})`);
    check(b.w > 120, `${tag}: ${b.id} keeps a comfortable width (${b.w})`);
  }
  check(!!m.inner && m.inner.y >= -0.5 && m.inner.bottom <= m.vh + 0.5, `${tag}: the column is inside the safe area`);
  // No bigger than the screen: the column is the thing that fits, not a scroll.
  check(!!m.inner && m.inner.h <= m.vh + 0.5, `${tag}: the column is no taller than the screen`);
  if (tall) {
    // SPREAD, not clustered: real air above the logo and under the last button, in every gap.
    const tiny = m.gaps.filter((g) => g < 24).length;
    check(tiny === 0, `${tag}: every gap uses the spare height (${m.gaps.join('/')}px)`);
    // …but never stretched into a sparse ladder.
    check(Math.max(...m.gaps) <= 220, `${tag}: the spread stays calm (max ${Math.max(...m.gaps)}px)`);
    // And the rhythm is even (the head gap may stand one step proud, never a chasm).
    const spread = Math.max(...m.gaps) - Math.min(...m.gaps);
    check(spread <= 60, `${tag}: the rhythm is even (spread ${spread}px)`);
  }
};

const results: string[] = [];
try {
  for (const size of SIZES) {
    console.log(`\n${size.name} ${size.w}x${size.h}:`);
    const tag = `${size.w}x${size.h}`;
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, isMobile: size.w < 800, hasTouch: size.w < 800 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await openMenu(page);
      const m = (await page.evaluate(MEASURE)) as Measure;
      checkFit(m, tag, size.h >= 780);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-${tag}.png` });
      results.push(`${tag}: ${m.visible} entries, gaps ${m.gaps.join('/')}px, tallest ${Math.max(...m.buttons.map((b) => b.h))}px`);
      assert.deepEqual(errors, [], `${tag}: no page errors: ${errors.join(' | ')}`);
    } finally {
      await page.close();
    }
  }
  // Large text on the smallest phone: everything is bigger, nothing may be cut off.
  {
    console.log('\nlarge text 320x568:');
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    try {
      await openMenu(page, true);
      const m = (await page.evaluate(MEASURE)) as Measure;
      check(m.docScroll <= 1 && m.menuScroll <= 1, `large text: no scroll (${m.docScroll}/${m.menuScroll})`);
      check(m.buttons.some((b) => b.id === 'menu-play') && m.buttons.some((b) => b.id === 'menu-settings'), 'large text: Play and Settings are shown');
      check(!!m.logo && m.logo.bottom <= m.vh, 'large text: the logo is on screen');
      for (const b of m.buttons) check(b.h >= 44 && b.bottom <= m.vh + 0.5, `large text: ${b.id} fits and stays tappable (${b.h}px)`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-large-text-320x568.png` });
      results.push(`large text 320x568: ${m.visible} entries, gaps ${m.gaps.join('/')}px`);
    } finally {
      await page.close();
    }
  }
  console.log('\n' + results.join('\n'));
} finally {
  await browser.close();
  server.close();
}
