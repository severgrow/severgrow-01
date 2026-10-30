// YOUR COLOUR (owner, 2026-10-30): "create 20 different colours ... find the best place to put 'change
// color' option, so player can choose what color are their tiles ... persist the choice server-side
// so it follows the player to another device".
//
// The real economy (memory) behind the real HTTP app, and the product build pointed at it:
//
//   * the picker opens from the map's MENU row, all twenty swatches, each NAMED;
//   * the current one is marked, and it is the colour the SERVER says this player has;
//   * choosing one re-colours the player's own tiles with no reload;
//   * the choice survives a reload (it is a stored row, not a local habit);
//   * at 320x568 the grid fits the window and never scrolls sideways.
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/territory-colours.ts
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
import { TILE_COLOURS } from '../../src/tile-colours.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const OUT = new URL('../../docs/screens/territory-colours/', import.meta.url).pathname;
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
const others = await Promise.all([guestOf(), guestOf()]);
const patches = [['0,0', '1,0', '2,0'], ['-5,3', '-4,3', '-4,4']];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, patches[i]!.length);
  for (const [j, cell] of patches[i]!.entries()) await store.claim(g.player.id, cell, `other-${i}-${j}-req`, Date.now() - (10 - j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 3);
await store.claim(me.player.id, '-2,-4', 'colours-owned-1', Date.now());
await store.claim(me.player.id, '-1,-4', 'colours-owned-2', Date.now());
await store.acknowledgeInvitation(me.player.id);
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind });

if (process.env.SKIP_BUILD !== '1') await new Promise<void>((resolve, reject) => {
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

/** My own tiles' colours, as the map is drawing them. */
const myColours = (p: Page) => p.evaluate(() => [...document.querySelectorAll<SVGPathElement>('.world-hex.mine')]
  .map((el) => el.style.getPropertyValue('--territory').trim()));
const panelOpen = (p: Page) => p.evaluate(() => document.querySelector<HTMLElement>('#online-world-panel')?.dataset.pane === 'colour'
  && !document.getElementById('online-world-panel')!.hasAttribute('hidden'));
const openPicker = async (p: Page) => {
  // ONE menu tap on the map, then the COLOUR key in its row: the same two taps as Ranking, and the
  // picker is the row's page, never a second screen.
  if (!(await p.evaluate(() => document.getElementById('online-world-keys')!.classList.contains('open')))) {
    await p.click('#online-world-menu');
    await p.waitForFunction(() => document.getElementById('online-world-keys')!.classList.contains('open'));
  }
  await p.click('#world-key-colour');
  await p.waitForFunction(() => document.querySelector<HTMLElement>('#online-world-panel')?.dataset.pane === 'colour');
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.mine', { timeout: 20_000 });
  await page.waitForTimeout(800);
  const reloadsBefore = navigations;

  // ---- 1. the wire: every claim wears one of the twenty ----
  const world = await (await fetch(`${apiBase}/v1/world`)).json() as { world: { claims: { colour: string }[] } };
  const palette = TILE_COLOURS.map((colour) => colour.css);
  check('every claim on the map carries a palette colour', world.world.claims.every((claim) => palette.includes(claim.colour)), `${world.world.claims.length} claims`);

  // ---- 1b. the two "less plain" additions are actually painted ----
  const faces = await page.evaluate(() => [...document.querySelectorAll<SVGPathElement>('.world-hex-face')]
    .filter((el) => el.classList.contains('held') || el.classList.contains('mine'))
    // CSSOM serialises url(#id) as url("#id"); normalise before comparing.
    .map((el) => ({
      cell: el.getAttribute('data-cell-id') ?? '',
      fill: el.style.fill.replace(/"/g, ''),
      stroke: el.style.stroke.replace(/"/g, ''),
    })));
  check('every held tile carries the top-left rim highlight', faces.length > 0 && faces.every((f) => f.stroke === 'url(#world-rim)'), `${faces.length} faces`);
  check('every held tile uses a per-cell jitter band gradient', faces.every((f) => /^url\(#world-face-\d+\)$/.test(f.fill)));
  const mineBands = faces.filter((f) => f.cell === '-2,-4' || f.cell === '-1,-4').map((f) => f.fill);
  check('my two tiles are drawn with two different bands of the same colour', mineBands.length === 2 && new Set(mineBands).size === 2, mineBands.join(' '));

  // ---- 2. the picker: one row, twenty NAMED swatches ----
  await openPicker(page);
  check('the picker opens from the map key row', await panelOpen(page));
  const swatches = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#world-colour-grid .world-colour-swatch')].map((el) => ({
    id: Number(el.dataset.colourId),
    name: el.querySelector('.world-colour-name')?.textContent ?? '',
    label: el.getAttribute('aria-label') ?? '',
    pressed: el.getAttribute('aria-pressed') === 'true',
    visible: (() => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
  })));
  check('all twenty swatches render', swatches.length === 20, `${swatches.length}`);
  check('every swatch is visible', swatches.every((s) => s.visible));
  check('every swatch shows a NAME', swatches.every((s) => s.name.trim().length > 2), swatches.map((s) => s.name).join(' '));
  check('the twenty names are distinct', new Set(swatches.map((s) => s.name)).size === 20);
  check('the names match the shared palette', swatches.map((s) => s.name).join('|') === TILE_COLOURS.map((c) => c.name).join('|'));
  check('each swatch is labelled with its name', swatches.every((s) => s.label.startsWith(s.name)));

  // ---- 3. the current one is marked, and it is the server's answer ----
  const server = await (await fetch(`${apiBase}/v1/world/colour`, { headers: { authorization: `Bearer ${me.token}` } })).json() as { colour: { colourId: number } };
  const pressed = swatches.filter((s) => s.pressed);
  check('exactly one swatch is marked current', pressed.length === 1, `marked ${pressed.map((s) => s.name).join(',')}`);
  check('the marked swatch is the server\'s colour', pressed[0]?.id === server.colour.colourId, `${pressed[0]?.name} vs ${server.colour.colourId}`);
  const before = await myColours(page);
  check('my tiles are drawn in that colour', before.every((colour) => colour === TILE_COLOURS[server.colour.colourId]!.css), before.join(','));

  const shots = [
    ['picker-390x844.png', 390, 844],
    ['picker-360x640.png', 360, 640],
    ['picker-320x568.png', 320, 568],
  ] as const;
  for (const [file, width, height] of shots) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}${file}` });
  }

  // ---- 4. 320x568: no sideways scroll, everything inside the window ----
  const narrow = await page.evaluate(() => {
    const grid = document.getElementById('world-colour-grid')!;
    const body = document.querySelector<HTMLElement>('#online-world-panel .world-panel-body')!;
    const panel = document.getElementById('online-world-panel')!.getBoundingClientRect();
    const cells = [...grid.querySelectorAll<HTMLElement>('.world-colour-swatch')].map((el) => el.getBoundingClientRect());
    return {
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      bodyScroll: body.scrollWidth - body.clientWidth,
      gridOverflow: grid.scrollWidth - grid.clientWidth,
      outside: cells.filter((cell) => cell.left < panel.left - 0.5 || cell.right > panel.right + 0.5).length,
      columns: new Set(cells.map((cell) => Math.round(cell.left))).size,
      rows: new Set(cells.map((cell) => Math.round(cell.top))).size,
    };
  });
  check('320x568: the page never scrolls sideways', narrow.pageScroll <= 0, `${narrow.pageScroll}px`);
  check('320x568: the swatch grid never scrolls sideways', narrow.bodyScroll <= 0 && narrow.gridOverflow <= 0, `body ${narrow.bodyScroll}px, grid ${narrow.gridOverflow}px`);
  check('320x568: every swatch is inside the window', narrow.outside === 0, `${narrow.outside} outside`);
  check('320x568: four swatches to a row, five rows', narrow.columns === 4 && narrow.rows === 5, `${narrow.columns} columns, ${narrow.rows} rows`);

  // ---- 5. choosing re-colours my tiles, with no reload ----
  // A SECOND DEVICE IS ALREADY OPEN, on the old colour, so the change can be watched arriving by
  // itself: a colour moves no tile and bumps no revision, so the map must notice the colour.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const otherPage = await other.newPage();
  await otherPage.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(otherPage, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  let otherNavigations = 0;
  otherPage.on('framenavigated', (frame) => { if (frame === otherPage.mainFrame()) otherNavigations++; });
  await otherPage.goto(origin + '/');
  await otherPage.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await otherPage.click('#menu-world');
  await otherPage.waitForSelector('.world-hex.mine', { timeout: 20_000 });
  await otherPage.waitForTimeout(800);
  const onOtherBefore = await myColours(otherPage);
  check('a second device starts on the same colour', onOtherBefore.every((colour) => colour === TILE_COLOURS[server.colour.colourId]!.css), onOtherBefore.join(','));
  const otherLoads = otherNavigations;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const target = TILE_COLOURS[(server.colour.colourId + 7) % 20]!;
  await page.tap(`#world-colour-grid [data-colour-id="${target.id}"]`);
  await page.waitForFunction((css) => {
    const mine = [...document.querySelectorAll<SVGPathElement>('.world-hex.mine')];
    return mine.length > 0 && mine.every((el) => el.style.getPropertyValue('--territory').trim() === css);
  }, target.css, { timeout: 15_000 });
  const after = await myColours(page);
  check('choosing a colour re-colours my tiles', after.every((colour) => colour === target.css), after.join(','));
  check('...without a page load', navigations === reloadsBefore, `${navigations - reloadsBefore} navigations`);
  await otherPage.waitForFunction((css) => {
    const mine = [...document.querySelectorAll<SVGPathElement>('.world-hex.mine')];
    return mine.length > 0 && mine.every((el) => el.style.getPropertyValue('--territory').trim() === css);
  }, target.css, { timeout: 20_000 }).catch(() => undefined);
  const onOtherLive = await myColours(otherPage);
  check('...and the other open device follows on its next poll', onOtherLive.every((colour) => colour === target.css), onOtherLive.join(','));
  check('...without reloading it either', otherNavigations === otherLoads, `${otherNavigations - otherLoads} navigations`);

  const savedServer = await (await fetch(`${apiBase}/v1/world/colour`, { headers: { authorization: `Bearer ${me.token}` } })).json() as { colour: { colourId: number; canChange: boolean; remainingMs: number } };
  check('the choice is stored on the server', savedServer.colour.colourId === target.id, `${savedServer.colour.colourId} vs ${target.id}`);

  // ---- 5b. ONE CHANGE PER 24 H (owner, 2026-10-30) -----------------------------------------
  // The wait is shown BEFORE the next pick, on the grid and its note — not only after a refusal.
  const cooldown = await page.evaluate(() => ({
    note: (document.getElementById('world-colour-note')?.textContent ?? '').trim(),
    disabled: [...document.querySelectorAll<HTMLButtonElement>('#world-colour-grid .world-colour-swatch')]
      .filter((el) => el.disabled).length,
    total: document.querySelectorAll('#world-colour-grid .world-colour-swatch').length,
  }));
  check('the picker says when a change is possible again, BEFORE a press',
    /^Changes again in \d+ h\.$/.test(cooldown.note), cooldown.note);
  check('...and the whole grid is closed until the window reopens',
    cooldown.total === 20 && cooldown.disabled === 20, `${cooldown.disabled}/${cooldown.total} disabled`);
  check('the server agrees the window is closed', savedServer.colour.canChange === false && savedServer.colour.remainingMs > 0,
    `canChange ${savedServer.colour.canChange}, ${savedServer.colour.remainingMs} ms left`);
  // A press on a closed swatch cannot reach the server: the colour does not move.
  const blockedTarget = TILE_COLOURS[(target.id + 5) % 20]!;
  await page.evaluate((id) => (document.querySelector(`#world-colour-grid [data-colour-id="${id}"]`) as HTMLButtonElement | null)?.click(), blockedTarget.id);
  await page.waitForTimeout(600);
  const stillTarget = await (await fetch(`${apiBase}/v1/world/colour`, { headers: { authorization: `Bearer ${me.token}` } })).json() as { colour: { colourId: number } };
  check('...so a second change inside 24 h never happens', stillTarget.colour.colourId === target.id,
    `${stillTarget.colour.colourId} vs ${target.id}`);

  await page.screenshot({ path: `${OUT}recoloured-390x844.png` });

  // ---- 6. it survives a reload ----
  await page.reload();
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.mine', { timeout: 20_000 });
  await page.waitForTimeout(800);
  const afterReload = await myColours(page);
  check('after a reload my tiles keep the chosen colour', afterReload.every((colour) => colour === target.css), afterReload.join(','));
  await openPicker(page);
  const marked = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#world-colour-grid .world-colour-swatch[aria-pressed="true"]')].map((el) => Number(el.dataset.colourId)));
  check('after a reload the picker still marks it', marked.length === 1 && marked[0] === target.id, marked.join(','));
  const reloadNote = (await page.textContent('#world-colour-note'))?.trim() ?? '';
  check('after a reload the 24 h wait is still stated (it is the server\'s, not a local flag)',
    /^Changes again in \d+ h\.$/.test(reloadNote), reloadNote);

  // ---- 7. a DEVICE THAT WAS NEVER HERE still opens on the choice ----
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const freshPage = await fresh.newPage();
  await freshPage.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(freshPage, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await freshPage.goto(origin + '/');
  await freshPage.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await freshPage.click('#menu-world');
  await freshPage.waitForSelector('.world-hex.mine', { timeout: 20_000 });
  await freshPage.waitForTimeout(800);
  const onFresh = await myColours(freshPage);
  check('a device that was never here opens on the chosen colour', onFresh.every((colour) => colour === target.css), onFresh.join(','));
  await fresh.close();
  await other.close();
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) { console.log(`${failed} territory-colours checks failed`); process.exit(1); }
console.log('territory-colours checks passed');
process.exit(0);
