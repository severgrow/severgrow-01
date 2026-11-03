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
    warpLive: Number(svg.dataset.warpLive ?? 0),
    viewWrites: Number(svg.dataset.viewWrites ?? 0), viewMs: Number(svg.dataset.viewMs ?? 0),
  };
});
/** Wait until the browser has painted two frames: whatever a gesture queued has landed. */
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
}));
/**
 * SAMPLE THE PRODUCT'S OWN WARP INSTRUMENT ONCE PER PAINTED FRAME. No new instrument: it reads the
 * `data-warp-*` the warp pass already publishes, and records one entry each time a pass happened,
 * plus the gap between frames (so a dropped frame is a number, not an opinion). The loop itself is
 * one rAF per frame, the same as any animation, and it is stopped after the measurement.
 */
const startProbe = (page: Page) => page.evaluate(() => {
  // tsx/esbuild names inner functions with a `__name` helper the page does not have. This is the
  // repo's usual stand-in, stated here explicitly.
  (window as unknown as { __name: (fn: unknown) => unknown }).__name = (fn: unknown) => fn;
  const w = window as unknown as { __warpProbe: { frames: number[]; warps: { ms: number; writes: number; cells: number; live: boolean }[]; stop: boolean } };
  const svg = (): SVGSVGElement | null => document.querySelector('.world-map-svg');
  w.__warpProbe = { frames: [], warps: [], stop: false };
  let last = performance.now();
  let passes = Number(svg()?.dataset.warpSettles ?? 0);
  let live = Number(svg()?.dataset.warpLive ?? 0);
  const loop = (t: number) => {
    if (w.__warpProbe.stop) return;
    w.__warpProbe.frames.push(t - last);
    last = t;
    const node = svg();
    const now = Number(node?.dataset.warpSettles ?? 0);
    if (node && now > passes) {
      const liveNow = Number(node.dataset.warpLive ?? 0);
      w.__warpProbe.warps.push({
        ms: Number(node.dataset.warpMs ?? 0),
        writes: Number(node.dataset.warpWrites ?? 0),
        cells: Number(node.dataset.warpCells ?? 0),
        live: liveNow > live,
      });
      passes = now;
      live = liveNow;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const stopProbe = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __warpProbe: { frames: number[]; warps: { ms: number; writes: number; cells: number; live: boolean }[]; stop: boolean } };
  w.__warpProbe.stop = true;
  // The first gap starts at an arbitrary moment inside a frame; the rest are real frame gaps.
  return { warps: w.__warpProbe.warps, frames: w.__warpProbe.frames.slice(1) };
});
const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!;
};
/** One tile's drawn path, so a caller can prove the geometry itself moved mid-gesture. */
const oneTilePath = (page: Page) => page.evaluate(() =>
  document.querySelector<SVGPathElement>('.world-hex[data-cell-id="0,0"]')?.getAttribute('d') ?? '');
/** The drawn path of every tile that touches the visible panel, keyed by cell id. */
const visiblePaths = (page: Page) => page.evaluate(() => {
  const grid = document.getElementById('online-world-grid')!.getBoundingClientRect();
  const out: Record<string, string> = {};
  for (const el of document.querySelectorAll<SVGPathElement>('.world-hex')) {
    const r = el.getBoundingClientRect();
    if (r.right < grid.left || r.left > grid.right || r.bottom < grid.top || r.top > grid.bottom) continue;
    out[el.getAttribute('data-cell-id') ?? ''] = el.getAttribute('d') ?? '';
  }
  return out;
});
/** The cell ids whose DRAWN hex touches the visible panel right now. */
const visibleHexIds = (page: Page) => page.evaluate(() => {
  const grid = document.getElementById('online-world-grid')!.getBoundingClientRect();
  return [...document.querySelectorAll<SVGPathElement>('.world-hex')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return !(r.right < grid.left || r.left > grid.right || r.bottom < grid.top || r.top > grid.bottom);
    })
    .map((el) => el.getAttribute('data-cell-id') ?? '');
});
/** The four numbers the camera currently shows. */
const viewBoxOf = (page: Page) => page.evaluate(() =>
  (document.querySelector<SVGSVGElement>('.world-map-svg')?.getAttribute('viewBox') ?? '').split(/\s+/).map(Number));
/**
 * EVERY drawn hex at once, in drawing coordinates: all six corners finite, a positive area (an
 * inverted tile has a negative winding) and its max/min edge ratio. This is the "no gaps, no
 * inverted tiles, no NaN" proof for a camera at the rim.
 */
const tileGeometry = (page: Page) => page.evaluate(() => {
  let count = 0, inverted = 0, finite = true, minArea = Infinity, worstRatio = 0, visibleRatio = 0, visible = 0;
  const grid = document.getElementById('online-world-grid')!.getBoundingClientRect();
  for (const el of document.querySelectorAll<SVGPathElement>('.world-hex')) {
    const points = [...(el.getAttribute('d') ?? '').matchAll(/(?:M|L)\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    if (points.length !== 6) continue;
    count++;
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) { finite = false; continue; }
    let area = 0;
    for (let i = 0; i < 6; i++) {
      const a = points[i]!, b = points[(i + 1) % 6]!;
      area += a.x * b.y - b.x * a.y;
    }
    area /= 2;
    if (area <= 0) inverted++;
    minArea = Math.min(minArea, Math.abs(area));
    const lengths = points.map((a, i) => { const b = points[(i + 1) % 6]!; return Math.hypot(b.x - a.x, b.y - a.y); });
    const ratio = Math.max(...lengths) / Math.min(...lengths);
    worstRatio = Math.max(worstRatio, ratio);
    // Only what the panel can SHOW is held to the hexagon bar: ground far beyond the window is
    // projected by the same continuous function but is never seen, and calling it a sliver says
    // nothing about the picture.
    const r = el.getBoundingClientRect();
    if (r.right < grid.left || r.left > grid.right || r.bottom < grid.top || r.top > grid.bottom) continue;
    visible++;
    visibleRatio = Math.max(visibleRatio, ratio);
  }
  return {
    count, inverted, finite, visible,
    minArea: Number.isFinite(minArea) ? minArea : 0, worstRatio, visibleRatio,
  };
});
/** Sample one tile's absolute screen rect on every painted frame, across a transition. */
const startTileTrace = (page: Page, id: string) => page.evaluate((cellId) => {
  (window as unknown as { __name: (fn: unknown) => unknown }).__name = (fn: unknown) => fn;
  const w = window as unknown as { __tileTrace: { frames: { left: number; top: number; width: number; height: number }[]; stop: boolean } };
  w.__tileTrace = { frames: [], stop: false };
  const loop = () => {
    if (w.__tileTrace.stop) return;
    const el = document.querySelector(`.world-hex[data-cell-id="${cellId}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      w.__tileTrace.frames.push({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, id);
const stopTileTrace = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __tileTrace: { frames: { left: number; top: number; width: number; height: number }[]; stop: boolean } };
  w.__tileTrace.stop = true;
  return { frames: w.__tileTrace.frames };
});
/** The worst seam between two neighbouring DRAWN hexes, in screen pixels (0 = they share corners).
 *  `only` restricts the proof to a set of cells: a live pass deliberately leaves OFF-SCREEN ground
 *  on its older pose, so a seam out there is invisible and is not what this check is about. */
const worstSeam = (page: Page, only?: Set<string>) => corners(page).then((drawn) => {
  const pointsOf = new Map(drawn);
  let seam = 0;
  let pairs = 0;
  for (const [id, mine] of pointsOf) {
    if (only && !only.has(id)) continue;
    const [q, r] = id.split(',').map(Number);
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1]] as const) {
      const theirs = pointsOf.get(`${q! + dq},${r! + dr}`);
      if (!theirs || (only && !only.has(`${q! + dq},${r! + dr}`))) continue;
      pairs++;
      const closest = Math.min(...mine.map((a) => Math.min(...theirs.map((b) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!)))));
      seam = Math.max(seam, closest);
    }
  }
  return { seam, pairs };
});
/** Press and drag ONE MOVE PER ~16 ms (a finger's pace), so each move lands in its own frame. */
const pressAndDrag = async (page: Page, moves: number, stepX: number, stepY: number, mid?: (i: number) => Promise<void>) => {
  const box = await page.locator('.world-map-svg').boundingBox();
  if (!box) return null;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= moves; i++) {
    await page.mouse.move(cx - i * stepX, cy - i * stepY);
    await page.waitForTimeout(16);
    if (mid) await mid(i);
  }
  await twoFrames(page);
  return { cx, cy };
};

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

  // ---- 3. THE BEND RIDES THE DRAG (owner, 2026-11-03) ----------------------------------
  // "it doesnt change while dragging but only when 'drag' is released - it should work smoothly
  // with no time taken and also while dragging". This used to be asserted as the OPPOSITE ("a pan
  // writes only the viewBox"), which is exactly what made the map jump at the release; the check
  // now pins the new rule on the same instrumentation.
  const beforePan = await stats(page);
  await startProbe(page);
  const midPaths: string[] = [];
  // A TRUE DIAGONAL: neither axis dominates, so a projection that only ever squashed along one
  // direction would show up here.
  await pressAndDrag(page, 18, 7, 5, async (i) => {
    if (i === 6) midPaths.push(await oneTilePath(page));
  });
  // STILL HOLDING THE MAP: everything below is measured with the finger down.
  const dragPaths = await oneTilePath(page);
  const held = await stats(page);
  const heldSeam = await worstSeam(page, new Set(await visibleHexIds(page)));
  const heldVisible = await visiblePaths(page);
  await page.mouse.up();
  // THE RELEASED FRAME, read before the 140ms margin pass can land: a release must cost NOTHING.
  const justReleased = await stats(page);
  // The release's deferred authoritative pass (and the soft-focus settle behind it) has landed.
  await page.waitForTimeout(120);
  await twoFrames(page);
  const releasedPaths = await visiblePaths(page);
  const afterPan = await stats(page);
  const probe = await stopProbe(page);
  const live = probe.warps.filter((warp) => warp.live); // the release's later full pass is not one
  const liveMs = live.map((warp) => warp.ms);
  const liveWrites = live.map((warp) => warp.writes);
  const warpsDuringDrag = held.warpLive - beforePan.warpLive;
  const viewWrites = afterPan.viewWrites - beforePan.viewWrites;
  const gap95 = percentile(probe.frames, 0.95);
  const gapMax = Math.max(0, ...probe.frames);

  // CHECK 1: the pose is re-computed DURING the drag (the bug the owner reported).
  const geometryMoved = midPaths.length === 1 && midPaths[0] !== dragPaths && !!dragPaths;
  check(`the globe is re-posed WHILE the finger is down (${warpsDuringDrag} live warps, ${viewWrites} viewBox writes, tile path moved mid-gesture: ${geometryMoved})`,
    warpsDuringDrag >= 8 && geometryMoved);
  // CHECK 2: a live warp still leaves neighbours sharing their corners exactly (no gaps), measured
  // on the bent paths while the finger is still down — and it only means anything if a live warp
  // happened in this same gesture.
  check(`a warp DURING the drag leaves neighbours sharing corners exactly (max seam ${heldSeam.seam.toFixed(3)}px over ${heldSeam.pairs} pairs, ${warpsDuringDrag} live warps)`,
    warpsDuringDrag > 0 && heldSeam.pairs > 300 && heldSeam.seam < 0.02);
  // CHECK 3: the settled frame equals the last drag frame (no drift between the two poses).
  const ids = Object.keys(heldVisible);
  const movedAtRelease = ids.filter((id) => heldVisible[id] !== releasedPaths[id]);
  check(`the release settles the SAME pose, not a second one (${movedAtRelease.length} of ${ids.length} visible tiles moved at the release)`,
    ids.length > 20 && movedAtRelease.length === 0);
  // CHECK 3b: and the released frame does not even do the WORK of a full pass. A pass may only have
  // run if the last pointermove had not been painted yet — and then it must be a LIVE pass over the
  // visible ground, never the 279-cell authoritative settle. That settle belongs 140ms later.
  const releasedPasses = justReleased.warpSettles - held.warpSettles;
  check(`the release itself runs no full pass (${releasedPasses} pass(es), ${justReleased.warpCells} cells; the full ${afterPan.warpCells}-cell margin pass lands after the camera rests)`,
    releasedPasses <= 1 && justReleased.warpCells < afterPan.warpCells && afterPan.warpCells > 200);

  console.log(`INFO drag: ${live.length} live warps over the probe — warp ${percentile(liveMs, 0.5)}ms median / ${Math.max(0, ...liveMs)}ms worst, ${percentile(liveWrites, 0.5)} writes median (${Math.max(0, ...liveWrites)} worst), ${live[0]?.cells ?? 0}-${Math.max(0, ...live.map((warp) => warp.cells))} cells; frames ${gap95.toFixed(1)}ms p95 / ${gapMax.toFixed(1)}ms worst`);
  console.log(`INFO settle after the pan: ${afterPan.warpMs}ms, ${afterPan.warpWrites} attribute writes, ${afterPan.warpCells} cells (only the margin the live passes skipped)`);

  // ---- 3b. the same drag with the CPU slowed 4x (a mid-range-phone proxy) --------------
  const cdp = await (context as unknown as { newCDPSession(page: Page): Promise<{ send(method: string, params?: unknown): Promise<unknown> }> }).newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const beforeSlow = await stats(page);
  await startProbe(page);
  await pressAndDrag(page, 12, 9, 4);
  // The finger rests before lifting: this drag moves at a flick's pace, and a flick now CARRIES
  // after the release (owner, 2026-11-03). Resting makes the release a placement, so what is
  // measured below is the release's own pose — the thing this check is about — and not the carry.
  await page.waitForTimeout(160);
  const slowHeld = await stats(page);
  const slowHeldVisible = await visiblePaths(page);
  await page.mouse.up();
  await page.waitForTimeout(260);
  await twoFrames(page);
  const slowReleased = await visiblePaths(page);
  const afterSlow = await stats(page);
  const slowProbe = await stopProbe(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const slowLive = slowProbe.warps.filter((warp) => warp.live);
  const slowMs = slowLive.map((warp) => warp.ms);
  const slowWrites = slowLive.map((warp) => warp.writes);
  const slowWarps = slowHeld.warpLive - beforeSlow.warpLive;
  const slowGap95 = percentile(slowProbe.frames, 0.95);
  const slowGapMax = Math.max(0, ...slowProbe.frames);
  const slowDrift = Object.keys(slowHeldVisible).filter((id) => slowHeldVisible[id] !== slowReleased[id]).length;
  console.log(`INFO drag at 4x CPU: ${slowWarps} live warps — warp ${percentile(slowMs, 0.5)}ms median / ${Math.max(0, ...slowMs)}ms worst, ${percentile(slowWrites, 0.5)} writes median (${Math.max(0, ...slowWrites)} worst); frames ${slowGap95.toFixed(1)}ms p95 / ${slowGapMax.toFixed(1)}ms worst`);
  console.log(`INFO settle at 4x CPU: ${afterSlow.warpMs}ms, ${afterSlow.warpWrites} attribute writes, ${afterSlow.warpCells} cells; pan ${afterSlow.viewWrites - beforeSlow.viewWrites} viewBox writes in ${(afterSlow.viewMs - beforeSlow.viewMs).toFixed(2)}ms`);
  check(`the bend still rides the drag at 4x CPU (${slowWarps} live warps, ${slowDrift} of ${Object.keys(slowHeldVisible).length} visible tiles drift at the release, worst warp ${Math.max(0, ...slowMs)}ms)`,
    slowWarps >= 6 && slowDrift === 0 && Math.max(0, ...slowMs) < 33);
  check(`a throttled drag holds ~60fps (p95 frame gap ${slowGap95.toFixed(1)}ms < 34ms; worst single frame ${slowGapMax.toFixed(1)}ms)`, slowGap95 < 34);
  check(`a settle stays cheap at 4x CPU (${afterSlow.warpMs}ms, ${afterSlow.warpWrites} writes, ${afterSlow.warpCells} cells)`, afterSlow.warpMs < 33);

  await backToMenu();

  // ---- 3c. THE EDGE OF THE WORLD: drag the camera past the settled land ------------------
  // The view centre ends outside the world's own land, where the fit box can no longer move with
  // the finger. Nothing may open a gap, invert a tile, write a NaN or unclamp the camera.
  const worldExtent = WORLD_CELLS.reduce((box, cell) => {
    const at = flatCell(cell.q, cell.r);
    return [Math.min(box[0], at.x - R), Math.min(box[1], at.y - R), Math.max(box[2], at.x + R), Math.max(box[3], at.y + R)] as const;
  }, [Infinity, Infinity, -Infinity, -Infinity] as const);
  await seedCamera(page, worldExtent[2] + 40, worldExtent[3] + 40);
  await boot();
  await openTerritory();
  const rimBefore = await stats(page);
  const rimBoxBefore = await viewBoxOf(page);
  await startProbe(page);
  await pressAndDrag(page, 10, -9, -7);
  const rimHeld = await stats(page);
  const rimGeometry = await tileGeometry(page);
  const rimSeam = await worstSeam(page, new Set(await visibleHexIds(page)));
  await page.mouse.up();
  await page.waitForTimeout(200);
  await twoFrames(page);
  const rimAfter = await stats(page);
  const rimBox = await viewBoxOf(page);
  const rimProbe = await stopProbe(page);
  const rimWarps = rimHeld.warpLive - rimBefore.warpLive;
  const finiteBox = rimBox.length === 4 && rimBox.every((n) => Number.isFinite(n)) && rimBox[2]! > 0 && rimBox[3]! > 0;
  // The camera may never leave the world's own fit box: its centre stays within the world extent
  // plus the product's PAD, however hard the finger pushes at the rim.
  const centreX = rimBox[0]! + rimBox[2]! / 2, centreY = rimBox[1]! + rimBox[3]! / 2;
  const clamped = centreX >= worldExtent[0] - 18 - 1 && centreX <= worldExtent[2] + 18 + 1 &&
    centreY >= worldExtent[1] - 18 - 1 && centreY <= worldExtent[3] + 18 + 1;
  check(`the edge of the world stays sane (viewBox ${rimBox.map((n) => n.toFixed(1)).join(' ')} finite: ${finiteBox}, centre clamped: ${clamped}, ${rimWarps} live warps, seam ${rimSeam.seam.toFixed(3)}px)`,
    finiteBox && clamped && rimWarps >= 3 && rimSeam.seam < 0.02);
  check(`no tile is inverted or empty at the rim (${rimGeometry.count} drawn hexes, smallest area ${rimGeometry.minArea.toFixed(1)}, all finite: ${rimGeometry.finite}, inverted: ${rimGeometry.inverted}; ${rimGeometry.visible} visible, worst visible edge ratio ${rimGeometry.visibleRatio.toFixed(4)})`,
    rimGeometry.count > 50 && rimGeometry.finite && rimGeometry.minArea > 0 && rimGeometry.inverted === 0 && rimGeometry.visibleRatio < 1.35);
  console.log(`INFO edge of world: ${rimProbe.warps.filter((w) => w.live).length} live warps, ${percentile(rimProbe.warps.filter((w) => w.live).map((w) => w.ms), 0.5)}ms median, frames ${percentile(rimProbe.frames, 0.95).toFixed(1)}ms p95; camera moved ${Math.hypot(rimBox[0]! - rimBoxBefore[0]!, rimBox[1]! - rimBoxBefore[1]!).toFixed(1)} world units; settles ${rimAfter.warpSettles - rimHeld.warpSettles}`);

  // ---- 3d. THE MENU -> TERRITORY OPENING: the SAME tile, frame by frame ---------------------
  // The old proof compared only before and after. The owner's complaint was a jump AT a moment, so
  // the moment itself is sampled: one tile's absolute screen rect, every painted frame, across the
  // whole transition. It may not move or resize by even a hundredth of a pixel.
  await backToMenu();
  await seedCamera(page, flatCell(-2, -4).x, flatCell(-2, -4).y);
  await boot();
  await startTileTrace(page, '0,0');
  await openTerritory();
  await page.waitForTimeout(700); // the colour-in is a full second; sample past its first half
  const trace = await stopTileTrace(page);
  const spread = trace.frames.reduce((worst, f) => Math.max(worst,
    Math.abs(f.left - trace.frames[0]!.left), Math.abs(f.top - trace.frames[0]!.top),
    Math.abs(f.width - trace.frames[0]!.width), Math.abs(f.height - trace.frames[0]!.height)), 0);
  check(`a tile does not move across the opening, sampled every frame (${trace.frames.length} frames, max ${spread.toFixed(3)}px, tile ${trace.frames[0]?.width.toFixed(2)}px wide)`,
    trace.frames.length >= 12 && spread < 0.01);
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
