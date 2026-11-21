// COLLECT FROM THE SHELF (owner, 2026-11-20): "find a smart way for extra window or space ... the
// achievements window same size as planet - with the newly acheived achievement showed there ...
// just make it be dragged onto the section where this achievmeent is with button 'COLLECT' by the
// seed payout with our classic glow - same style as hand during grow etc".
//
// What this drives, on the real product build against the real memory economy:
//   * the achievements page takes the Planet's whole stage, not the 420px drawer;
//   * a newly earned reward is on the SHELF at the top, once — with its seed payout and COLLECT;
//   * COLLECT wears the game's grow-glow (animation running), and under reduce motion the same halo
//     rests lit with no animation;
//   * the key is a real button: Tab + Enter collect the reward, the server pays it, the wallet and
//     the polite status line say so, and the ticked row is filed into its own section;
//   * screenshots at 390x844 and 1280x800, plus the reduce-motion sheet.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/achievements-collect.ts
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
const SHOTS = process.env.SHOTS ?? '/tmp/ach';
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

/** One funded player holding exactly one tile: "Put down roots" (100 Seeds) is ready, and only it. */
const rootedGuest = async (cell: string, tag: string) => {
  const player = await guestOf();
  store.adminAdjustSeeds({ playerId: player.player.id, delta: 1000, reason: 'e2e', actorId: 'e2e', requestId: `fund-${tag}`, now: Date.now() });
  const claim = await store.claim(player.player.id, cell, `claim-${tag}`, Date.now());
  if (!claim.ok) throw new Error(`could not claim ${cell} for ${tag}: ${claim.code}`);
  await store.acknowledgeInvitation(player.player.id);
  return {
    identity: JSON.stringify({ token: player.token, playerId: player.player.id, displayName: player.player.displayName, kind: player.player.kind }),
    playerId: player.player.id,
  };
};

// Two separate players: the first is collected from on the phone, the second is the desktop's
// untouched "before" state (a collect cannot be replayed as a fresh reward).
const phone = await rootedGuest('-2,-4', 'phone');
const desk = await rootedGuest('0,0', 'desk');

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

const openSheet = async (page: Page) => {
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex', { timeout: 20_000 });
  await page.click('#online-world-menu');
  await page.waitForSelector('#world-key-achievements:not([hidden])', { timeout: 20_000 });
  await page.click('#world-key-achievements');
  await page.waitForSelector('#online-world-panel[data-pane="achievements"]:not([hidden])');
  await page.waitForSelector('.world-achievement-card', { timeout: 20_000 });
  await page.waitForTimeout(300);
};

const walletSeeds = async (page: Page) => Number((await page.textContent('#online-world-wallet .world-seeds'))?.replace(/\D/g, '') ?? 0);

/** The stage the sheet must fill, and the sheet itself. */
const sheetBox = (page: Page) => page.evaluate(() => {
  const panel = document.getElementById('online-world-panel')!.getBoundingClientRect();
  const grid = document.getElementById('online-world-grid')!.getBoundingClientRect();
  return {
    panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: panel.width, height: panel.height },
    grid: { left: grid.left, right: grid.right, top: grid.top, bottom: grid.bottom, width: grid.width, height: grid.height },
  };
});

/** The glow, read from the key: the halo's own animation, its still shadow, and its light. */
const glowOf = (page: Page) => page.evaluate(() => {
  const key = document.querySelector<HTMLElement>('.world-achievement-card .world-collect');
  const glow = key?.querySelector<HTMLElement>('.world-collect-glow');
  if (!key || !glow) return null;
  const style = getComputedStyle(glow);
  return {
    text: key.textContent?.trim() ?? '',
    label: key.getAttribute('aria-label') ?? '',
    animation: style.animationName,
    shadow: style.boxShadow,
    opacity: Number(style.opacity),
  };
});

const collectWithKeyboard = async (page: Page) => {
  await page.evaluate(() => {
    const key = document.querySelector<HTMLButtonElement>('.world-achievement-card .world-collect')!;
    key.focus();
  });
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('world-collect') === true);
  await page.keyboard.press('Enter');
  return focused;
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  // ---- 1. the phone: the sheet, the shelf, the glow, one press, the filing ----------------------
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, phone.identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await openSheet(page);

  const box = await sheetBox(page);
  check('390: the achievements sheet takes the Planet stage, not the small drawer',
    box.panel.width >= box.grid.width - 21 && box.panel.height >= box.grid.height - 80,
    `panel ${Math.round(box.panel.width)}x${Math.round(box.panel.height)} / stage ${Math.round(box.grid.width)}x${Math.round(box.grid.height)}`);
  check('390: the sheet stops under the key row, so MENU and close stay reachable',
    box.panel.top >= box.grid.top + 55 && box.panel.top <= box.grid.top + 70, String(Math.round(box.panel.top - box.grid.top)));

  const shelf = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.world-achievement-card')];
    const roots = cards.find((card) => card.dataset.achievement === 'roots');
    const title = document.getElementById('world-shelf-title');
    return {
      cards: cards.length,
      ids: cards.map((card) => card.dataset.achievement ?? ''),
      heading: title?.textContent ?? '',
      payout: roots?.querySelector('.world-achievement-payout')?.textContent ?? '',
      action: roots?.querySelector('.world-collect')?.textContent?.trim() ?? '',
      inShelf: !!roots?.closest('#online-world-achievements-shelf'),
      fileRow: document.querySelectorAll('#online-world-achievements [data-achievement="roots"]').length,
    };
  });
  check('390: the earned reward waits on the shelf, once, with its payout and COLLECT',
    shelf.cards >= 1 && shelf.ids.includes('roots') && shelf.heading.endsWith('ready to collect') &&
      shelf.payout.includes('+100') && shelf.action === 'COLLECT' && shelf.inShelf && shelf.fileRow === 0,
    JSON.stringify(shelf));

  const glow = await glowOf(page);
  check('390: COLLECT wears the grow-glow — a still halo whose opacity alone breathes',
    !!glow && glow.animation.includes('world-collect-glow') && glow.shadow !== 'none' && glow.opacity > 0.4 && glow.opacity <= 1,
    JSON.stringify(glow));
  check('390: the COLLECT key names its achievement for a screen reader', !!glow && glow.label.includes('Put down roots') && glow.label.includes('100 Seeds'), glow?.label ?? '');
  await page.screenshot({ path: `${SHOTS}/ach-390-ready.png`, animations: 'allow', timeout: 60_000 });

  // THE IN-GAME Reduce motion switch, live, while the reward is still waiting: the glow stops
  // breathing but stays lit (it is information, not decoration).
  const reducedGlow = await page.evaluate(() => {
    document.documentElement.classList.add('reduce-motion');
    const glow = document.querySelector<HTMLElement>('.world-collect-glow');
    if (!glow) return null;
    const style = getComputedStyle(glow);
    return { animation: style.animationName, opacity: Number(style.opacity), shadow: style.boxShadow };
  });
  check('390: in-game Reduce motion leaves the glow THERE, resting lit (no animation)',
    !!reducedGlow && reducedGlow.animation === 'none' && reducedGlow.opacity > 0.5 && reducedGlow.shadow !== 'none',
    JSON.stringify(reducedGlow));
  await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'));

  const before = await walletSeeds(page);
  const focused = await collectWithKeyboard(page);
  check('390: the COLLECT key is keyboard-reachable (a real button, Tab/Enter)', focused);
  await page.waitForSelector('#online-world-achievements [data-achievement="roots"][data-state="claimed"]', { timeout: 10_000 });
  // The filing glide is deliberately not instant; give it its moment before judging where it landed.
  await page.waitForTimeout(700);
  const after = await walletSeeds(page);
  const filed = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('#online-world-achievements [data-achievement="roots"]');
    const heading = [...document.querySelectorAll<HTMLElement>('.world-achievement-heading')]
      .find((h) => h.textContent?.toUpperCase().includes('PLANET'));
    const body = document.querySelector<HTMLElement>('#online-world-panel .world-panel-body')!;
    const b = body.getBoundingClientRect();
    const r = row!.getBoundingClientRect();
    return {
      tick: !!row?.querySelector('.world-achievement-done'),
      offShelf: document.querySelector('#online-world-achievements-shelf [data-achievement="roots"]') === null,
      shelfLeft: document.querySelectorAll('.world-achievement-card').length,
      heading: heading?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      visible: r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
      notice: document.getElementById('online-world-notice')?.textContent ?? '',
    };
  });
  check('390: the server paid exactly the achievement (wallet +100)', after - before === 100, `${before} -> ${after}`);
  check('390: the payout is announced on the sheet’s existing polite status line', filed.notice.includes('+100 Seeds'), filed.notice);
  check('390: the card leaves the shelf and is filed into its own section, ticked and in view',
    filed.tick && filed.offShelf && filed.shelfLeft === shelf.cards - 1 && filed.heading.includes('/10') && filed.visible,
    JSON.stringify(filed));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/ach-390-collected.png`, animations: 'allow', timeout: 60_000 });

  check('390: no page errors', errors.length === 0, errors.join(' | '));
  await context.close();

  // ---- 2. the OS reduce-motion path on a fresh reward -------------------------------------------
  const reduceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const reducePage = await reduceContext.newPage();
  const reduceErrors: string[] = [];
  reducePage.on('pageerror', (error) => reduceErrors.push(String(error)));
  await reducePage.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, desk.identity);
  await seedSettings(reducePage, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await reducePage.goto(origin + '/');
  await reducePage.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await openSheet(reducePage);
  const osGlow = await glowOf(reducePage);
  check('390 (reduce): prefers-reduced-motion keeps the halo, still and lit',
    !!osGlow && osGlow.animation === 'none' && osGlow.opacity > 0.5 && osGlow.shadow !== 'none',
    JSON.stringify(osGlow));
  await reducePage.screenshot({ path: `${SHOTS}/ach-390-reduce.png`, animations: 'allow', timeout: 60_000 });
  check('390 (reduce): no page errors', reduceErrors.length === 0, reduceErrors.join(' | '));
  await reduceContext.close();

  // ---- 3. the desktop stage --------------------------------------------------------------------
  const deskContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const deskPage = await deskContext.newPage();
  const deskErrors: string[] = [];
  deskPage.on('pageerror', (error) => deskErrors.push(String(error)));
  await deskPage.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, desk.identity);
  await seedSettings(deskPage, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await deskPage.goto(origin + '/');
  await deskPage.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await openSheet(deskPage);
  const wide = await sheetBox(deskPage);
  check('1280: the sheet covers the whole stage (no 420px drawer)',
    wide.panel.width >= wide.grid.width - 30 && wide.panel.height >= wide.grid.height - 100,
    `panel ${Math.round(wide.panel.width)}x${Math.round(wide.panel.height)} / stage ${Math.round(wide.grid.width)}x${Math.round(wide.grid.height)}`);
  const measure = await deskPage.evaluate(() => {
    const column = document.querySelector<HTMLElement>('.world-pane[data-pane="achievements"]')!.getBoundingClientRect();
    const card = document.querySelector<HTMLElement>('.world-achievement-card')!.getBoundingClientRect();
    return { column: column.width, card: card.width };
  });
  check('1280: the reading column stays a comfortable measure and the cards fill it',
    measure.column <= 762 && measure.card >= 300, JSON.stringify(measure));
  await deskPage.screenshot({ path: `${SHOTS}/ach-1280-ready.png`, animations: 'allow', timeout: 60_000 });
  await collectWithKeyboard(deskPage);
  await deskPage.waitForSelector('#online-world-achievements [data-achievement="roots"][data-state="claimed"]', { timeout: 10_000 });
  await deskPage.waitForTimeout(200);
  await deskPage.screenshot({ path: `${SHOTS}/ach-1280-collected.png`, animations: 'allow', timeout: 60_000 });
  check('1280: no page errors', deskErrors.length === 0, deskErrors.join(' | '));
  await deskContext.close();
} finally {
  await browser.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
  await new Promise<void>((resolve) => web.httpServer.close(() => resolve()));
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
