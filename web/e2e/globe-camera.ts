// THE GLOBE'S CAMERA, FOG AND FEEL, PROVEN ON THE REAL PAGE (owner brief, 2026-11-03: "every edge
// accessible. Beautiful undiscovered land. Stronger globe perspective. Zero visible jumps").
//
// Boots the real app against a real memory server and measures, on the drawn geometry:
//   1. REACH: the outermost discovered tile in each of the four directions can be brought to the
//      centre of the VISIBLE Territory panel (not merely to the screen edge), at two zoom levels;
//   2. FOG: mid-drag, every undiscovered hex shares its corners with the land beside it (one pose),
//      no fog hex is inverted or giant, and the two rings are intact;
//   3. EDGES: overscroll gives way softly while held and returns to the limit on release, never
//      sticking beyond it;
//   4. FEEL: a flick carries on and decelerates; a slow drag that pauses stops exactly there;
//   5. COST: frame times of a drag at 1x and 4x CPU.
// It writes the screenshots the report quotes (SHOTS=dir). A proof tool, run by hand:
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/globe-camera.ts
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

const OUT = process.env.SHOTS ?? '/tmp';
const TAG = process.env.TAG ?? 'after';
mkdirSync(OUT, { recursive: true });
const VIEW_W = Number(process.env.VIEW_W ?? 390);
const VIEW_H = Number(process.env.VIEW_H ?? 844);

const storage = new MemoryStorage();
const store = new MemoryWorldEconomyStore();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({ service, config, live: createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }) });
await new Promise<void>((done) => api.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
const guest = async () => (await (await fetch(`${base}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as {
  token: string; player: { id: string; kind: string; displayName: string | null };
};
const me = await guest();
await store.adminAdjustSeeds({ playerId: me.player.id, delta: 5000, reason: 'e2e', actorId: 'e2e', requestId: 'fund-cam', now: Date.now() });
await store.acknowledgeInvitation(me.player.id);
for (const [i, cell] of ['-2,-4', '-1,-4', '-2,-3', '1,0', '2,0', '0,1', '-8,9', '-7,9', '-8,8'].entries())
  await store.claim(me.player.id, cell, `cam-${i}`, Date.now() - (9 - i) * 60_000);

process.env.CHANNEL = 'futa04';
process.env.VITE_DUEL_API_URL = base;
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY = 'local-e2e';
const web = await createServer({
  cacheDir: `/tmp/globe-cam-vite-${(api.address() as AddressInfo).port}`,
  configFile: resolve('web/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await web.listen();
const origin = `http://127.0.0.1:${(web.httpServer!.address() as AddressInfo).port}`;

let failed = 0;
const check = (label: string, pass: boolean, note = '') => {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${note ? `  (${note})` : ''}`);
};

const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>((done) => {
  requestAnimationFrame(() => requestAnimationFrame(() => done()));
}));
/** Every path's corners in SCREEN pixels, for land (.world-hex) and fog (.world-fog). */
const drawn = (page: Page) => page.evaluate(() => {
  const svg = document.querySelector<SVGSVGElement>('.world-map-svg')!;
  const box = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const rect = svg.getBoundingClientRect();
  const k = Math.min(rect.width / box[2]!, rect.height / box[3]!);
  const ox = (rect.width - box[2]! * k) / 2, oy = (rect.height - box[3]! * k) / 2;
  const pick = (selector: string) => [...document.querySelectorAll<SVGPathElement>(selector)].map((el) => {
    const pts = [...(el.getAttribute('d') ?? '').matchAll(/(?:M|L)\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)]
      .map((m) => [rect.left + ox + (Number(m[1]) - box[0]!) * k, rect.top + oy + (Number(m[2]) - box[1]!) * k] as [number, number]);
    const ring = el.classList.contains('ring-2') ? 2 : el.classList.contains('ring-1') ? 1 : 0;
    return { id: el.getAttribute('data-cell-id') ?? '', pts, ring };
  });
  return { land: pick('.world-hex'), fog: pick('.world-fog-layer .world-fog') };
});
const panelRect = (page: Page) => page.evaluate(() => {
  const r = document.getElementById('online-world-grid')!.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
const centroid = (pts: [number, number][]) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
const area = (pts: [number, number][]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
};
/** Fog-to-land and fog-to-fog seams, between axial neighbours, for cells inside the panel. */
const fogSeams = async (page: Page) => {
  const { land, fog } = await drawn(page);
  const panel = await panelRect(page);
  const all = new Map<string, [number, number][]>();
  for (const t of [...land, ...fog]) if (t.pts.length === 6) all.set(t.id, t.pts);
  const inPanel = (pts: [number, number][]) => { const [x, y] = centroid(pts); return x > panel.left && x < panel.left + panel.width && y > panel.top && y < panel.top + panel.height; };
  let seam = 0, pairs = 0;
  for (const f of fog) {
    if (f.pts.length !== 6 || !inPanel(f.pts)) continue;
    const [q, r] = f.id.split(',').map(Number);
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) {
      const theirs = all.get(`${q! + dq},${r! + dr}`);
      if (!theirs || !inPanel(theirs)) continue;
      pairs++;
      // two shared corners per neighbour: take the two closest corner pairs
      const ds = f.pts.map((a) => Math.min(...theirs.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))).sort((a, b) => a - b);
      seam = Math.max(seam, ds[1]!);
    }
  }
  // fog geometry: no inverted, none bigger than the biggest land tile
  const landMax = Math.max(...land.filter((t) => t.pts.length === 6).map((t) => Math.abs(area(t.pts))));
  const visibleFog = fog.filter((f) => f.pts.length === 6 && inPanel(f.pts));
  const inverted = visibleFog.filter((f) => area(f.pts) <= 0).length;
  const giant = visibleFog.filter((f) => Math.abs(area(f.pts)) > landMax * 1.02).length;
  return { seam, pairs, inverted, giant, fog: visibleFog.length, rings: new Set(visibleFog.map((f) => f.ring)).size };
};
/** Drag the map by (dx, dy) screen px in `steps`, a finger's pace, optionally holding at the end. */
const drag = async (page: Page, dx: number, dy: number, steps = 20, hold = 0, release = true) => {
  const p = await panelRect(page);
  const x0 = p.cx - dx / 2, y0 = p.cy - dy / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + dx * i / steps, y0 + dy * i / steps); await page.waitForTimeout(16); }
  if (hold) await page.waitForTimeout(hold);
  if (release) await page.mouse.up();
};
const settle = async (page: Page, ms = 700) => { await page.waitForTimeout(ms); await twoFrames(page); };
const viewBox = (page: Page) => page.evaluate(() => (document.querySelector('.world-map-svg')?.getAttribute('viewBox') ?? '').split(/\s+/).map(Number));

const identity = JSON.stringify({ token: me.token, playerId: me.player.id, kind: me.player.kind, displayName: me.player.displayName });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 2, hasTouch: false });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // tsx names inner functions with a `__name` helper the page does not have (the repo's stand-in).
  await page.addInitScript('window.__name = (fn) => fn;');
  await page.addInitScript((raw) => { for (const prefix of ['', 'main2:', 'futa04:']) localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, raw); }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', eyeCandy: false, reduceMotion: false });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
  await page.waitForFunction(() => !!document.querySelector('.world-hex.mine'));
  await page.click('#menu-world');
  await page.waitForSelector('#online-world-screen:not([hidden])');
  await settle(page, 900);
  await page.screenshot({ path: `${OUT}/${TAG}-open.png` });

  // ---- 2. FOG shares the pose, MID-DRAG (the camera still moving under the finger) ----------
  await drag(page, 160, 260, 18, 0, false);          // toward the top-left coast, finger still down
  await twoFrames(page);
  const mid = await fogSeams(page);
  await page.screenshot({ path: `${OUT}/${TAG}-fog-middrag.png` });
  await page.mouse.up();
  await settle(page);
  const rest = await fogSeams(page);
  check('mid-drag: every visible fog hex shares its corners with its neighbours', mid.pairs > 0 && mid.seam < 0.5, `worst ${mid.seam.toFixed(2)}px over ${mid.pairs} pairs, ${mid.fog} fog hexes`);
  check('mid-drag: no fog hex is inverted or larger than a land tile', mid.inverted === 0 && mid.giant === 0, `inverted ${mid.inverted}, giant ${mid.giant}`);
  check('at rest: fog still shares corners', rest.pairs > 0 && rest.seam < 0.5, `worst ${rest.seam.toFixed(2)}px over ${rest.pairs} pairs`);
  check('both fog rings are on screen near the coast', mid.rings === 2 || rest.rings === 2, `rings ${Math.max(mid.rings, rest.rings)}`);

  // ---- 1. REACH: each direction's outermost tile can reach the panel centre ------------------
  const reach = async (label: string) => {
    for (const [dir, dx, dy] of [['top', 0, 1], ['bottom', 0, -1], ['left', 1, 0], ['right', -1, 0]] as const) {
      for (let i = 0; i < 14; i++) { await drag(page, dx * 320, dy * 320, 8); await page.waitForTimeout(40); }
      await settle(page, 900);
      const { land } = await drawn(page);
      const p = await panelRect(page);
      const tiles = land.filter((t) => t.pts.length === 6).map((t) => {
        const [q, r] = t.id.split(',').map(Number) as [number, number];
        const [x, y] = centroid(t.pts);
        return { id: t.id, flatX: Math.sqrt(3) * (q + r / 2), flatY: 1.5 * r, x, y };
      });
      const key = dir === 'top' ? (t: typeof tiles[0]) => t.flatY : dir === 'bottom' ? (t: typeof tiles[0]) => -t.flatY
        : dir === 'left' ? (t: typeof tiles[0]) => t.flatX : (t: typeof tiles[0]) => -t.flatX;
      const extreme = Math.min(...tiles.map(key));
      const outer = tiles.filter((t) => Math.abs(key(t) - extreme) < 0.01);
      const along = dir === 'top' || dir === 'bottom' ? (t: typeof tiles[0]) => Math.abs(t.y - p.cy) : (t: typeof tiles[0]) => Math.abs(t.x - p.cx);
      const best = outer.reduce((a, t) => (along(t) < along(a) ? t : a), outer[0]!);
      const gap = along(best);
      const cell = Math.abs(area(land.find((t) => t.id === best.id)!.pts)) ** 0.5;
      check(`${label}: the ${dir}most tile reaches the panel centre`, gap <= Math.max(12, cell * 0.6), `${best.id} is ${gap.toFixed(1)}px from the centre line (cell ~${cell.toFixed(0)}px)`);
      if (label === 'default zoom' && dir === 'top') await page.screenshot({ path: `${OUT}/${TAG}-top-limit.png` });
      if (label === 'default zoom' && dir === 'right') await page.screenshot({ path: `${OUT}/${TAG}-right-limit.png` });
    }
  };
  await reach('default zoom');
  const p = await panelRect(page);
  await page.mouse.move(p.cx, p.cy);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  await settle(page);
  await reach('zoomed in');
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); }
  await settle(page);
  await reach('zoomed out');

  // ---- 3. EDGES: soft overscroll that returns ------------------------------------------------
  for (let i = 0; i < 14; i++) { await drag(page, 0, 320, 8); await page.waitForTimeout(40); }
  await settle(page, 900);
  const limit = await viewBox(page);
  await drag(page, 0, 300, 20, 0, false);
  await twoFrames(page);
  const held = await viewBox(page);
  await page.mouse.up();
  await settle(page, 900);
  const back = await viewBox(page);
  const give = limit[1]! - held[1]!;
  check('held past the edge, the map gives way a little (resistance, not a wall)', give > 0.5 && give < limit[3]! * 0.2, `gave ${give.toFixed(2)} world units of ${limit[3]!.toFixed(0)}`);
  check('released past the edge, it returns to the limit and never sticks beyond', Math.abs(back[1]! - limit[1]!) < 0.05, `limit y ${limit[1]!.toFixed(2)}, after ${back[1]!.toFixed(2)}`);

  // ---- 4. FEEL: a flick carries; a pause stops -----------------------------------------------
  await drag(page, 0, -900, 6);                      // back toward the middle
  await settle(page, 1200);
  const beforeFlick = await viewBox(page);
  // a quick 120px flick in 5 fast moves, released at speed
  {
    const q = await panelRect(page);
    await page.mouse.move(q.cx, q.cy + 60);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.mouse.move(q.cx, q.cy + 60 - i * 24); await page.waitForTimeout(8); }
    await page.mouse.up();
  }
  await twoFrames(page);
  const atRelease = await viewBox(page);
  await settle(page, 1200);
  const afterFlick = await viewBox(page);
  const carried = afterFlick[1]! - atRelease[1]!;
  check('a flick carries on after the release and comes to rest', carried > 1, `carried ${carried.toFixed(2)} world units after the release (dragged ${(atRelease[1]! - beforeFlick[1]!).toFixed(2)})`);
  {
    const q = await panelRect(page);
    await page.mouse.move(q.cx, q.cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(q.cx + i * 6, q.cy); await page.waitForTimeout(30); }
    await page.waitForTimeout(160);
    await page.mouse.up();
  }
  const slowRelease = await viewBox(page);
  await settle(page, 900);
  const slowRest = await viewBox(page);
  check('a slow drag that pauses stops exactly where the finger left it', Math.abs(slowRest[0]! - slowRelease[0]!) < 0.01 && Math.abs(slowRest[1]! - slowRelease[1]!) < 0.01,
    `moved ${Math.hypot(slowRest[0]! - slowRelease[0]!, slowRest[1]! - slowRelease[1]!).toFixed(3)} after release`);

  // ---- 5. COST: a drag's frames at 1x and 4x CPU --------------------------------------------
  const cdp = await context.newCDPSession(page);
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.evaluate(() => {
      const w = window as unknown as { __f: number[]; __on: boolean };
      w.__f = []; w.__on = true;
      let last = performance.now();
      const loop = (t: number) => { if (!w.__on) return; w.__f.push(t - last); last = t; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await drag(page, 140, 180, 30);
    await settle(page, 300);
    const frames = await page.evaluate(() => { const w = window as unknown as { __f: number[]; __on: boolean }; w.__on = false; return w.__f.slice(2); });
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    console.log(`INFO  drag frames at ${rate}x CPU: p50 ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)}ms p95 ${p95.toFixed(1)}ms worst ${sorted.at(-1)?.toFixed(1)}ms (${frames.length} frames)`);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((done) => api.close(() => done()));
}
console.log(failed ? `${failed} globe-camera checks failed` : 'globe-camera checks passed');
process.exit(failed ? 1 : 0);
