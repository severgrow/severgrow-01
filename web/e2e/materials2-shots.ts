// Material pass 2 proof: phone (390x844) and desktop (1280x800) screenshots of the board,
// the lab (strength ramp strips and neighbour boards, Normal and Low), the turn pill, and
// a performance report (frames per second during a bot turn, repaint times, memory, size).
//   npx tsx web/e2e/materials2-shots.ts --dir=docs/screens/materials2
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { goldDemo } from './positions.js';
import { newGame } from '../../src/engine/index.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/materials2';
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4178, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4178/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };
const demo = goldDemo();
const errors: string[] = [];
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
type W = { __severgrow: { busy: () => boolean; world: () => { full: number[]; partial: number[]; canvasBytes: number } | null } };

const open = async (vp: { width: number; height: number }, settings: Record<string, unknown>, state: unknown = demo.state, needWorld = true) => {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', ...settings }), JSON.stringify({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.mouse.move(1, 1);
  if (needWorld) await page.waitForFunction(() => document.querySelector('.world-fill') !== null, undefined, { timeout: 30000 }).catch(() => errors.push('world layer never appeared'));
  await page.waitForTimeout(500);
  return page;
};
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: `${dir}/${name}.jpg`, quality: 82, fullPage: full });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

const report: Record<string, unknown> = {};
for (const [name, vp] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
  const page = await open(vp, { palette: 'soil' });
  await shot(page, `${name}-board`);
  if (await overflow(page)) errors.push(`${name}: the page scrolls sideways`);
  report[`${name}-world`] = await page.evaluate(() => (window as unknown as W).__severgrow.world());
  await page.close();
  const low = await open(vp, { palette: 'soil', materialDetail: 'low' });
  await shot(low, `${name}-board-low`);
  await low.close();
}
// the lab: strength ramp strips (grass and lava 1-9) and the neighbour boards, every palette
for (const [name, vp] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
  for (const detail of ['normal', 'low']) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}?lab=1${detail === 'low' ? '&detail=low' : ''}`);
    await page.waitForFunction(() => document.querySelectorAll('.world-fill').length > 20, undefined, { timeout: 30000 }).catch(() => errors.push('lab: world layer never appeared'));
    await page.waitForTimeout(800);
    await shot(page, `${name}-lab${detail === 'low' ? '-low' : ''}`, true);
    await page.close();
  }
}
// the turn pill: a fresh game, my turn; then play into the bot's turn at normal speed and
// measure the frame rate while its turn animates
{
  const page = await open(PHONE, { palette: 'soil', speed: 'normal' }, newGame(4242), false);
  // (a plain string: tsx would wrap a named function in a helper the page does not have)
  await page.evaluate('window.__fps = []; (() => { let last = performance.now(); const f = (now) => { window.__fps.push(now - last); last = now; requestAnimationFrame(f); }; requestAnimationFrame(f); })()');
  // draw, stop growing, throw a card: the quickest way to hand the turn over
  await page.click('#deck');
  await page.waitForTimeout(500);
  await page.locator('#moves .end').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('#hand .card.playable').first().click();
  await page.waitForFunction(() => !document.querySelector('#turn-pill')?.hasAttribute('hidden') && document.querySelector('#turn-pill.bot') !== null, undefined, { timeout: 8000 }).catch(() => errors.push('no bot pill'));
  await page.waitForTimeout(330);
  await shot(page, 'phone-pill-bot');
  await page.waitForFunction(() => !(window as unknown as W).__severgrow.busy() && document.querySelector('#turn-pill.you:not([hidden])') !== null, undefined, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(330);
  await shot(page, 'phone-pill-you');
  const frames = await page.evaluate(() => (window as unknown as { __fps: number[] }).__fps.slice(5));
  const sorted = [...frames].sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  report.frames = { count: frames.length, meanFps: Math.round(1000 / mean), p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 10) / 10, worstMs: Math.round(sorted[sorted.length - 1]!), over20ms: frames.filter((f) => f > 20).length, over50ms: frames.filter((f) => f > 50).length };
  report.partials = await page.evaluate(() => (window as unknown as W).__severgrow.world());
  report.heapMB = await page.evaluate(() => Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e5) / 10);
  await page.close();
}
writeFileSync(`${dir}/perf.json`, JSON.stringify(report, null, 2) + '\n');
await browser.close();
await server.close();
console.log(JSON.stringify(report));
console.log(errors.length ? `errors: ${errors.join(' | ')}` : `saved to ${dir}`);
