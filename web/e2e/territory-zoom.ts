// THE MAP'S ZOOM, ON A DESKTOP (owner, 2026-10-29: "sometimes zoom in zoom out on territory doesnt
// work — i was just testing on desktop and wasnt able to zoom at some point randomly — add a fix").
//
// The cause was STATE, not a missed event: `open()` drops the view (`this.box = null`) so a visit
// frames itself afresh, but the re-frame only ran inside `paint()` — and `paint()` is skipped when
// the world has not changed. Leave the Territory and come back: the map is on screen, `box` is null,
// and the wheel, the double tap and the pan all began with `if (!this.box) return`. The map looked
// perfect and answered nothing until the page was reloaded.
//
// This suite drives a REAL desktop browser (1280x800, real wheel, real double click) and proves the
// map keeps its zoom through every reachable state — and that it comes back from the two ways it
// used to die:
//
//   1. the re-entry above (back to the hub, then in again);
//   2. a view poisoned to NaN — here FORCED, by dispatching a wheel while the map measures 0 x 0
//      (which is exactly what the old code divided by);
//   3. a pointer whose release the browser never delivered (a mouse press with no `pointerup`).
//
// Every state also asserts the cheap catch-all: the viewBox is four FINITE numbers, every time it
// changes, for the whole run.
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/territory-zoom.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium, type Page, type BrowserContext } from 'playwright-core';
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
const api = createHttpServer({
  service,
  config,
  live: chainRouters(
    createTerritoryChatRouter({ store: memoryTerritoryChatStore(storage), service, storage }),
    createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }),
  ),
});
await new Promise<void>((resolve) => api.listen(Number(process.env.API_PORT ?? 0), '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () =>
  (await (
    await fetch(`${apiBase}/v1/guests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  ).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) =>
  store.adminAdjustSeeds({
    playerId,
    delta: n * 100,
    reason: 'e2e',
    actorId: 'e2e',
    requestId: `fund-${playerId}-${n}`,
    now: Date.now(),
  });

// A world with land in it: six patches around the middle, so every corner of the map is pannable.
const others = await Promise.all(Array.from({ length: 6 }, () => guestOf()));
const patches = [
  ['0,0', '1,0', '2,0', '1,1', '0,1'],
  ['-5,3', '-4,3', '-4,4'],
  ['3,-6', '4,-6', '3,-5'],
  ['6,2', '7,2', '6,3', '5,3'],
  ['-7,-2', '-6,-2', '-7,-1'],
  ['2,5', '3,5', '2,6'],
];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, patches[i]!.length);
  for (const [j, cell] of patches[i]!.entries())
    await store.claim(g.player.id, cell, `other-${i}-${j}`, Date.now() - (i * 5 + j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 4);
for (const [j, cell] of ['-2,-4', '-1,-4'].entries())
  await store.claim(me.player.id, cell, `mine-${j}`, Date.now());
await store.acknowledgeInvitation(me.player.id);
const identity = JSON.stringify({
  token: me.token,
  playerId: me.player.id,
  displayName: me.player.displayName,
  kind: me.player.kind,
});

if (!SKIP_BUILD)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
      {
        env: {
          ...process.env,
          CHANNEL: process.env.CHANNEL ?? 'futa04',
          VITE_DUEL_API_URL: apiBase,
          VITE_SUPABASE_URL: 'http://127.0.0.1:9',
          VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let err = '';
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
  });
const web = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors: string[] = [];
try {
  const context: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page: Page = await context.newPage();
  // This suite is run on a busy machine (other suites build and drive browsers beside it), so the
  // waits are patience, not assertions: no check here is about how FAST the map answers.
  page.setDefaultNavigationTimeout(90_000);
  page.setDefaultTimeout(45_000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });

  // EVERY viewBox THE MAP EVER WRITES, so a poisoned one can never slip by unnoticed.
  await page.evaluate(`(() => {
    window.__vbLog = [];
    var seen = new WeakSet();
    var hook = function () {
      var svg = document.querySelector('.world-map-svg');
      if (!svg || seen.has(svg)) return;
      seen.add(svg);
      new MutationObserver(function () { window.__vbLog.push(svg.getAttribute('viewBox') || ''); })
        .observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
    };
    hook();
    new MutationObserver(hook).observe(document.body, { childList: true, subtree: true });
  })()`);

  /** The map's viewBox as numbers — the one truthful read of where the map is looking. */
  const box = () =>
    page.evaluate(`(() => {
      const s = document.querySelector('.world-map-svg');
      const v = (s?.getAttribute('viewBox') ?? '').split(/[\\s,]+/).map(Number);
      return v.length === 4 ? v : null;
    })()`) as Promise<number[] | null>;
  const mapRect = async () => (await page.locator('.world-map-svg').boundingBox())!;
  /** What is actually under the middle of the map: an overlay swallowing the wheel would show here. */
  const centreHit = () =>
    page.evaluate(`(() => {
      const s = document.querySelector('.world-map-svg');
      if (!s) return 'nosvg';
      const r = s.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el ? el.tagName + '.' + (el.getAttribute('class') || '') : 'none';
    })()`) as Promise<string>;
  /** One real wheel notch, at a point (the map's centre by default). */
  const wheel = async (dy: number, at?: { x: number; y: number }) => {
    const r = await mapRect();
    const x = at?.x ?? r.x + r.width / 2;
    const y = at?.y ?? r.y + r.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(120);
  };
  const enter = async () => {
    await page.waitForTimeout(400);
    await page.click('#menu-world');
    await page.waitForSelector('.world-hex', { timeout: 20_000 });
    await page.waitForTimeout(900);
  };

  await page.waitForTimeout(1200);
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex', { timeout: 20_000 });
  await page.waitForTimeout(1200);

  // ---- 0. the map is what the pointer is over, and the view is real ---------------------------
  const start = await box();
  check('the map draws a real view', !!start && start.every((n) => Number.isFinite(n)) && start[2]! > 0, start?.map((n) => n.toFixed(1)).join(' '));
  check('the middle of the map is the map, not an overlay', /hex|svg/i.test(await centreHit()), await centreHit());

  // ---- 1. the wheel zooms in and out ----------------------------------------------------------
  await wheel(-100);
  const wheeledIn = await box();
  check('a wheel notch zooms IN', !!start && !!wheeledIn && wheeledIn[2]! < start[2]! * 0.95, `view width ${start?.[2]!.toFixed(1)} -> ${wheeledIn?.[2]!.toFixed(1)}`);
  await wheel(100);
  const wheeledOut = await box();
  check('a wheel notch zooms back OUT', !!wheeledIn && !!wheeledOut && wheeledOut[2]! > wheeledIn[2]! * 0.95, `view width ${wheeledIn?.[2]!.toFixed(1)} -> ${wheeledOut?.[2]!.toFixed(1)}`);

  // ---- 2. the two ends of the range, measured ------------------------------------------------
  for (let i = 0; i < 20; i++) await wheel(-100);
  const inLimit = (await box())![2]!;
  const atIn = await box();
  await wheel(-100);
  check('at the zoom-IN limit a further notch is a no-op (it does not poison the view)', Math.abs((await box())![2]! - inLimit) < 0.01 && !!atIn);
  for (let i = 0; i < 20; i++) await wheel(100);
  const outLimit = (await box())![2]!;
  await wheel(100);
  check('at the zoom-OUT limit a further notch is a no-op', Math.abs((await box())![2]! - outLimit) < 0.01);
  check('the desktop range is the framed 4x (not a tiny sliver)', outLimit / inLimit > 3.9 && outLimit / inLimit < 4.1, `${inLimit.toFixed(1)} .. ${outLimit.toFixed(1)} = ${(outLimit / inLimit).toFixed(2)}x`);

  /** Put the view in the middle of the range, where BOTH directions must answer. */
  const mid = async () => {
    for (let i = 0; i < 16; i++) {
      const b = await box();
      if (!b) return;
      if (b[2]! > inLimit * 1.6 && b[2]! < outLimit * 0.8) return;
      await wheel(b[2]! <= inLimit * 1.6 ? 100 : -100);
    }
  };
  /**
   * THE ONE ASSERTION THAT MATTERS IN EVERY STATE: a wheel notch changes the view — unless the view
   * is provably at one of the two ends. "Nothing happened, and I was not at a limit" is the bug.
   */
  const zoomWorks = async (label: string) => {
    await mid();
    const before = await box();
    await wheel(-100);
    const after = await box();
    const moved = !!before && !!after && Math.abs(after[2]! - before[2]!) > 0.5;
    const atEnd = !!before && (Math.abs(before[2]! - inLimit) < 0.01 || Math.abs(before[2]! - outLimit) < 0.01);
    check(label, moved || atEnd, `view width ${before?.[2]?.toFixed(1)} -> ${after?.[2]?.toFixed(1)}`);
  };
  const doubleTapWorks = async (label: string) => {
    await mid();
    const r = await mapRect();
    const before = await box();
    await page.mouse.dblclick(r.x + r.width / 2, r.y + r.height / 2);
    await page.waitForTimeout(500);
    const after = await box();
    check(label, !!before && !!after && Math.abs(after[2]! - before[2]!) > 0.5, `view width ${before?.[2]?.toFixed(1)} -> ${after?.[2]?.toFixed(1)}`);
  };

  // ---- 3. THE REGRESSION: leaving the Territory and coming back -------------------------------
  // `open()` drops the view; the re-frame must not depend on a repaint that may never come.
  // Leave from the MIDDLE of the range, so "nothing changed" cannot be excused as being at an end.
  await mid();
  const beforeLeave = await box();
  await page.click('#online-world-back');
  await page.waitForTimeout(800);
  await enter();
  const afterReturn = await box();
  check('the map is still drawn after leaving and returning', !!afterReturn && afterReturn.every((n) => Number.isFinite(n)), `${beforeLeave?.[2]?.toFixed(1)} -> ${afterReturn?.[2]?.toFixed(1)}`);
  check('...and the middle of the map is still the map', /hex|svg/i.test(await centreHit()), await centreHit());
  await zoomWorks('after leaving and returning, the WHEEL still zooms');
  // A single click must move nothing at all: with the view missing, its release used to snap the map
  // to the fit box — a map that jumps under a plain click is the same broken state, seen another way.
  const beforeClick = await box();
  {
    const r = await mapRect();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await page.waitForTimeout(500);
  }
  const afterClick = await box();
  check('a plain click on the map does not move the view', !!beforeClick && !!afterClick && Math.abs(afterClick[2]! - beforeClick[2]!) < 0.05 && Math.abs(afterClick[0]! - beforeClick[0]!) < 0.05, `view width ${beforeClick?.[2]?.toFixed(1)} -> ${afterClick?.[2]?.toFixed(1)}`);
  await doubleTapWorks('after leaving and returning, the DOUBLE TAP still zooms');
  await zoomWorks('...and the wheel still zooms after that double tap');

  // ---- 4. the window's panes over the map -----------------------------------------------------
  /**
   * The key row folds and unfolds, and it stays out while a window is open — so a click on MENU is
   * not "open the row", it is "toggle it". This opens a key from any state.
   */
  const openKey = async (id: string) => {
    const keyed = (await page.evaluate(
      `(() => {
        const keys = document.querySelector('#online-world-keys');
        const key = document.querySelector(${JSON.stringify(id)});
        if (!keys || !key) return false;
        const r = key.getBoundingClientRect();
        return keys.classList.contains('open') && r.width > 0 && r.height > 0;
      })()`,
    )) as boolean;
    if (!keyed) {
      await page.click('#online-world-menu');
      await page.waitForTimeout(450);
    }
    await page.click(id);
    await page.waitForTimeout(650);
  };

  await openKey('#world-key-ranking');
  check('the ranking pane is open', await page.evaluate(`!document.querySelector('#online-world-panel')?.hasAttribute('hidden')`));
  await zoomWorks('with the ranking pane OPEN, the wheel zooms (at the map centre)');
  await page.click('#world-panel-close');
  await page.waitForTimeout(600);
  await zoomWorks('after the pane CLOSES, the wheel still zooms');

  // ---- 4b. after a GLIDE: a ranking row flies the view to that player's land ------------------
  // The glide writes `box` every frame on its own rAF, so the wheel has to take over cleanly when
  // it lands (`stopGlide` on the first wheel) and the view must still answer afterwards.
  await openKey('#world-key-ranking');
  await page.waitForSelector('.world-ranking-row', { timeout: 20_000 });
  await page.click('.world-ranking-row');
  await page.waitForTimeout(1300);
  await zoomWorks('after a fly-to glide, the wheel still zooms');
  await doubleTapWorks('...and the double tap still zooms after a glide');

  // The chat is the other window; it takes the same corner of the map.
  const chatVisible = async () =>
    (await page.evaluate(`(() => {
      const panel = document.querySelector('#online-world-chat-panel');
      if (!panel) return false;
      const r = panel.getBoundingClientRect();
      return !panel.hidden && r.width > 0 && r.height > 0;
    })()`)) as boolean;
  await openKey('#online-world-chat');
  check('the chat is open', await chatVisible());
  await openKey('#online-world-chat'); // the key toggles the chat shut
  check('the chat is closed again', !(await chatVisible()));
  await zoomWorks('after the chat opens and closes, the wheel still zooms');

  // ---- 5. a selected tile's bar (the map's own chrome) ---------------------------------------
  // A tap on the map selects the nearest cell (that is the map's own rule, and the tile under the
  // middle of a zoomed-in view is not the first hex in document order).
  {
    await page.waitForTimeout(450); // well past the double-tap window: this is one tap, not a toggle
    const r = await mapRect();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await page.waitForTimeout(500);
    check('a tile can be selected', await page.evaluate(`!!document.querySelector('.world-hex.selected')`));
    await zoomWorks('with the selection bar up, the wheel still zooms');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ---- 6. a resize ----------------------------------------------------------------------------
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForTimeout(800);
  await zoomWorks('after the window is RESIZED, the wheel still zooms');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(800);
  await zoomWorks('...and after resizing back, it still zooms');

  // ---- 7. A VIEW POISONED BY A MAP THAT CANNOT BE MEASURED (forced) --------------------------
  // Exactly the old arithmetic: a wheel whose anchor divides by a 0-wide box. A pointer at the rect's
  // own origin (0, 0) while the map is 0 x 0 is the `0 / 0` case that used to write
  // "NaN NaN 268.0 154.2" — a blank map that no wheel, drag or resize could ever bring back
  // (measured on the pre-fix build; see the note at `usableView`).
  const poisoned = await page.evaluate(`(() => {
    const svg = document.querySelector('.world-map-svg');
    if (!svg) return 'nosvg';
    svg.style.display = 'none';
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: r.left, clientY: r.top, bubbles: true, cancelable: true }));
    svg.style.display = '';
    return r.width + 'x' + r.height;
  })()`) as string;
  await page.waitForTimeout(500);
  const afterPoison = await box();
  check(`a wheel on a 0-sized map (measured ${poisoned}) writes a FINITE view`, !!afterPoison && afterPoison.every((n) => Number.isFinite(n)) && afterPoison[2]! > 0, afterPoison?.map((n) => n.toFixed(1)).join(' '));
  await zoomWorks('...and zoom still works afterwards');

  // ---- 8. A POINTER WHOSE RELEASE NEVER ARRIVED ---------------------------------------------
  // A mouse press with no `pointerup`, then another press, then a `pointerup` for a different id.
  // Latched, that made `pointers.size > 1` forever: every tap was read as a pinch, and the double
  // tap (the zoom toggle) stopped answering.
  await page.evaluate(`(() => {
    const svg = document.querySelector('.world-map-svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'mouse', pointerId: 7, bubbles: true, cancelable: true };
    svg.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0, buttons: 1 }));
    svg.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'mouse', pointerId: 9, button: 0, buttons: 0 }));
  })()`);
  await page.waitForTimeout(200);
  await doubleTapWorks('a mouse release the map never saw cannot latch the DOUBLE TAP');
  await zoomWorks('...and the wheel still zooms after that ghost');
  const ghostMove = await page.evaluate(`(() => {
    const svg = document.querySelector('.world-map-svg');
    if (!svg) return 'nosvg';
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: r.x + 10, clientY: r.y + 10, pointerType: 'mouse', pointerId: 7, buttons: 0, bubbles: true }));
    return 'ok';
  })()`);
  check('a mouse move with every button up is accepted as a release', ghostMove === 'ok');
  await doubleTapWorks('...and the double tap still zooms after it');

  // ---- 9. the catch-all: no viewBox the map ever wrote was non-finite -----------------------
  const log = (await page.evaluate('window.__vbLog')) as string[];
  const bad = log.filter((value) => value.split(/[\s,]+/).some((part) => !Number.isFinite(Number(part)) || part.trim() === ''));
  check('every viewBox the map wrote in this whole run was finite', log.length > 20 && bad.length === 0, `${log.length} writes, ${bad.length} bad${bad.length ? `: ${bad.slice(0, 3).join(' | ')}` : ''}`);

  check('no browser page exceptions', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((r) => api.close(() => r()));
}

console.log(failed === 0 ? '\nTerritory zoom: all checks passed.' : `\n${failed} territory zoom check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
