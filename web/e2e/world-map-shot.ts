// Visual check for the shared world map view: opens the online hub, taps "The world map", and
// screenshots the grid. Serves the pre-built `web/dist`.
//   npx tsx web/e2e/world-map-shot.ts --out=docs/screens/online [--dist=web/dist]
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = resolve(opt('out') ?? 'docs/screens/online');
mkdirSync(OUT, { recursive: true });
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let f = join(DIST, p === '/' ? 'index.html' : p);
  if (!existsSync(f)) f = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise<void>((r) => server.listen(4199, r));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.addInitScript({ content: 'window.__name = (f) => f;' });

// The live API only allows the production origins, so a localhost page is (correctly) refused.
// Stub the two calls the hub makes so this checks the RENDERING, not the network.
const SAMPLE = {
  ok: true,
  cols: 8,
  rows: 8,
  cells: 64,
  filled: 5,
  serverNow: Date.now(),
  tiles: [
    { cell: 9, ownerName: 'BloomHeron', awardedAt: Date.now() - 3_600_000, tookOver: false },
    { cell: 10, ownerName: 'WillowBirch', awardedAt: Date.now() - 1_800_000, tookOver: true },
    { cell: 18, ownerName: 'FernHare', awardedAt: Date.now() - 900_000, tookOver: false },
    { cell: 27, ownerName: 'MossLark', awardedAt: Date.now() - 600_000, tookOver: true },
    { cell: 44, ownerName: 'CedarWren', awardedAt: Date.now() - 120_000, tookOver: false },
  ],
};
await page.route('**/v1/world*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
await page.route('**/v1/guests*', (r) =>
  r.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now() }),
  }),
);

const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto('http://localhost:4199/', { waitUntil: 'load' });
await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20000 });
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'world-menu-390x844.png') });

// Play online -> hub
await page.click('#menu-online');
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'world-hub-390x844.png') });

// The world map
await page.click('#online-world');
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'world-map-390x844.png') });

// What actually rendered
const report = await page.evaluate(() => {
  const grid = document.getElementById('online-world-grid');
  const summary = document.getElementById('online-world-summary');
  const notice = document.getElementById('online-world-notice');
  const cells = grid ? grid.querySelectorAll('.world-cell') : null;
  const held = grid ? grid.querySelectorAll('.world-cell[data-held="true"]') : null;
  return {
    screenVisible: !(document.getElementById('online-world-screen') as HTMLElement | null)?.hidden,
    cells: cells ? cells.length : 0,
    held: held ? held.length : 0,
    summary: summary?.textContent ?? '',
    notice: notice?.textContent ?? '',
    titles: [...(grid?.querySelectorAll('.world-cell span') ?? [])].map((s) => (s.textContent ?? '')),
  };
});
console.log(JSON.stringify(report, null, 2));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');

await browser.close();
server.close();
