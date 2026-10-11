import { chromium } from 'playwright-core';
const URL = 'https://severgrow.github.io/severgrow-01/futa0.4/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30000 });
await page.waitForTimeout(1500);
const probe = await page.evaluate(() => {
  const h = (window as any).__severgrow;
  const vis = (sel: string) => { const el = document.querySelector(sel); if (!el) return 'absent'; const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' ? 'visible' : 'hidden'; };
  return {
    keys: Object.keys(h || {}),
    state: h?.state?.() ?? null,
    busy: h?.busy?.(),
    infoClass: document.documentElement.classList.contains('futa04-information'),
    smartPanel: !!document.getElementById('smart-panel'),
    dragStyle: !!document.getElementById('drag-layer-style'),
    menuNew: vis('#menu-new'),
    gmNew: vis('#gm-new'),
    game: vis('#game'),
    board: document.querySelectorAll('#board g.hex-cell').length,
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
