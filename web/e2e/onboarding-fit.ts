// The guided window grew (a level line above the instruction), so the two layouts that have the
// least room get a direct check: a small phone and a phone on its side. The window must stay out of
// the board's way and inside the screen.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const served = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

const check = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  console.log(`  ok  ${what}`);
};

try {
  for (const [w, h] of [[320, 568], [568, 320], [844, 390]] as const) {    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await page.goto(`${served.url}?fit=${w}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#menu-play:not([hidden])', { timeout: 15000 });
    await page.evaluate(() => document.getElementById('menu-play')?.click());
    await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('menu-campaign')?.click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    await page.waitForTimeout(1000);

    const m = await page.evaluate(() => {
      const panel = document.getElementById('futasaku-glass')!.getBoundingClientRect();
      const cells = [...document.querySelectorAll('.hex-cell')].map((c) => c.getBoundingClientRect());
      const hit = cells.filter((r) => panel.left < r.right && r.left < panel.right && panel.top < r.bottom && r.top < panel.bottom).length;
      return {
        panel: { x: panel.left, y: panel.top, w: panel.width, h: panel.height },
        hit,
        cells: cells.length,
        vw: innerWidth,
        vh: innerHeight,
        deck: (() => { const r = document.getElementById('deck')!.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
      };
    });
    check(m.panel.w > 0 && m.panel.h > 0, `${w}x${h}: the guidance window is on screen`);
    check(m.panel.x >= -1 && m.panel.y >= -1, `${w}x${h}: the window starts inside the viewport (left ${Math.round(m.panel.x)}, top ${Math.round(m.panel.y)})`);
    check(m.panel.x + m.panel.w <= m.vw + 1, `${w}x${h}: the window does not run off the right edge`);
    check(m.hit === 0, `${w}x${h}: the window covers no playable hex (${m.hit} of ${m.cells})`);
    check(m.deck.w >= 36 && m.deck.h >= 36, `${w}x${h}: the Draw pile stays tappable (${Math.round(m.deck.w)}px)`);
    await page.screenshot({ path: `/tmp/ob-shots/fit-${w}x${h}.png` });
    await page.close();
  }

  // Large text: the window's own type grows, so the smallest phone must still keep the board clear.
  {
    const w = 360, h = 640;
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await page.goto(`${served.url}?fit=large`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#menu-play:not([hidden])', { timeout: 15000 });
    await page.evaluate(() => document.getElementById('menu-play')?.click());
    await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('menu-campaign')?.click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    await page.evaluate(() => document.documentElement.classList.add('large-text'));
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const panel = document.getElementById('futasaku-glass')!.getBoundingClientRect();
      const hit = [...document.querySelectorAll('.hex-cell')].filter((c) => {
        const r = c.getBoundingClientRect();
        return panel.left < r.right && r.left < panel.right && panel.top < r.bottom && r.top < panel.bottom;
      }).length;
      return { w: panel.width, h: panel.height, hit, vw: innerWidth };
    });
    check(m.w > 0 && m.w <= m.vw, `${w}x${h} large text: the window fits the width (${Math.round(m.w)}px)`);
    check(m.hit === 0, `${w}x${h} large text: the window covers no playable hex (${m.hit})`);
    await page.screenshot({ path: '/tmp/ob-shots/fit-large-text.png' });
    await page.close();
  }
} finally {
  await browser.close();
  await served.server.close();
}
