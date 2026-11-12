// A FILMSTRIP OF THE MENU <-> TERRITORY TRANSITION (owner, 2026-11-02: "a filmstrip of the
// transition (3-4 frames)").
//
//   CHANNEL=futa04 npm run web:build && SHOTS=docs/screens/motion npx tsx web/e2e/motion-strip.ts
//
// The frames are the REAL animation, held at a chosen progress: every running animation on the page
// is paused and its clock set, so a still is exactly the frame a player would see at that moment
// (rather than a screenshot of whenever the camera happened to catch it). The main menu is hidden
// for the panel's frames because it owns the first 100ms of the beat; it is drawn in the first one.
// A local economy server backs the map, like `living-territory.ts`, so real tiles are painted.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';

const shots = process.env.SHOTS ?? '/tmp/motion-strip';
mkdirSync(shots, { recursive: true });

const storage = new MemoryStorage(), store = new MemoryWorldEconomyStore();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const economy = new WorldEconomyService(store, storage), service = new MatchService({ storage, config, economy });
const api = createHttpServer({ service, config, live: createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }) });
await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
const guest = async () => await (await fetch(`${base}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json() as { token: string; player: { id: string; kind: string; displayName: string | null } };
const me = await guest();
await store.adminAdjustSeeds({ playerId: me.player.id, delta: 2000, reason: 'e2e', actorId: 'e2e', requestId: `fund-${me.player.id}`, now: Date.now() });
await store.acknowledgeInvitation(me.player.id);
for (const [i, cell] of ['-2,-4', '-1,-4', '-2,-3'].entries()) await store.claim(me.player.id, cell, `mine-${i}`, Date.now() - 3_600_000);
process.env.CHANNEL = 'futa04'; process.env.VITE_DUEL_API_URL = base;
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'; process.env.VITE_SUPABASE_ANON_KEY = 'local-e2e';
const web = await createServer({ cacheDir: `/tmp/motion-strip-vite-${(api.address() as AddressInfo).port}`, configFile: resolve('web/vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await web.listen();
const origin = `http://127.0.0.1:${(web.httpServer!.address() as AddressInfo).port}`;

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page: Page = await context.newPage();
  await page.addInitScript(({ identity }) => {
    (window as any).__name = (fn: unknown) => fn;
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, identity);
    // Hold every animation on the page at `progress` of its own timeline.
    (window as any).__hold = (progress: number) => {
      for (const a of document.getAnimations()) {
        const timing = a.effect?.getTiming();
        const duration = Number(timing?.duration ?? 0);
        const delay = Number(timing?.delay ?? 0);
        try {
          a.pause();
          a.currentTime = delay + duration * progress;
        } catch {
          /* a finished animation cannot be re-pinned; it is already at rest */
        }
      }
    };
  }, { identity: JSON.stringify({ token: me.token, playerId: me.player.id, kind: me.player.kind, displayName: me.player.displayName }) });
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'normal', eyeCandy: false, largeText: false });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__severgrow?.ready?.());
  await page.waitForFunction(() => !(document.getElementById('menu-world') as HTMLButtonElement).disabled);
  await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
  await page.waitForFunction(() => !!document.querySelector('.world-hex.mine'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${shots}/01-menu.jpg`, type: 'jpeg', quality: 82 });

  // 02: the settle's very first frame. The menu is hidden (it is gone by 100ms in the real beat);
  // the map keeps its exact menu position and the frame's skin is still absent.
  await page.evaluate(() => { document.getElementById('menu-world')!.click(); });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.evaluate(() => {
    (window as any).__hold(0);
    document.getElementById('menu')!.style.visibility = 'hidden';
  });
  await page.screenshot({ path: `${shots}/02-settle-first-frame.jpg`, type: 'jpeg', quality: 82 });

  await page.evaluate(() => (window as any).__hold(0.45));
  await page.screenshot({ path: `${shots}/03-settling.jpg`, type: 'jpeg', quality: 82 });

  await page.evaluate(() => {
    (window as any).__hold(1);
    document.getElementById('menu')!.style.visibility = '';
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${shots}/04-territory.jpg`, type: 'jpeg', quality: 82 });

  // 05: the way back, held just before the framing returns to the full-bleed menu view.
  await page.evaluate(() => { document.getElementById('online-world-back')!.click(); });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.evaluate(() => (window as any).__hold(0.8));
  await page.screenshot({ path: `${shots}/05-return.jpg`, type: 'jpeg', quality: 82 });
  await context.close();
} finally {
  await browser.close().catch(() => undefined);
  await web.close().catch(() => undefined);
  api.closeAllConnections();
  await new Promise<void>((r) => api.close(() => r()));
}
console.log(`filmstrip written to ${shots}`);
