// Phone screenshots (390x844) for the material pass: the board mid-game, a close-up of
// the rocks, the hand of cards, the same board in each palette, and (when it exists)
// the material lab page.
//   npx tsx web/e2e/material-shots.ts --dir=docs/screens/materials --prefix=after-
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { THEME_IDS } from '../src/logic/themes.js';
import { goldDemo } from './positions.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/materials';
const prefix = arg('prefix') ?? '';
const lab = process.argv.includes('--lab');
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4177, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4177/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };
const demo = goldDemo();
const errors: string[] = [];

const open = async (settings: Record<string, unknown>) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', ...settings }), JSON.stringify({ state: demo.state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.mouse.move(1, 1);
  await page.waitForTimeout(600);
  return page;
};
const shot = (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) =>
  page.screenshot({ path: `${dir}/${prefix}${name}.jpg`, quality: 82, ...(clip ? { clip } : {}) });

{
  const page = await open({ palette: 'soil' });
  await shot(page, 'board');
  // Close-up of the rocks: a box around the rock hexes.
  const rocks = Object.keys(demo.state.terrain).filter((k) => demo.state.terrain[k] === 'rock');
  const boxes = (await Promise.all(rocks.map((k) => page.locator(`.hex-cell[data-key="${k}"]`).boundingBox()))).filter((b) => b);
  const x0 = Math.min(...boxes.map((b) => b!.x)) - 20;
  const y0 = Math.min(...boxes.map((b) => b!.y)) - 20;
  const x1 = Math.max(...boxes.map((b) => b!.x + b!.width)) + 20;
  const y1 = Math.max(...boxes.map((b) => b!.y + b!.height)) + 20;
  await shot(page, 'rocks', { x: Math.max(0, x0), y: Math.max(0, y0), width: Math.min(390, x1 - x0), height: y1 - y0 });
  const hand = await page.locator('#hand').boundingBox();
  await shot(page, 'hand', { x: 0, y: Math.max(0, hand!.y - 30), width: 390, height: Math.min(844 - hand!.y + 30, hand!.height + 60) });
  await page.close();
}
for (const id of THEME_IDS) {
  const page = await open({ palette: id });
  await shot(page, `palette-${id}`);
  await page.close();
}
if (lab) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?lab=1`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${prefix}lab.jpg`, quality: 82, fullPage: true });
  await page.close();
}
await browser.close();
await server.close();
console.log(errors.length ? `errors: ${errors.join(' | ')}` : `saved to ${dir}`);
