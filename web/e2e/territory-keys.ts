// THE TERRITORY KEY ROW'S ROLL-OUT, MEASURED (owner, 2026-10-28): "i like the way they 'roll out'
// but its speed, the animations speed seems random and now very smooth neither, make that look
// clean organic and efficient, built it in a smart way so it loads instantly always".
//
// What this suite proves on a real 390x844 phone viewport, against the built app:
//   (a) the row starts moving on the very next frame after the tap;
//   (b) the engine really RUNS a transition for every key (two properties each) instead of snapping
//       it, with the one duration token and the one easing - and the press is never delayed by the
//       wave, in either direction (the old cascade bug);
//   (c) no key lags or is left behind: they all settle together, and the wave's order is
//       nearest-first on open and farthest-first on the fold;
//   (d) two opens and two closes in a row are stable (no key stuck mid-travel);
//   (e) Reduce motion shows the whole row instantly, from the OS preference and from the game's own
//       setting;
//   (f) no page errors.
//
// HOW THE TIMING IS MEASURED (and the honest limit). Three independent sources:
//   1. The computed motion - every property's own duration and delay, read from getComputedStyle.
//      Exact, and the strongest statement about consistency: one list per key, the press at 0ms.
//   2. The engine's own `transitionrun` / `transitionstart` / `transitionend` events, listened for
//      on the row. They prove a transition was started (never a snap) and, through `elapsedTime`,
//      that it lasted the token's duration.
//   3. A few timed reads (setTimeout at 18/45/80/120/170/240/320ms after the click) of the actual
//      computed opacity, plus a LIGHT requestAnimationFrame loop that only records frame
//      timestamps (no style reads - reading styles every frame starved the sampler in the first
//      draft and made the numbers meaningless).
// The samples are reported with the time they really fired; an intermediate value is asserted only
// for a sample that genuinely landed mid-flight, and the transition events stand in for the rest.
//
// Filmstrip at 0 / ~50 / ~110 / ~210ms in docs/screens/online/ is illustrative only: screenshots
// are far too slow to be timing evidence; the three sources above are.
//
// It runs its OWN build (a stale dist makes `.world-hex.available` time out):
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/territory-keys.ts
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
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
const SHOTS = process.env.SHOTS ?? resolve('docs/screens/online');
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
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e-keys', actorId: 'e2e', requestId: `fund-keys-${playerId}-${n}`, now: Date.now() });
// A world with land around this device's tile, so the map has `.world-hex.available` to open.
const others = await Promise.all([guestOf(), guestOf(), guestOf()]);
const patches = [['0,0', '1,0', '2,0'], ['-5,3', '-4,3'], ['3,-6', '-1,-4']];
for (const [i, guest] of others.entries()) {
  await fund(guest.player.id, patches[i]!.length);
  for (const [j, cell] of patches[i]!.entries()) await store.claim(guest.player.id, cell, `keys-${i}-${j}`, Date.now() - (5 - j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 3);
await store.claim(me.player.id, '-2,-4', 'keys-mine', Date.now());
await store.acknowledgeInvitation(me.player.id);
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind });

// The build is always its own: a dist from another run baked another suite's (dead) API URL, so a
// SKIP_BUILD option would silently test nothing.
await new Promise<void>((resolveBuild, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolveBuild() : reject(new Error(`build failed: ${err}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';
mkdirSync(SHOTS, { recursive: true });

type TransitionEventRec = { kind: 'run' | 'start' | 'end'; prop: string; key: string; at: number; elapsed: number };
type Sample = { why: number; at: number; keys: { o: number; tr: string }[] };
type Rec = { click: number; handlerEnd: number; runs: TransitionEventRec[]; samples: Sample[]; gaps: number[]; longTaskMs: number };

const launch = async (options: { reducedMotion?: 'reduce' | 'no-preference'; viewport?: { width: number; height: number } } = {}) => {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, ...options });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: options.reducedMotion === 'reduce', eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  // Let the screen's first refresh land before anything is timed: the map's opening poll and its
  // JSON parse are a ~100ms main-thread task at 4x CPU throttle, and a tap inside it cannot animate
  // at all. This measures the row's own motion, not an unrelated refresh.
  await page.waitForTimeout(2400);
  return { context, page, errors };
};

/**
 * Arm the recorder. It listens for the engine's transition events on the row, timestamps the MENU
 * click, samples computed opacity at known offsets AFTER the click, and runs a frame clock that
 * does no style reads. Everything is measured from the click's own `performance.now()`.
 */
const arm = (page: Page) => page.evaluate(`(() => {
  const row = document.getElementById('online-world-keys');
  const keys = [...row.querySelectorAll('.world-key')];
  const menu = document.getElementById('online-world-menu');
  const rec = { click: 0, handlerEnd: 0, runs: [], samples: [], gaps: [], longTaskMs: 0 };
  window.__keyRec = rec;
  // Only the newest recorder is live: stop the previous frame clock and silence its listeners.
  const gen = (window.__keyGen = (window.__keyGen || 0) + 1);
  const live = () => window.__keyGen === gen;
  const idOf = (el) => (el && el.id) || (el && el.className) || 'row';
  for (const kind of ['transitionrun', 'transitionstart', 'transitionend']) {
    row.addEventListener(kind, (e) => {
      if (!live()) return;
      rec.runs.push({ kind: kind.replace('transition', ''), prop: e.propertyName, key: idOf(e.target), at: performance.now(), elapsed: e.elapsedTime });
    }, true);
  }
  let last = 0;
  const tick = (t) => {
    if (!live()) return;
    if (last) rec.gaps.push(Math.round((t - last) * 100) / 100);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const read = (why, at) => {
    if (!live()) return;
    rec.samples.push({ why, at, keys: keys.map((k) => { const cs = getComputedStyle(k); return { o: Math.round(Number(cs.opacity) * 1000) / 1000, tr: cs.transform }; }) });
  };
  menu.addEventListener('click', () => {
    if (!live() || rec.click) return;
    rec.click = performance.now();
    for (const off of [18, 45, 80, 120, 170, 240, 320]) setTimeout(() => read(off, performance.now()), off);
  }, { capture: true });
  // Registered after the view's own click handler, so this runs immediately after it: the gap
  // between the two stamps is the whole synchronous tap path (no layout, no waiting).
  menu.addEventListener('click', () => { if (live()) rec.handlerEnd = performance.now(); });
  try {
    new PerformanceObserver((list) => { if (live()) for (const e of list.getEntries()) rec.longTaskMs += e.duration; }).observe({ type: 'longtask', buffered: false });
  } catch {}
  return true;
})()`);

const tapMenu = async (page: Page) => {
  const box = (await page.locator('#online-world-menu').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};

const readRecorder = (page: Page) => page.evaluate(() => (window as any).__keyRec) as Promise<Rec>;

type AuditKey = { id: string; i: number; opacity: number; transform: string; props: string[]; durations: number[]; delays: number[] };
type Audit = { open: boolean; count: string; keys: AuditKey[] };

/** The computed motion, property by property, paired with each property's own delay/duration. */
const audit = (page: Page) => page.evaluate(`(() => {
  const row = document.getElementById('online-world-keys');
  const keys = [...row.querySelectorAll('.world-key')];
  const split = (s) => s.split(',').map((x) => x.trim());
  const seconds = (v) => {
    const m = /^([\\d.]+)(ms|s)$/.exec(v.trim());
    return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : NaN;
  };
  return {
    open: row.classList.contains('open'),
    count: getComputedStyle(row).getPropertyValue('--key-count').trim(),
    keys: keys.map((k) => {
      const cs = getComputedStyle(k);
      return {
        id: k.id,
        i: Number(getComputedStyle(k).getPropertyValue('--key-i').trim()),
        opacity: Number(cs.opacity),
        transform: cs.transform,
        props: split(cs.transitionProperty),
        durations: split(cs.transitionDuration).map(seconds),
        delays: split(cs.transitionDelay).map(seconds),
      };
    }),
  };
})()`) as Promise<Audit>;

/** The wave's gap, read from the product: the SMALLEST non-zero transform delay in the row.
 *  (The old helper read key i=1 and used that as the unit — but on the way IN key i=1 waits
 *  (count-1-1) waves, so the unit was multiplied by four and the mirrored check was arithmetically
 *  impossible to satisfy. The smallest positive delay is the wave itself, in either direction.) */
const staggerOf = (measured: Audit): number => {
  const at = measured.keys[0]?.props.indexOf('transform') ?? -1;
  const delays = measured.keys.map((k) => k.delays[at] ?? 0).filter((d) => d > 0);
  return delays.length ? Math.min(...delays) : NaN;
};

const pressOk = (measured: Audit): boolean => measured.keys.every((k) => {
  const at = (prop: string) => k.props.indexOf(prop);
  return ['scale', 'translate'].every((prop) => k.delays[at(prop)] === 0 && Math.round(k.durations[at(prop)]!) === 90);
});

type RollFrame = { at: number; dt: number; keys: { o: number; tx: number }[] };
type RollRec = { click: number; frames: RollFrame[]; created: { key: string; at: number }[] };

/**
 * THE ROLL-OUT, FRAME BY FRAME (owner, 2026-10-30: "the animation of the submenu in territory isnt
 * smooth"). The existing checks above are timing and computed-style audit; this one samples every
 * key's real computed transform and opacity once per animation frame, so a whip or a stall shows up
 * as a number rather than a feeling. Strings, not closures: tsx wraps named arrows in a helper the
 * page does not have.
 */
const perFrameRollout = async (page: Page, viewport: { width: number; height: number }) => {
  // Deliberately un-throttled: the row is composited, and at 4x CPU throttle this shared machine's
  // other work (the map's 12 s refresh, a JSON parse) lands on the tap and delays the FIRST frame —
  // which is a main-thread fact, not the row's motion. The row's own claim is that once it starts it
  // never stalls; that is measured here, and the throttled picture is reported in the summary.
  await page.waitForTimeout(150);
  await page.evaluate(`(() => {
    const w = window;
    const row = document.getElementById('online-world-keys');
    const keys = [...row.querySelectorAll('.world-key')];
    w.__roll = { click: 0, frames: [], created: [] };
    const rec = () => w.__roll;
    document.getElementById('online-world-menu').addEventListener('click', () => {
      if (!rec().click) rec().click = performance.now();
    }, { capture: true });
    row.addEventListener('transitionrun', (e) => {
      if (e.propertyName !== 'transform' || !rec().click) return;
      rec().created.push({ key: e.target.id, at: performance.now() - rec().click });
    }, true);
    let last = 0;
    const tick = (t) => {
      if (rec().click) {
        const at = t - rec().click;
        if (at > 420) return;
        rec().frames.push({ at, dt: last ? t - last : 0, keys: keys.map((k) => {
          const cs = getComputedStyle(k);
          return { o: Number(cs.opacity), tx: cs.transform === 'none' ? 0 : new DOMMatrix(cs.transform).m41 };
        }) });
      }
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);
  const box = (await page.locator('#online-world-menu').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const rec = (await page.evaluate(() => (window as any).__roll)) as RollRec;
  const analyse = (frames: RollFrame[], count: number) => {
    const peak = Array.from({ length: count }, (_, i) => {
      let worst = 0;
      for (let f = 1; f < frames.length; f++) worst = Math.max(worst, Math.abs(frames[f]!.keys[i]!.tx - frames[f - 1]!.keys[i]!.tx));
      return Math.round(worst * 10) / 10;
    });
    // Speed is displacement per millisecond, so a slow frame cannot fake a whip and a fast display
    // cannot fake a stall. (260px in 150ms with this curve was ~4.5 px/ms; one 52px slot is ~0.9.)
    const speed = Array.from({ length: count }, (_, i) => {
      let worst = 0;
      for (let f = 1; f < frames.length; f++) {
        const dt = frames[f]!.at - frames[f - 1]!.at;
        if (dt > 0) worst = Math.max(worst, Math.abs(frames[f]!.keys[i]!.tx - frames[f - 1]!.keys[i]!.tx) / dt);
      }
      return Math.round(worst * 100) / 100;
    });
    const first = frames[0]!.keys.map((k) => k.tx);
    const last = frames.at(-1)!.keys.map((k) => k.tx);
    const dips = frames[0]!.keys.map((_k, i) => frames.filter((f, at) => at > 0 && (f.keys[i]!.o < frames[at - 1]!.keys[i]!.o - 0.002 || Math.abs(f.keys[i]!.tx) > Math.abs(frames[at - 1]!.keys[i]!.tx) + 0.6)).length);
    const settle = frames[0]!.keys.map((_k, i) => { const f = frames.find((fr) => fr.keys[i]!.o >= 0.999 && Math.abs(fr.keys[i]!.tx) < 0.6); return f ? Math.round(f.at) : null; });
    const gaps = frames.map((f) => f.dt).filter((d) => d > 0).sort((a, b) => a - b);
    return { peak, speed, first, last, dips, settle, gapP95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0), gapWorst: Math.round(gaps.at(-1) ?? 0), frames: frames.length };
  };
  const a = analyse(rec.frames, rec.frames[0]?.keys.length ?? 0);
  console.log(`rollout ${viewport.width}x${viewport.height}`, JSON.stringify({ ...a, created: rec.created.map((c) => Math.round(c.at)) }));
  return { rec, a, count: rec.frames[0]?.keys.length ?? 0 };
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  // ---- the measured pass: open, close, and open/close again -------------------------------------
  const main = await launch();
  const page = main.page;

  const keysInDom = await page.evaluate(() => document.querySelectorAll('#online-world-keys .world-key').length);
  const nearest = keysInDom - 1; // the last key in the DOM is the one next to MENU
  const keyIds = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#online-world-keys .world-key')].map((k) => k.id));
  check('the row is folded at rest and the map is ready', keysInDom >= 3 && !(await page.evaluate(() => document.getElementById('online-world-keys')!.classList.contains('open'))), `${keysInDom} keys`);

  await arm(page);
  await tapMenu(page);
  await page.waitForTimeout(700);
  const openRec = await readRecorder(page);

  const openRuns = openRec.runs.filter((r) => r.at >= openRec.click - 40);
  const openSamples = openRec.samples.filter((s) => s.at >= openRec.click - 5);
  console.log('open samples', JSON.stringify(openSamples.map((s) => ({ at: Math.round(s.at - openRec.click), o: s.keys.map((k) => k.o) }))));
  console.log('open transitions', JSON.stringify(openRuns.map((r) => ({ kind: r.kind, prop: r.prop, key: r.key, at: Math.round(r.at - openRec.click), elapsed: +r.elapsed.toFixed(3) }))));
  const liveGaps = openRec.gaps.filter((g) => g > 0);
  console.log('frame gaps (light loop)', JSON.stringify({ frames: liveGaps.length, median: liveGaps.slice().sort((a, b) => a - b)[Math.floor(liveGaps.length / 2)], p95: liveGaps.slice().sort((a, b) => a - b)[Math.floor(liveGaps.length * 0.95)], worst: Math.max(...liveGaps), longTaskMs: Math.round(openRec.longTaskMs) }));

  check('the click was seen by the row', openRec.click > 0 && openSamples.length > 0, `${openRec.click.toFixed(0)}ms, ${openSamples.length} samples`);

  // (a) NEXT-FRAME START. Two independent stamps: the whole synchronous tap path (click handler's
  // own duration) and the engine's `transitionrun`, which is dispatched in the first style update
  // that starts the transition. Neither waits on a timer.
  const handlerMs = openRec.handlerEnd - openRec.click;
  // `transitionstart` is the frame the key actually begins to move (after its own delay);
  // `transitionrun` fires earlier, when every key's transition is created.
  const firstStart = (id: string) => {
    const runs = openRuns.filter((r) => r.kind === 'start' && r.key === id).map((r) => r.at - openRec.click);
    return runs.length > 0 ? Math.min(...runs) : Infinity;
  };
  check('the tap path is a pure write: the click handler itself finishes inside a frame', handlerMs >= 0 && handlerMs < 16, `${handlerMs.toFixed(1)}ms synchronous`);
  check('the nearest key starts on the very next frame (transitionstart <= 34ms)', firstStart(keyIds[nearest]!) <= 34, `${Math.round(firstStart(keyIds[nearest]!))}ms`);
  // ONE WAVE PER KEY, derived from the row's own count (never a magic number tuned to four keys):
  // the farthest key waits (count - 1) × 18ms, then waits for its first frame.
  const farthestWave = (keysInDom - 1) * 18;
  check('the farthest key starts one wave later, and only that', firstStart(keyIds[0]!) >= farthestWave - 12 && firstStart(keyIds[0]!) <= farthestWave + 45, `${Math.round(firstStart(keyIds[0]!))}ms, wave ${farthestWave}ms`);

  // (b) A REAL TRANSITION, NOT A SNAP: the engine starts transform AND opacity on EVERY key.
  for (const id of keyIds) {
    const props = new Set(openRuns.filter((r) => r.kind === 'start' && r.key === id).map((r) => r.prop));
    check(`${id} really transitions transform and opacity`, props.has('transform') && props.has('opacity'), [...props].join(','));
  }
  const openEnds = openRuns.filter((r) => r.kind === 'end' && r.prop === 'transform');
  check('the arrival lasts the 150ms token (engine elapsedTime)', openEnds.length === keysInDom && openEnds.every((r) => r.elapsed >= 0.13 && r.elapsed <= 0.19), JSON.stringify(openEnds.map((r) => +r.elapsed.toFixed(3))));

  // Smooth, not stepped: anywhere a sample genuinely landed mid-flight, the value is in between.
  const midFlight = openSamples.filter((s) => s.at - openRec.click >= 40 && s.at - openRec.click <= 110);
  const midOk = midFlight.length > 0 && midFlight.every((s) => s.keys[nearest]!.o > 0.02 && s.keys[nearest]!.o < 0.98);
  check('a mid-flight sample is genuinely between 0 and 1 (no snap)', midOk, midFlight.map((s) => `${Math.round(s.at - openRec.click)}ms:${s.keys[nearest]!.o}`).join(' ') || 'no sample landed mid-flight');

  // Monotonic rise, no key dipping.
  const rising = keyIds.every((_id, index) => openSamples.every((s, at) => at === 0 || s.keys[index]!.o >= openSamples[at - 1]!.keys[index]!.o - 0.001));
  check('every key rises monotonically', rising);

  // (c) ALL TOGETHER: the last sample has every key at rest, and the wave is ordered.
  const lastSample = openSamples.at(-1)!;
  check('all keys end fully opaque at the rest position', lastSample.keys.every((k) => k.o >= 0.999 && k.tr === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify(lastSample.keys));
  const firstMoves = keyIds.map((_id, index) => {
    const sample = openSamples.find((s) => s.keys[index]!.o > 0.001);
    return sample ? sample.at - openRec.click : Infinity;
  });
  check('the wave runs from MENU outward (nearest first)', firstMoves[nearest]! <= firstMoves[0]! && firstMoves[0]! - firstMoves[nearest]! >= 6, JSON.stringify(firstMoves.map((ms) => Math.round(ms))));

  // Frame health: the light loop's own gaps (it reads no styles).
  const worstGap = Math.max(...liveGaps);
  check('no stalled frame while the row rolls out (worst gap <= 120ms)', worstGap <= 120, `${Math.round(worstGap)}ms worst of ${liveGaps.length} frames`);

  // Touchable where it lands.
  const hits = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#online-world-keys .world-key')].map((k) => {
    const r = k.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === k || k.contains(el));
  }));
  check('every key is hit-testable where it lands', hits.every(Boolean), JSON.stringify(hits));

  // ---- the motion audit: ONE list, the vocabulary's tokens, the press never delayed ------------
  const openAudit = await audit(page);
  const openStagger = staggerOf(openAudit);
  check('open: one wave gap drives every key (18ms)', Math.round(openStagger) === 18, `${openStagger}ms`);
  check('open: transform/opacity arrive in the 150ms token, staggered by index', openAudit.keys.every((k) => {
    const at = (prop: string) => k.props.indexOf(prop);
    return ['transform', 'opacity'].every((prop) => Math.round(k.durations[at(prop)]!) === 150 && Math.abs(k.delays[at(prop)]! - k.i * openStagger) < 1);
  }), JSON.stringify(openAudit.keys.map((k) => [k.i, k.delays, k.durations])));
  check('open: a press answers in 90ms and is never delayed', pressOk(openAudit), JSON.stringify(openAudit.keys.map((k) => k.delays)));
  check('every key carries its own index and the row its count', openAudit.count === String(keysInDom) && new Set(openAudit.keys.map((k) => k.i)).size === keysInDom, `${openAudit.count} / ${openAudit.keys.map((k) => k.i).join(',')}`);

  // ---- close: the same formula, mirrored ---------------------------------------------------------
  await arm(page);
  await tapMenu(page);
  await page.waitForTimeout(600);
  const closeRec = await readRecorder(page);
  const closeSamples = closeRec.samples.filter((s) => s.at >= closeRec.click - 5);
  console.log('close samples', JSON.stringify(closeSamples.map((s) => ({ at: Math.round(s.at - closeRec.click), o: s.keys.map((k) => k.o) }))));
  const closeStarts = keyIds.map((id) => {
    const start = closeRec.runs.find((r) => r.kind === 'start' && r.key === id && r.prop === 'transform');
    return start ? start.at - closeRec.click : Infinity;
  });
  const closeEnds = closeRec.runs.filter((r) => r.kind === 'end' && r.prop === 'transform');
  check('close: every key really folds away (transition end on each)', closeEnds.length === keysInDom, JSON.stringify(closeEnds.map((r) => r.key)));
  check('close: the fold lasts the 100ms token', closeEnds.length === keysInDom && closeEnds.every((r) => r.elapsed >= 0.08 && r.elapsed <= 0.14), JSON.stringify(closeEnds.map((r) => +r.elapsed.toFixed(3))));
  check('close: the farthest key starts folding first (the same gesture mirrored)', closeStarts[0]! <= closeStarts[nearest]!, JSON.stringify(closeStarts.map((ms) => Math.round(ms))));
  check('close: every key ends invisible', closeSamples.at(-1)!.keys.every((k) => k.o <= 0.001), JSON.stringify(closeSamples.at(-1)!.keys));

  const closedAudit = await audit(page);
  check('closed: the fold uses the 100ms token and the mirrored delay', closedAudit.keys.every((k) => {
    const at = (prop: string) => k.props.indexOf(prop);
    return ['transform', 'opacity'].every((prop) => Math.round(k.durations[at(prop)]!) === 100 && Math.abs(k.delays[at(prop)]! - (keysInDom - 1 - k.i) * staggerOf(closedAudit)) < 1);
  }), JSON.stringify(closedAudit.keys.map((k) => [k.i, k.delays, k.durations])));
  check('closed: a press is still 90ms and undelayed', pressOk(closedAudit), JSON.stringify(closedAudit.keys.map((k) => k.delays)));

  // (d) a second open/close cycle is the same motion, and leaves nothing mid-travel.
  await arm(page);
  await tapMenu(page);
  await page.waitForTimeout(650);
  const openAgain = await readRecorder(page);
  const againSamples = openAgain.samples.filter((s) => s.at >= openAgain.click - 5);
  const againMoves = keyIds.map((_id, index) => {
    const sample = againSamples.find((s) => s.keys[index]!.o > 0.001);
    return sample ? sample.at - openAgain.click : Infinity;
  });
  // THE SAME WAVE, not the same absolute frame: samples land on frames (~17ms apart), so the two
  // runs are compared by their SHAPE — each key's distance from the first key to move.
  const waveOf = (moves: number[]) => { const base = Math.min(...moves); return moves.map((ms) => ms - base); };
  const firstWave = waveOf(firstMoves), againWave = waveOf(againMoves);
  // Three frames of the harness's own cadence (16.7ms): the recorder samples opacity per frame, so a
  // key's "first visible" sample can be a frame or two late. The exact delays themselves are pinned
  // to the millisecond by the audit checks above; this one is about the SHAPE repeating.
  check('a second open is the same motion (same wave shape, all settled)', againSamples.at(-1)!.keys.every((k) => k.o >= 0.999) && againWave.every((ms, index) => Math.abs(ms - firstWave[index]!) <= 50), `${JSON.stringify(againWave.map((ms) => Math.round(ms)))} vs ${JSON.stringify(firstWave.map((ms) => Math.round(ms)))}`);

  await arm(page);
  await tapMenu(page);
  await page.waitForTimeout(700);
  const secondClose = await readRecorder(page);
  const restState = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#online-world-keys .world-key')].map((k) => ({ o: Number(getComputedStyle(k).opacity), i: Number(k.style.getPropertyValue('--key-i')), anim: k.getAnimations().length })));
  check('closing twice leaves no key stuck mid-travel', secondClose.samples.at(-1)!.keys.every((k) => k.o <= 0.001) && restState.every((s) => s.o <= 0.001 && s.anim === 0), JSON.stringify(restState));

  // ---- filmstrip evidence ------------------------------------------------------------------------
  await tapMenu(page);
  await page.screenshot({ path: `${SHOTS}/territory-keys-rollout-1-tap.png`, scale: 'css' });
  await page.waitForTimeout(45);
  await page.screenshot({ path: `${SHOTS}/territory-keys-rollout-2-wave.png`, scale: 'css' });
  await page.waitForTimeout(65);
  await page.screenshot({ path: `${SHOTS}/territory-keys-rollout-3-arriving.png`, scale: 'css' });
  await page.waitForTimeout(130);
  await page.screenshot({ path: `${SHOTS}/territory-keys-rollout-4-rest.png`, scale: 'css' });
  check('the filmstrip was captured', true, SHOTS);
  await tapMenu(page);
  await page.waitForTimeout(300);

  check('no page errors on the measured pass', main.errors.length === 0, main.errors.join(' | '));
  await main.context.close();

  // ---- the roll-out, frame by frame, on a phone AND on its side ----------------------------------
  // MEASURED (2026-10-30): the folded pose used to be translateX(i*52px + 52px), so the key farthest
  // from MENU covered 260px in the same 150ms as the nearest key's 52px - a measured 82px in ONE
  // 60Hz frame at five times the nearest key's speed, which is the whip the owner saw. Every key now
  // covers exactly one row pitch, so all five have the same speed. The bounds below are the claim.
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const run = await launch({ viewport });
    const frames = await perFrameRollout(run.page, viewport);
    const label = `${viewport.width}x${viewport.height}`;
    const count = frames.count;
    check(`${label}: every key is sampled across the roll-out`, count >= 3 && frames.rec.frames.length >= 8, `${frames.a.frames} frames of ${count} keys`);
    check(`${label}: every key’s transition is created within one frame of the tap`, frames.rec.created.length >= count && frames.rec.created.every((c) => c.at <= 34), JSON.stringify(frames.rec.created.map((c) => Math.round(c.at))));
    check(`${label}: every key covers the SAME one-slot travel (52px -> 0)`, frames.a.first.every((tx) => Math.abs(tx - 52) < 1) && frames.a.last.every((tx) => Math.abs(tx) < 1), `first ${JSON.stringify(frames.a.first.map(Math.round))} last ${JSON.stringify(frames.a.last.map(Math.round))}`);
    check(`${label}: the peak frame-to-frame travel is trackable (34px or less, two frames’ worth)`, frames.a.peak.every((p) => p <= 34), JSON.stringify(frames.a.peak));
    check(`${label}: no key ever moves faster than 1.8px/ms (one slot in one arrival, not a whip; the old fan measured ~4.5)`, frames.a.speed.every((s) => s <= 1.8), JSON.stringify(frames.a.speed));
    check(`${label}: every key moves monotonically (no key ever dips back or stalls backwards)`, frames.a.dips.every((d) => d === 0), JSON.stringify(frames.a.dips));
    // The end times differ by exactly the intended wave (18ms): frame sampling is 16.7ms, so the
    // LADDER is checked as a span per step rather than key-against-key.
    const settlements = frames.a.settle.filter((s): s is number => s !== null);
    const descending = settlements.every((s, i) => i === 0 || s <= settlements[i - 1]!);
    const perStep = settlements.length > 1 ? (settlements[0]! - settlements.at(-1)!) / (settlements.length - 1) : 0;
    check(`${label}: the keys settle in the intended wave (farthest first, ~18ms apart)`, settlements.length === count && descending && perStep >= 10 && perStep <= 26, `${JSON.stringify(settlements)} ~${Math.round(perStep)}ms`);
    check(`${label}: no stalled frame while the row rolls out (p95 <= 34ms, worst <= 50ms)`, frames.a.gapP95 <= 34 && frames.a.gapWorst <= 50, JSON.stringify({ p95: frames.a.gapP95, worst: frames.a.gapWorst }));
    await run.page.screenshot({ path: `${SHOTS}/territory-keys-rollout-${label}.png`, scale: 'css' });
    check(`${label}: no page errors`, run.errors.length === 0, run.errors.join(' | '));
    await run.context.close();
  }

  // ---- reduce motion: the row simply appears ------------------------------------------------------
  const reduced = await launch({ reducedMotion: 'reduce' });
  await arm(reduced.page);
  await tapMenu(reduced.page);
  await reduced.page.waitForTimeout(300);
  const reducedRec = await readRecorder(reduced.page);
  const reducedSamples = reducedRec.samples.filter((s) => s.at >= reducedRec.click - 5);
  const reducedFirst = reducedSamples.findIndex((s) => s.keys.every((k) => k.o >= 0.99));
  check('OS Reduce motion: all keys are fully out on the first sample after the tap', reducedFirst >= 0 && reducedFirst <= 1, `sample ${reducedFirst}, ${reducedSamples.map((s) => Math.round(s.at - reducedRec.click)).join('/')}ms`);
  const reducedAudit = await audit(reduced.page);
  check('OS Reduce motion: every transition is switched off, no stagger survives', reducedAudit.keys.every((k) => k.durations.every((d) => d === 0) && k.delays.every((d) => d === 0)), JSON.stringify(reducedAudit.keys.map((k) => k.durations)));
  check('no page errors with Reduce motion', reduced.errors.length === 0, reduced.errors.join(' | '));
  await reduced.context.close();

  // The game's own Reduce motion setting (the html.reduce-motion class) is the second path.
  const appPref = await launch();
  await appPref.page.evaluate(() => document.documentElement.classList.add('reduce-motion'));
  await appPref.page.waitForTimeout(80);
  await arm(appPref.page);
  await tapMenu(appPref.page);
  await appPref.page.waitForTimeout(300);
  const appRec = await readRecorder(appPref.page);
  const appSamples = appRec.samples.filter((s) => s.at >= appRec.click - 5);
  check('the game Reduce motion setting also shows the row at once', appSamples.length > 0 && appSamples.findIndex((s) => s.keys.every((k) => k.o >= 0.99)) <= 1, JSON.stringify(appSamples.map((s) => Math.round(s.at - appRec.click))));
  await appPref.context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} territory-keys checks failed`);
  process.exit(1);
}
console.log('territory-keys checks passed');
process.exit(0);
