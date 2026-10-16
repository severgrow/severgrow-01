// Visual check for the shared world map. Serves the pre-built `web/dist`.
//   npx tsx web/e2e/world-map-shot.ts --out=docs/screens/online [--dist=web/dist]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { WORLD_CELLS } from '../../server/src/world.js';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = resolve(opt('out') ?? 'docs/screens/online');
mkdirSync(OUT, { recursive: true });
// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await serveStaticDist(DIST);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.addInitScript({ content: 'window.__name = (f) => f;' });

// The live API only allows the production origins, so a localhost page is (correctly) refused.
// Stub the world and wallet calls so this checks the RENDERING, not the network.
const SAMPLE = {
  ok: true,
  world: { version: 1, revision: 5, cost: 100, cells: WORLD_CELLS,
    claims: ['0,0', '1,0', '0,1', '-1,1', '-1,0'].map((cellId, index) => ({
      cellId, ownerId: index % 2 ? 'b' : 'a', ownerName: index % 2 ? 'WillowBirch' : 'BloomHeron',
      ownerTag: index % 2 ? '1002' : '1001', colour: index % 2 ? 'hsl(220 34% 49%)' : 'hsl(80 34% 49%)',
      claimedAt: Date.now() - index * 60_000,
    })) },
};
let walletBalance = 150;
await page.route('**/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
await page.route('**/v1/seeds/wallet', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  ok: true, wallet: { balance: walletBalance, lifetimeEarned: 150, lifetimeSpent: 150 - walletBalance, worldInvitationSeen: true },
}) }));
await page.route('**/v1/world/claims', async (r) => {
  const { cellId } = r.request().postDataJSON() as { cellId: string };
  walletBalance -= 100;
  SAMPLE.world.claims.push({ cellId, ownerId: 'stub', ownerName: 'StubGuest', ownerTag: '1003',
    colour: 'hsl(120 34% 49%)', claimedAt: Date.now() });
  SAMPLE.world.revision++;
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, claim: {
    ok: true, cellId, revision: SAMPLE.world.revision, replayed: false,
    wallet: { balance: walletBalance, lifetimeEarned: 150, lifetimeSpent: 100, worldInvitationSeen: true },
  } }) });
});
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

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20000 });
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'world-menu-390x844.png') });

// The world is a top-level entry on the product menu.
await page.click('#menu-world');
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'world-map-390x844.png') });

// What actually rendered
const report = await page.evaluate(() => {
  const grid = document.getElementById('online-world-grid');
  const summary = document.getElementById('online-world-summary');
  const notice = document.getElementById('online-world-notice');
  const cells = grid ? grid.querySelectorAll('.world-hex') : null;
  const held = grid ? grid.querySelectorAll('.world-hex.held') : null;
  return {
    screenVisible: !(document.getElementById('online-world-screen') as HTMLElement | null)?.hidden,
    cells: cells ? cells.length : 0,
    held: held ? held.length : 0,
    summary: summary?.textContent ?? '',
    notice: notice?.textContent ?? '',
    firstTile: grid?.querySelector('.world-hex')?.getAttribute('aria-label') ?? '',
  };
});
console.log(JSON.stringify(report, null, 2));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
if (!report.screenVisible || report.cells !== 183 || report.held !== 5) throw new Error('The shared world did not render correctly.');

// A mobile first-claim gesture must select, confirm, debit and appear in the refreshed world.
const free = page.locator('.world-hex.available').first();
const claimedCell = await free.getAttribute('data-cell-id');
await free.click();
await page.getByRole('button', { name: 'GROW A TILE' }).click();
await page.getByRole('button', { name: 'CONFIRM GROW' }).click();
await page.waitForFunction(() => document.getElementById('online-world-wallet')?.textContent?.includes('50 SEEDS'));
if (claimedCell) await page.locator(`.world-hex[data-cell-id="${claimedCell}"].mine`).waitFor();
if (!claimedCell || !(await page.locator(`.world-hex[data-cell-id="${claimedCell}"].mine`).count())) {
  throw new Error(`The confirmed claim did not render as owned territory: ${claimedCell}; ` +
    `${await page.locator(`.world-hex[data-cell-id="${claimedCell}"]`).getAttribute('class')}; ` +
    `${await page.locator('#online-world-notice').innerText()}`);
}
console.log('mobile claim: confirmed, balance 50, cell owned');

// A second browser sees the same owner even if it cannot create a guest token. The map is public.
const other = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await other.route('**/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
await other.route('**/v1/guests*', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'RATE_LIMITED' }) }));
await other.goto(BASE, { waitUntil: 'load' });
await other.click('#menu-world');
await other.locator('.world-hex').first().waitFor({ state: 'attached' });
if ((await other.locator('.world-hex').count()) !== 183 ||
  !(await other.locator(`.world-hex[data-cell-id="${claimedCell}"].held`).count())) {
  throw new Error('The second browser did not see the public updated territory.');
}
console.log('second browser: public map and new owner visible without sign-in');
await other.close();

await browser.close();
server.close();
