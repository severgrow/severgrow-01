import { chromium } from 'playwright-core';

const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
for (const base of ['https://www.futasaku.com/', 'https://www.futasaku.com/test/']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
  await page.goto(base + '?seed=219682080', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const stats = await page.evaluate(() => {
    const q = (s: string) => document.querySelectorAll(s).length;
    return {
      entry: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src?.split('/').pop(),
      boardImages: q('#board image'),
      paintedGround: q('#board .fa-painted-ground'),
      filters: q('#board filter'),
      masks: q('#board mask'),
      clippaths: q('#board clipPath'),
      anims: document.getAnimations().length,
      running: document.getAnimations().filter((a) => a.playState === 'running').length,
      totalNodes: q('*'),
      boardNodes: q('#board *'),
      boardSize: (() => { const r = document.getElementById('board')!.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
      feels: (() => { try { return { raf: (window as any).__severgrow.feel().rafSubscribers, live: (window as any).__severgrow.feel().liveAnimations }; } catch { return null; } })(),
      renderCosts: (() => { try { return (window as any).__severgrow.renderCosts().slice(-3); } catch { return null; } })(),
    };
  });
  console.log(base, JSON.stringify(stats));
  await page.close();
}
await browser.close();
