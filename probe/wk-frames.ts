// WebKit sanity: does the page deliver frames at all, before and during a tap?
import { webkit } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const browser = await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(BASE + '?seed=219682080');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 60000 });
let quiet = 0;
for (let i = 0; i < 100; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { quiet = 0; await page.mouse.click(195, 420); } else { quiet++; if (quiet >= 5) break; }
  await page.waitForTimeout(160);
}
await page.waitForTimeout(800);
for (let round = 0; round < 4; round++) {
  const before = await page.evaluate(async () => {
    const t: number[] = [];
    await new Promise<void>((res) => {
      const t0 = performance.now();
      const f = (now: number) => { t.push(Math.round(now - t0)); if (performance.now() - t0 < 400) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    return { frames: t.length, gaps: t.slice(1).map((v, i) => v - t[i]!), hidden: document.hidden, vis: document.visibilityState };
  });
  // a real tap on the deck area (harmless if nothing legal)
  await page.mouse.click(195, 620);
  const during = await page.evaluate(async () => {
    const t: number[] = [];
    await new Promise<void>((res) => {
      const t0 = performance.now();
      const f = (now: number) => { t.push(Math.round(now - t0)); if (performance.now() - t0 < 400) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    return { frames: t.length };
  });
  console.log('round', round, JSON.stringify({ before, during }));
}
await browser.close();
