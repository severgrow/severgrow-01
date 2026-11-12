// THE MAIN MENU FITS EVERY SUPPORTED SCREEN (owner, 2026-10-19) — no scrolling, ever.
//
//   CHANNEL=futa05 npm run web:build && npx tsx web/e2e/menu-fit.ts
//   SHOTS=docs/screens/menu-fit npx tsx web/e2e/menu-fit.ts   (also writes one shot per size)
//
// For each size the test reads the REAL menu: the logo, the wordmark and every visible button must
// be fully inside the screen, every menu key is the owner's 50px (2026-10-21), with no page or menu
// scrolling. Tall screens must SPREAD (the free height is shared, not clustered in the middle)
// without stretching into a sparse ladder; short screens compress the gaps first. Large text is
// checked on the smallest phone. The bottom row (account key | Settings) must stay one row, below
// the beta line and the logo, with Settings as the last control.
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
  const foot = document.getElementById('menu-foot');
  const footKeys = foot ? [...foot.querySelectorAll('.btn')].filter((b) => b.offsetParent !== null) : [];
  const betaEl = document.getElementById('menu-beta');
  const betaBtn = betaEl ? betaEl.querySelector('button') : null;
  const betaVisible = !!betaEl && betaEl.offsetParent !== null;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) }; };
  const ib = box(inner), lb = box(logo), wb = box(wordmark), fb = box(foot);
  const bb = buttons.map((b) => ({ id: b.id, ...box(b), label: (b.textContent || '').trim().slice(0, 24) }));
  const visible = buttons.length;
  const menuScroll = Math.max(0, menu.scrollHeight - menu.clientHeight);
  const innerScroll = Math.max(0, inner.scrollHeight - inner.clientHeight);
  // The owner's rule (2026-10-21): every key on the menu is the same distance from the next. Measure
  // the space between CONSECUTIVE visible keys, including the footer row, in visual (y) order.
  const keyGaps = (() => {
    const all = [...buttons].sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y || a.getBoundingClientRect().x - b.getBoundingClientRect().x);
    const out = [];
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1].getBoundingClientRect();
      const cur = all[i].getBoundingClientRect();
      // Keys on the same row (the footer pair) are not a vertical gap.
      if (Math.abs(cur.y - prev.y) < 1) continue;
      out.push(+(cur.y - prev.bottom).toFixed(1));
    }
    return out;
  })();
  const gaps = [];
  if (ib && lb && wb) {
    gaps.push(+(lb.y - ib.y).toFixed(1));
    gaps.push(+(wb.y - lb.bottom).toFixed(1));
    // The beta line is part of the column's rhythm, so it gets its own two gaps (owner, 2026-10-20):
    // wordmark → beta line, beta line → first entry. Measuring past it would hide a cramped gap.
    const betaBox = betaVisible ? box(betaEl) : null;
    if (betaBox) gaps.push(+(betaBox.y - wb.bottom).toFixed(1));
    if (bb.length) gaps.push(+(bb[0].y - (betaBox ? betaBox.bottom : wb.bottom)).toFixed(1));
    gaps.push(+(ib.bottom - bb[bb.length - 1].bottom).toFixed(1));
  }
  return {
    vw: innerWidth, vh: innerHeight,
    inner: ib, logo: lb, wordmark: wb, buttons: bb,
    foot: fb,
    footKeys: footKeys.map((b) => ({ id: b.id, ...box(b) })),
    beta: betaVisible ? { ...box(betaEl), link: box(betaBtn) } : null,
    seen: [...(betaVisible ? ['menu-beta'] : []), ...buttons.map((b) => b.id)],
    gaps,
    keyGaps,
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
  buttons: (Box & { id: string; label: string })[];
  /** The bottom row (owner brief, 2026-10-21): LOG IN/name left, Settings right, one row. */
  foot: Box | null;
  footKeys: (Box & { id: string })[];
  /** The beta line (owner, 2026-10-20): its own box and its link's 44px target. */
  beta: (Box & { link: Box | null }) | null;
  /** Everything the player sees in DOM (and tab) order: the beta line, then the entries. */
  seen: string[];
  gaps: number[];
  /** The vertical space between each CONSECUTIVE pair of visible keys (the owner's equal-spacing
   *  rule, 2026-10-21). Same-row pairs (the footer's two keys) are not vertical gaps. */
  keyGaps: number[];
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
  // Owner (2026-10-21): "make the spacing between buttons always equal". Every consecutive pair of
  // keys in the menu — including the footer row that used to sit in the menu's distributed space —
  // must be the same distance apart. One pixel of tolerance for sub-pixel rounding.
  if (m.keyGaps.length > 1) {
    const min = Math.min(...m.keyGaps);
    const max = Math.max(...m.keyGaps);
    check(max - min <= 1, `${tag}: every key is spaced equally (gaps ${m.keyGaps.join('/')}px)`);
  }
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
  // The bottom row (owner brief, 2026-10-21): ONE footer after the column, Settings on its right.
  check(!!m.foot, `${tag}: the footer row exists`);
  check(m.footKeys.some((k) => k.id === 'menu-settings'), `${tag}: Settings is a footer key`);
  check(m.seen.at(-1) === 'menu-settings', `${tag}: Settings is the LAST control in the menu (${m.seen.at(-1)})`);
  const footLogin = m.footKeys.find((k) => k.id === 'menu-login');
  const footSettings = m.footKeys.find((k) => k.id === 'menu-settings');
  if (footLogin && footSettings) {
    check(footLogin.right <= footSettings.x + 0.5, `${tag}: LOG IN is the left key (${footLogin.right} ≤ ${footSettings.x})`);
    check(Math.abs(footLogin.y - footSettings.y) <= 0.5, `${tag}: LOG IN and Settings are one row (${footLogin.y}/${footSettings.y})`);
  }
  // Every key on the menu is the owner's 50px key, at every size and with Large text.
  for (const k of m.footKeys) check(Math.abs(k.h - 50) <= 0.5, `${tag}: ${k.id} is the 50px menu key (${k.h})`);
  // The footer must never collide with the beta line or the logo above it.
  check(!!m.foot && !!m.beta && m.foot.y >= m.beta.bottom - 0.5, `${tag}: the footer sits below the beta line (${m.foot?.y} vs ${m.beta?.bottom})`);
  check(!!m.foot && !!m.logo && m.foot.y >= m.logo.bottom - 0.5, `${tag}: the footer sits below the logo`);
  check(!!m.foot && m.foot.y >= -0.5 && m.foot.bottom <= m.vh + 0.5, `${tag}: the footer is fully inside (${m.foot?.y}..${m.foot?.bottom} of ${m.vh})`);
  // The beta line sits between the wordmark and the first entry, and is part of the seen/tab order.
  check(!!m.beta, `${tag}: the beta line is shown`);
  check(!!m.beta && !!m.wordmark && m.beta.y >= m.wordmark.bottom - 0.5, `${tag}: the beta line follows the wordmark (${m.beta?.y} vs ${m.wordmark?.bottom})`);
  check(!!m.beta && m.buttons.length > 0 && m.beta.bottom <= m.buttons[0]!.y + 0.5, `${tag}: the beta line sits above the first entry (${m.beta?.bottom} vs ${m.buttons[0]?.y})`);
  check(!!m.beta && m.beta.y >= -0.5 && m.beta.bottom <= m.vh + 0.5, `${tag}: the beta line is fully inside (${m.beta?.y}..${m.beta?.bottom} of ${m.vh})`);
  check(!!m.beta && m.beta.x >= -0.5 && m.beta.right <= m.vw + 0.5, `${tag}: the beta line never runs off the side`);
  check(!!m.beta?.link && m.beta.link.h >= 44, `${tag}: the beta link is a 44px tap target (${m.beta?.link?.h})`);
  check(m.seen[0] === 'menu-beta', `${tag}: the beta line is first in the seen order (${m.seen.join(' → ')})`);
  const required = ['menu-play', 'menu-world', 'menu-login', 'menu-settings'];
  const positions = required.map((id) => m.seen.indexOf(id)).filter((i) => i >= 0);
  check(
    positions.length >= 2 && positions.every((p, i) => i === 0 || p > positions[i - 1]!),
    `${tag}: the entries keep the owner's order (${m.seen.filter((id) => required.includes(id)).join(' → ')})`,
  );
  for (const b of m.buttons) {
    check(b.y >= -0.5 && b.bottom <= m.vh + 0.5, `${tag}: ${b.id} is fully inside (${b.y}..${b.bottom} of ${m.vh})`);
    check(Math.abs(b.h - 50) <= 0.5, `${tag}: ${b.id} is the owner's 50px key (${b.h})`);
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
    // And the rhythm is even (the head gap may stand one step proud, never a chasm). Since the owner's
    // 2026-10-31 call ("the space under and above the beta text is too large, equal spacing") the
    // wordmark, beta line and entries are ONE group: its two inner steps are equal to each other and
    // tight, and the evenness applies to the column's own gaps around the group.
    const beta = m.gaps.length === 5 ? m.gaps.slice(2, 4) : [];
    const outer = beta.length ? [m.gaps[0]!, m.gaps[1]!, m.gaps[4]!] : m.gaps;
    const spread = Math.max(...outer) - Math.min(...outer);
    check(spread <= 60, `${tag}: the rhythm is even (spread ${spread}px)`);
    if (beta.length) {
      check(Math.abs(beta[0]! - beta[1]!) <= 1, `${tag}: the beta line sits one equal step from the wordmark and the entries (${beta.join('/')}px)`);
      check(Math.max(...beta) < Math.min(...outer), `${tag}: the beta steps are tighter than the column's gaps (${beta.join('/')} vs ${outer.join('/')}px)`);
    }
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
      for (const b of m.buttons) check(Math.abs(b.h - 50) <= 0.5 && b.bottom <= m.vh + 0.5, `large text: ${b.id} is the 50px key and fits (${b.h}px)`);
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
