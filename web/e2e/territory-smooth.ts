// TERRITORY SMOOTHNESS PROBE (owner, 2026-10-28: "see if refreshing/scrolling/tapping anywhere is not
// smooth and optimise it so it always looks smooth"). A phone-sized Chromium at 4x CPU throttle:
//   - a one-finger pan and a two-finger pinch, driven through CDP touch, with every frame timed;
//   - the idle map's own cost (style recalcs, layouts and script per second while nothing happens);
//   - a forced refresh with nothing changed (it must not rebuild the map);
//   - tap-to-answer latency for a tile.
// Prints numbers; fails only on the hard budgets below.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/territory-smooth.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
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
await new Promise<void>((resolve) => api.listen(Number(process.env.API_PORT ?? 0), '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });
// a busier world than the menu suite: eight players, a few dozen tiles, several of them fresh
const others = await Promise.all(Array.from({ length: 8 }, () => guestOf()));
const patches = [
  ['0,0', '1,0', '2,0', '1,1', '0,1'], ['-5,3', '-4,3', '-4,4'], ['3,-6', '4,-6', '3,-5'], ['6,2', '7,2', '6,3', '5,3'],
  ['-7,-2', '-6,-2', '-7,-1'], ['2,5', '3,5', '2,6'], ['-3,7', '-2,7'], ['8,-4', '8,-3', '7,-3'],
];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, patches[i]!.length);
  for (const [j, cell] of patches[i]!.entries()) await store.claim(g.player.id, cell, `other-${i}-${j}`, Date.now() - (i * 5 + j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 4);
for (const [j, cell] of ['-2,-4', '-1,-4'].entries()) await store.claim(me.player.id, cell, `mine-${j}`, Date.now());
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

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Frame timing: every rAF delta while a gesture runs.
  // (strings, not closures: tsx would wrap a named arrow inside them in a helper the page lacks)
  const startFrames = () => page.evaluate(`(() => {
    const w = window;
    w.__frames = [];
    w.__long = 0;
    let last = performance.now();
    w.__frameOn = true;
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
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

  if (process.env.PROBE_CSS) await page.addStyleTag({ content: process.env.PROBE_CSS });
  const rect = (await page.locator('.world-map-svg').boundingBox())!;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const touch = (type: string, pts: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts.map((p, i) => ({ ...p, id: i + 1 })) });

  // 1. one-finger pan: 40 moves, a frame apart
  await startFrames();
  await touch('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 40; i++) { await touch('touchMove', [{ x: cx - i * 4, y: cy - i * 3 }]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  const pan = await stopFrames();
  console.log('pan', JSON.stringify(pan));

  // 2. two-finger pinch
  await startFrames();
  await touch('touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
  for (let i = 1; i <= 30; i++) { await touch('touchMove', [{ x: cx - 30 - i * 2, y: cy }, { x: cx + 30 + i * 2, y: cy }]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  const pinch = await stopFrames();
  console.log('pinch', JSON.stringify(pinch));

  // 3. the idle map: 3 s with nothing happening
  const a = await metrics();
  await page.waitForTimeout(3000);
  const b = await metrics();
  const idle = {
    recalcPerS: Math.round(((b.RecalcStyleCount ?? 0) - (a.RecalcStyleCount ?? 0)) / 3),
    layoutPerS: Math.round(((b.LayoutCount ?? 0) - (a.LayoutCount ?? 0)) / 3),
    scriptMsPerS: Math.round(((b.ScriptDuration ?? 0) - (a.ScriptDuration ?? 0)) * 1000 / 3),
    taskMsPerS: Math.round(((b.TaskDuration ?? 0) - (a.TaskDuration ?? 0)) * 1000 / 3),
  };
  console.log('idle', JSON.stringify(idle));

  // 4. a refresh that changes nothing must not rebuild the map
  const svgBefore = await page.evaluate(() => { const s = document.querySelector('.world-map-svg') as any; s.__probe = 1; return true; });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);
  const kept = svgBefore && await page.evaluate(() => (document.querySelector('.world-map-svg') as any)?.__probe === 1);
  console.log('refresh keeps the map', kept);

  // 5. a tap on a free tile answers within a frame or two
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => document.querySelectorAll('.world-hex.selected').forEach((n) => n.classList.remove('selected')));
  const free = await page.evaluate(() => {
    const svg = document.querySelector('.world-map-svg')!.getBoundingClientRect();
    for (const el of document.querySelectorAll('.world-hex.available')) {
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x > svg.left + 60 && x < svg.right - 60 && y > svg.top + 120 && y < svg.bottom - 120) return { x, y };
    }
    return null;
  });
  if (free) {
    await page.evaluate(() => { (window as any).__tapAt = performance.now(); new MutationObserver((_m, o) => { if (document.querySelector('.world-hex.selected')) { (window as any).__answered = performance.now(); o.disconnect(); } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
    await page.touchscreen.tap(free.x, free.y);
    await page.waitForTimeout(300);
    const latency = await page.evaluate(() => Math.round(((window as any).__answered ?? Infinity) - (window as any).__tapAt));
    console.log('tap answer ms', latency);
  }

  check('pan holds frame rate under 4x CPU throttle (p95 <= 34ms)', pan.p95 <= 34, JSON.stringify(pan));
  check('pinch holds frame rate under 4x CPU throttle (p95 <= 34ms)', pinch.p95 <= 34, JSON.stringify(pinch));
  check('a refresh with nothing new keeps the drawn map', !!kept);
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) { console.log(`${failed} territory-smooth checks failed`); process.exit(1); }
console.log('territory-smooth checks passed');
process.exit(0);
