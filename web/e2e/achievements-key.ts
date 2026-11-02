// THE ACHIEVEMENTS KEY IS ALWAYS THERE FOR A SIGNED-IN PLAYER (owner direction, 2026-11-01:
// "should always be availalbe in territory menu"), and it survives a flaky read.
//
// This drives the real product build against the real memory economy, and stubs ONLY the
// achievements route so the states can be produced without waiting for a bad network:
//
//   1. the FIRST read is HELD (no answer at all): the key is visible the moment the map opens, and
//      the panel shows its honest waiting line with no rows and no numbers. Releasing the read
//      fills the panel in place — the key never comes and goes;
//   2. a later read fails (500) after a good one: the key stays, and so does its ready badge (the
//      last good list is remembered on the device), including after a full page reload;
//   3. a definite 404: the key hides and stays hidden (an old server has no broken pane).
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

  // Stub ONLY `/v1/seeds/achievements` (and its preflight). 'hold' keeps the request unanswered so
  // "before any achievements response" is literal; null means "let the real server answer".
  let status: number | 'hold' | null = 'hold';
  // A holder object: a bare `let` assigned only inside the route callback is narrowed to null by
  // the compiler at the call site, which is not what happens at runtime.
  const held: { release: (() => void) | null } = { release: null };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  await page.route(/\/v1\/seeds\/achievements$/, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (status === 'hold') {
      await new Promise<void>((resolve) => { held.release = resolve; });
      await route.continue().catch(() => undefined);
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

  // ---- 1. the first read is HELD: the key is there at once and the panel waits honestly ----------
  await openWorld(page);
  await openKeys(page);
  // No achievements answer has been sent: the route is still holding the very first GET.
  check('the key is visible the moment the map opens, before any achievements answer', !(await keyHidden(page)));
  await page.click('#world-key-achievements');
  await page.waitForTimeout(400);
  const waitingLine = await page.evaluate(() => {
    const line = document.getElementById('world-achievements-empty');
    return line && !line.hidden ? (line.textContent ?? '') : '';
  });
  check('the panel shows its quiet waiting line while the read is in flight', waitingLine.toLowerCase().includes('reading'), waitingLine);
  const rowsWhileWaiting = await page.evaluate(() => document.querySelectorAll('.world-achievement').length);
  check('no achievement row, number or claim key is drawn before the answer', rowsWhileWaiting === 0, String(rowsWhileWaiting));

  status = null;
  held.release?.();
  held.release = null;
  const appeared = await page.waitForFunction(() => document.querySelectorAll('.world-achievement').length > 0, undefined, { timeout: 25_000 }).then(() => true).catch(() => false);
  check('the answering read fills the panel in place, without the key coming and going', appeared && !(await keyHidden(page)));
  const readyAfterSuccess = await keyReady(page);
  check('the key carries the ready badge from the successful read', readyAfterSuccess >= 1, String(readyAfterSuccess));
  const lineGone = await page.evaluate(() => document.getElementById('world-achievements-empty')?.hidden === true);
  check('the waiting line goes away once there is a real list', lineGone === true);

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
