// TERRITORY GESTURES ON WEBKIT (iOS), owner 2026-10-28: "trying to zoom territory, navigate around
// it, scroll across now stopped working on my iphone, it selects a tile but dragging doesn't move
// the map and zooming stops working too".
//
// THIS IS THE SUITE THAT WOULD HAVE CAUGHT THAT REGRESSION. `web/e2e/territory-gestures.ts` drives
// Chromium touch over CDP and stayed 18/18 green while the owner's iPhone was broken, because the
// two engines do not hand a gesture to the page the same way. Everything here runs on WebKit with
// REAL touch input: Playwright's public API can only tap in WebKit, but its WebKit build speaks
// `Input.dispatchTouchEvent` (touchStart / touchMove / touchEnd / touchCancel); its client just
// never exposes it. This suite keeps the page-proxy session the packaged touchscreen uses and sends
// those commands itself, so a drag below is a genuine, trusted WebKit touch drag — the same
// pipeline an iPhone uses (implicit pointer capture, real coalescing, real cancellation).
//
// What it proves:
//   - a real touch drag pans the map, by exactly the finger's distance;
//   - a real quick double tap zooms;
//   - a real two-finger pinch zooms it;
//   - a real tap selects a tile and does not zoom;
//   - THE REGRESSION: a release the map's SVG never sees (iOS dispatches the end of a touch at the
//     document, then keeps sending moves for that same finger) must NOT freeze the map. The drag
//     continues from where the finger was, by the exact remaining distance;
//   - a genuinely cancelled gesture leaves nothing behind (the next drag is not offset).
//
//   npx tsx web/e2e/territory-gestures-ios.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { webkit, devices, type Page } from 'playwright-core';
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

// ---- REAL WEBKIT TOUCH ------------------------------------------------------------------------
const require = createRequire(import.meta.url);
/** The WebKit page-proxy session, captured from the first packaged tap. */
const proxy: { session: any } = { session: null };
try {
  const root = path.dirname(require.resolve('playwright-core/package.json'));
  const wkInput = require(path.join(root, 'lib/server/webkit/wkInput.js'));
  const original = wkInput.RawTouchscreenImpl.prototype.tap;
  wkInput.RawTouchscreenImpl.prototype.tap = async function (this: any, progress: any, x: number, y: number, modifiers: number) {
    proxy.session = this._pageProxySession;
    return original.call(this, progress, x, y, modifiers);
  };
} catch {
  // Reported by the first check below: a suite that cannot drive touch must never look green.
}

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
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () =>
  (await (
    await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  ).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) =>
  store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });

// A world with land in it, so there is something to pan across and a tile to select.
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
for (const [j, cell] of ['-2,-4', '-1,-4'].entries()) await store.claim(me.player.id, cell, `mine-${j}`, Date.now());
await store.acknowledgeInvitation(me.player.id);
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind });

// The suite builds its own bundle: the API port is baked into it, so a stale dist cannot work.
if (process.env.SKIP_BUILD !== '1')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: {
        ...process.env,
        CHANNEL: 'futa04',
        VITE_DUEL_API_URL: apiBase,
        VITE_SUPABASE_URL: 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
  });
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

/** A viewBox number for a message: `undefined` must print as `?`, never throw. */
const fmt = (n?: number) => (typeof n === 'number' ? n.toFixed(2) : '?');
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const browser = await webkit.launch();
const errors: string[] = [];
try {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page: Page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
    // `setPointerCapture` on the SVG was a suspect for this regression: record whether WebKit ever
    // refuses it, rather than assuming either way.
    const w = window as any;
    w.__capture = [] as string[];
    const original = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (this: Element, id: number) {
      try {
        original.call(this, id);
        w.__capture.push(`ok#${id}`);
      } catch (error) {
        w.__capture.push(`THREW#${id} ${String(error)}`);
        throw error;
      }
    };
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(1200);

  const view = () =>
    page.evaluate(`(() => {
      const s = document.querySelector('.world-map-svg');
      const v = (s?.getAttribute('viewBox') ?? '').split(/[\\s,]+/).map(Number);
      return v.length === 4 ? v : null;
    })()`) as Promise<number[] | null>;
  const selected = () =>
    page.evaluate(`(() => { const el = document.querySelector('.world-hex.selected'); return el ? el.getAttribute('data-cell-id') : null; })()`) as Promise<string | null>;
  /**
   * The view writes once per animation frame (see `queueView`), and WebKit does not run frames
   * while the page sits idle between trusted touches — so a read taken straight after a gesture can
   * still see the frame BEFORE it. Ask for a frame explicitly (bounded, so a page that never paints
   * cannot hang the suite), then wait for the attribute to stop moving rather than for a fixed time.
   *
   * The first FAILURE this suite reported — "moved 16.42, expected ~8.96" — was this, not the map:
   * the cancelled gesture's own 50 px pan was read one frame late, so it was credited to the next
   * drag's 60 px. (Behind it was a second, real residue: a cancelled gesture could still be resumed
   * and re-apply its own distance — see the section 6 checks.)
   */
  const settle = async () => {
    await page.evaluate(`new Promise((done) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; done(true); } };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 250);
    })`);
    let last = '';
    for (let i = 0; i < 30; i++) {
      const now = (await page.evaluate(`document.querySelector('.world-map-svg')?.getAttribute('viewBox') ?? ''`)) as string;
      if (now === last) return;
      last = now;
      await page.waitForTimeout(40);
    }
  };
  const rect = (await page.locator('.world-map-svg').boundingBox())!;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  /** Map units per CSS pixel, from the live viewBox against the element's width. */
  const unitsPerPx = async () => ((await view())![2]! / rect.width);

  // Capture the WebKit page-proxy session with the one packaged primitive: a real tap.
  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(400);
  check('WebKit can be driven with real touch input', !!proxy.session, proxy.session ? '' : 'Playwright internals unavailable — this suite cannot test iOS');
  if (!proxy.session) throw new Error('cannot drive real WebKit touch: the suite would be meaningless');

  const touch = async (type: string, points: Array<{ x: number; y: number; id: number }>) => {
    await proxy.session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id })),
    });
  };
  const tap = async (x: number, y: number, holdMs = 30) => {
    await touch('touchStart', [{ x, y, id: 1 }]);
    await page.waitForTimeout(holdMs);
    await touch('touchEnd', [{ x, y, id: 1 }]);
    await page.waitForTimeout(120);
  };
  /** A real one-finger drag. `during` runs after the first move, while the finger is still down. */
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, steps = 20, during?: () => Promise<void>) => {
    await touch('touchStart', [{ ...from, id: 1 }]);
    let last = from;
    for (let i = 1; i <= steps; i++) {
      last = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await touch('touchMove', [{ ...last, id: 1 }]);
      await page.waitForTimeout(16);
      if (i === 1 && during) await during();
    }
    await touch('touchEnd', [{ ...last, id: 1 }]);
    await page.waitForTimeout(160);
    await settle();
  };

  check('the map still declares touch-action: none', (await page.evaluate(`getComputedStyle(document.querySelector('.world-map-svg')).touchAction`)) === 'none');

  // ---- 1. a real drag pans, by exactly the finger's distance ---------------------------------
  await settle();
  let before = await view();
  await drag({ x: cx, y: cy }, { x: cx - 80, y: cy - 40 });
  let after = await view();
  const panDx = after && before ? after[0]! - before[0]! : 0;
  const panDy = after && before ? after[1]! - before[1]! : 0;
  check('a real touch drag pans the map', !!before && !!after && Math.abs(panDx) > 0.4, `viewBox x ${fmt(before?.[0])} -> ${fmt(after?.[0])}`);
  // The finger moved LEFT and UP, so the map must look further RIGHT and DOWN.
  check('the pan follows the finger on both axes', panDx > 0 && panDy > 0, `dx ${panDx.toFixed(2)} dy ${panDy.toFixed(2)}`);
  const perPx = await unitsPerPx();
  const expected = 80 * perPx;
  check('the pan distance matches the drag (no drift, no double-apply)', Math.abs(panDx - expected) < expected * 0.15, `moved ${panDx.toFixed(2)}, expected ~${expected.toFixed(2)}`);
  check('setPointerCapture is accepted on the SVG in WebKit', (await page.evaluate(`window.__capture.some((c) => c.startsWith('ok'))`)) === true, JSON.stringify(await page.evaluate(`window.__capture.splice(0, 3)`)));

  // ---- 2. a real quick double tap zooms, and the same gesture reverses it ---------------------
  before = await view();
  await tap(cx, cy);
  await tap(cx, cy);
  await page.waitForTimeout(400);
  await settle();
  const afterFirst = await view();
  check('a real quick double tap zooms the map', !!before && !!afterFirst && Math.abs(afterFirst[2]! - before[2]!) > 0.5, `view width ${fmt(before?.[2])} -> ${fmt(afterFirst?.[2])}`);
  await tap(cx, cy);
  await tap(cx, cy);
  await page.waitForTimeout(400);
  await settle();
  after = await view();
  // The toggle picks its direction from how deep the view already is (a quarter of the framed view
  // is as far in as it goes), so the contract is "the same gesture goes the other way", not "the
  // first one always goes in".
  const firstWay = Math.sign(afterFirst![2]! - before![2]!);
  const secondWay = Math.sign(after![2]! - afterFirst![2]!);
  check('a second double tap zooms the other way (a toggle)', firstWay !== 0 && secondWay === -firstWay, `${fmt(before?.[2])} -> ${fmt(afterFirst?.[2])} -> ${fmt(after?.[2])}`);

  // ---- 3. a real pinch zooms -----------------------------------------------------------------
  before = await view();
  await touch('touchStart', [{ x: cx - 60, y: cy, id: 1 }]);
  await page.waitForTimeout(16);
  await touch('touchStart', [{ x: cx - 60, y: cy, id: 1 }, { x: cx + 60, y: cy, id: 2 }]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: cx - 60 - i * 6, y: cy, id: 1 }, { x: cx + 60 + i * 6, y: cy, id: 2 }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', [{ x: cx - 132, y: cy, id: 1 }]);
  await page.waitForTimeout(16);
  await touch('touchEnd', [{ x: cx + 132, y: cy, id: 2 }]);
  await page.waitForTimeout(200);
  await settle();
  after = await view();
  check('a real two-finger pinch zooms the map', !!before && !!after && Math.abs(after[2]! - before[2]!) > 0.5, `view width ${fmt(before?.[2])} -> ${fmt(after?.[2])}`);
  // Pinching apart must zoom IN: the visible view gets narrower.
  check('pinching the fingers apart zooms IN', !!before && !!after && after[2]! < before[2]!, `view width ${fmt(before?.[2])} -> ${fmt(after?.[2])}`);

  // ---- 4. a real tap selects, and does not zoom ----------------------------------------------
  const atTap = await view();
  const wasSelected = await selected();
  await tap(cx + 40, cy + 30);
  await page.waitForTimeout(400);
  const nowSelected = await selected();
  check('a real touch tap selects a tile', nowSelected !== null, `${wasSelected} -> ${nowSelected}`);
  check('a real touch tap does not zoom', !!atTap && Math.abs((await view())![2]! - atTap[2]!) < 0.05);

  // ---- 5. THE REGRESSION: a release the SVG never sees must not freeze the map ----------------
  await settle();
  before = await view();
  let strays = 0;
  await drag(
    { x: cx, y: cy },
    { x: cx + 140, y: cy },
    14,
    async () => {
      // The finger is down and the map is tracking it; now the browser says it ended — delivered at
      // the DOCUMENT, so the map's own SVG listener never runs. iOS does this, and then keeps
      // sending moves for the same finger under the same pointerId.
      await page.evaluate(
        `document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, clientX: ${cx + 10}, clientY: ${cy} }))`,
      );
      strays++;
      await page.waitForTimeout(16);
    },
  );
  after = await view();
  const strayDx = after && before ? after[0]! - before[0]! : 0;
  const strayPerPx = await unitsPerPx();
  const strayExpected = 140 * strayPerPx;
  check('a stray document-level release happens mid-drag', strays === 1);
  check('the map keeps panning after a release the SVG never saw', Math.abs(strayDx) > 0.4, `viewBox x ${fmt(before?.[0])} -> ${fmt(after?.[0])}`);
  check('...and the pan continues by the full finger distance, with no jump', Math.abs(-strayDx - strayExpected) < strayExpected * 0.15, `moved ${(-strayDx).toFixed(2)}, expected ~${strayExpected.toFixed(2)}`);

  // ---- 6. a genuinely cancelled gesture leaves nothing behind --------------------------------
  await settle();
  const beforeCancel = await view();
  await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [{ x: cx - i * 10, y: cy, id: 1 }]);
    await page.waitForTimeout(16);
  }
  await touch('touchCancel', [{ x: cx - 50, y: cy, id: 1 }]);
  await page.waitForTimeout(150);
  await settle();
  const afterCancel = await view();
  const cancelPerPx = await unitsPerPx();
  const cancelDx = afterCancel && beforeCancel ? afterCancel[0]! - beforeCancel[0]! : 0;
  // The cancelled gesture really did pan its own 50 px while the finger was down, so the checks
  // below measure the NEXT gesture against a map this one has already moved — not a frozen one.
  check('a cancelled gesture panned while the finger was down', Math.abs(cancelDx - 50 * cancelPerPx) < 3 * cancelPerPx, `moved ${cancelDx.toFixed(2)}, expected ~${(50 * cancelPerPx).toFixed(2)}`);
  // A move can still arrive for a finger the browser has already cancelled (a queued frame of
  // moves, or iOS delivering the cancel late). It has to re-anchor where the finger is NOW: the
  // position the dead gesture ended on is the residue that gets re-applied to the next gesture.
  await page.evaluate(
    `document.querySelector('.world-map-svg').dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: ${cx - 70}, clientY: ${cy} }))`,
  );
  await page.waitForTimeout(150);
  await settle();
  const afterDeadMove = await view();
  const deadDx = afterDeadMove && afterCancel ? afterDeadMove[0]! - afterCancel[0]! : 99;
  check('a move for an already-cancelled finger does not back-fill the dead gesture', Math.abs(deadDx) < 3 * cancelPerPx, `moved ${deadDx.toFixed(2)}, expected 0`);
  before = await view();
  await drag({ x: cx, y: cy }, { x: cx - 60, y: cy });
  after = await view();
  const nextPerPx = await unitsPerPx();
  const nextDx = after && before ? after[0]! - before[0]! : 0;
  check('a drag after a cancelled gesture still pans', Math.abs(nextDx) > 0.3, `viewBox x ${fmt(before?.[0])} -> ${fmt(after?.[0])}`);
  // EXACTLY the new gesture's distance, in the new gesture's own pixels: 3 CSS px of slack is the
  // viewBox's own rounding, and nothing else. The cancelled 50 px cannot hide in it (it used to read
  // 16.42 against an expected 8.96 because the snapshot was one frame — one gesture — behind).
  check(
    '...and it is not offset by a ghost pointer',
    Math.abs(nextDx - 60 * nextPerPx) < 3 * nextPerPx,
    `moved ${nextDx.toFixed(2)}, expected ~${(60 * nextPerPx).toFixed(2)}`,
  );
  // The whole episode, from before the cancelled gesture to after the next drag: exactly the two
  // gestures' finger travel (50 px + 60 px), with nothing re-applied in between.
  const episodeDx = after && beforeCancel ? after[0]! - beforeCancel[0]! : 0;
  const episodeExpected = 110 * nextPerPx;
  check('the cancelled gesture and the drag after it move the map by only their own distances', Math.abs(episodeDx - episodeExpected) < 3 * nextPerPx, `moved ${episodeDx.toFixed(2)}, expected ~${episodeExpected.toFixed(2)}`);

  // ---- 7. no page exceptions ------------------------------------------------------------------
  check('no browser page exceptions', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((r) => api.close(() => r()));
}

console.log(failed === 0 ? '\nTerritory gestures (WebKit/iOS): all checks passed.' : `\n${failed} territory gesture check(s) failed on WebKit`);
process.exit(failed === 0 ? 0 : 1);
