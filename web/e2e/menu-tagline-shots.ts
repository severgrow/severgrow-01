// Main-menu evidence shots for the tagline removal (2026-10-14).
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/menu-tagline-shots.ts after
//
// Serves the CURRENT `web/dist` via `vite preview`, captures the main menu at the four owner widths
// and writes `docs/screens/menu-tagline-<label>-<WxH>.png`. It also records the logo / title / buttons
// boxes and the wordmark→buttons distance, so "the tagline is gone and the rhythm did not move" is a
// number, not a guess. With the `after` label it FAILS if a tagline element is present, so the
// evidence cannot silently go stale.
//
//   LABEL   defaults to `after`. Use any other label to keep a differently-named pair.
//   PORT    overrides the preview port (default 4272).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const LABEL = process.argv[2] ?? 'after';
const OUT = new URL('../../docs/screens/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4272);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
  { key: '768x1024', width: 768, height: 1024 },
  { key: '1280x800', width: 1280, height: 800 },
];

const METRICS = `(() => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const inner = document.querySelector('#menu .menu-inner');
  const title = document.querySelector('#menu .title');
  const buttons = document.querySelector('#menu .menu-buttons');
  const kids = inner ? [...inner.children] : [];
  return {
    logo: box(document.getElementById('logo')),
    title: box(title),
    buttons: box(buttons),
    tagline: box(document.getElementById('menu-tagline')),
    taglineCount: document.querySelectorAll('#menu .tagline, #menu-tagline').length,
    betweenTitleAndButtons: kids
      .slice(kids.findIndex((k) => k.classList.contains('title')) + 1, kids.findIndex((k) => k.classList.contains('menu-buttons')))
      .map((k) => k.id || k.className),
    titleToButtons: title && buttons ? Math.round(buttons.getBoundingClientRect().top - title.getBoundingClientRect().bottom) : null,
    columnGap: inner ? Math.round(Number.parseFloat(getComputedStyle(inner).rowGap)) : null,
    headGap: inner ? getComputedStyle(inner).getPropertyValue('--menu-head-gap').trim() : null,
    overflowY: inner ? Math.round(inner.scrollHeight - inner.clientHeight) : null,
    viewportH: window.innerHeight,
  };
})()`;

mkdirSync(OUT, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 800, isMobile: vp.width < 800 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(700);
  const path = `${OUT}menu-tagline-${LABEL}-${vp.key}.png`;
  await page.screenshot({ path });
  const m: any = await page.evaluate(METRICS);
  console.log(`\n${vp.key}  ${path.split('/').pop()}`);
  console.log(`   ${JSON.stringify(m)}`);
  if (LABEL === 'after') {
    check(`${vp.key}: no tagline element in the menu`, m.taglineCount === 0 && m.tagline === null);
    check(`${vp.key}: nothing sits between the wordmark and the buttons`, m.betweenTitleAndButtons.length === 0, JSON.stringify(m.betweenTitleAndButtons));
    // The tagline is gone since 2026-10-14; the wordmark now stands a deliberate two-step head gap
    // (28px) above the buttons instead of the bare 14px column rhythm. This used to assert the gap
    // EQUALS the column rhythm (proving no leftover tagline gap) — that value is 14px only while the
    // head gap is absent. Assert the deliberate floor plus the token so the spacing cannot silently
    // collapse back into the wordmark.
    // `m.headGap` is the USED token value; Chrome resolves `calc(2 * var(--menu-rhythm))` to
    // `calc(2 * 14px)`, so the check ties the head gap to the 14px rhythm rather than a magic number.
    check(`${vp.key}: wordmark→buttons is the deliberate head gap (28px)`, m.titleToButtons === 28 && String(m.headGap).includes('14px'), `${m.titleToButtons}px, token ${m.headGap}`);
    check(`${vp.key}: the menu column does not scroll`, m.overflowY === 0, `overflow ${m.overflowY}px`);
  }
  await page.close();
}

await browser.close();
await server.close();
if (failed) {
  console.error(`\n${failed} menu shot check(s) failed`);
  process.exit(1);
}
console.log(`\nmenu tagline ${LABEL} shots written (${VIEWPORTS.length} viewports)`);
