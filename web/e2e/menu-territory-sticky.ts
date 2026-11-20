// THE PLANET KEY KEEPS ITS NUMBERS (owner report, 2026-11-20):
//
//   "on live version, sometimes after exiting the planet - the planet button looses the tiles and
//    seeds count inside the button. - should not happen"
//
// The menu's TERRITORY / THE PLANET key shows two read-outs: Seeds on the left, tiles held on the
// right. They are painted by the ONE menu-show read (`refreshMenu` → `readMenuCounts`). On the way
// back from the Planet that read runs again; if the wallet (or the map) fails on that pass, the old
// code remembered `null` and painted `null`, so numbers the player had ALREADY seen went blank. That
// is the owner's exact report, and it is a race: it only happens when the returning read fails.
//
// This suite reproduces it on the real page at 390x844, against the real HTTP app with a real
// account identity:
//   1. load the menu, wait for 300 Seeds / 2 tiles, remember what was painted;
//   2. make `/v1/seeds/wallet` fail from now on (route abort — the phone drops the request);
//   3. open THE PLANET and come back through its own back key;
//   4. the read-outs must STILL be painted with the same pair (never blank), and a burst of
//      `futasaku:menu` passes must not clear them either.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/menu-territory-sticky.ts
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
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---- the real economy: this device owns two tiles, one rival owns another ------------------------
const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const store = new MemoryWorldEconomyStore(storage);
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({
  service,
  config,
  live: chainRouters(createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) })),
});
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });

const rival = await guestOf();
await fund(rival.player.id, 1);
await store.claim(rival.player.id, '3,-6', 'rival-far', Date.now() - 30_000);
const me = await guestOf();
// The owner's live account grows tiles, so the page is signed in as an account on the server too.
{
  const players = (storage as unknown as { players: Map<string, { kind: string; upgradedAt?: number | null }> }).players;
  const row = players.get(me.player.id)!;
  players.set(me.player.id, { ...row, kind: 'account', upgradedAt: Date.now() });
  me.player.kind = 'account';
}
await fund(me.player.id, 3);
await store.claim(me.player.id, '-2,-4', 'sticky-owned-1', Date.now());
await store.claim(me.player.id, '-2,-3', 'sticky-owned-2', Date.now() - 1_000);
await store.acknowledgeInvitation(me.player.id); // the one-time 100 Seeds card is not what this suite tests
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: 'account' });

// THE OWNER'S LINE IS THE PLANET (futa05): build that channel so the exit walks the real planet path.
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: apiBase,
      VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key', VITE_ACCOUNTS: 'on',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

// The e2e runner's transform names assigned arrows with a `__name` helper that does not exist
// inside the page (see territory-icons.ts), so each evaluate body stays inline: no local helpers.
/** Both read-outs, as the key shows them: what is painted, or null when the pair is hidden. */
const readouts = (p: Page) => p.evaluate(() => {
  const seeds = document.getElementById('menu-world-seeds') as HTMLElement | null;
  const tiles = document.getElementById('menu-world-tiles') as HTMLElement | null;
  const shownSeeds = !!seeds && !seeds.hidden && seeds.getClientRects().length > 0;
  const shownTiles = !!tiles && !tiles.hidden && tiles.getClientRects().length > 0;
  return shownSeeds && shownTiles
    ? {
      seeds: document.getElementById('menu-world-seeds-value')?.textContent ?? '',
      tiles: document.getElementById('menu-world-tiles-value')?.textContent ?? '',
    }
    : null;
});
const waitPainted = (p: Page, timeout = 20_000) =>
  p.waitForFunction(() => {
    const seeds = document.getElementById('menu-world-seeds') as HTMLElement | null;
    const tiles = document.getElementById('menu-world-tiles') as HTMLElement | null;
    const shownSeeds = !!seeds && !seeds.hidden && seeds.getClientRects().length > 0;
    const shownTiles = !!tiles && !tiles.hidden && tiles.getClientRects().length > 0;
    return shownSeeds && shownTiles && !!document.getElementById('menu-world-seeds-value')?.textContent;
  }, undefined, { timeout });

const pageErrors: string[] = [];
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:', 'futa05:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await waitPainted(page);
  const first = await readouts(page);
  const wallet = await (await fetch(`${apiBase}/v1/seeds/wallet`, { headers: { authorization: `Bearer ${me.token}` } })).json() as { wallet: { balance: number } };
  check('the known pair paints on the menu', !!first && first.seeds === String(wallet.wallet.balance) && first.tiles === '2', JSON.stringify(first));

  // ---- THE DROPPED REQUEST: every wallet read from now on dies on the wire ----------------------
  let walletFailures = 0;
  await page.route('**/v1/seeds/wallet*', (route) => {
    walletFailures += 1;
    void route.abort('failed');
  });

  // ---- OPEN THE PLANET, THEN COME BACK -------------------------------------------------------------
  await page.click('#menu-world');
  await page.waitForSelector('#online-world-screen', { state: 'visible', timeout: 20_000 });
  await page.waitForSelector('#online-world-back', { state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/planet-sticky-open-390.png` });
  await page.click('#online-world-back');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  // Let the returning menu pass run and its wallet read fail.
  await page.waitForTimeout(1_800);

  const after = await readouts(page);
  check('the returning pass really tried the wallet and lost it', walletFailures > 0, `${walletFailures} failed wallet request(s)`);
  check('returning from the Planet keeps BOTH read-outs painted', !!after, JSON.stringify(after));
  check('…and with the SAME pair the player had already seen',
    !!after && !!first && after.seeds === first.seeds && after.tiles === first.tiles,
    `${JSON.stringify(first)} → ${JSON.stringify(after)}`);
  const aria = await page.getAttribute('#menu-world', 'aria-label');
  check('…and the spoken line still carries both numbers',
    !!first && !!aria && aria.includes(`${first.seeds} SEEDS`) && aria.includes(`${first.tiles} of`), String(aria));
  await page.screenshot({ path: `${SHOTS}/planet-sticky-back-390.png` });

  // ---- A BURST OF MENU PASSES: a late pass can never clear a known pair ---------------------------
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new Event('futasaku:menu')); });
  await page.waitForTimeout(1_200);
  const burst = await readouts(page);
  check('a burst of menu passes cannot clear it either',
    !!burst && !!first && burst.seeds === first.seeds && burst.tiles === first.tiles, JSON.stringify(burst));

  // ---- …and a healthy read still updates the numbers (the pair is not frozen) --------------------
  await page.unroute('**/v1/seeds/wallet*');
  await page.evaluate(() => window.dispatchEvent(new Event('futasaku:menu')));
  await page.waitForFunction((expected) => {
    const seeds = document.getElementById('menu-world-seeds') as HTMLElement | null;
    return !!seeds && !seeds.hidden && (document.getElementById('menu-world-seeds-value')?.textContent ?? '') === expected;
  }, first?.seeds ?? '300', { timeout: 20_000 }).then(() => check('a healthy pass repaints the live numbers after recovery', true))
    .catch(() => check('a healthy pass repaints the live numbers after recovery', false));

  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
  failed++;
  console.error('SUITE ERROR', error);
  console.error('page errors', pageErrors);
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
