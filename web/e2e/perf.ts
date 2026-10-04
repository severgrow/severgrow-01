// v0.7 Step 9: performance numbers. Frame times (CPU slowed 4x, like a mid-range phone) during a
// big cut and during the Strangle finish, the particle peak, the first-load bundle (JS, CSS and
// fonts, raw and gzipped), and the time until the first tap works on a slow connection.
//   npx tsx web/e2e/perf.ts       (needs a built page and PW_CHROMIUM)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Suit } from '../../src/engine/index.js';
import { fixture } from '../../tests/helpers.js';
import { positionSave } from './position.js';
import { cutPosition } from './cut-positions.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4193, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4193/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const open = async (state: State) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.addInitScript(
    ([saved]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'normal', effects: 'normal', confirmPolicy: 'never' }));
      localStorage.setItem('severgrow.save.v7', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    },
    [positionSave({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.waitForTimeout(1500);
  return page;
};

/** Plays `a` for `who` with the CPU 4x slower and returns the frame gaps while it animates. */
const framesDuring = async (page: Page, a: Action, who: Player) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(`window.__frames = []; (function tick(t) { window.__frames.push(t); if (window.__frames.length < 3000) requestAnimationFrame(tick); })(performance.now());`);
  await page.evaluate(`window.__severgrow.playFor(${JSON.stringify(a)}, ${who})`);
  await page.waitForFunction('!window.__severgrow.busy()', undefined, { timeout: 60000 }).catch(() => {});
  const frames = (await page.evaluate('window.__frames')) as number[];
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const gaps = frames.slice(1).map((t, i) => t - frames[i]!);
  const sorted = [...gaps].sort((x, y) => x - y);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const avg = gaps.reduce((x, y) => x + y, 0) / Math.max(1, gaps.length);
  const peak = ((await page.evaluate('window.__severgrow.particles()')) as { peak: number }).peak;
  return { frames: gaps.length, fps: 1000 / avg, median: p(0.5), p95: p(0.95), worst: sorted.at(-1) ?? 0, over33: gaps.filter((g) => g > 33.4).length, peak };
};
const fmt = (r: Awaited<ReturnType<typeof framesDuring>>) =>
  `${r.frames} frames, about ${r.fps.toFixed(0)} fps on average, median ${r.median.toFixed(1)} ms, 95th percentile ${r.p95.toFixed(1)} ms, slowest ${r.worst.toFixed(0)} ms, ${r.over33} frames over 33 ms; peak particles ${r.peak}`;

// 1. a big cut (my link taken, 6 of my tiles cut off)
{
  const big = cutPosition(6, true);
  const page = await open(big.state);
  console.log(`Big cut (CPU 4x slower): ${fmt(await framesDuring(page, big.action, 1))}`);
  await page.close();
}
// 2. the Strangle finish (my Bloom fills the last open side around the volcano)
{
  const g = newGame(5);
  const f = fixture({ tiles: { '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [0, 3] }, rock: ['3,-2', '3,-3', '2,-3', '2,-1'] });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => c.suit !== null);
  const h: Card[] = [];
  for (const [su, r] of [[0, 6], [1, 6], [2, 6]] as [Suit, number][]) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  const s: State = { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', turnPlayer: 0, actor: 0 };
  const a = legalActions(viewFor(s, 0)).find((x) => x.t === 'Bloom' && x.hexes.some((k) => coordKey(k) === '1,-2'))!;
  const page = await open(s);
  console.log(`Strangle finish (CPU 4x slower): ${fmt(await framesDuring(page, a, 0))}`);
  await page.close();
}
// 3. the first-load bundle
{
  const dir = 'web/dist/assets';
  const files = readdirSync(dir).map((f) => ({ f, size: statSync(`${dir}/${f}`).size, gz: gzipSync(readFileSync(`${dir}/${f}`)).length }));
  const sum = (re: RegExp) => files.filter((x) => re.test(x.f)).reduce((n, x) => ({ size: n.size + x.size, gz: n.gz + x.gz }), { size: 0, gz: 0 });
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const js = sum(/\.js$/);
  const css = sum(/\.css$/);
  const fonts = sum(/\.woff2$/);
  console.log(`Bundle: JS ${kb(js.size)} (${kb(js.gz)} gzipped), CSS ${kb(css.size)} (${kb(css.gz)} gzipped), fonts ${kb(fonts.size)} (woff2, already compressed); ${files.length} files`);
}
// 4. time until the first tap works, on a slow connection (about 1.6 Mbit/s, 150 ms) with the CPU 4x slower
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForSelector('#menu-new:not([disabled])', { state: 'visible', timeout: 60000 });
  const shown = Date.now() - t0;
  // the first tap that works: tapping New game opens the level screen (a tap on the opening
  // splash only skips it, so keep tapping every 100 ms until the level screen opens)
  for (let i = 0; i < 300 && !(await page.locator('#levels').isVisible()); i++) {
    await page.locator('#menu-new').tap({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(100);
  }
  console.log(`Menu visible after ${(shown / 1000).toFixed(2)} s`);
  console.log(`First tap works after ${((Date.now() - t0) / 1000).toFixed(2)} s (slow connection, CPU 4x slower, cold cache)`);
  await page.close();
}
await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
