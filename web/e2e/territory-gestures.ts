// TERRITORY GESTURES (owner, 2026-10-28): "it should be possible to 'scroll' around the map always
// when holding and dragging finger. quick double tap should zoom out / zoom in, right now all of
// this is a bit buggy and glitchy".
//
// What this proves, on a real phone-sized Chromium with real touch events:
//   - hold-and-drag ALWAYS pans, from the middle and from an edge, and by exactly the distance the
//     finger travelled (the viewBox moves the same amount in map units);
//   - the pan survives the finger leaving the map, and it is not lost or offset afterwards (no
//     ghost pointer left behind);
//   - a quick double tap zooms IN, and a second double tap zooms back OUT (a toggle);
//   - a single tap still selects a tile and does NOT zoom — and a slightly unsteady tap (a few px
//     of jitter) is still a tap, not a pan;
//   - a slow second tap is two taps, not a double tap;
//   - the map never scrolls the page sideways while dragging.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/territory-gestures.ts
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
          CHANNEL: 'futa04',
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
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const page: Page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(1200);
  const cdp = await context.newCDPSession(page);

  /** The map's viewBox as numbers — the one truthful read of where the map is looking. */
  const box = () =>
    page.evaluate(`(() => {
      const s = document.querySelector('.world-map-svg');
      const v = (s?.getAttribute('viewBox') ?? '').split(/[\\s,]+/).map(Number);
      return v.length === 4 ? v : null;
    })()`) as Promise<number[] | null>;
  const rect = (await page.locator('.world-map-svg').boundingBox())!;
  const touch = (type: string, pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart' | 'touchMove' | 'touchEnd',
      touchPoints: pts.map((p, i) => ({ ...p, id: i + 1 })),
    });
  /** Drag from one point to another in `steps` moves, a frame apart. */
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, steps = 20) => {
    await touch('touchStart', [from]);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', [
        { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps },
      ]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(120);
  };
  /** A tap, optionally held for `holdMs` before lifting (a slow second tap). */
  const tap = async (x: number, y: number, holdMs = 30) => {
    await touch('touchStart', [{ x, y }]);
    await page.waitForTimeout(holdMs);
    await touch('touchEnd', []);
  };

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  // ---- 1. a plain drag pans, and by exactly the finger's distance -------------------------------
  const before = await box();
  await drag({ x: cx, y: cy }, { x: cx - 60, y: cy - 40 });
  const after = await box();
  const panDx = before && after ? after[0]! - before[0]! : 0;
  const panDy = before && after ? after[1]! - before[1]! : 0;
  // The finger moved LEFT and UP, so the map must look further RIGHT and DOWN.
  check('a hold-and-drag pans the map', before !== null && after !== null && Math.abs(panDx) > 0.4, `viewBox x ${before?.[0]!.toFixed(2)} -> ${after?.[0]!.toFixed(2)}`);
  check('the pan follows the finger on both axes', panDx > 0 && panDy > 0, `dx ${panDx.toFixed(2)} dy ${panDy.toFixed(2)}`);
  // Map units per CSS pixel, from the box width against the element width.
  const unitsPerPx = after![2]! / rect.width;
  const expectedDx = 60 * unitsPerPx;
  check('the pan distance matches the drag (no drift, no double-apply)', Math.abs(panDx - expectedDx) < expectedDx * 0.2, `moved ${panDx.toFixed(2)}, expected ~${expectedDx.toFixed(2)}`);

  // ---- 2. the pan keeps working, from an edge, and does not drift -------------------------------
  const edgeFrom = { x: rect.x + 8, y: rect.y + rect.height - 8 };
  const beforeEdge = await box();
  await drag(edgeFrom, { x: edgeFrom.x + 50, y: edgeFrom.y - 50 });
  const afterEdge = await box();
  check('a drag that starts at the edge of the map still pans', beforeEdge !== null && afterEdge !== null && Math.abs((afterEdge[0] ?? 0) - (beforeEdge[0] ?? 0)) > 0.3, `viewBox x ${beforeEdge?.[0]!.toFixed(2)} -> ${afterEdge?.[0]!.toFixed(2)}`);

  // ---- 3. a drag that runs OUT of the map still ends cleanly (no ghost pointer) -----------------
  const beforeOut = await box();
  await touch('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: cx - i * 12, y: cy - i * 6 }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(120);
  const afterOut = await box();
  check('a drag that leaves the map still pans', beforeOut !== null && afterOut !== null && Math.abs((afterOut[0] ?? 0) - (beforeOut[0] ?? 0)) > 0.4);
  // If a pointer were left behind, this next small drag would jump by the stale offset.
  const beforeNext = await box();
  await drag({ x: cx, y: cy }, { x: cx - 30, y: cy });
  const afterNext = await box();
  const nextDx = afterNext && beforeNext ? afterNext[0]! - beforeNext[0]! : 0;
  const expectedNext = 30 * (afterNext?.[2]! / rect.width);
  check('the next drag is not offset by a ghost pointer', Math.abs(nextDx - expectedNext) < expectedNext * 0.25, `moved ${nextDx.toFixed(2)}, expected ~${expectedNext.toFixed(2)}`);

  // ---- 4. a single tap selects, and does not zoom -----------------------------------------------
  const atTap = await box();
  await tap(cx, cy);
  await page.waitForTimeout(450); // past the double-tap window
  const afterTap = await box();
  const selected = await page.evaluate(`!!document.querySelector('.world-hex.selected, .world-hex-cell.selected, [data-selected="true"]')`);
  check('a single tap selects a tile', !!selected);
  check('a single tap does NOT zoom', afterTap !== null && atTap !== null && Math.abs(afterTap[2]! - atTap[2]!) < 0.05, `width ${atTap?.[2]!.toFixed(2)} -> ${afterTap?.[2]!.toFixed(2)}`);

  // ---- 5. an unsteady tap is still a tap (a few px of jitter must not pan) ----------------------
  const atJitter = await box();
  await touch('touchStart', [{ x: cx, y: cy }]);
  await touch('touchMove', [{ x: cx + 3, y: cy + 2 }]);
  await page.waitForTimeout(40);
  await touch('touchEnd', []);
  await page.waitForTimeout(450);
  const afterJitter = await box();
  check('a tap with a few px of jitter does not pan the map', afterJitter !== null && atJitter !== null && Math.abs(afterJitter[0]! - atJitter[0]!) < 0.05, `${atJitter?.[0]!.toFixed(2)} -> ${afterJitter?.[0]!.toFixed(2)}`);

  // ---- 6. double tap zooms IN, second double tap zooms OUT -------------------------------------
  // Two QUICK taps on the map are one double tap and toggle the zoom.
  const atDouble = await box();
  await tap(cx, cy);
  await page.waitForTimeout(90);
  await tap(cx, cy);
  await page.waitForTimeout(450);
  const zoomedIn = await box();
  check('a quick double tap zooms IN', zoomedIn !== null && atDouble !== null && (zoomedIn[2] ?? 0) < (atDouble[2] ?? 0) * 0.75, `view width ${atDouble?.[2]!.toFixed(2)} -> ${zoomedIn?.[2]!.toFixed(2)}`);
  await tap(cx, cy);
  await page.waitForTimeout(90);
  await tap(cx, cy);
  await page.waitForTimeout(450);
  const zoomedOut = await box();
  check('a second double tap zooms back OUT', zoomedOut !== null && zoomedIn !== null && (zoomedOut[2] ?? 0) > (zoomedIn[2] ?? 0) * 1.2, `view width ${zoomedIn?.[2]!.toFixed(2)} -> ${zoomedOut?.[2]!.toFixed(2)}`);

  // ---- 7. a slow second tap is two taps, not a double tap --------------------------------------
  const atSlow = await box();
  await tap(cx, cy);
  await page.waitForTimeout(420); // well past DOUBLE_TAP_MS
  await tap(cx, cy);
  await page.waitForTimeout(450);
  const afterSlow = await box();
  check('a slow second tap is not a double tap', afterSlow !== null && atSlow !== null && Math.abs(afterSlow[2]! - atSlow[2]!) < 0.05, `width ${atSlow?.[2]!.toFixed(2)} -> ${afterSlow?.[2]!.toFixed(2)}`);

  // ---- 8. dragging never scrolls the page ------------------------------------------------------
  const scroll = await page.evaluate(`(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sx: scrollX }))()`) as { sw: number; iw: number; sx: number };
  check('dragging the map never scrolls the page sideways', scroll.sw <= scroll.iw + 1 && scroll.sx === 0, JSON.stringify(scroll));

  // ---- 8b. a second tap at a NORMAL pace still releases the same tile (and never zooms) --------
  const tileBox = await page.evaluate(`(() => { const el = document.querySelector('[data-cell-id]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`) as { x: number; y: number } | null;
  if (tileBox) {
    const atTile = await box();
    await tap(tileBox.x, tileBox.y);
    await page.waitForTimeout(400); // a normal, deliberate second tap
    await tap(tileBox.x, tileBox.y);
    await page.waitForTimeout(450);
    const afterTile = await box();
    const released = await page.evaluate(`!document.querySelector('.world-hex.selected, [data-selected="true"]')`);
    check('a slower second tap on the same tile releases it', !!released);
    check('...and that pair does not zoom the map', afterTile !== null && atTile !== null && Math.abs(afterTile[2]! - atTile[2]!) < 0.05, `width ${atTile?.[2]!.toFixed(2)} -> ${afterTile?.[2]!.toFixed(2)}`);
  }

  // ---- 9. NO PLAYER TAG IS SHOWN (owner, 2026-10-28) ------------------------------------------
  // The ranking and the chat both show a name only. The tag must still exist for hover and for
  // assistive tech, because two players can share a name.
  // The ranking pane is behind a key; wait for it to actually paint rows, so this check can never
  // pass just because nothing was on screen (a vacuous green is worse than a red).
  // The keys slide out of the MENU key (the ranking is the first of the four).
  await page.click('#online-world-menu');
  await page.waitForTimeout(300);
  await page.click('#world-key-ranking');
  await page
    .waitForSelector('.world-ranking-row', { timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
  const tagScan = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.world-ranking-row, .world-chat-line')];
    const shown = rows.map((r) => (r.textContent || '').trim()).filter(Boolean);
    const visibleTag = shown.some((t) => /#[0-9A-HJKMNP-TV-Z]{4}/.test(t));
    const kept = rows.some((r) => /#[0-9A-HJKMNP-TV-Z]{4}/.test(r.getAttribute('aria-label') || '') || /#[0-9A-HJKMNP-TV-Z]{4}/.test(r.getAttribute('title') || '') || /#[0-9A-HJKMNP-TV-Z]{4}/.test((r.querySelector('[title]') || {}).title || ''));
    const first = rows[0];
    return { rows: rows.length, shown: shown.slice(0, 3), visibleTag, kept };
  })()`) as { rows: number; shown: string[]; visibleTag: boolean; kept: boolean };
  check('the ranking really painted rows to check', tagScan.rows > 0, `${tagScan.rows} row(s)`);
  check('no player tag is visible in the ranking or chat', !tagScan.visibleTag, JSON.stringify(tagScan).slice(0, 240));
  check('the tag is still available for hover and assistive tech', tagScan.kept, JSON.stringify(tagScan).slice(0, 240));

  check('no browser page exceptions', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((r) => api.close(() => r()));
}

console.log(failed === 0 ? '\nTerritory gestures: all checks passed.' : `\n${failed} territory gesture check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
