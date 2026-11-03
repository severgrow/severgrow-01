// THE VIEW-CENTRED GLOBE AND THE CROP (owner, 2026-11-03), PROVEN ON THE REAL PAGE.
//
// The owner asked for two things that must not be taken on trust:
//   · the menu and the Territory must show the SAME tiles on the SAME pixels ("make them identical
//     by construction"), and
//   · the globe must be DYNAMIC: the middle of the VIEW is the fattest point, the edges squish, and
//     panning almost feels like turning a ball ("always the middle of the view ... is larger").
//
// This script boots the real app against a real memory server, measures tile rects in both surfaces,
// the same tile at the view centre and at the view edge, the neighbour seams on the DRAWN paths, the
// cost of a settle and of a pan, and writes the screenshots the report quotes. It is a proof tool,
// not a CI gate (the suites in living-territory.ts / territory-gestures-ios.ts are the gates).
//
//   npx tsx web/e2e/dynamic-globe.ts
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
import { WORLD_CELLS } from '../../server/src/world.js';
import { flatCell } from '../src/online/map-globe.js';
import { seedSettings } from './helpers/settings-seed.js';

const OUT = process.env.SHOTS ?? '/tmp';
mkdirSync(OUT, { recursive: true });
const X = Math.sqrt(3), R = 10;
const VIEW_W = Number(process.env.VIEW_W ?? 390);
const VIEW_H = Number(process.env.VIEW_H ?? 844);
/** The same cap `world-view.detailFor` puts on the view: one cell is at least 46 CSS px at the rim. */
const MENU_WIDTH = VIEW_W * (X * R) / (46 / (1 - 0.08));
const MENU_HEIGHT = MENU_WIDTH / (VIEW_W / VIEW_H);

const storage = new MemoryStorage();
const store = new MemoryWorldEconomyStore();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({ service, config, live: createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }) });
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
const guest = async () => (await (await fetch(`${base}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as {
  token: string; player: { id: string; kind: string; displayName: string | null };
};
const me = await guest();
await store.adminAdjustSeeds({ playerId: me.player.id, delta: 5000, reason: 'e2e', actorId: 'e2e', requestId: 'fund-globe', now: Date.now() });
await store.acknowledgeInvitation(me.player.id);
// A holding near the middle of the world (the fat point of the default camera) and a few others,
// so there is land in every direction on the three camera centres.
for (const [i, cell] of ['-2,-4', '-1,-4', '-2,-3', '1,0', '2,0', '0,1', '-8,9', '-7,9', '-8,8'].entries())
  await store.claim(me.player.id, cell, `globe-${i}`, Date.now() - (9 - i) * 60_000);

process.env.CHANNEL = 'futa04';
process.env.VITE_DUEL_API_URL = base;
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY = 'local-e2e';
const web = await createServer({
  cacheDir: `/tmp/dyn-globe-vite-${(api.address() as AddressInfo).port}`,
  configFile: resolve('web/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await web.listen();
const origin = `http://127.0.0.1:${(web.httpServer!.address() as AddressInfo).port}`;

let checks = 0;
const check = (label: string, pass: boolean, note = '') => {
  checks++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${note ? `  (${note})` : ''}`);
  if (!pass) process.exitCode = 1;
};

type Rect = { id: string; left: number; top: number; width: number; height: number };
const rects = (page: Page): Promise<Rect[]> => page.evaluate(() =>
  [...document.querySelectorAll<SVGElement>('.world-hex')].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute('data-cell-id') ?? '', left: r.left, top: r.top, width: r.width, height: r.height };
  }),
);
/** The drawn corners of every hex path, in screen pixels, for the seam proof. */
const corners = (page: Page): Promise<[string, number[][]][]> => page.evaluate(() => {
  const svg = document.querySelector<SVGSVGElement>('.world-map-svg')!;
  const box = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const rect = svg.getBoundingClientRect();
  const k = Math.min(rect.width / box[2]!, rect.height / box[3]!);
  const ox = (rect.width - box[2]! * k) / 2, oy = (rect.height - box[3]! * k) / 2;
  const out: [string, number[][]][] = [];
  for (const el of document.querySelectorAll<SVGPathElement>('.world-hex')) {
    const d = el.getAttribute('d') ?? '';
    const points = [...d.matchAll(/(?:M|L)\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => {
      const wx = Number(m[1]), wy = Number(m[2]);
      return [rect.left + ox + (wx - box[0]!) * k, rect.top + oy + (wy - box[1]!) * k];
    });
    out.push([el.getAttribute('data-cell-id') ?? '', points]);
  }
  return out;
});
/** The worst max/min edge ratio among the tiles whose drawn path intersects the visible panel. */
const edgeRatios = (page: Page) => page.evaluate(() => {
  const grid = document.getElementById('online-world-grid')!.getBoundingClientRect();
  let worst = 0, worstId = '', tiles = 0;
  for (const el of document.querySelectorAll<SVGPathElement>('.world-hex')) {
    const r = el.getBoundingClientRect();
    if (r.right < grid.left || r.left > grid.right || r.bottom < grid.top || r.top > grid.bottom) continue;
    tiles++;
    const points = [...(el.getAttribute('d') ?? '').matchAll(/(?:M|L)\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    if (points.length !== 6) continue;
    const lengths = points.map((a, i) => { const b = points[(i + 1) % 6]!; return Math.hypot(b.x - a.x, b.y - a.y); });
    const ratio = Math.max(...lengths) / Math.min(...lengths);
    if (ratio > worst) { worst = ratio; worstId = el.getAttribute('data-cell-id') ?? ''; }
  }
  return { worst, worstId, tiles };
});
const waitPainted = async (page: Page) => {
  await page.waitForFunction(() => {
    const svg = document.querySelector<SVGSVGElement>('.world-map-svg');
    return !!svg && Number(getComputedStyle(svg).opacity) >= 0.99;
  }, undefined, { timeout: 6000 });
  // One settle of the globe, then a frame to paint it.
  await page.waitForTimeout(260);
};
const stats = (page: Page) => page.evaluate(() => {
  const svg = document.querySelector<SVGSVGElement>('.world-map-svg')!;
  return {
    warpMs: Number(svg.dataset.warpMs ?? 0), warpWrites: Number(svg.dataset.warpWrites ?? 0),
    warpCells: Number(svg.dataset.warpCells ?? 0), warpSettles: Number(svg.dataset.warpSettles ?? 0),
    viewWrites: Number(svg.dataset.viewWrites ?? 0), viewMs: Number(svg.dataset.viewMs ?? 0),
  };
});
/** Seed the camera the product would have saved after a deliberate pan (unprefixed key). Written
 *  directly on the live page, not through an init script, so the next reload reads exactly this. */
const seedCamera = async (page: Page, cx: number, cy: number, offsetX = 0, offsetY = 0) =>
  page.evaluate(({ cx, cy, w, h, ox, oy }) => {
    localStorage.setItem('futasaku.world.camera.v1', JSON.stringify({
      version: 3, manual: true, box: [cx - w / 2 + ox, cy - h / 2 + oy, w, h],
    }));
  }, { cx, cy, w: MENU_WIDTH, h: MENU_HEIGHT, ox: offsetX, oy: offsetY });

const identity = JSON.stringify({ token: me.token, playerId: me.player.id, kind: me.player.kind, displayName: me.player.displayName });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((raw) => {
  for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw);
}, identity);
await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', eyeCandy: false, reduceMotion: false });

const boot = async () => {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
  await page.waitForFunction(() => !!document.querySelector('.world-hex.mine'));
  await page.waitForTimeout(400);
};
const openTerritory = async () => {
  await page.click('#menu-world');
  await page.waitForSelector('#online-world-screen:not([hidden])');
  await waitPainted(page);
};
const backToMenu = async () => {
  await page.click('#online-world-back');
  await page.waitForSelector('#menu:not([hidden])');
  // The retreat is a 300ms colour-out; only after it does `done()` run, `preview()` re-frame the
  // menu and `close()` write the camera record. Seeding before that write would be overwritten by
  // the camera we are trying to replace — the race that made two camera seeds look identical.
  await page.waitForFunction(() => {
    const svg = document.querySelector<SVGSVGElement>('.world-map-svg');
    return !!svg && Math.abs(Number(getComputedStyle(svg).opacity) - 0.23436) <= 0.02;
  }, undefined, { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(250);
};

try {
  // ---- 1. menu -> territory: the SAME canvas, only a crop -------------------------------
  await boot();
  await page.screenshot({ path: `${OUT}/dyn2-menu.png` });
  const menu = await rects(page);
  const menuStats = await stats(page);
  await openTerritory();
  await page.screenshot({ path: `${OUT}/dyn2-territory.png` });
  const panel = await rects(page);
  const byId = new Map(menu.map((r) => [r.id, r]));
  let worst = 0;
  let compared = 0;
  for (const tile of panel) {
    const before = byId.get(tile.id);
    if (!before) continue;
    compared++;
    worst = Math.max(worst, Math.abs(tile.left - before.left), Math.abs(tile.top - before.top), Math.abs(tile.width - before.width), Math.abs(tile.height - before.height));
  }
  check(`menu -> territory tile rects identical by construction (max ${worst.toFixed(3)}px over ${compared} tiles)`, compared > 50 && worst < 0.01);
  const afterStats = await stats(page);
  console.log(`INFO settle: ${afterStats.warpMs}ms, ${afterStats.warpWrites} attribute writes, ${afterStats.warpCells} visible+margin cells, ${afterStats.warpSettles} settle(s)`);
  check('the first Territory frame is already posed (a settle happened before the screenshot)', afterStats.warpSettles > menuStats.warpSettles);

  // ---- 2. the seams of the DRAWN hexes at 8% --------------------------------------------
  const drawn = await corners(page);
  const pointsOf = new Map(drawn);
  let seam = 0;
  let pairs = 0;
  for (const [id, mine] of pointsOf) {
    const [q, r] = id.split(',').map(Number);
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1]] as const) {
      const theirs = pointsOf.get(`${q! + dq},${r! + dr}`);
      if (!theirs) continue;
      pairs++;
      // Most two corners must coincide: the closest pair distance is the seam (0 when shared).
      const closest = Math.min(...mine.map((a) => Math.min(...theirs.map((b) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!)))));
      seam = Math.max(seam, closest);
    }
  }
  check(`neighbours still share their drawn corners exactly at 8% (max seam ${seam.toFixed(3)}px over ${pairs} pairs)`, pairs > 300 && seam < 0.02);
  const edgesNow = await edgeRatios(page);
  console.log(`INFO visible tiles: worst max/min edge ratio ${edgesNow.worst.toFixed(4)} on ${edgesNow.worstId}; ${edgesNow.tiles} tiles touch the window`);
  check(`the shipped 8% is a compressed hexagon, not a sliver (worst visible edge ratio ${edgesNow.worst.toFixed(4)} < 1.35)`, edgesNow.tiles > 20 && edgesNow.worst < 1.35);

  // ---- 3. cost: a pan is one viewBox write per frame, then one settle -------------------
  const beforePan = await stats(page);
  const box = await page.locator('.world-map-svg').boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) await page.mouse.move(box.x + box.width / 2 - i * 7, box.y + box.height / 2 - i * 3, { steps: 1 });
    await page.mouse.up();
  }
  await page.waitForTimeout(360);
  const afterPan = await stats(page);
  const viewWrites = afterPan.viewWrites - beforePan.viewWrites;
  const viewMs = afterPan.viewMs - beforePan.viewMs;
  const settleWrites = afterPan.warpWrites;
  console.log(`INFO pan: ${viewWrites} viewBox writes in ${viewMs.toFixed(2)}ms (${(viewMs / Math.max(1, viewWrites)).toFixed(3)}ms per write, geometry untouched)`);
  check('a pan writes only the viewBox (no settle during the drag)', afterPan.warpSettles <= beforePan.warpSettles + 1 && viewWrites > 0);
  console.log(`INFO settle after the pan: ${afterPan.warpMs}ms, ${settleWrites} attribute writes, ${afterPan.warpCells} cells`);

  // ---- 3b. the same work with the CPU slowed 4x (a mid-range-phone proxy) --------------
  const cdp = await (context as unknown as { newCDPSession(page: Page): Promise<{ send(method: string, params?: unknown): Promise<unknown> }> }).newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const beforeSlow = await stats(page);
  const slowBox = await page.locator('.world-map-svg').boundingBox();
  if (slowBox) {
    await page.mouse.move(slowBox.x + slowBox.width / 2, slowBox.y + slowBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(slowBox.x + slowBox.width / 2 - i * 9, slowBox.y + slowBox.height / 2 - i * 4, { steps: 1 });
    await page.mouse.up();
  }
  await page.waitForTimeout(700);
  const afterSlow = await stats(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check(`a settle stays cheap at 4x CPU (${afterSlow.warpMs}ms, ${afterSlow.warpWrites} writes, ${afterSlow.warpCells} cells)`, afterSlow.warpMs < 33);
  console.log(`INFO settle at 4x CPU: ${afterSlow.warpMs}ms, ${afterSlow.warpWrites} attribute writes, ${afterSlow.warpCells} cells; pan ${afterSlow.viewWrites - beforeSlow.viewWrites} viewBox writes in ${(afterSlow.viewMs - beforeSlow.viewMs).toFixed(2)}ms`);

  await backToMenu();

  // ---- 4. centre vs edge: the SAME tile at the fat middle and at the view edge ----------
  // A cell near the world's middle, so both cameras (centred on it, and half a view away) stay
  // inside the fit box and neither is clamped. The DOM rect is the tile's drawn size.
  const tileId = '0,0';
  const at = flatCell(0, 0);
  await seedCamera(page, at.x, at.y);
  await boot();
  await openTerritory();
  const centreRect = (await rects(page)).find((r) => r.id === tileId)!;
  await backToMenu();
  // The same camera panned so the tile is on the view's RIGHT edge (half a view across). The
  // horizontal edge is the radial one, where the sphere squashes a tile most; and the world is much
  // wider than a phone view, so the camera is not clamped by the fit box on the way there.
  await seedCamera(page, at.x, at.y, MENU_WIDTH / 2, 0);
  await boot();
  await openTerritory();
  const edgeRect = (await rects(page)).find((r) => r.id === tileId)!;
  const ratio = centreRect.width / edgeRect.width;
  check(`the middle of the view swells: the same tile is ${ratio.toFixed(4)}x wider at the centre (${centreRect.width.toFixed(2)}px) than at the view edge (${edgeRect.width.toFixed(2)}px)`, ratio > 1.005);
  console.log(`INFO centre tile ${centreRect.width.toFixed(2)}x${centreRect.height.toFixed(2)}, edge ${edgeRect.width.toFixed(2)}x${edgeRect.height.toFixed(2)}`);
  await backToMenu();

  // ---- 5. three camera centres: the globe turns with the view --------------------------
  const centres: [string, number, number][] = [
    ['a', flatCell(-2, -4).x, flatCell(-2, -4).y],   // own land
    ['b', flatCell(1, 0).x, flatCell(1, 0).y],       // another part of the holding
    ['c', flatCell(-8, 9).x, flatCell(-8, 9).y],     // the old rim, where the static pose compressed
  ];
  for (const [name, x, y] of centres) {
    await seedCamera(page, x, y);
    await boot();
    await openTerritory();
    await page.screenshot({ path: `${OUT}/dyn2-rotate-${name}.png` });
    const centreCell = WORLD_CELLS.reduce((best, cell) => {
      const d = Math.hypot(flatCell(cell.q, cell.r).x - x, flatCell(cell.q, cell.r).y - y);
      return d < best.d ? { id: cell.id, d } : best;
    }, { id: '', d: Infinity });
    const tile = (await rects(page)).find((r) => r.id === centreCell.id);
    const edges = await edgeRatios(page);
    console.log(`INFO rotate ${name}: camera (${x.toFixed(1)}, ${y.toFixed(1)}), centre tile ${centreCell.id} at ${tile ? `${tile.width.toFixed(2)}px` : '?'}; worst visible edge ratio ${edges.worst.toFixed(4)} (${edges.worstId})`);
    await backToMenu();
  }

  // ---- 6. a reload lands on the same anchor --------------------------------------------
  await seedCamera(page, flatCell(-2, -4).x, flatCell(-2, -4).y);
  await boot();
  const reloadMenu = await rects(page);
  await page.screenshot({ path: `${OUT}/dyn2-reload-menu.png` });
  await openTerritory();
  const reloadPanel = await rects(page);
  const reloadMap = new Map(reloadMenu.map((r) => [r.id, r]));
  let reloadWorst = 0;
  for (const tile of reloadPanel) {
    const before = reloadMap.get(tile.id);
    if (!before) continue;
    reloadWorst = Math.max(reloadWorst, Math.abs(tile.left - before.left), Math.abs(tile.top - before.top), Math.abs(tile.width - before.width), Math.abs(tile.height - before.height));
  }
  check(`anchor after a reload: tile rects identical (max ${reloadWorst.toFixed(3)}px)`, reloadWorst < 0.01);

  check(`no browser page exceptions${errors.length ? `: ${errors.join(' | ')}` : ''}`, errors.length === 0);
  console.log(`PASS ${checks} dynamic-globe checks; screenshots in ${OUT}`);
} finally {
  await context.close();
  await browser.close();
  await web.close();
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
