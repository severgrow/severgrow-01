// THE GROWING TERRITORY, end to end (owner, 2026-10-27): the map grows around its tiles, a tile can
// be grown anywhere on the seen map, the fog shows where it can grow, the RANKING drops over the map,
// the activity strip flies to a placement, and "find my land" centres on your own tiles.
//
// A real economy (memory) behind the real HTTP app; the product build points at it. Three other
// players hold tiles; this device's guest gets 300 Seeds and grows a tile at the far east coast.
//
//   npx tsx web/e2e/territory-growth.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { chainRouters } from '../../server/src/feedback/feedback.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { WORLD_CELL_IDS } from '../../server/src/world.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const store = new MemoryWorldEconomyStore();
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({ service, config, live: chainRouters(createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) })) });
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });
// three other players with land
const others = await Promise.all([guestOf(), guestOf(), guestOf()]);
const otherCells = [['0,0', '1,0', '2,0'], ['-5,3', '-4,3'], ['3,-6']];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, otherCells[i]!.length);
  for (const [j, cell] of otherCells[i]!.entries()) await store.claim(g.player.id, cell, `other-${i}-${j}-req`, Date.now() - (10 - j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 3);
await store.acknowledgeInvitation(me.player.id); // the one-time 100 Seeds card is not what this suite tests
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind });

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

const count = (p: Page, sel: string) => p.evaluate((s) => document.querySelectorAll(s).length, sel);
const grow = async (p: Page, cellId: string) => {
  await p.focus(`.world-hex[data-cell-id="${cellId}"]`);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.world-claim-button', { timeout: 10_000 });
  await p.click('.world-claim-button');
  await p.waitForFunction(() => document.querySelector('.world-claim-button')?.textContent === 'CONFIRM GROW');
  await p.click('.world-claim-button');
  await p.waitForSelector(`.world-hex.mine[data-cell-id="${cellId}"]`, { timeout: 20_000 });
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(700);
  const before = await count(page, '.world-hex');
  check('the map opens at the v2 coast plus the land around the tiles', before >= WORLD_CELL_IDS.size, `${before} cells`);
  check('the fog shows land beyond the coast', (await count(page, '.world-fog.ring-1')) > 0 && (await count(page, '.world-fog.ring-2')) > 0);
  check('the bar shows the latest placements', (await count(page, '.world-activity-chip')) === 5);
  const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, col: document.querySelector('.online-world .online-inner')!.getBoundingClientRect().right }));
  check('the strip never widens the screen (no sideways scroll)', overflow.doc <= overflow.win && overflow.col <= overflow.win, JSON.stringify(overflow));
  const dash = await page.evaluate(() => { const el = document.querySelector('.world-hex.available'); return el ? getComputedStyle(el).strokeDasharray : 'none'; });
  check('free tiles keep a solid edge', dash === 'none', dash);
  await page.screenshot({ path: `${SHOTS}/territory-open-390x844.png` });

  // anywhere: a tile far from any other, then one at the east coast
  await grow(page, '-2,-4');
  check('a first tile can go anywhere', true);
  await grow(page, '8,0');
  check('a second tile need not touch the first (owner experiment)', true);
  await page.waitForTimeout(300);
  const risen = await count(page, '.world-hex-face.rising');
  const after = await count(page, '.world-hex');
  check('a tile at the coast uncovers new land', after > before, `${before} → ${after}`);
  check('the new land rises in', risen > 0, `${risen} rising`);
  check('the line says how much was uncovered', /UNCOVERED/.test(await page.textContent('#online-world-notice') ?? ''), await page.textContent('#online-world-notice') ?? '');
  check('the coast moved: two rings of land beyond the new tile', (await count(page, '.world-hex[data-cell-id="10,0"]')) === 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/territory-grown-390x844.png` });
  // the next tile can go on the new land
  await grow(page, '10,0');
  check('the uncovered land can be grown on', true);

  // the ranking
  await page.click('#online-world-rank-toggle');
  await page.waitForSelector('#online-world-ranking:not([hidden])');
  const rows = await page.$$eval('.world-ranking-row', (els) => els.map((e) => ({ text: e.textContent ?? '', mine: e.classList.contains('mine') })));
  check('the ranking lists every player, most tiles first', rows.length === 4 && /3$/.test(rows[0]!.text), rows.map((r) => r.text).join(' | '));
  check('my row is marked', rows.some((r) => r.mine && r.text.includes('YOU')));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/territory-ranking-390x844.png` });
  await page.click('.world-ranking-list li:last-child .world-ranking-row');
  check('picking a row folds the ranking away', await page.evaluate(() => document.getElementById('online-world-ranking')!.hidden === true));

  // find my land and the activity strip
  check('find my land shows once I hold tiles', await page.isVisible('#online-world-mine'));
  const vb0 = await page.getAttribute('.world-map-svg', 'viewBox');
  await page.click('.world-activity-chip:nth-child(5)');
  await page.waitForTimeout(200);
  const vb1 = await page.getAttribute('.world-map-svg', 'viewBox');
  check('an activity chip flies the map to that tile', vb0 !== vb1, `${vb0} → ${vb1}`);
  await page.click('#online-world-mine');
  await page.waitForTimeout(200);
  check('find my land moves the map back to my tiles', (await page.getAttribute('.world-map-svg', 'viewBox')) !== vb1);
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} territory-growth checks failed`);
  process.exit(1);
}
console.log('territory-growth checks passed');
process.exit(0);
