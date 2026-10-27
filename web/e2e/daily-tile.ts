// THE DAILY PUZZLE'S TILE, end to end, against a real in-process server (owner, 2026-10-27).
//
// A real economy (memory storage) behind the real HTTP app; the live product build points at it.
// The clock (page and server) is puzzle #3's day. The suite solves #3, presses PLACE IT, and checks
// the server paid exactly one tile, the Territory opened with the "Place your tile" strip, a free
// hex can be grown, the strip then offers BACK TO GAMES, and the menu no longer owes a tile, with
// exactly one receipt on the server at the end.
//
//   npx tsx web/e2e/daily-tile.ts          (builds the product channel against the local server)
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { prove } from '../../src/daily/core.js';
import { dailyPuzzle } from '../../src/daily/puzzles.js';
import { DAILY_EPOCH } from '../../src/daily/schedule.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { chainRouters } from '../../server/src/feedback/feedback.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { SEED_ECONOMY } from '../../server/src/seeds/config.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const NO = 3;
const puzzle = dailyPuzzle(NO)!;
const proof = prove(puzzle, 50_000, 6);
if (!proof.ok) throw new Error('puzzle #3 does not prove');
const noon = Date.parse(`${DAILY_EPOCH}T12:00:00Z`) + (NO - 1) * 86_400_000;

// ---- the server: matches + the world economy, in memory, on the puzzle's day ----
const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const economyStore = new MemoryWorldEconomyStore();
const economy = new WorldEconomyService(economyStore, storage, () => noon);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({
  service,
  config,
  live: chainRouters(createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) })),
});
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
// The Daily is shown only to testers while it is tested: this suite's own guest is made one for
// this local build (VITE_DAILY_TESTERS), and the page starts signed in as it.
const guest = await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json() as { token: string; player: { id: string; displayName: string | null; kind: string } };
const identity = JSON.stringify({ token: guest.token, playerId: guest.player.id, displayName: guest.player.displayName, kind: guest.player.kind });

// ---- the product build, pointed at it ----
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa04', VITE_DAILY_TESTERS: guest.player.id, VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.clock.setFixedTime(noon);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false });
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-play');
  await page.click('#menu-daily');
  await page.waitForFunction(() => document.getElementById('sheet-daily')?.hidden === false);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#daily-actions button')][0]?.click());
  await page.waitForFunction(() => document.getElementById('sheet-daily')?.hidden === true);
  for (const a of proof.solution) {
    await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 20_000 });
    await page.evaluate((x) => (window as any).__severgrow.playFor(x, 0), a);
  }
  await page.waitForFunction(() => document.getElementById('daily-title')?.textContent?.trim() === 'Solved', undefined, { timeout: 20_000 });
  const keys = await page.evaluate(() => [...document.querySelectorAll('#daily-actions button')].map((b) => b.textContent?.trim()));
  check('a solve offers PLACE IT first', keys[0] === 'Place it', keys.join('|'));
  check('the sheet says a tile was earned', (await page.textContent('#daily-body'))?.includes('1 tile') ?? false);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/daily-tile-solved-390x844.png` });

  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#daily-actions button')][0]?.click());
  await page.waitForFunction(() => document.getElementById('online-world-screen')?.hidden === false, undefined, { timeout: 20_000 });
  check('PLACE IT opens the Territory', true);
  await page.waitForFunction(() => document.getElementById('daily-place')?.hidden === false);
  check('the strip asks for the tile', (await page.textContent('#daily-place-title'))?.trim() === 'Place your tile');
  // the server paid exactly one tile
  const receipts = economyStore as unknown as { receipts?: Map<string, { awarded: number; input: { sourceKey: string } }> };
  const paid = [...(receipts.receipts?.values() ?? [])].filter((r) => r.input.sourceKey === `daily:${NO}`);
  check('the server verified the solve and paid one tile', paid.length === 1 && paid[0]!.awarded === SEED_ECONOMY.tileCost, JSON.stringify(paid.map((r) => r.awarded)));
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/daily-tile-place-390x844.png` });

  // grow one free hex (the map's own flow: select, GROW A TILE, CONFIRM GROW); a tile is selected
  // from the keyboard exactly as a tap selects it
  await page.focus('.world-hex.available');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.world-claim-button', { timeout: 10_000 });
  await page.click('.world-claim-button');
  await page.waitForFunction(() => document.querySelector('.world-claim-button')?.textContent === 'CONFIRM GROW');
  await page.click('.world-claim-button');
  await page.waitForFunction(() => !document.getElementById('daily-place-back')?.hidden, undefined, { timeout: 20_000 });
  check('after growing it, the strip says so and offers BACK TO GAMES', (await page.textContent('#daily-place-title'))?.trim() === 'Your Territory grew.');
  const wallet = await page.evaluate(() => document.getElementById('online-world-wallet')?.textContent ?? '');
  check('the tile was paid from the reward, not the player\'s own Seeds', /\b0\b/.test(wallet), wallet);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/daily-tile-placed-390x844.png` });

  await page.click('#daily-place-back');
  await page.waitForFunction(() => document.getElementById('online-world-screen')?.hidden === true);
  await page.evaluate(() => { if (document.getElementById('play-menu')?.hidden) document.getElementById('menu-play')?.click(); });
  await page.waitForTimeout(300);
  const cap = (await page.textContent('#daily-readout'))?.trim() ?? '';
  check('the menu no longer owes a tile', cap.startsWith('SOLVED'), cap);

  // the server never pays twice for the same puzzle: one receipt, one tile, after the whole flow
  const after = [...(receipts.receipts?.values() ?? [])].filter((r) => r.input.sourceKey === `daily:${NO}`);
  check('one receipt for the puzzle after the whole flow', after.length === 1 && after[0]!.awarded === SEED_ECONOMY.tileCost);
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} daily-tile checks failed`);
  process.exit(1);
}
console.log('daily-tile checks passed');
process.exit(0);
