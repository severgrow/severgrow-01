// THE ACHIEVEMENTS KEY SURVIVES A FLAKY READ (owner report, 2026-10-31: "sometimes i see the
// achievements sometimes i dont" on /test/).
//
// This drives the real product build against the real memory economy, and stubs ONLY the
// achievements route so the three states can be produced without waiting for a bad network:
//
//   1. the FIRST read fails (500): the key is hidden, a retry is remembered, and the ordinary world
//      poll makes it appear once the route answers — without leaving the screen;
//   2. a later read fails (500) after a good one: the key stays, and so does its ready badge (the
//      last good list is remembered on the device), including after a full page reload;
//   3. a definite 404: the key hides and stays hidden.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/achievements-key.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page, Route } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
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
const api = createHttpServer({ service, config, live: createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }) });
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guest = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const me = await guest();
store.adminAdjustSeeds({ playerId: me.player.id, delta: 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${me.player.id}`, now: Date.now() });
await store.claim(me.player.id, '-2,-4', 'achievements-key-owned', Date.now());
await store.acknowledgeInvitation(me.player.id);
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

/** The attribute, not the computed box: the key row is shut until MENU is pressed. */
const keyHidden = (page: Page) => page.evaluate(() => document.getElementById('world-key-achievements')?.hasAttribute('hidden') ?? true);
const keyReady = (page: Page) => page.evaluate(() => {
  const badge = document.querySelector<HTMLElement>('#world-key-achievements .world-deck-count');
  return badge && !badge.hidden ? Number(badge.textContent) : 0;
});
const openWorld = async (page: Page) => {
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex', { timeout: 20_000 });
};
const openKeys = async (page: Page) => {
  await page.click('#online-world-menu');
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  // Stub ONLY `/v1/seeds/achievements` (and its preflight); null means "let the real server answer".
  let status: number | null = 500;
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  await page.route(/\/v1\/seeds\/achievements$/, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (status === null) {
      await route.continue();
      return;
    }
    await route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: 'stub' }) });
  });

  await page.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });

  // ---- 1. the first read fails: hidden, then the existing poll retries and the key appears --------
  await openWorld(page);
  await openKeys(page);
  await page.waitForTimeout(1_500);
  check('a failed FIRST read hides the key (no list has ever arrived)', await keyHidden(page));

  status = null;
  const appeared = await page.waitForFunction(() => !document.getElementById('world-key-achievements')!.hasAttribute('hidden'), undefined, { timeout: 25_000 }).then(() => true).catch(() => false);
  check('the ordinary 12 s world poll retries and the key appears without leaving the screen', appeared);
  const readyAfterSuccess = await keyReady(page);
  check('the key carries the ready badge from the successful read', readyAfterSuccess >= 1, String(readyAfterSuccess));

  // ---- 2. a later failure keeps the key and its remembered list, even across a reload ------------
  status = 500;
  await page.reload();
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await openWorld(page);
  await openKeys(page);
  await page.waitForTimeout(1_500);
  check('after a good read, a 500 no longer hides the key', !(await keyHidden(page)));
  check('the ready badge follows the remembered list through the failed refresh', (await keyReady(page)) === readyAfterSuccess, String(await keyReady(page)));

  // ---- 3. a definite 404 hides it, and the poll does not keep asking ------------------------------
  status = 404;
  await page.click('#online-world-back');
  await openWorld(page);
  await openKeys(page);
  const hid = await page.waitForFunction(() => document.getElementById('world-key-achievements')!.hasAttribute('hidden'), undefined, { timeout: 10_000 }).then(() => true).catch(() => false);
  check('a 404 / NOT_FOUND hides the key', hid);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
} finally {
  await browser.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
  await new Promise<void>((resolve) => web.httpServer.close(() => resolve()));
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
