// Desktop screenshots of the side layout (board left, dock right), a fresh game in its Grow step.
//   npx tsx web/e2e/desk-shots.ts --out=<dir> --label=<name>
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = resolve(opt('out') ?? 'docs/screens/desktop');
const LABEL = opt('label') ?? 'after';
mkdirSync(OUT, { recursive: true });
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let f = join(DIST, p === '/' ? 'index.html' : p);
  if (!existsSync(f)) f = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise<void>((r) => server.listen(4196, r));
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
  await page.goto('http://localhost:4196/');
  await page.waitForTimeout(800);
  await page.click('#menu-new');
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
