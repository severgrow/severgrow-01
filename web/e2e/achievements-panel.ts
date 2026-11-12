// THE ACHIEVEMENTS PANEL at every phone/desktop width (owner, 2026-10-30: "around 35 achievements
// in total now", "keep it clean lean and elegant").
//
// What this pins, on the real product build and the real memory economy:
//   * all 35 rows and five section headings at 320x568, 390x844 and 1280x800;
//   * no horizontal scroll anywhere (page, panel body, or any row);
//   * earned vs unearned is structural — a CLAIM key / a tick, never colour alone;
//   * a newly claimed row plays its moment once and then settles;
//   * screenshots land in docs/screens/achievements/.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/achievements-panel.ts
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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
import { createTerritoryChatRouter, memoryTerritoryChatStore } from '../../server/src/chat/territory.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? 'docs/screens/achievements';
mkdirSync(SHOTS, { recursive: true });

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
const api = createHttpServer({ service, config, live: chainRouters(createTerritoryChatRouter({ store: memoryTerritoryChatStore(storage), service, storage }), createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) })) });
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });
// One rival holds a tile; this device holds one of its own, so exactly "Put down roots" is ready.
const rival = await guestOf();
await fund(rival.player.id, 1);
await store.claim(rival.player.id, '0,0', 'ach-rival-req', Date.now());
const me = await guestOf();
await fund(me.player.id, 1);
await store.claim(me.player.id, '-2,-4', 'ach-mine-req', Date.now());
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

const count = (p: Page, sel: string) => p.evaluate((s) => document.querySelectorAll(s).length, sel);
const layout = (p: Page) => p.evaluate(() => {
  const panel = document.getElementById('online-world-panel')!.getBoundingClientRect();
  const body = document.querySelector<HTMLElement>('#online-world-panel .world-panel-body')!;
  const rows = [...document.querySelectorAll<HTMLElement>('.world-achievement')].map((row) => {
    const r = row.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
  return {
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    bodyWidth: body.scrollWidth,
    bodyClient: body.clientWidth,
    panel: { left: panel.left, right: panel.right },
    rows,
  };
});

const openPanel = async (p: Page) => {
  await p.click('#online-world-menu');
  await p.waitForSelector('#world-key-achievements:not([hidden])', { timeout: 20_000 });
  await p.click('#world-key-achievements');
  await p.waitForSelector('#online-world-panel[data-pane="achievements"]:not([hidden])');
  await p.waitForSelector('.world-achievement');
  await p.waitForTimeout(250);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const viewports = [
    { width: 320, height: 568, claim: false },
    { width: 390, height: 844, claim: true },
    { width: 1280, height: 800, claim: false },
  ] as const;
  let claimedOnce = false;
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.width < 700, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript((raw) => {
      for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
    }, identity);
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
    await page.goto(origin + '/');
    await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
    await page.click('#menu-world');
    await page.waitForSelector('.world-hex', { timeout: 20_000 });
    await openPanel(page);

    check(`${viewport.width}: all 35 rows and five sections`, (await count(page, '.world-achievement')) === 35 && (await count(page, '.world-achievement-heading')) === 5);
    check(`${viewport.width}: the old intro line is gone`, (await count(page, '#world-achievements-intro')) === 0 && !(await page.textContent('#online-world-achievements'))?.toLowerCase().includes('seeds for your first'));
    check(`${viewport.width}: unearned rows carry no reward teaser`, (await count(page, '.world-achievement-reward')) === 0);

    const shape = await layout(page);
    check(`${viewport.width}: the page never scrolls sideways`, shape.pageWidth <= shape.viewport + 1, `${shape.pageWidth} / ${shape.viewport}`);
    check(`${viewport.width}: the panel body never scrolls sideways`, shape.bodyWidth <= shape.bodyClient + 1, `${shape.bodyWidth} / ${shape.bodyClient}`);
    check(`${viewport.width}: every row stays inside the panel`, shape.rows.every((r) => r.left >= shape.panel.left - 1 && r.right <= shape.panel.right + 1), JSON.stringify(shape.rows.slice(0, 2)));

    const ready = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.world-achievement[data-state="ready"]');
      const open = document.querySelector<HTMLElement>('.world-achievement[data-state="open"]');
      return {
        readyHasClaim: !!row?.querySelector('.world-achievement-claim'),
        openHasClaim: !!open?.querySelector('.world-achievement-claim'),
        readyText: row?.querySelector('strong')?.textContent ?? '',
      };
    });
    check(`${viewport.width}: earned and unearned differ without colour (CLAIM vs none)`, ready.readyHasClaim && !ready.openHasClaim, JSON.stringify(ready));

    if (viewport.claim && !claimedOnce) {
      claimedOnce = true;
      await page.click('.world-achievement[data-state="ready"] .world-achievement-claim');
      await page.waitForSelector('.world-achievement[data-state="claimed"]', { timeout: 10_000 });
      check('a claimed row is a tick, and its moment shows once', (await count(page, '.world-achievement[data-state="claimed"] .world-achievement-done')) === 1 && (await count(page, '.world-achievement.just-claimed')) === 1);
      await page.waitForTimeout(1_600);
      check('the claimed moment settles (not a loop)', (await count(page, '.world-achievement.just-claimed')) === 0);
    }

    await page.screenshot({ path: `${SHOTS}/achievements-${viewport.width}.png`, fullPage: false, animations: 'disabled', timeout: 60_000 });
    check(`${viewport.width}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
  await new Promise<void>((resolve) => web.httpServer.close(() => resolve()));
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
