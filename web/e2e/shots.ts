// Phone screenshots (390x844) of the look, for docs/screens and for self-review.
//   npx tsx web/e2e/shots.ts --dir=docs/screens
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { THEME_IDS } from '../src/logic/themes.js';
import { cutDemo, goldDemo } from './positions.js';
import { chooseBloom, drawMeld } from './drawing.js';

const dir = process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? 'docs/screens';
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4175, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4175/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };
const demo = cutDemo();
const gold = goldDemo();
const errors: string[] = [];

const open = async (settings: Record<string, unknown>, state: unknown) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v6', saved as string);
    },
    [JSON.stringify({ sound: false, coach: false, ...settings }), JSON.stringify({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.mouse.move(1, 1); // no hover tooltip in the pictures
  await page.waitForTimeout(500);
  return page;
};
const shot = (page: Page, name: string) => page.screenshot({ path: `${dir}/${name}.jpg`, quality: 80 });

// Each palette on the same mid-game board (Draw step: both piles ready).
for (const id of THEME_IDS) {
  const page = await open({ palette: id, speed: 'skip' }, gold.state);
  await shot(page, `palette-${id}`);
  await page.close();
}
// Piles in Draw and in Grow; veins with a weak link pulsing.
{
  const page = await open({ palette: 'soil', speed: 'skip' }, gold.state);
  await shot(page, 'piles-draw');
  await page.click('#deck');
  await page.waitForTimeout(400);
  await shot(page, 'piles-grow');
  await page.close();
}
// Veins: fragile links (thin, flickering), with the bot's weak links switched on.
{
  const page = await open({ palette: 'soil', speed: 'skip' }, demo.state);
  await page.click('#tool-targets');
  await page.mouse.move(1, 1);
  await page.waitForTimeout(700);
  await shot(page, 'veins-weak-links');
  await page.close();
}
// The Settings sheet (buttons and choices).
{
  const page = await open({ palette: 'soil', speed: 'skip' }, demo.state);
  await page.click('#hud-menu');
  await page.waitForTimeout(250);
  await shot(page, 'game-menu');
  await page.click('#gm-settings');
  await page.waitForTimeout(250);
  await shot(page, 'settings');
  await page.close();
}
// A gold hex with and without a tile.
{
  const page = await open({ palette: 'soil', speed: 'skip' }, gold.state);
  const box = await page.locator(`.hex-cell[data-key="${gold.empty}"]`).boundingBox();
  const full = await page.locator(`.hex-cell[data-key="${gold.covered}"]`).boundingBox();
  const clip = (b: { x: number; y: number } | null) => ({ x: Math.max(0, b!.x - 50), y: Math.max(0, b!.y - 50), width: 160, height: 160 });
  await page.screenshot({ path: `${dir}/gold-empty.jpg`, quality: 85, clip: clip(box) });
  await page.screenshot({ path: `${dir}/gold-with-tile.jpg`, quality: 85, clip: clip(full) });
  await page.close();
}
// A frame in the middle of a big cut.
{
  const page = await open({ palette: 'soil', speed: 'slow' }, demo.state);
  if (demo.action.t === 'Bloom') await chooseBloom(page, demo.action);
  await page.click(`#hand [data-card="${demo.card}"]`).catch(() => {});
  if (!(await page.locator('#confirm-play').isVisible())) {
    if (demo.action.t === 'Bloom') await drawMeld(page, demo.action);
    else {
      const b = await page.locator(`.hex-cell[data-key="${demo.hex}"] path.hex`).boundingBox();
      if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    }
  }
  await page.click('#confirm-play').catch(() => {});
  await page.waitForTimeout(700);
  await shot(page, 'mid-cut');
  await page.close();
}
// The level screen (with a few wins recorded).
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, palette: 'soil', level: 7 }));
    localStorage.setItem('severgrow.stats.v1', JSON.stringify({ wins: 5, losses: 3, best: 30, streak: 1, bestStreak: 2, winsByLevel: [2, 1, 1, 0, 0, 0, 1, 0, 0] }));
    localStorage.setItem('severgrow.seen', '1');
  });
  await page.goto(BASE);
  await page.waitForTimeout(300);
  await shot(page, 'menu');
  await page.click('#menu-new');
  await page.waitForTimeout(300);
  await shot(page, 'levels');
  await page.close();
}
await browser.close();
await server.close();
console.log(errors.length ? `errors: ${errors.join(' | ')}` : `saved to ${dir}`);
