// THE TERRITORY PREP PASS (owner, 2026-10-29):
//
//   1. "the 'out of map' territory animation is too fast and too jumpy - a bit slower, way smoother,
//      without costing much CPU at all". The glide to a tile or a player is measured here in the
//      BUILT app: how long it really takes, where it is half-way through, whether the last frame
//      lands exactly on target (a second glide to the same place moves nothing), what a re-target
//      mid-flight does (it must continue from the current pixel), that Reduce motion still arrives
//      at once, and that its frames are no more expensive than a pan's at 4x CPU on a phone.
//
//   2. "in 'paused' menu or any similar there should be no orphaned single button that's half the
//      width of regular button". A table of every row that can lose a child to `[hidden]`, each
//      rendered at 320x568, 390x844 and 1280x800, hiding children the way the app itself does
//      (the same `hidden` writes main.ts / live/ui.ts / daily/mount.ts perform). A lone visible
//      control must span its row within 1px; two visible controls must split it evenly.
//
// A real economy (memory) behind the real HTTP app; the product build points at it. The suite builds
// its own dist, so never run it with SKIP_BUILD=1 against a dist built for another API.
//
//   PW_CHROMIUM=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome npx tsx web/e2e/territory-prep.ts
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
import { createTerritoryChatRouter, memoryTerritoryChatStore } from '../../server/src/chat/territory.js';
import { seedSeen, seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SKIP_BUILD = process.env.SKIP_BUILD === '1';
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
// Three rivals, one of them beside this device's own tile: a ranking to glide through, and a tile
// that offers CHALLENGE.
const others = await Promise.all([guestOf(), guestOf(), guestOf()]);
const otherCells = [['0,0', '1,0', '2,0', '-3,2', '-4,2'], ['-5,3', '-4,3', '-5,4'], ['3,-6', '4,-6', '-1,-4']];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, otherCells[i]!.length);
  for (const [j, cell] of otherCells[i]!.entries()) await store.claim(g.player.id, cell, `other-${i}-${j}-req`, Date.now() - (10 - j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 3);
await store.claim(me.player.id, '-2,-4', 'prep-owned-fixture', Date.now());
await store.acknowledgeInvitation(me.player.id);
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind });

if (!SKIP_BUILD) await new Promise<void>((resolve, reject) => {
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

type Box = number[];
type Frame = { t: number; b: Box };
type Glide = {
  from: Box; to: Box; duration: number; samples: number;
  midpointFraction: number; maxFrameTravel: number; firstFrameTravel: number;
  total: number; changes: number;
};

/** A glide read from the one attribute the view actually writes: the svg's `viewBox`. */
const analyse = (frames: Frame[]): Glide => {
  const moved = frames.filter((f, i) => i > 0 && f.b.join(' ') !== frames[i - 1]!.b.join(' '));
  const from = (frames[0]!.b.length === 4 ? frames[0]!.b : moved[0]!.b) as Box;
  const to = (moved.at(-1)?.b ?? from) as Box;
  const start = moved[0]?.t ?? 0;
  const end = moved.at(-1)?.t ?? start;
  const duration = Math.round(end - start);
  const half = start + (end - start) / 2;
  const nearest = moved.reduce((best, f) => (Math.abs(f.t - half) < Math.abs(best.t - half) ? f : best), moved[0]!);
  // Travel is measured on the axis that moved the most (a diagonal glide is one gesture).
  const axis = [0, 1].sort((a, b) => Math.abs(to[b]! - from[b]!) - Math.abs(to[a]! - from[a]!))[0]!;
  const total = Math.abs(to[axis]! - from[axis]!);
  const travelled = (b: Box) => Math.abs(b[axis]! - from[axis]!);
  let maxFrameTravel = 0, firstFrameTravel = 0;
  let previous = from;
  for (const f of moved) {
    const step = Math.abs(f.b[axis]! - previous[axis]!);
    if (maxFrameTravel === 0 && step > 0) firstFrameTravel = step;
    maxFrameTravel = Math.max(maxFrameTravel, step);
    previous = f.b;
  }
  return {
    from, to, duration, samples: moved.length, changes: moved.length,
    midpointFraction: total > 0 ? +(travelled(nearest.b) / total).toFixed(3) : 0,
    maxFrameTravel: Math.round(maxFrameTravel), firstFrameTravel: Math.round(firstFrameTravel),
    total: Math.round(total),
  };
};

// ===== 2. THE ROWS' IN-PAGE HALF =============================================================
// Kept as a STRING: tsx's keepNames transform would otherwise wrap every arrow inside a function
// passed to `page.evaluate` in a `__name` helper the page does not have.
const MEASURE = `(setup) => {
  const $ = function (id) { return document.getElementById(id); };
  const sheetIds = ['sheet-menu', 'gameover', 'sheet-settings', 'sheet-tutorial', 'sheet-daily', 'online-matched', 'install-prompt', 'online-hub'];
  for (const id of sheetIds) { const el = $(id); if (el) el.hidden = true; }
  const stale = document.querySelector('#gm-leave-live'); if (stale) stale.remove();
  document.documentElement.classList.remove('live-on');
  const gmNew = $('gm-new'), gmMain = $('gm-main'), resign = $('gm-resign'), exit = $('gm-exit-tutorial'), history = $('gm-history');
  gmNew.hidden = false; gmMain.hidden = false; resign.hidden = true; exit.hidden = true; history.hidden = false;
  const liveKey = function () {
    const b = document.createElement('button');
    b.id = 'gm-leave-live'; b.className = 'btn ghost gm-act'; b.textContent = 'Leave live';
    resign.parentElement.insertBefore(b, resign);
    return b;
  };
  switch (setup) {
    case 'pause-pair-duel':
      // main.ts: restart.hidden = isOnlineDuel(); Resign appears in the row below.
      $('sheet-menu').hidden = false; gmNew.hidden = true; break;
    case 'pause-pair-empty':
      // live-on: main.ts hides Restart (duel) AND Main menu (real-time duel).
      $('sheet-menu').hidden = false; gmNew.hidden = true; gmMain.hidden = true; break;
    case 'pause-acts-one':
      $('sheet-menu').hidden = false; gmNew.hidden = true; gmMain.hidden = true; resign.hidden = false; break;
    case 'pause-acts-live-one':
      // live/ui.ts mountLeaveItem: Leave live only, Resign absent from this match's row.
      $('sheet-menu').hidden = false; gmNew.hidden = true; gmMain.hidden = true; liveKey().hidden = false; break;
    case 'pause-acts-two':
      $('sheet-menu').hidden = false; gmNew.hidden = true; gmMain.hidden = true; resign.hidden = false; liveKey().hidden = false; break;
    case 'pause-leads-one':
      // syncTutorialMenuExit: exit hidden outside a lesson, Resume is the only lead.
      $('sheet-menu').hidden = false; gmNew.hidden = false; break;
    case 'pause-leads-two':
      $('sheet-menu').hidden = false; exit.hidden = false; gmNew.hidden = true; break;
    case 'pause-tools-three':
      $('sheet-menu').hidden = false; history.hidden = true; break;
    case 'pause-tools-four':
      $('sheet-menu').hidden = false; break;
    case 'gameover-buttons':
      // The card as an offline game leaves it: Play again / the other key / Board, the two quiet
      // links under them, and the disclosure's extras still folded away.
      $('gameover').hidden = false; break;
    case 'gameover-review-one':
      // main.ts openReview: go-review-show.hidden = !p (no better move to show).
      $('gameover').hidden = false;
      $('go-review-face').hidden = false;
      $('go-review-show').hidden = true; break;
    case 'gameover-review-two':
      $('gameover').hidden = false;
      $('go-review-face').hidden = false;
      $('go-review-show').hidden = false; break;
    case 'daily-two':
      // daily/mount.ts paint: the row is emptied and refilled with this state's keys.
      $('sheet-daily').hidden = false;
      var daily = $('daily-actions'); daily.replaceChildren();
      for (const label of ['Play', 'Share']) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = label; daily.append(b);
      }
      break;
    case 'settings-one':
      // The Tutorial entry is the only direct BUTTON child of the settings body; it must fill the
      // column like every other settings key.
      $('sheet-settings').hidden = false; $('settings-tutorial').hidden = false; break;
    case 'matched':
      $('online-matched').hidden = false; break;
    case 'install':
      $('install-prompt').hidden = false; break;
    case 'lobby':
      // main.ts hides Find opponent when this build has no search pool.
      $('online-hub').hidden = false; $('online-find').hidden = true; break;
  }
  const rows = [];
  const add = function (sel, name, buttonsOnly) { rows.push({ sel: sel, name: name, buttonsOnly: !!buttonsOnly }); };
  if (setup.indexOf('pause-pair') === 0) add('#sheet-menu .gm-pair', 'gm-pair');
  if (setup.indexOf('pause-acts') === 0) add('#sheet-menu .gm-acts', 'gm-acts');
  if (setup.indexOf('pause-leads') === 0) add('#sheet-menu .gm-leads', 'gm-leads');
  if (setup.indexOf('pause-tools') === 0) add('#sheet-menu .gm-tools', 'gm-tools');
  if (setup === 'gameover-buttons') add('#gameover .go-buttons', 'go-buttons', true);
  if (setup.indexOf('gameover-review') === 0) add('#gameover .go-review-keys', 'go-review-keys');
  if (setup === 'daily-two') add('#daily-actions', 'daily-actions', true);
  if (setup === 'settings-one') add('#sheet-settings .sheet-body', 'settings-body', true);
  if (setup === 'matched') add('#online-matched .online-actions', 'online-actions', true);
  if (setup === 'install') add('#install-prompt .sheet-body', 'install-body', true);
  if (setup === 'lobby') add('#online-hub .menu-buttons', 'lobby-actions', true);
  return rows.map(function (entry) {
    const row = document.querySelector(entry.sel);
    const r = row.getBoundingClientRect();
    const kids = [].slice.call(row.children).filter(function (c) {
      if (c.hidden || getComputedStyle(c).display === 'none') return false;
      if (entry.buttonsOnly && c.tagName !== 'BUTTON') return false;
      return c.getBoundingClientRect().width > 0;
    });
    return {
      row: entry.name, rowW: +r.width.toFixed(1), rowH: +r.height.toFixed(1),
      visible: kids.map(function (c) { return { id: c.id || c.className, w: +c.getBoundingClientRect().width.toFixed(1), link: c.classList.contains('link') }; }),
    };
  });
}`;

type Measured = { row: string; rowW: number; rowH: number; visible: { id: string; w: number; link: boolean }[] };
const measure = (p: Page, setup: string): Promise<Measured[]> =>
  p.evaluate(`(${MEASURE})(${JSON.stringify(setup)})`) as Promise<Measured[]>;

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  // ===== 1. THE GLIDE, in the built app, at 4x CPU on a phone ================================
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  // The menu key is only tappable once the column has laid out; a press swallowed by the column's
  // arrival is retried ONCE (a retry while the map is open would press a hidden key).
  await page.waitForSelector('#menu-world', { state: 'visible', timeout: 20_000 });
  await page.click('#menu-world');
  if (await page.isHidden('#online-world-screen')) {
    await page.waitForTimeout(300);
    await page.click('#menu-world');
  }
  await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
  await page.waitForSelector('.world-hex', { timeout: 20_000 });
  // `available` needs a wallet read (a free tile is offered only once its price can be paid), so a
  // dead API shows a map with no available tile — say that plainly instead of timing out vaguely.
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 })
    .catch(() => { throw new Error('no available tile: this dist is not talking to this run API (rebuild without SKIP_BUILD)'); });
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Every frame, the viewBox and its own timestamp. (Strings, not closures: tsx would wrap a
  // named arrow inside them in a helper the page does not have.)
  const startTrace = () => page.evaluate(`(() => {
    const svg = document.querySelector('.world-map-svg');
    const w = window;
    w.__trace = [];
    w.__traceOn = true;
    const read = () => (svg.getAttribute('viewBox') || '').split(' ').map(Number);
    w.__trace.push({ t: performance.now(), b: read() });
    function tick(t) { w.__trace.push({ t: t, b: read() }); if (w.__traceOn) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  })()`);
  const stopTrace = async (): Promise<Frame[]> => page.evaluate(`(() => { window.__traceOn = false; return window.__trace; })()`) as Promise<Frame[]>;

  // Frame timing (the same probe territory-smooth.ts uses for a pan).
  const startFrames = () => page.evaluate(`(() => {
    const w = window;
    w.__frames = []; w.__long = 0; let last = performance.now(); w.__frameOn = true;
    function tick(t) { w.__frames.push(t - last); last = t; if (w.__frameOn) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long += e.duration; }).observe({ type: 'longtask', buffered: false }); } catch {}
  })()`);
  const stopFrames = () => page.evaluate(`(() => {
    const w = window; w.__frameOn = false;
    const f = w.__frames.slice(1).sort((a, b) => a - b);
    function p(q) { return f[Math.min(f.length - 1, Math.floor(q * f.length))] ?? 0; }
    return { frames: f.length, p50: Math.round(p(.5)), p95: Math.round(p(.95)), worst: Math.round(f[f.length - 1] ?? 0), janky: f.filter((d) => d > 34).length, longTaskMs: Math.round(w.__long) };
  })()`) as Promise<{ frames: number; p50: number; p95: number; worst: number; janky: number; longTaskMs: number }>;

  const openRanking = async () => {
    // The key row folds itself shut after a row is used, and MENU sits over it while it rolls in:
    // wait for the row to be OPEN before pressing a key inside it.
    const rowOpen = await page.evaluate(() => document.getElementById('online-world-keys')!.classList.contains('open'));
    if (!rowOpen) {
      await page.click('#online-world-menu');
      await page.waitForFunction(() => document.getElementById('online-world-keys')!.classList.contains('open'));
      await page.waitForTimeout(260);
    }
    if (await page.isHidden('#online-world-panel')) await page.click('#world-key-ranking');
    await page.waitForSelector('#online-world-panel:not([hidden])');
    await page.waitForSelector('.world-ranking-row');
  };
  const viewBox = () => page.getAttribute('.world-map-svg', 'viewBox');

  // ---- one glide ------------------------------------------------------------------------------
  await openRanking();
  await startTrace();
  await startFrames();
  await page.locator('.world-ranking-row').nth(1).click();
  await page.waitForTimeout(1100);
  const framesDuringGlide = await stopFrames();
  const glide = analyse(await stopTrace());
  console.log('glide', JSON.stringify(glide), 'frames', JSON.stringify(framesDuringGlide));

  check('the glide takes the new breath (520–620ms)', glide.duration >= 500 && glide.duration <= 640, `${glide.duration}ms`);
  check('…and is half-way through at half-time (the old curve was 0.875)',
    glide.midpointFraction >= 0.4 && glide.midpointFraction <= 0.6, `travelled ${glide.midpointFraction} at t=0.5`);
  check('it leaves gently — no snap on the first frame',
    glide.firstFrameTravel <= Math.max(2, glide.total * 0.08), `first frame ${glide.firstFrameTravel} of ${glide.total}`);
  check('no frame jumps either', glide.maxFrameTravel <= Math.max(3, glide.total * 0.12), `worst frame ${glide.maxFrameTravel} of ${glide.total}`);
  check('it moves on many frames, not two', glide.samples >= 12, `${glide.samples} moving frames`);
  check('it lands exactly on target (a second glide to the same place moves nothing)', await (async () => {
    const landed = await viewBox();
    await openRanking();
    await page.locator('.world-ranking-row').nth(1).click();
    await page.waitForTimeout(900);
    return (await viewBox()) === landed;
  })(), `${glide.to.join(' ')}`);
  check('a glide costs no more than a pan on a phone (p95 ≤ 34ms at 4x CPU)',
    framesDuringGlide.p95 <= 34, `glide p50 ${framesDuringGlide.p50}ms p95 ${framesDuringGlide.p95}ms worst ${framesDuringGlide.worst}ms long ${framesDuringGlide.longTaskMs}ms`);

  // ---- a second tap mid-flight: continue from the current pixel, never jump --------------------
  // The only way a player re-targets is MENU → RANKING → another row while the camera is still
  // moving (using a row closes its window, but not the key row). So the target of a solo glide is
  // learned first, then that same move is interrupted and sent somewhere else.
  await openRanking();
  await page.locator('.world-ranking-row').nth(0).click();
  await page.waitForTimeout(900);
  const target0 = await viewBox();
  // Sit back where the first measurement left the camera, so the next move is a real one.
  await openRanking();
  await page.locator('.world-ranking-row').nth(1).click();
  await page.waitForTimeout(900);
  await openRanking();
  await page.waitForTimeout(200);
  const startBox = await viewBox();
  await startTrace();
  await page.locator('.world-ranking-row').nth(0).click();
  await page.waitForTimeout(120);
  const beforeRetarget = await viewBox();
  await page.click('#world-key-ranking', { timeout: 5_000 });
  await page.waitForSelector('#online-world-panel:not([hidden])', { timeout: 5_000 });
  await page.locator('.world-ranking-row').nth(2).click();
  await page.waitForTimeout(1100);
  const retargetFrames = await stopTrace();
  const retarget = analyse(retargetFrames);
  const worstRetarget = retarget.maxFrameTravel;
  console.log('retarget', JSON.stringify(retarget), `mid-flight at ${beforeRetarget} (start ${startBox}, row-0 target ${target0})`);
  check('the re-target really happened mid-flight', beforeRetarget !== target0 && beforeRetarget !== startBox && retarget.to.join(' ') !== target0, `${beforeRetarget}`);
  check('a re-target mid-flight never jumps',
    worstRetarget <= Math.max(3, glide.total * 0.2), `worst frame ${worstRetarget} (a single glide tops out at ${glide.maxFrameTravel} of ${glide.total})`);
  const settleA = await viewBox();
  await page.waitForTimeout(400);
  check('…and then rests where it was sent', (await viewBox()) === settleA);

  // ---- Reduce motion still arrives at once ----------------------------------------------------
  await openRanking();
  await page.evaluate(() => document.documentElement.classList.add('reduce-motion'));
  await startTrace();
  await page.locator('.world-ranking-row').nth(1).click();
  await page.waitForTimeout(400);
  const instant = analyse(await stopTrace());
  await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'));
  check('Reduce motion arrives at once (no glide frames)', instant.changes <= 1 && instant.duration === 0, `${instant.changes} change frame(s), ${instant.duration}ms`);
  await page.waitForTimeout(300);

  // ---- the challenge sheet's key row (measured; its CSS lives in online-css.ts) ----------------
  const tapTile = async (id: string) => {
    const at = await page.evaluate(`(() => {
      const el = document.querySelector('.world-hex[data-cell-id="${id}"]');
      const svg = document.querySelector('.world-map-svg');
      if (!el || !svg) return null;
      const s = svg.getBoundingClientRect(); const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      return x > s.left + 40 && x < s.right - 40 && y > s.top + 120 && y < s.bottom - 120 ? { x: x, y: y } : null;
    })()`) as { x: number; y: number } | null;
    if (at) await page.touchscreen.tap(at.x, at.y);
    else { await page.focus(`.world-hex[data-cell-id="${id}"]`); await page.keyboard.press('Enter'); }
    await page.waitForTimeout(140);
    return !!at;
  };
  await page.waitForTimeout(400);
  const reached = await tapTile('-1,-4');
  const bar = await page.evaluate(`(() => {
    const el = document.getElementById('online-world-selection');
    return el && !el.hidden ? (el.querySelector('.world-claim-button') || {}).textContent : null;
  })()`);
  console.log('rival tile', reached ? 'tapped' : 'keyboard', 'bar:', JSON.stringify(bar));
  if (bar) {
    await page.click('#online-world-selection .world-claim-button');
    await page.waitForTimeout(700);
    const sheet = await page.evaluate(`(() => {
      const row = document.querySelector('.world-challenge-keys');
      if (!row || !row.offsetParent) return null;
      const rowW = row.getBoundingClientRect().width;
      const keys = [].slice.call(row.children);
      const two = keys.map(function (k) { return +k.getBoundingClientRect().width.toFixed(1); });
      const primary = keys[0]; primary.hidden = true;
      const one = +keys[1].getBoundingClientRect().width.toFixed(1);
      primary.hidden = false;
      return { rowW: +rowW.toFixed(1), two: two, one: one };
    })()`) as { rowW: number; two: number[]; one: number } | null;
    if (sheet) console.log('challenge-keys', JSON.stringify(sheet));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ---- a pan, for the price comparison --------------------------------------------------------
  await page.waitForTimeout(300);
  const rect = (await page.locator('.world-map-svg').boundingBox())!;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const touch = (type: string, pts: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts.map((p, i) => ({ ...p, id: i + 1 })) });
  await startFrames();
  await touch('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 30; i++) { await touch('touchMove', [{ x: cx - i * 4, y: cy - i * 3 }]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  const pan = await stopFrames();
  console.log('pan', JSON.stringify(pan));
  check('the glide is no dearer than a pan',
    framesDuringGlide.p95 <= Math.max(34, pan.p95 + 8), `glide p95 ${framesDuringGlide.p95}ms vs pan p95 ${pan.p95}ms`);
  await context.close();

  // ===== 2. THE ROWS: no lone control at half width ===========================================
  const CASES: { key: string; setup: string }[] = [
    { key: 'pause pair, duel (Restart hidden)', setup: 'pause-pair-duel' },
    { key: 'pause pair, live duel (both hidden)', setup: 'pause-pair-empty' },
    { key: 'pause row, duel (Resign alone)', setup: 'pause-acts-one' },
    { key: 'pause row, live (Leave live alone)', setup: 'pause-acts-live-one' },
    { key: 'pause row, live + resign (two)', setup: 'pause-acts-two' },
    { key: 'pause lead, practice (Resume alone)', setup: 'pause-leads-one' },
    { key: 'pause lead, lesson (two)', setup: 'pause-leads-two' },
    { key: 'pause tools (History hidden)', setup: 'pause-tools-three' },
    { key: 'pause tools (four)', setup: 'pause-tools-four' },
    { key: 'finish card keys (offline, extras folded)', setup: 'gameover-buttons' },
    { key: 'finish card review keys (Show me hidden)', setup: 'gameover-review-one' },
    { key: 'finish card review keys (two)', setup: 'gameover-review-two' },
    { key: 'daily sheet actions (two keys)', setup: 'daily-two' },
    { key: 'settings sheet (Tutorial key alone)', setup: 'settings-one' },
    { key: 'matched prompt (two keys)', setup: 'matched' },
    { key: 'install prompt (three keys)', setup: 'install' },
    { key: 'lobby hub (Find opponent hidden)', setup: 'lobby' },
  ];

  for (const [w, h, label] of [[320, 568, '320x568'], [390, 844, '390x844'], [1280, 800, '1280x800']] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700 });
    const p = await ctx.newPage();
    await seedSettings(p, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false });
    await seedSeen(p);
    await p.goto(origin + '/');
    await p.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
    await p.waitForTimeout(400);
    for (const item of CASES) {
      const rows = await measure(p, item.setup);
      for (const row of rows) {
        const note = `${label} ${row.row}: row ${row.rowW}px (h ${row.rowH}) → ${row.visible.map((v) => `${v.id} ${v.w}`).join(', ') || 'none'}`;
        if (row.visible.length === 0) {
          check(`${item.key}: an empty row takes no space`, row.rowH <= 0.5, note);
          continue;
        }
        if (row.visible.length === 1) {
          check(`${item.key}: the lone control spans its row`, Math.abs(row.visible[0]!.w - row.rowW) <= 1, note);
          continue;
        }
        if (row.row === 'go-buttons') {
          // A DESIGNED two-column row: every framed key spans both columns, the two quiet links
          // pair up. Neither shape may leave a key at a fraction it did not choose.
          const full = row.visible.filter((v) => !v.link);
          const links = row.visible.filter((v) => v.link);
          const fullOk = full.every((v) => Math.abs(v.w - row.rowW) <= 1);
          const linksOk = links.length === 0
            || (links.every((v) => Math.abs(v.w - (row.rowW - 8) / 2) <= 1) && links.length === 2);
          check(`${item.key}: framed keys span, links pair`, fullOk && linksOk, note);
          continue;
        }
        const widest = Math.max(...row.visible.map((v) => v.w));
        const narrowest = Math.min(...row.visible.map((v) => v.w));
        check(`${item.key}: visible controls split the row evenly`, widest - narrowest <= 1, note);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} territory-prep checks failed`);
  process.exit(1);
}
console.log('territory-prep checks passed');
process.exit(0);
