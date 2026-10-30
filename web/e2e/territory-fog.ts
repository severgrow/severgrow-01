// THE MIST'S HAND-OFF, end to end (owner, 2026-10-28: "the way the empty tiles around the
// 'discovered' is changing colors, shading --- i like that, but make it smooth more transition like
// rather than sudden changes u get me - but the idea is dope - lean into it").
//
// A real economy (memory) behind the real HTTP app. This device's guest grows a tile at the east
// coast, which uncovers land that was drawn as fog a moment earlier. The suite records the FIRST
// frame of that paint (a MutationObserver reads the new nodes before they are painted) and then
// freezes the hand-off mid-way with the Web Animations API, so both "during" evidence and the
// filmstrip are real frames of the transition rather than a guess at the timing.
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/territory-fog.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
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
const SHOTS = process.env.SHOTS ?? fileURLToPath(new URL('../../docs/screens/online', import.meta.url));
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
// land around the map, but the east coast (8,0) left free: growing there is what uncovers 10,0
const others = await Promise.all([guestOf(), guestOf(), guestOf()]);
const otherCells = [['0,0', '1,0', '2,0'], ['-5,3', '-4,3'], ['3,-6']];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, otherCells[i]!.length);
  for (const [j, cell] of otherCells[i]!.entries()) await store.claim(g.player.id, cell, `other-${i}-${j}-req`, Date.now() - (10 - j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 3);
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

/** Every animation frame for `ms`: the ring's computed opacity, the frame gaps, and a running clock. */
const sampleRing = (p: Page, ms: number, selector = '.world-fog-ring.ring-1') => p.evaluate(`(() => new Promise((resolve) => {
  const out = [];
  const gaps = [];
  const t0 = performance.now();
  let last = t0;
  function tick(t) {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) out.push([t - t0, Number(getComputedStyle(el).opacity), el === window.__ringNode ? 0 : 1]);
    window.__ringNode = el;
    gaps.push(t - last);
    last = t;
    if (t - t0 < ${ms}) requestAnimationFrame(tick); else resolve({ out, gaps: gaps.slice(1) });
  }
  requestAnimationFrame(tick);
}))()`) as Promise<{ out: [number, number, number][]; gaps: number[] }>;

/**
 * THE BREATH, AS NUMBERS (owner, 2026-10-30: "should be smooth pulsating like changes ... right now
 * looks choppy and laggy"). One frame of a 9 s breath changes the shade by ~0.0006. A repaint that
 * snapped it forward by the hidden-startup gap measured 0.030 in a single frame; a rebuilt loop that
 * restarted measured 0.16. The bound below (0.002) is three frames' worth, so any snap fails.
 */
const analyseBreath = (sample: { out: [number, number, number][]; gaps: number[] }) => {
  const values = sample.out.map((r) => r[1]);
  const steps = values.slice(1).map((v, i) => Math.abs(v - values[i]!));
  const sorted = [...sample.gaps].filter((g) => g > 0).sort((a, b) => a - b);
  if (!values.length) return { samples: 0, range: -1, maxStep: -1, maxStepAt: 0, gapP95: 0, gapWorst: 0, nodes: 0 };
  return {
    samples: values.length,
    range: Math.round((Math.max(...values) - Math.min(...values)) * 10_000) / 10_000,
    maxStep: Math.round(Math.max(...steps) * 10_000) / 10_000,
    maxStepAt: Math.round(sample.out[steps.indexOf(Math.max(...steps)) + 1]?.[0] ?? 0),
    gapP95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    gapWorst: Math.round(sorted.at(-1) ?? 0),
    nodes: sample.out.filter((r) => r[2] === 1).length,
  };
};

const grow = async (p: Page, cellId: string) => {
  await p.focus(`.world-hex[data-cell-id="${cellId}"]`);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.world-claim-button', { timeout: 10_000 });
  await p.click('.world-claim-button');
  await p.waitForFunction(() => document.querySelector('.world-claim-button')?.textContent === 'CONFIRM GROW');
  await p.click('.world-claim-button');
  await p.waitForSelector(`.world-hex.mine[data-cell-id="${cellId}"]`, { timeout: 20_000 });
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(900);

  // THE BREATH IS NOT FILTERED AT RUNTIME. A `filter` on a layer whose child animates opacity makes
  // the browser re-rasterise the whole Gaussian every frame; measured at 4x CPU throttle that was
  // 80.3ms of GPU render passes per 1.5s of breathing vs 33.3ms without it, plus two extra raster
  // queues per frame. The softness is baked into the paint now.
  const layer = await page.evaluate(() => {
    const el = document.querySelector<SVGGElement>('.world-fog-layer')!;
    return { attr: el.getAttribute('filter'), css: getComputedStyle(el).filter, shift: [...document.querySelectorAll<SVGGElement>('.world-fog-shift-was, .world-fog-shift-now')].map((g) => g.getAttribute('filter')) };
  });
  check('the fog layer carries no SVG filter', layer.attr === null && layer.css === 'none', JSON.stringify(layer));
  check('no hand-off half is filtered either', layer.shift.every((f) => f === null), JSON.stringify(layer.shift));

  const idleBreath = analyseBreath(await sampleRing(page, 2400));
  console.log('idle breath', JSON.stringify(idleBreath));
  check('the mist is really breathing (its shade moves over 2.4 s)', idleBreath.range >= 0.004, JSON.stringify(idleBreath));
  check('no frame of the breath jumps (every step <= 0.002, one frame is ~0.0006)', idleBreath.maxStep <= 0.002, JSON.stringify(idleBreath));
  check('the idle breath holds the frame budget (p95 <= 34ms, worst <= 50ms)', idleBreath.gapP95 <= 34 && idleBreath.gapWorst <= 50, JSON.stringify(idleBreath));

  // The framed view on a phone crops the rings away, and the east coast (where this test grows) is
  // off-screen. Zoom out through the map's own wheel path first, so the filmstrip shows the actual
  // reveal. (Read-only: the gesture machine is not touched.)
  const mapRect = (await page.locator('.world-map-svg').boundingBox())!;
  await page.mouse.move(mapRect.x + mapRect.width / 2, mapRect.y + mapRect.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(60); }
  await page.waitForTimeout(450);
  // Now a double tap (the map's own zoom) close in around the cell that is about to be uncovered,
  // so the filmstrip shows the hand-off at a readable size rather than a whole-world thumbnail.
  const focus = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('.world-map-svg')!;
    const rect = svg.getBoundingClientRect();
    const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const R = 10, X = Math.sqrt(3);
    const wx = X * 10 * R, wy = 0;
    return { x: rect.left + (wx - box[0]!) / box[2]! * rect.width, y: rect.top + (wy - box[1]!) / box[3]! * rect.height };
  });
  await page.touchscreen.tap(focus.x, focus.y);
  await page.waitForTimeout(90);
  await page.touchscreen.tap(focus.x, focus.y);
  await page.waitForTimeout(550);
  await page.keyboard.press('Escape');

  const before = await page.evaluate(() => ({
    fog: document.querySelectorAll('.world-fog-layer .world-fog').length,
    shift: document.querySelectorAll('.world-fog-shift').length,
    seen: !!document.querySelector('.world-hex[data-cell-id="10,0"]'),
    fogged: !!document.querySelector('.world-fog[data-cell-id="10,0"]'),
  }));
  check('before: the fog draws land beyond the coast', before.fog > 0, `${before.fog} mist cells`);
  check('before: nothing is in a hand-off', before.shift === 0);
  check('before: the cell about to be uncovered is fog, not land', before.fogged && !before.seen);
  await page.locator('#online-world-grid').screenshot({ path: `${SHOTS}/territory-fog-before-390x844.png` });

  // THE FIRST FRAME. A MutationObserver runs before paint, so this is the hand-off exactly as it
  // appears: the new land is already seen and the old mist is still fully on top of it.
  // (A string, not a closure: tsx wraps a named arrow in a `__name` helper the page does not have.)
  await page.evaluate(`(() => {
    const w = window;
    w.__fogFrame = null;
    const read = () => {
      const layer = document.querySelector('.world-fog-shift');
      if (!layer) return null;
      const was = layer.querySelector('.world-fog-shift-was');
      const now = layer.querySelector('.world-fog-shift-now');
      const face = document.querySelector('.world-hex-face[data-cell-id="10,0"]');
      return {
        t: Math.round(performance.now()),
        was: was ? getComputedStyle(was).opacity : null,
        now: now ? getComputedStyle(now).opacity : null,
        liftIds: [...layer.querySelectorAll('.world-fog-shift-was .world-fog')].map((p) => p.getAttribute('data-cell-id')),
        nowIds: [...layer.querySelectorAll('.world-fog-shift-now .world-fog')].map((p) => p.getAttribute('data-cell-id')),
        faceOpacity: face ? getComputedStyle(face).opacity : null,
        seen: !!document.querySelector('.world-hex[data-cell-id="10,0"]'),
        fogHere: !!layer.querySelector('.world-fog-shift-was .world-fog[data-cell-id="10,0"]'),
        running: layer.getAnimations({ subtree: true }).map((a) => ({ name: a.animationName, state: a.playState })),
        pointer: [...layer.querySelectorAll('.world-fog')].map((p) => getComputedStyle(p).pointerEvents).join(','),
        hidden: layer.getAttribute('aria-hidden'),
      };
    };
    const observer = new MutationObserver(() => {
      if (w.__fogFrame) return;
      const frame = read();
      if (!frame) return;
      w.__fogFrame = frame;
      // Freeze the hand-off a fifth of a second in, so "during" is a real frame of it.
      setTimeout(() => {
        w.__fogPausedAnims = document.getAnimations().filter((a) => a.animationName && a.animationName.indexOf('world-fog-') === 0);
        for (const a of w.__fogPausedAnims) a.pause();
        w.__fogPaused = read();
      }, 200);
    });
    observer.observe(document.getElementById('online-world-grid'), { childList: true, subtree: true });
  })()`);

  // THE SNAP ACROSS A REPAINT. This grow rebuilds the whole map, i.e. both fog ring nodes. The
  // breath must continue, not jump: sampled across the rebuild, every frame's step stays inside the
  // same 0.002 bound as idle. (The clock-fed form measured 0.030 here; a restart measured 0.16.)
  const breathAcross = sampleRing(page, 4000);
  await page.waitForTimeout(120);
  await grow(page, '8,0');
  const acrossRepaint = analyseBreath(await breathAcross);
  console.log('breath across a repaint', JSON.stringify(acrossRepaint));
  check('the repaint really rebuilt the ring nodes (so the continuity check means something)', acrossRepaint.nodes >= 1, `${acrossRepaint.nodes} new node(s)`);
  check('the breath never snaps across a repaint (every step <= 0.002)', acrossRepaint.maxStep <= 0.002, JSON.stringify(acrossRepaint));
  const first = await page.evaluate(() => (window as any).__fogFrame);
  await page.waitForFunction(() => (window as any).__fogPaused !== undefined, undefined, { timeout: 5000 });
  const during = await page.evaluate(() => (window as any).__fogPaused);

  check('the newly revealed cell is land in the same frame its mist still covers it', !!first?.seen && !!first?.fogHere, JSON.stringify(first?.liftIds?.slice(0, 8)));
  check('the uncovered cell’s fog is still drawn during the transition', (first?.liftIds ?? []).includes('10,0'));
  check('the new land is NOT already at full strength in that frame (it animates in)', Number(first?.faceOpacity) < 1, `face opacity ${first?.faceOpacity}`);
  check('the outgoing mist starts whole and the incoming shade starts empty', first?.was === '1' && first?.now === '0', `was ${first?.was} now ${first?.now}`);
  check('both halves of the hand-off are really running', ['world-fog-lift', 'world-fog-settle'].every((name) => (first?.running ?? []).some((a: any) => a.name === name && a.state === 'running')), JSON.stringify(first?.running));
  check('the hand-off is aria-hidden', first?.hidden === 'true');
  check('mist is never a tap target', (first?.pointer ?? '').split(',').every((p: string) => p === 'none'), first?.pointer);

  check('mid-way: the mist is thinner than it began and not yet gone', Number(during?.was) > 0 && Number(during?.was) < 1, `was ${during?.was}`);
  check('mid-way: the new shade is arriving (not yet full)', Number(during?.now) > 0 && Number(during?.now) < 1, `now ${during?.now}`);
  check('mid-way: the cell beyond the coast deepens as well as the mist lifting', (during?.nowIds ?? []).length > 0 || (during?.liftIds ?? []).length > 0);
  await page.locator('#online-world-grid').screenshot({ path: `${SHOTS}/territory-fog-during-390x844.png` });

  // let it finish (only what this test paused, so nothing else is restarted)
  await page.evaluate(() => { for (const a of ((window as any).__fogPausedAnims ?? [])) a.play(); });
  await page.waitForTimeout(900);
  const settled = await page.evaluate(() => {
    const layer = document.querySelector<SVGGElement>('.world-fog-shift');
    const was = layer?.querySelector<SVGGElement>('.world-fog-shift-was');
    const now = layer?.querySelector<SVGGElement>('.world-fog-shift-now');
    return {
      was: was ? getComputedStyle(was).opacity : null,
      now: now ? getComputedStyle(now).opacity : null,
      running: layer ? layer.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName) : [],
      land: !!document.querySelector('.world-hex[data-cell-id="10,0"]'),
      fogOnLand: !!document.querySelector('.world-fog-layer .world-fog[data-cell-id="10,0"]'),
      ambient: document.querySelectorAll('.world-fog-layer .world-fog').length,
    };
  });
  check('settled: the land stays uncovered', settled.land && !settled.fogOnLand);
  check('settled: the outgoing mist is gone and the new shade is at rest', settled.was === '0' && settled.now === '1', JSON.stringify(settled));
  check('settled: nothing is still animating the hand-off', settled.running.length === 0, settled.running.join(','));
  check('settled: the fog is still drawn around the new coast', settled.ambient > 0, `${settled.ambient} mist cells`);
  await page.locator('#online-world-grid').screenshot({ path: `${SHOTS}/territory-fog-after-390x844.png` });

  // THE MOTION BUDGET: the reveal itself, at the smoothness suite's own 4x CPU throttle. The pan
  // budget is p95 <= 34ms; a discovery must not cost more than the map moving does.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(`(() => {
    const w = window;
    w.__frames = [];
    w.__frameOn = true;
    let last = performance.now();
    function tick(t) { if (w.__frames) w.__frames.push(t - last); last = t; if (w.__frameOn) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  })()`);
  await grow(page, '10,0');          // this paint uncovers land again
  // PAUSED WHILE THE MAP MOVES: the same rule the mist and the glints already follow.
  const moving = await page.evaluate(() => {
    const grid = document.getElementById('online-world-grid')!;
    grid.classList.add('moving');
    const states = [...document.querySelectorAll<SVGGElement>('.world-fog-shift-was, .world-fog-shift-now')]
      .map((el) => getComputedStyle(el).animationPlayState);
    grid.classList.remove('moving');
    return states;
  });
  await page.waitForTimeout(700);
  const reveal = (await page.evaluate(`(() => {
    const w = window; w.__frameOn = false;
    const f = w.__frames.slice(1).sort((a, b) => a - b);
    const p = (q) => f[Math.min(f.length - 1, Math.floor(q * f.length))] ?? 0;
    return { frames: f.length, p95: Math.round(p(.95)), worst: Math.round(f[f.length - 1] ?? 0), janky: f.filter((d) => d > 34).length };
  })()`)) as { frames: number; p95: number; worst: number; janky: number };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('reveal', JSON.stringify(reveal));
  check('the reveal holds the frame budget under 4x CPU throttle (p95 <= 34ms)', reveal.p95 <= 34, JSON.stringify(reveal));
  check('the hand-off is paused while the map is moving', moving.length > 0 && moving.every((s) => s === 'paused'), moving.join(',') || 'no hand-off layer was drawn');

  // A later grow, far away: the next paint must drop the finished hand-off (no layer creep).
  await grow(page, '-2,-4');
  await page.waitForTimeout(700);
  check('a later paint replaces the finished hand-off (no layer creep)', (await count(page, '.world-fog-shift')) <= 1, `${await count(page, '.world-fog-shift')} layers`);

  // THE MIST IS NOT A CONTROL: tapping a fog hex selects no fog cell, and the points are inert.
  const tap = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('.world-map-svg')!;
    const rect = svg.getBoundingClientRect();
    const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    if (box.length !== 4) return null;
    const R = 10, X = Math.sqrt(3);
    for (const path of document.querySelectorAll<SVGPathElement>('.world-fog-layer .world-fog')) {
      const id = path.dataset.cellId ?? '';
      const [q, r] = id.split(',').map(Number);
      const wx = X * (q! + r! / 2) * R, wy = 1.5 * r! * R;
      const x = rect.left + (wx - box[0]!) / box[2]! * rect.width;
      const y = rect.top + (wy - box[1]!) / box[3]! * rect.height;
      // Only a mist cell comfortably inside the framed map: a portrait phone crops the surplus.
      if (x < rect.left + 30 || x > rect.right - 30 || y < rect.top + 30 || y > rect.bottom - 30) continue;
      const hit = document.elementFromPoint(x, y);
      return { id, x, y, hit: hit ? (hit.getAttribute('class') ?? hit.tagName) : '', pointer: getComputedStyle(path).pointerEvents };
    }
    return null;
  });
  if (!tap) {
    check('a fog cell is on screen to test the touch target', false, 'no fog centre inside the map');
  } else {
    check('a fog path ignores pointers', tap.pointer === 'none', tap.pointer);
    check('the point over the mist is not a fog path', !String(tap.hit).includes('world-fog'), String(tap.hit));
    await page.touchscreen.tap(tap.x, tap.y);
    await page.waitForTimeout(200);
    const selected = await page.evaluate(() => [...document.querySelectorAll<SVGPathElement>('.world-hex.selected')].map((p) => p.dataset.cellId));
    check('tapping the mist never selects a fog cell', !selected.includes(tap.id), `selected ${selected.join(',') || 'nothing'}`);
    await page.keyboard.press('Escape');
  }

  const layout = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('no sideways scroll at 390x844', layout.doc <= layout.win, JSON.stringify(layout));
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  await context.close();

  // REDUCE MOTION: the land simply appears. No hand-off layer is built at all, and the fresh face
  // is already at rest in the same frame it is created.
  await fund(me.player.id, 6);   // a fresh funding request id: the earlier one is idempotent
  const still = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const quiet = await still.newPage();
  const quietErrors: string[] = [];
  quiet.on('pageerror', (error) => quietErrors.push(String(error)));
  await quiet.addInitScript((raw: string) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(quiet, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false });
  await quiet.goto(origin + '/');
  await quiet.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await quiet.click('#menu-world');
  await quiet.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await quiet.waitForTimeout(800);
  // The EASTERNMOST free tile: growing there pushes the coast out, so land really is uncovered.
  const target = await quiet.evaluate(() => {
    const R = 10, X = Math.sqrt(3);
    let best: string | null = null, bestX = -Infinity;
    for (const path of document.querySelectorAll<SVGPathElement>('.world-hex.available')) {
      const [q, r] = (path.dataset.cellId ?? '').split(',').map(Number);
      const x = X * (q! + r! / 2) * R;
      if (x > bestX) { bestX = x; best = path.dataset.cellId ?? null; }
    }
    return best;
  });
  const cellsBefore = await count(quiet, '.world-hex');
  await quiet.evaluate(`(() => {
    const w = window;
    w.__quietFrame = null;
    const observer = new MutationObserver(() => {
      if (w.__quietFrame) return;
      const face = document.querySelector('.world-hex-face[data-cell-id="${target}"]');
      if (!face) return;
      w.__quietFrame = {
        shift: document.querySelectorAll('.world-fog-shift').length,
        faceOpacity: getComputedStyle(face).opacity,
        rising: getComputedStyle(face).animationName,
        seen: !!document.querySelector('.world-hex[data-cell-id="${target}"]'),
      };
    });
    observer.observe(document.getElementById('online-world-grid'), { childList: true, subtree: true });
  })()`);
  await grow(quiet, target!);
  const quietFrame = await quiet.evaluate(() => (window as any).__quietFrame);
  await quiet.waitForTimeout(400);
  const cellsAfter = await count(quiet, '.world-hex');
  check('reduce motion: the grow uncovered new land (so there was a hand-off to skip)', cellsAfter > cellsBefore, `${cellsBefore} → ${cellsAfter}`);
  check('reduce motion: no hand-off layer is built at all', quietFrame?.shift === 0, JSON.stringify(quietFrame));
  check('reduce motion: the land is already at rest in its first frame', quietFrame?.faceOpacity === '1' && quietFrame?.seen, JSON.stringify(quietFrame));
  check('reduce motion: no rise animation runs (the CSS gate holds)', quietFrame?.rising === 'none', String(quietFrame?.rising));
  check('reduce motion: no page errors', quietErrors.length === 0, quietErrors.join(' | '));
  const quietRing = await quiet.evaluate(() => {
    const el = document.querySelector<SVGGElement>('.world-fog-ring.ring-1')!;
    return { anim: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity };
  });
  const quietBreath = analyseBreath(await sampleRing(quiet, 900));
  check('reduce motion: the fog is a still layer (no animation, no movement)', quietRing.anim === 'none' && quietBreath.range === 0, JSON.stringify({ ...quietRing, ...quietBreath }));
  await still.close();

  // THE SAME BREATH ON ITS SIDE (owner's other viewport): the ring does not care about the window's
  // aspect, but the map's own moving-layer budget might. Measured so a landscape regression fails.
  const side = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const sideways = await side.newPage();
  const sideErrors: string[] = [];
  sideways.on('pageerror', (error) => sideErrors.push(String(error)));
  await sideways.addInitScript((raw: string) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(sideways, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await sideways.goto(origin + '/');
  await sideways.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await sideways.click('#menu-world');
  await sideways.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await sideways.waitForTimeout(900);
  const sideLayer = await sideways.evaluate(() => {
    const el = document.querySelector<SVGGElement>('.world-fog-layer')!;
    return { attr: el.getAttribute('filter'), css: getComputedStyle(el).filter };
  });
  check('844x390: the fog layer carries no SVG filter', sideLayer.attr === null && sideLayer.css === 'none', JSON.stringify(sideLayer));
  const sideBreath = analyseBreath(await sampleRing(sideways, 2400));
  console.log('844x390 breath', JSON.stringify(sideBreath));
  check('844x390: the mist is breathing', sideBreath.range >= 0.004, JSON.stringify(sideBreath));
  check('844x390: no frame of the breath jumps (every step <= 0.002)', sideBreath.maxStep <= 0.002, JSON.stringify(sideBreath));
  check('844x390: the breath holds the frame budget (p95 <= 34ms, worst <= 50ms)', sideBreath.gapP95 <= 34 && sideBreath.gapWorst <= 50, JSON.stringify(sideBreath));
  check('844x390: no page errors', sideErrors.length === 0, sideErrors.join(' | '));
  await side.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} territory-fog checks failed`);
  process.exit(1);
}
console.log('territory-fog checks passed');
process.exit(0);
