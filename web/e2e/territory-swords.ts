// FUTASAKU 0.5 — the crossed swords on a challenged Territory tile, in a real browser.
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   tsx web/e2e/territory-swords.ts [--dist=web/dist-futa05]
//
// Owner's instruction (2026-10-24): "place 2 swords graphic on top of the tile that is being
// challenged... place it as soon as challenge has been sent. if someone clicks at it they can see
// who challenged it too."
//
// Why this file exists beside territory-challenges.ts: that suite proves the ring/sheet/rail logic at
// phone sizes; this one is the owner's visual receipt — both perspectives, the tap, the send/answer
// pair, a pan+zoom proof that the glyph is glued to its tile, and reduced motion, at BOTH 390x844 and
// 1280x800. Every screenshot lands in /tmp/territory-swords/.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { WORLD_CELLS, worldNeighbours } from '../../server/src/world.js';
import type { WorldChallengeWire } from '../../server/src/seeds/types.js';

const OUT = '/tmp/territory-swords';
mkdirSync(OUT, { recursive: true });

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

const X = Math.sqrt(3);
const R = 10;
const position = (cell: { q: number; r: number }) => ({ x: X * (cell.q + cell.r / 2) * R, y: 1.5 * cell.r * R });
const xs = WORLD_CELLS.map((cell) => position(cell).x);
const ys = WORLD_CELLS.map((cell) => position(cell).y);
const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
const hub = WORLD_CELLS
  .filter((cell) => worldNeighbours(cell.id).length === 6)
  .sort((a, b) => ((position(a).x - centreX) ** 2 + (position(a).y - centreY) ** 2) -
    ((position(b).x - centreX) ** 2 + (position(b).y - centreY) ** 2))[0]!;
const around = worldNeighbours(hub.id);
const own1 = around[1]!;   // mine, carrying an INCOMING challenge (defender's view)
const rival2 = around[4]!; // rival, my OUTGOING pending challenge (challenger's view)
const sendTarget = around[3]!; // rival, no challenge: where the suite sends a new one
const OWN = new Set([hub.id, own1]);

const claims = [hub.id, own1, rival2, sendTarget].map((cellId) => ({
  cellId,
  ownerId: OWN.has(cellId) ? 'p1' : 'r1',
  ownerName: OWN.has(cellId) ? 'BloomHeron' : 'RYK',
  ownerLevel: OWN.has(cellId) ? 11 : null,
  ownerTag: OWN.has(cellId) ? '1001' : '1002',
  colour: OWN.has(cellId) ? 'hsl(80 34% 49%)' : 'hsl(220 34% 49%)',
  claimedAt: NOW - 5 * 60_000,
}));
const WORLD = { ok: true, world: { version: 2, revision: 5, cost: 100, challengeStake: 0, cells: WORLD_CELLS, claims } };

const base = {
  challengerId: 'p1', defenderId: 'r1', challengerName: 'BloomHeron', defenderName: 'RYK',
  fromMe: true, stake: 0, stakeCellId: null, respondedAt: null, matchId: null, matchFinished: false,
  matchWinnerId: null, winnerId: null, resolvedAt: null, remainingMs: 0, serverNow: NOW,
};
/** The ONE mutable list the mock serves; the send/answer steps edit it as the server would. */
const state: { incoming: WorldChallengeWire[]; outgoing: WorldChallengeWire[] } = {
  incoming: [{
    ...base, id: 'in-1', cellId: own1, challengerId: 'r1', defenderId: 'p1',
    challengerName: 'RYK', defenderName: 'BloomHeron', fromMe: false, status: 'pending',
    createdAt: NOW - 2 * HOUR, expiresAt: NOW + 22 * HOUR,
  }],
  outgoing: [{
    ...base, id: 'out-1', cellId: rival2, status: 'pending',
    createdAt: NOW - 18 * HOUR, expiresAt: NOW + 6 * HOUR,
  }],
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const n2 = (value: number) => Number(value.toFixed(2));

const settleSheet = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const card = document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-card') as HTMLElement | null;
    return !!card && card.dataset.ixState === 'open';
  }, undefined, { timeout: 5000 }).catch(() => undefined);
};

const tapAt = async (page: Page, selector: string) => {
  await page.evaluate((sel) => {
    const node = document.querySelector(sel) as SVGElement | null;
    const svg = node?.ownerSVGElement;
    if (!node || !svg) return;
    const box = node.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true,
      clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    };
    svg.dispatchEvent(new PointerEvent('pointerdown', init));
    svg.dispatchEvent(new PointerEvent('pointerup', init));
  }, selector);
  await page.waitForTimeout(60);
};
const tapTile = (page: Page, cellId: string) => tapAt(page, `.world-hex[data-cell-id="${cellId}"]`);
const tapSwords = (page: Page, cellId: string) => tapAt(page, `.world-swords[data-cell-id="${cellId}"] .world-swords-hit`);

/**
 * A tap on contested ground SELECTS it; the tile bar's one key (VIEW CHALLENGE) opens the sheet that
 * says who challenged. (The sheet is not opened by the tap itself — that is the 2026-10-28 redesign,
 * and this suite stopped running before it ever reached here, so it still assumed the old door.)
 */
const tapAndOpenSheet = async (page: Page): Promise<void> => {
  const open = await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 1500 })
    .then(() => true).catch(() => false);
  if (open) return;
  await activate(page, '#online-world-selection .world-claim-button');
  await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
};

const activate = async (page: Page, selector: string) => {
  await page.locator(selector).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
};

const markerInfo = (page: Page, cellId: string) => page.evaluate((id) => {
  const group = document.querySelector(`.world-swords[data-cell-id="${id}"]`) as SVGGElement | null;
  const hit = group?.querySelector('.world-swords-hit') as SVGCircleElement | null;
  const tile = document.querySelector(`.world-hex[data-cell-id="${id}"]`) as SVGPathElement | null;
  if (!group || !hit || !tile) return null;
  const hb = hit.getBoundingClientRect();
  const tb = tile.getBoundingClientRect();
  return {
    label: hit.getAttribute('aria-label') ?? '',
    side: group.getAttribute('data-side') ?? '',
    hit: { w: hb.width, h: hb.height },
    tile: { w: tb.width, h: tb.height },
    dx: (hb.left + hb.width / 2) - (tb.left + tb.width / 2),
    dy: (hb.top + hb.height / 2) - (tb.top + tb.height / 2),
    // The trace contains both swords in ONE path; the old two rotated <g> copies are gone. Count
    // the drawn path so a regression that drops the glyph (or doubles it) still fails here.
    swords: group.querySelectorAll(':scope > g.world-swords-glyph > path').length,
  };
}, cellId);

const markerCount = (page: Page) => page.evaluate(() => document.querySelectorAll('.world-swords').length);

const closeup = async (page: Page, cellId: string, path: string) => {
  const box = await page.evaluate((id) => {
    const tile = document.querySelector(`.world-hex[data-cell-id="${id}"]`) as SVGPathElement | null;
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, cellId);
  if (!box) return;
  const pad = 26;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(page.viewportSize()!.width - x, box.width + pad * 2);
  const height = Math.min(page.viewportSize()!.height - y, box.height + pad * 2);
  await page.screenshot({ path, clip: { x, y, width, height } });
};

const dragTo = async (page: Page, dx: number, dy: number, touch: boolean) => {
  const panel = await page.locator('.world-map-svg').boundingBox();
  if (!panel) return;
  const cx = panel.x + panel.width / 2;
  const cy = panel.y + panel.height / 2;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - dx / 2, y: cy - dy / 2 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: cx - dx / 2 + dx * step / 8, y: cy - dy / 2 + dy * step / 8 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(cx - dx / 2, cy - dy / 2);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(cx - dx / 2 + dx * step / 8, cy - dy / 2 + dy * step / 8);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(120);
};

const viewBox = (page: Page) => page.evaluate(() =>
  (document.querySelector('.world-map-svg')?.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number));

let BASE_URL = '';

const routeWorld = async (page: Page) => {
  await page.route(/\/v1\/world\/challenges(\/.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...state, serverNow: NOW }) });
      return;
    }
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    if (request.url().endsWith('/respond')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, challenge: { ...state.incoming[0], status: 'declined' }, matchId: null }) });
      return;
    }
    const sent: WorldChallengeWire = {
      ...base, id: 'new-1', cellId: String(body.cellId), status: 'pending',
      createdAt: NOW, expiresAt: NOW + 24 * HOUR, remainingMs: 24 * HOUR,
    };
    state.outgoing = [sent, ...state.outgoing.filter((c) => c.id !== 'new-1')];
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, replayed: false, challenge: sent }) });
  });
  await page.route('**/v1/world', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(WORLD),
  }));
  await page.route('**/v1/seeds/wallet', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, wallet: { balance: 150, lifetimeEarned: 150, lifetimeSpent: 0, worldInvitationSeen: true } }),
  }));
  await page.route('**/v1/guests*', (route) => route.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'p1', kind: 'guest', displayName: 'BloomHeron' }, serverNow: NOW }),
  }));
};

const openTerritory = async (page: Page) => {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
  // The FIT key (`#online-world-fit`) was removed with the 2026-10-28 menu redesign, and this line
  // used to wait for it — which is why this suite died in setup, before it checked a single marker.
  // Readiness is the LOBBY being installed: the world view injects its hardware-key icons when it is
  // constructed, and that is the moment `#menu-world` has a handler.
  await page.waitForFunction(() => !!document.querySelector('#online-world-keys .world-key svg'), undefined, { timeout: 20_000 });
  await activate(page, '#menu-world');
  await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
  await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 45_000 });
  await page.waitForSelector('.world-swords', { timeout: 20_000 });
  await page.waitForTimeout(300);
};

try {
  const { server, url } = await serveStaticDist(DIST);
  BASE_URL = url;
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

  for (const size of [{ w: 390, h: 844, touch: true }, { w: 1280, h: 800, touch: false }] as const) {
    const tag = `${size.w}x${size.h}`;
    console.log(`\n=== ${tag} ===`);
    const page = await browser.newPage({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2,
      hasTouch: size.touch, isMobile: size.touch,
    });
    // Five agents share this machine; a full-page DPR-2 screenshot of the filtered map can sit in
    // Chromium's raster queue for longer than the 30s default while another worktree builds. The
    // product checks above/below are not time-dependent, so give the screenshots room rather than
    // let a noisy neighbour turn a visual receipt into a red suite.
    page.setDefaultTimeout(180_000);
    await page.addInitScript(() => localStorage.clear());
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    await routeWorld(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('ERR_UNSAFE_PORT')) errors.push(`console: ${message.text()}`);
    });
    await openTerritory(page);

    // ---- 1. both perspectives, and the glyph is glued to its tile -----------------------------
    const defender = await markerInfo(page, own1);
    const challenger = await markerInfo(page, rival2);
    check(`[${tag}] defender's tile carries the traced swords`, !!defender && defender.side === 'incoming' && defender.swords === 1);
    check(`[${tag}] challenger's tile carries the traced swords`, !!challenger && challenger.side === 'outgoing' && challenger.swords === 1);
    check(`[${tag}] the glyph is centred on the tile`, !!defender &&
      Math.abs(defender.dx) <= 1 && Math.abs(defender.dy) <= 1,
      `offset ${n2(defender?.dx ?? -99)}, ${n2(defender?.dy ?? -99)}px`);
    check(`[${tag}] the marker's touch target is >=44px`, !!defender &&
      defender.hit.w >= 44 && defender.hit.h >= 44, `${n2(defender?.hit.w ?? 0)}x${n2(defender?.hit.h ?? 0)}px`);
    check(`[${tag}] the marker is a named button, not a silent shape`, !!defender &&
      defender.label === 'Challenge on this tile. RYK challenged you.' &&
      challenger?.label === 'Challenge on this tile. You challenged RYK.',
      `${defender?.label} / ${challenger?.label}`);
    await page.screenshot({ path: join(OUT, `map-defender-${tag}.png`) });
    await page.screenshot({ path: join(OUT, `map-challenger-${tag}.png`) });
    await closeup(page, own1, join(OUT, `closeup-defender-${tag}.png`));
    await closeup(page, rival2, join(OUT, `closeup-challenger-${tag}.png`));

    // ---- 2. the tap tells you who, in the existing challenge sheet ----------------------------
    await tapSwords(page, own1);
    await tapAndOpenSheet(page);
    await settleSheet(page);
    const sheetLine = await page.evaluate(() =>
      (document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-line') as HTMLElement | null)?.textContent ?? '');
    check(`[${tag}] tapping the swords says who challenged`, sheetLine.includes('RYK') && sheetLine.includes('challenged you'), sheetLine);
    await page.screenshot({ path: join(OUT, `popover-defender-${tag}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // A tap on contested ground SELECTED it; Enter on the marker toggles a selection, so clear it
    // first (the same tap a player makes) or the marker's key would deselect instead of opening.
    await tapTile(page, own1);
    await page.waitForTimeout(150);

    // ---- 2b. the same answer without a finger: focus the marker, press Enter ------------------
    const focused = await page.evaluate((id) => {
      const hit = document.querySelector(`.world-swords[data-cell-id="${id}"] .world-swords-hit`) as SVGCircleElement | null;
      hit?.focus();
      return { focused: document.activeElement === hit, label: hit?.getAttribute('aria-label') ?? '' };
    }, own1);
    check(`[${tag}] the swords are a separate keyboard stop with their spoken name`,
      focused.focused && focused.label.startsWith('Challenge on this tile.'), focused.label);
    await page.keyboard.press('Enter');
    await tapAndOpenSheet(page);
    await settleSheet(page);
    const keyboardLine = await page.evaluate(() =>
      (document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-line') as HTMLElement | null)?.textContent ?? '');
    check(`[${tag}] Enter on the swords opens the same who-challenged sheet`,
      keyboardLine.includes('RYK') && keyboardLine.includes('challenged you'), keyboardLine);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    await tapSwords(page, rival2);
    await tapAndOpenSheet(page);
    await settleSheet(page);
    const challengerLine = await page.evaluate(() =>
      (document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-line') as HTMLElement | null)?.textContent ?? '');
    check(`[${tag}] the challenger's tap names who was challenged`, challengerLine.includes('You challenged RYK'), challengerLine);
    await page.screenshot({ path: join(OUT, `popover-challenger-${tag}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // ---- 3. before -> send -> after: the marker arrives with the data -------------------------
    await tapTile(page, sendTarget);
    await tapAndOpenSheet(page);
    await settleSheet(page);
    await page.screenshot({ path: join(OUT, `before-send-${tag}.png`) });
    check(`[${tag}] the target tile has no swords before sending`,
      (await markerInfo(page, sendTarget)) === null);
    await activate(page, '.world-challenge-sheet:not([hidden]) .world-challenge-primary');
    await page.waitForFunction((id) => !!document.querySelector(`.world-swords[data-cell-id="${id}"]`),
      sendTarget, { timeout: 10_000 }).catch(() => undefined);
    const sentMarker = await markerInfo(page, sendTarget);
    check(`[${tag}] the swords appear as soon as the challenge is sent`, !!sentMarker && sentMarker.side === 'outgoing',
      sentMarker?.label ?? 'missing');
    await page.screenshot({ path: join(OUT, `after-send-${tag}.png`) });
    await closeup(page, sendTarget, join(OUT, `closeup-after-send-${tag}.png`));

    // ---- 3b. THE OWNER'S BUG (2026-10-29): an ACCEPTED challenge keeps its swords --------------
    // "as RYK I have a duel over a tile in territory - but theres no swords icon on the tile that is
    // being challenged right now - it should always show one." An accepted challenge is a live duel
    // and nothing has changed hands, so the mark must survive the answer.
    state.outgoing = state.outgoing.map((c) => c.id === 'new-1' ? { ...c, status: 'accepted' as const, matchId: 'm-9' } : c);
    // A real product path re-reads the map: the tab coming back to the foreground calls refresh().
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() =>
      document.querySelector('.world-challenge-chip[data-challenge-id="new-1"]')?.getAttribute('data-status') === 'accepted',
      undefined, { timeout: 20_000 }).catch(() => undefined);
    const acceptedMarker = await markerInfo(page, sendTarget);
    check(`[${tag}] the swords STAY once the challenge is ACCEPTED (a live duel is still a dispute)`,
      !!acceptedMarker && acceptedMarker.side === 'outgoing', acceptedMarker?.side ?? 'missing');
    await page.screenshot({ path: join(OUT, `after-accepted-${tag}.png`) });

    // The defender answers: the mock's list now carries the challenge as declined. Nothing local runs.
    state.outgoing = state.outgoing.map((c) => c.id === 'new-1' ? { ...c, status: 'declined' as const } : c);
    await page.waitForFunction((id) => !document.querySelector(`.world-swords[data-cell-id="${id}"]`),
      sendTarget, { timeout: 20_000 }).catch(() => undefined);
    check(`[${tag}] the swords leave on the next poll once it is answered`,
      (await markerInfo(page, sendTarget)) === null, `markers now ${await markerCount(page)}`);
    await page.screenshot({ path: join(OUT, `after-answered-${tag}.png`) });

    // ---- 4. pan + zoom: the glyph is drawn in the map, so it cannot drift ---------------------
    const beforeBox = await viewBox(page);
    const beforeDefender = await markerInfo(page, own1);
    await dragTo(page, size.touch ? 110 : 160, 90, size.touch);
    const panel = await page.locator('.world-map-svg').boundingBox();
    if (panel) {
      // Zoom as well as pan, at BOTH sizes: the same wheel the desktop uses works in the emulated
      // touch viewport, and it is the honest proof that the glyph's coordinates are the map's.
      await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(150);
    }
    const afterBox = await viewBox(page);
    const afterDefender = await markerInfo(page, own1);
    check(`[${tag}] the map actually panned/zoomed`, afterBox[0] !== beforeBox[0] || afterBox[2] !== beforeBox[2],
      `x ${n2(beforeBox[0] ?? 0)} -> ${n2(afterBox[0] ?? 0)}, w ${n2(beforeBox[2] ?? 0)} -> ${n2(afterBox[2] ?? 0)}`);
    check(`[${tag}] the swords stay centred on their tile after the map moves`, !!afterDefender &&
      Math.abs(afterDefender.dx) <= 1 && Math.abs(afterDefender.dy) <= 1,
      `offset ${n2(afterDefender?.dx ?? -99)}, ${n2(afterDefender?.dy ?? -99)}px (was ${n2(beforeDefender?.dx ?? -99)}, ${n2(beforeDefender?.dy ?? -99)})`);
    check(`[${tag}] the glyph did not shrink below its tile`, !!afterDefender &&
      afterDefender.hit.w >= 44, `${n2(afterDefender?.hit.w ?? 0)}px`);
    await page.screenshot({ path: join(OUT, `panned-${tag}.png`) });
    await closeup(page, own1, join(OUT, `closeup-panned-${tag}.png`));
    check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    // ---- 5. reduced motion: the swords are static there too -----------------------------------
    const reduced = await browser.newPage({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2,
      hasTouch: size.touch, isMobile: size.touch,
    });
    reduced.setDefaultTimeout(180_000);
    await reduced.emulateMedia({ reducedMotion: 'reduce' });
    await reduced.addInitScript(() => localStorage.clear());
    await reduced.addInitScript({ content: 'window.__name = (f) => f;' });
    await routeWorld(reduced);
    await openTerritory(reduced);
    const reducedMarker = await markerInfo(reduced, own1);
    const glyph = await reduced.evaluate(() => {
      const node = document.querySelector('.world-swords-glyph') as SVGGElement | null;
      if (!node) return null;
      const style = getComputedStyle(node);
      return { animation: style.animationName, transition: style.transitionDuration, opacity: style.opacity };
    });
    check('[reduced] the swords are on the map and fully drawn', !!reducedMarker && glyph?.opacity === '1');
    check('[reduced] the swords are static (nothing to switch off, nothing lost)',
      glyph?.animation === 'none' && glyph?.transition === '0s', JSON.stringify(glyph ?? {}));
    await reduced.screenshot({ path: join(OUT, `reduced-motion-${tag}.png`) });
    await reduced.close();

    // ---- 6. the whole-map zoom, where the mark is ~16px ---------------------------------------
    // (This used to click the FIT key; that key no longer exists, and a wheel-out is the same zoom.)
    // The framed view above is the 46px-cell shipping size. Zoomed out, the trace must still read as
    // a mark rather than a blob, so keep the evidence.
    const panelForFit = await page.locator('.world-map-svg').boundingBox();
    if (panelForFit) {
      await page.mouse.move(panelForFit.x + panelForFit.width / 2, panelForFit.y + panelForFit.height / 2);
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(350);
    }
    await page.screenshot({ path: join(OUT, `fit-${tag}.png`) });
    await closeup(page, own1, join(OUT, `closeup-fit-${tag}.png`));
    await page.close();
  }

  await browser.close();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILURE(S)`}`);
  process.exit(failed === 0 ? 0 : 1);
} catch (error) {
  console.error(error);
  process.exit(1);
}
