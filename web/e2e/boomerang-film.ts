// MEASURING TOOL (not a CI gate): frames of the human throw's boomerang, stepped on the animation's own
// clock slowed to 1/10 through CDP (Animation.setPlaybackRate). Writes FILM_DIR/boomerang-*.png.
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/boomerang-film.ts
import { chromium } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';

const OUT = process.env.FILM_DIR ?? '/tmp/boomerang-film';
const { server, url: BASE } = await servePreview(4299, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
try {
  await page.addInitScript(() => localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal' })));
  await page.addInitScript(() => { (window as any).__name = (fn: unknown) => fn; });
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#deck.ready');
  await page.evaluate(() => document.getElementById('deck')!.click());
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());
  await page.locator('#smart-context').click();
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'DISCARD' && !(window as any).__severgrow.busy());
  const st = await page.evaluate(() => (window as any).__severgrow.state());
  const action = legalActions(viewFor(st, 0)).find((a) => a.t === 'Discard')!;
  // Slow motion on the browser's own animation clock (every Web Animation at 1/10 speed).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  await page.evaluate((a) => { (window as any).__severgrow.playFor(a, 0); }, action);
  const t0 = Date.now();
  const shots: string[] = [];
  const total = 620;
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const want = (total * 10 * i) / N;
    const wait = want - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const t = Math.round((Date.now() - t0) / 10);
    const path = `${OUT}/boomerang-${String(i).padStart(2, '0')}-${t}ms.png`;
    await page.screenshot({ path });
    shots.push(path);
  }
  console.log(`boomerang film: ${shots.length} frames over ${total} ms -> ${OUT}`);
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
