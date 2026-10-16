// Desktop screenshots of the side layout (board left, dock right), a fresh game in its Grow step.
//   npx tsx web/e2e/desk-shots.ts --out=<dir> --label=<name>
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { openMenuEntry } from './helpers/menu-nav.js';
import { serveStaticDist } from './helpers/preview-port.js';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = resolve(opt('out') ?? 'docs/screens/desktop');
const LABEL = opt('label') ?? 'after';
mkdirSync(OUT, { recursive: true });
// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await serveStaticDist(DIST);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [w, h] of [[1000, 620], [1280, 800], [1440, 900], [1920, 1080]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('s')) return;
    sessionStorage.setItem('s', '1');
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip', eyeCandy: false }));
    localStorage.setItem('severgrow.seen', '1');
    localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    localStorage.setItem('severgrow.ctools.seen', '1');
  });
  await page.goto(BASE);
  await page.waitForTimeout(800);
  await openMenuEntry(page, 'menu-new');
  await page.waitForTimeout(500);
  const tile = page.locator('.level-tile').nth(6);
  if (await tile.count()) await tile.click();
  await page.waitForTimeout(1500);
  // draw a card so the hand is full, as in the Grow step
  await page.click('#deck').catch(() => {});
  await page.waitForTimeout(1200);
  await page.mouse.move(1, 1);
  await page.screenshot({ path: `${OUT}/${LABEL}-${w}x${h}.png` });
  await page.close();
}
await browser.close();
server.close();
console.log(`desktop shots written to ${OUT}`);
