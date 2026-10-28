// THE CHALLENGE OFFER STAYS OPEN (owner, 2026-10-28): "sometimes when pressing a tile next to yours
// for challenge it closes in half a second, just blinking the confirmation window". A real touch
// tap, a mouse click and a quick double tap on a rival tile beside mine must all leave the offer open.
//
//   npx tsx web/e2e/territory-challenge-tap.ts
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
const fund = (playerId: string, n: number, tag: string) => store.adminAdjustSeeds({ playerId, delta: n, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${tag}`, now: Date.now() });

const rival = await guestOf();
await fund(rival.player.id, 300, 'r');
for (const [j, cell] of ['0,0', '1,0', '0,1'].entries()) await store.claim(rival.player.id, cell, `rival-${j}`, Date.now() - 60_000);
const me = await guestOf();
await fund(me.player.id, 600, 'm');
await store.acknowledgeInvitation(me.player.id);
await store.claim(me.player.id, '2,0', 'mine-0', Date.now() - 30_000);
await store.claim(me.player.id, '1,1', 'mine-1', Date.now() - 30_000);
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

const centre = (p: Page, cellId: string) => p.$eval(`.world-hex[data-cell-id="${cellId}"]`, (el) => {
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const sheetOpen = (p: Page) => p.evaluate(() => {
  const root = document.querySelector('.world-challenge-sheet') as HTMLElement | null;
  return !!root && !root.hidden && !root.hasAttribute('inert');
});
const dismiss = async (p: Page) => {
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => (document.querySelector('.world-challenge-sheet') as HTMLElement | null)?.hidden !== false, undefined, { timeout: 3000 });
  await p.waitForTimeout(250);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  for (const touch of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.addInitScript((raw) => {
      for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
    }, identity);
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
    await page.goto(origin + '/');
    await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
    await page.click('#menu-world');
    await page.waitForSelector('.world-hex.mine', { timeout: 20_000 });
    await page.waitForTimeout(900);
    const how = touch ? 'touch' : 'mouse';
    for (const target of ['1,0', '0,1']) {
      const at = await centre(page, target);
      if (touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(900);
      check(`[${how}] one tap on rival tile ${target} leaves the offer open`, await sheetOpen(page));
      await dismiss(page);
    }
    // the tap that already selected the tile, repeated: a second tap must not shut the offer under the finger
    const at = await centre(page, '1,0');
    if (touch) { await page.touchscreen.tap(at.x, at.y); await page.waitForTimeout(120); await page.touchscreen.tap(at.x, at.y); }
    else { await page.mouse.click(at.x, at.y); await page.waitForTimeout(120); await page.mouse.click(at.x, at.y); }
    await page.waitForTimeout(900);
    check(`[${how}] a quick second tap on the same tile leaves the offer open`, await sheetOpen(page));
    await dismiss(page);
    // the offer survives the 12-second world refresh
    const again = await centre(page, '0,1');
    if (touch) await page.touchscreen.tap(again.x, again.y); else await page.mouse.click(again.x, again.y);
    await page.waitForTimeout(13_500);
    check(`[${how}] the offer survives the world's own refresh`, await sheetOpen(page));
    await context.close();
  }
} finally {
  await browser.close();
  await web.close();
  api.close();
}
if (failed) { console.log(`\n${failed} challenge-tap checks failed`); process.exit(1); }
console.log('\nchallenge offer stays open');
