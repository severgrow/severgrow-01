// THE DAILY PUZZLES, all of them, in a real browser — the review gallery (not a CI suite: slow).
//
// For every shipped puzzle: set the clock to its day, open it from PLAY, start, play the proven
// answer through the page and check it is SOLVED. Saves the board before the move and the board
// after it, at phone size, as daily-NNN-before.png / daily-NNN-after.png in $SHOTS.
//
//   CHANNEL=futa04 npm run web:build && SHOTS=/tmp/gallery npx tsx web/e2e/daily-gallery.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { prove } from '../../src/daily/core.js';
import { dailyPuzzle } from '../../src/daily/puzzles.js';
import { DAILY_COUNT, DAILY_EPOCH } from '../../src/daily/schedule.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp/daily-gallery';
mkdirSync(SHOTS, { recursive: true });
const pad = (n: number) => String(n).padStart(3, '0');
let failed = 0;

const { server, origin } = await servePreview(0, { logLevel: 'error' });
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  for (let no = 1; no <= DAILY_COUNT; no++) {
    const p = dailyPuzzle(no)!;
    const proof = prove(p, 50_000, 6);
    if (!proof.ok) { console.log(`FAIL #${no}: unproven`); failed++; continue; }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.clock.setFixedTime(Date.parse(`${DAILY_EPOCH}T12:00:00Z`) + (no - 1) * 86_400_000);
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false });
    await page.goto(origin + '/');
    await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
    await page.click('#menu-play');
    await page.click('#menu-daily');
    await page.waitForFunction(() => document.getElementById('sheet-daily')?.hidden === false, undefined, { timeout: 15_000 });
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#daily-actions button')][0]?.click());
    await page.waitForFunction(() => document.getElementById('sheet-daily')?.hidden === true);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/daily-${pad(no)}-before.png` });
    for (const a of proof.solution) {
      await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 20_000 });
      const ok = await page.evaluate((x) => (window as any).__severgrow.playFor(x, 0), a);
      if (!ok) { console.log(`FAIL #${no}: ${a.t} refused by the page`); failed++; break; }
    }
    try {
      await page.waitForFunction(() => document.getElementById('daily-title')?.textContent?.trim() === 'Solved' && document.getElementById('sheet-daily')?.hidden === false, undefined, { timeout: 20_000 });
      await page.evaluate(() => { const s = document.getElementById('sheet-daily'); if (s) s.style.visibility = 'hidden'; const sc = document.getElementById('scrim'); if (sc) sc.style.visibility = 'hidden'; document.documentElement.classList.remove('game-veiled'); });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/daily-${pad(no)}-after.png` });
      console.log(`PASS #${no} ${p.title}`);
    } catch {
      console.log(`FAIL #${no}: not solved on the page`);
      failed++;
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `${failed} puzzles failed` : 'every puzzle solves on the page');
process.exit(failed ? 1 : 0);
