// FUTASAKU 0.5 — the Territory challenge layer, in a real browser.
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   tsx web/e2e/territory-challenges.ts [--dist=web/dist]
//
// What this proves at 320x568, 360x640 and 390x844:
//   1. the page never scrolls, with the challenge rail present;
//   2. the timer ring is traced on the CELL'S OWN hex path (identical `d`), drains as a fraction
//      (pathLength=1) and breathes under 6 h — and reduced motion stops the breath but keeps the
//      drained length;
//   3. the frontier mark appears on rival tiles that share a side with the selected tile of mine;
//   4. tapping a frontier rival opens the send sheet with ONE primary key, and tapping it sends the
//      challenge with a request id;
//   5. an incoming challenge opens the defender sheet with ACCEPT / DECLINE, and DECLINE posts the
//      answer; a finished linked duel offers TAKE THE GROUND and posts the confirm;
//   6. every challenge key and chip is at least 44 px tall.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { WORLD_CELLS, worldNeighbours } from '../../server/src/world.js';
import type { WorldChallengeWire } from '../../server/src/seeds/types.js';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { serializeProgress } from '../../src/campaign/progress.js';
import type { CampaignProgress } from '../../src/campaign/progress.js';

/**
 * A campaign record that has cleared levels 1..22, i.e. "I am on level 23". The app prefixes its
 * storage keys per channel, so this is written by a page init script under each prefix.
 */
const progressAt22 = (): string => {
  const progress: CampaignProgress = {
    version: 1,
    unlocked: 23,
    completed: CAMPAIGN_LEVELS.filter((level) => level.number <= 22).map((level) => level.id),
    best: {},
  };
  return serializeProgress(progress);
};

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = new URL('../../docs/screens/territory-challenges/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

/**
 * A cell near the VISUAL centre of the world, with enough neighbours for two of mine and three of
 * the rival's. The default map view is a ~120-unit window centred on the world's bounding box (the
 * 46px cell floor), not on cell `0,0`, so the hub is chosen from the bounding box's centre and every
 * neighbour it needs is on screen at 320px.
 */
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
// NE, NW, W, SW, SE: every neighbour the suite drives is on screen even at 320px. (The hub's east
// neighbour is the one a 288px panel clips, so the send target is the WEST tile instead.)
const around = worldNeighbours(hub.id);
const own1 = around[1]!;   // mine, carrying an incoming challenge
const rival = around[3]!;  // rival, no challenge: the send sheet target
const rival2 = around[4]!; // rival, my outgoing pending challenge (under 6 h)
const rival3 = around[5]!; // rival, my accepted + finished duel (ready to confirm)
const OWN = new Set([hub.id, own1]);

const claims = [
  ...OWN,
  rival, rival2, rival3,
].map((cellId) => ({
  cellId,
  ownerId: OWN.has(cellId) ? 'p1' : 'r1',
  ownerName: OWN.has(cellId) ? 'BloomHeron' : 'RYK',
  // MY OWN GROUND CARRIES A STALE NUMBER ON PURPOSE (owner report, 2026-10-24): the server's is the
  // highest Campaign clear it was ever told about, which lags real progress. The suite seeds this
  // device's record at level 23 and asserts the map shows 23, not this 11.
  ownerLevel: OWN.has(cellId) ? 11 : null,
  ownerTag: OWN.has(cellId) ? '1001' : '1002',
  colour: OWN.has(cellId) ? 'hsl(80 34% 49%)' : 'hsl(220 34% 49%)',
  claimedAt: NOW - 5 * 60_000,
}));

// `cost` is a TILE's price. `challengeStake` is historical and 0: challenging is free since
// 2026-10-29, and the stake is a TILE (`stakeCellId` on each challenge).
const SAMPLE = { ok: true, world: { version: 2, revision: 5, cost: 100, challengeStake: 0, cells: WORLD_CELLS, claims } };

const base = {
  challengerId: 'p1', defenderId: 'r1', challengerName: 'BloomHeron', defenderName: 'RYK',
  fromMe: true, stake: 0, stakeCellId: null, respondedAt: null, matchId: null, matchFinished: false,
  matchWinnerId: null, winnerId: null, resolvedAt: null, remainingMs: 0, serverNow: NOW,
};
const challenges: { incoming: WorldChallengeWire[]; outgoing: WorldChallengeWire[] } = {
  incoming: [{
    ...base, id: 'in-1', cellId: own1, challengerId: 'r1', defenderId: 'p1',
    challengerName: 'RYK', defenderName: 'BloomHeron', fromMe: false, status: 'pending',
    createdAt: NOW - 2 * HOUR, expiresAt: NOW + 22 * HOUR,
  }],
  outgoing: [
    {
      ...base, id: 'out-1', cellId: rival2, status: 'pending', stakeCellId: hub.id,
      createdAt: NOW - 18 * HOUR, expiresAt: NOW + 6 * HOUR,
    },
    {
      ...base, id: 'out-2', cellId: rival3, status: 'accepted', matchId: 'm-1', stakeCellId: hub.id,
      createdAt: NOW - 2 * 24 * HOUR, expiresAt: NOW - 24 * HOUR, respondedAt: NOW - 2 * 24 * HOUR,
      matchFinished: true, matchWinnerId: 'p1',
    },
  ],
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const n2 = (value: number) => Number(value.toFixed(2));

/**
 * A REAL-pointer tap at the centre of a cell, dispatched on the map SVG. It goes through the same
 * pointerdown/pointerup → nearest-centre → select path a finger does, without moving the mouse across
 * the hidden game board (whose document listener is not part of this feature).
 */
/**
 * The challenge card arrives through interface-motion (300ms, from 96.5% scale). Every measurement
 * below is of the SETTLED surface: reading it on the opening frame measures the animation, not the
 * design, and would report a 43.6px key that is 44px the moment it lands.
 */
const settleSheet = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const card = document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-card') as HTMLElement | null;
    return !!card && card.dataset.ixState === 'open';
  }, undefined, { timeout: 5000 }).catch(() => undefined);
};

const tapCell = async (page: Page, cellId: string) => {
  await page.evaluate((id) => {
    const path = document.querySelector(`.world-hex[data-cell-id="${id}"]`) as SVGPathElement | null;
    const svg = path?.ownerSVGElement;
    if (!path || !svg) return;
    const box = path.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true,
      clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    };
    svg.dispatchEvent(new PointerEvent('pointerdown', init));
    svg.dispatchEvent(new PointerEvent('pointerup', init));
  }, cellId);
  await page.waitForTimeout(40);
};

/** A finger tap on the crossed swords themselves (the marker's own hit disc). */
const tapSwords = async (page: Page, cellId: string) => {
  await page.evaluate((id) => {
    const hit = document.querySelector(`.world-swords[data-cell-id="${id}"] .world-swords-hit`) as SVGCircleElement | null;
    const svg = hit?.ownerSVGElement;
    if (!hit || !svg) return;
    const box = hit.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true,
      clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    };
    svg.dispatchEvent(new PointerEvent('pointerdown', init));
    svg.dispatchEvent(new PointerEvent('pointerup', init));
  }, cellId);
  await page.waitForTimeout(60);
};

/** The marker as the browser draws it: where it sits on its tile, how big it is, what it says. */
const swordsData = (page: Page, cellId: string) => page.evaluate((id) => {
  const group = document.querySelector(`.world-swords[data-cell-id="${id}"]`) as SVGGElement | null;
  const hit = group?.querySelector('.world-swords-hit') as SVGCircleElement | null;
  const tile = document.querySelector(`.world-hex[data-cell-id="${id}"]`) as SVGPathElement | null;
  if (!group || !hit || !tile) return null;
  const hb = hit.getBoundingClientRect();
  const tb = tile.getBoundingClientRect();
  const glyph = group.querySelector('.world-swords-glyph') as SVGGElement | null;
  return {
    label: hit.getAttribute('aria-label') ?? '',
    role: hit.getAttribute('role') ?? '',
    tabindex: hit.getAttribute('tabindex') ?? '',
    side: group.getAttribute('data-side') ?? '',
    hit: { w: hb.width, h: hb.height },
    dx: (hb.left + hb.width / 2) - (tb.left + tb.width / 2),
    dy: (hb.top + hb.height / 2) - (tb.top + tb.height / 2),
    // The trace is ONE filled path containing both swords and the crossing block (world-view.ts
    // `makeMarker`: "this is ONE filled path, not two rotated copies").
    glyphPaths: glyph ? glyph.querySelectorAll(':scope > path').length : 0,
    glyphD: glyph?.querySelector('path')?.getAttribute('d')?.length ?? 0,
    animation: glyph ? getComputedStyle(glyph).animationName : '',
    transition: glyph ? getComputedStyle(glyph).transitionDuration : '',
  };
}, cellId);

/** Keyboard activation of a real button: no mouse move across the hidden game board. */
const activate = async (page: Page, selector: string) => {
  await page.locator(selector).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
};

/**
 * Open the challenge window. Since the 2026-10-28 redesign there is no single "list" panel: MENU
 * slides out the key row, and the CHALLENGES key opens its pane. This is that one path, so a suite
 * step never depends on the key row already being open.
 */
const openChallengeWindow = async (page: Page): Promise<void> => {
  if (await page.isHidden('#online-world-panel')) {
    if ((await page.getAttribute('#online-world-menu', 'aria-expanded')) !== 'true') await page.click('#online-world-menu');
    await page.click('#world-key-challenges');
  }
  await page.waitForSelector('.world-challenge-chip', { state: 'visible', timeout: 10_000 });
};

/**
 * Tap a tile and open its challenge sheet. A contested tile's tap selects it and offers VIEW
 * CHALLENGE on the tile bar; the crossed swords (drawn above the tile) open the sheet directly. Both
 * are real paths, so this takes whichever the tap produced rather than assuming one.
 */
const tapAndOpenSheet = async (page: Page): Promise<void> => {
  const open = await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 2500 })
    .then(() => true).catch(() => false);
  if (open) return;
  await activate(page, '#online-world-selection .world-claim-button');
  await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
};

const scrollState = (page: Page) => page.evaluate(() => ({
  y: window.scrollY,
  height: document.scrollingElement?.scrollHeight ?? 0,
  viewport: window.innerHeight,
}));

const ringData = (page: Page, challengeId: string) => page.evaluate((id) => {
  const ring = document.querySelector(`.world-ring[data-challenge-id="${id}"]`) as SVGPathElement | null;
  if (!ring) return null;
  const cellId = ring.getAttribute('data-cell-id') ?? '';
  const line = document.querySelector(`.world-hex[data-cell-id="${cellId}"]`) as SVGPathElement | null;
  const style = getComputedStyle(ring);
  return {
    d: ring.getAttribute('d') ?? '',
    lineD: line?.getAttribute('d') ?? '',
    pathLength: ring.getAttribute('pathLength') ?? '',
    offset: Number(ring.getAttribute('stroke-dashoffset')),
    stroke: style.stroke,
    lineStroke: line ? getComputedStyle(line).stroke : '',
    territory: style.getPropertyValue('--territory').trim(),
    lineTerritory: line ? getComputedStyle(line).getPropertyValue('--territory').trim() : '',
    animation: style.animationName,
    low: ring.classList.contains('low'),
    commands: (ring.getAttribute('d') ?? '').split('L').length - 1,
    closed: (ring.getAttribute('d') ?? '').trim().endsWith('Z'),
  };
}, challengeId);

try {
  const { server, url: BASE } = await serveStaticDist(DIST);
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

  for (const size of [{ w: 320, h: 568 }, { w: 360, h: 640 }, { w: 390, h: 844 }] as const) {
    const tag = `${size.w}x${size.h}`;
    console.log(`\n=== ${tag} ===`);
    const page = await browser.newPage({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    });
    await page.addInitScript(() => localStorage.clear());
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    // THIS DEVICE'S CAMPAIGN RECORD, at level 23 (owner report, 2026-10-24: "im at level 23 - but on
    // territory it says im level 11"). Registered after the clear so it wins, and written under every
    // channel prefix a build might use, because the prefix patch installs at boot, after this runs.
    await page.addInitScript(({ progress }) => {
      for (const prefix of ['', 'futa05:', 'futa04:', 'main2:']) {
        localStorage.setItem(`${prefix}severgrow.seen`, '1');
        localStorage.setItem(`${prefix}severgrow.campaign.progress.v3`, progress);
      }
    }, { progress: progressAt22() });

    const sent: { cellId?: string; requestId?: string }[] = [];
    const answered: { accept?: boolean }[] = [];
    const confirmed: string[] = [];
    // The mock is STATEFUL for the defender's answer: once DECLINE is posted, the list read back no
    // longer carries the incoming challenge. That is what lets the suite prove the swords leave because
    // the DATA closed the challenge, not because a local timer fired.
    let answeredIncoming = false;

    // A regex, not a glob: the respond/confirm paths contain slashes, which a single `*` would not
    // cross. This is one handler for the list, the send and both transitions.
    await page.route(/\/v1\/world\/challenges(\/.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, incoming: answeredIncoming ? [] : challenges.incoming, outgoing: challenges.outgoing, serverNow: NOW,
        }) });
        return;
      }
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      if (request.url().endsWith('/respond')) {
        answered.push({ accept: body.accept === true });
        if (body.accept !== true) answeredIncoming = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, challenge: { ...challenges.incoming[0], status: 'declined' }, matchId: null }) });
        return;
      }
      if (request.url().endsWith('/confirm')) {
        confirmed.push(String(request.url()));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, settled: true, winnerId: 'p1', cellId: rival3, replayed: false,
          challenge: { ...challenges.outgoing[1], status: 'resolved', winnerId: 'p1' },
        }) });
        return;
      }
      sent.push({ cellId: body.cellId as string, requestId: body.requestId as string });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        ok: true, replayed: false,
        challenge: { ...base, id: 'new-1', cellId: String(body.cellId), status: 'pending', createdAt: NOW, expiresAt: NOW + 24 * HOUR },
      }) });
    });
    await page.route('**/v1/world', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE),
    }));
    await page.route('**/v1/seeds/wallet', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, wallet: { balance: 150, lifetimeEarned: 150, lifetimeSpent: 0, worldInvitationSeen: true } }),
    }));
    await page.route('**/v1/guests*', (route) => route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'p1', kind: 'guest', displayName: 'BloomHeron' }, serverNow: NOW }),
    }));

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // The local build points realtime at the deliberately closed port 9; Chromium refuses it with
      // ERR_UNSAFE_PORT. That is the harness, not the page, so it is not a page error.
      if (message.type() === 'error' && !message.text().includes('ERR_UNSAFE_PORT')) {
        errors.push(`console: ${message.text()}`);
      }
    });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
    // Readiness is the LOBBY being installed, not just the page loading: the world view injects its
    // hardware-key icons when it is constructed, and that is the moment `#menu-world` has a handler.
    // (The old signal was the FIT icon, which the 2026-10-28 redesign removed.)
    await page.waitForFunction(() => !!document.querySelector('#online-world-keys .world-key svg'), undefined, { timeout: 20_000 });
    await activate(page, '#menu-world');
    await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
    await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 45_000 });
    // The challenge list lives in the one window now (owner, 2026-10-28), opened below.
    await page.waitForSelector('.world-challenge-chip', { state: 'attached', timeout: 20_000 });
    await page.waitForTimeout(300);

    // ---- 0. THE OWNER'S OWN GROUND SHOWS WHERE THEY ACTUALLY ARE (2026-10-24) ------------------
    // The server's number for these tiles is 11 (a stale "last clear it was told about"); this
    // device's record is level 23. The map must say 23 — and must leave a neighbour's line alone,
    // because no client can know another account's progress.
    await tapCell(page, hub.id);
    const mineLine = await page.evaluate(() => (document.getElementById('online-world-selection')?.textContent ?? '').trim());
    check(`[${tag}] my own ground shows my real level, not the last one the server was paid for`,
      mineLine.includes('LEVEL 23') && !mineLine.includes('LEVEL 11') && mineLine.includes('YOURS'), mineLine);
    await tapCell(page, rival);
    const rivalLine = await page.evaluate(() => (document.getElementById('online-world-selection')?.textContent ?? '').trim());
    check(`[${tag}] a neighbour's line is untouched: no local level leaks onto it`,
      rivalLine.includes('RYK') && !rivalLine.includes('LEVEL'), rivalLine);
    // the rival tap opened the challenge offer; shut it, then open the one window's list
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (document.querySelector('.world-challenge-sheet') as HTMLElement | null)?.hidden !== false);
    await openChallengeWindow(page);
    await page.waitForTimeout(700); // the chips' one-time arrival settles before anything is measured

    // ---- 1. no page scroll, with the rail on screen ------------------------------------------
    const scroll = await scrollState(page);
    check(`[${tag}] no page scroll with challenges present`, scroll.y === 0 && scroll.height <= scroll.viewport + 1,
      `y ${scroll.y}, ${scroll.height}/${scroll.viewport}`);
    const chipBox = await page.locator('.world-challenge-chip').first().boundingBox();
    check(`[${tag}] a challenge chip is a 44px touch target`, !!chipBox && chipBox.height >= 44, `${n2(chipBox?.height ?? 0)}px`);
    // The chip speaks in a player's words: the player and the clock, never the cell's coordinate
    // (owner review, 2026-10-24: "3,-10" is the machine's name for the ground, not a sentence).
    const chipText = await page.evaluate(() => [...document.querySelectorAll('.world-challenge-chip')]
      .map((chip) => (chip as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
    check(`[${tag}] a chip names the player and the clock, never a cell coordinate`,
      chipText.length >= 2 && chipText.every((text) => !/\d+\s*,\s*-?\d+/.test(text)),
      chipText.join(' | '));
    // The chips are REUSED across polls (world-view.ts keys them by challenge id), so the rail can
    // animate an arrival once and a keyboard focus is never destroyed under the player. Proved on
    // the slowest viewport only, because it costs one real 12 s poll.
    if (tag === '320x568') {
      await page.evaluate(() => {
        const chip = document.querySelector('.world-challenge-chip') as HTMLElement;
        chip.dataset.probe = 'kept';
        chip.focus();
        // The swords are REUSED by challenge id too; probe the node so a poll that rebuilt it shows.
        const swords = document.querySelector('.world-swords') as SVGGElement | null;
        if (swords) swords.dataset.probe = 'kept';
      });
      await page.waitForTimeout(13_500);
      const survived = await page.evaluate(() => {
        const chip = document.querySelector('.world-challenge-chip') as HTMLElement | null;
        const swords = document.querySelector('.world-swords') as SVGGElement | null;
        return {
          same: chip?.dataset.probe === 'kept', focused: document.activeElement === chip,
          swords: swords?.dataset.probe === 'kept',
        };
      });
      check(`[${tag}] a poll keeps the same chip nodes and the player's focus`, survived.same && survived.focused,
        `same node ${survived.same}, focus kept ${survived.focused}`);
      check(`[${tag}] a poll keeps the same swords nodes too`, survived.swords);
      await page.evaluate(() => (document.querySelector('.world-challenge-chip') as HTMLElement).blur());
    }
    const chipRings = await page.evaluate(() => [...document.querySelectorAll('.world-chip-ring-path')].map((node) => {
      const path = node as SVGPathElement;
      const d = path.getAttribute('d') ?? '';
      return {
        pathLength: path.getAttribute('pathLength'),
        offset: Number(path.getAttribute('stroke-dashoffset')),
        commands: d.split('L').length - 1,
        closed: d.trim().endsWith('Z'),
        low: path.classList.contains('low'),
      };
    }));
    const chipLow = chipRings.find((ring) => ring.low);
    // The list's small ring is the SAME instrument: a closed six-point path, a fractional dash, and
    // the same .75 offset the 6 h map ring shows.
    check(`[${tag}] the list carries the same drained ring at chip size`,
      chipRings.length >= 2 && !!chipLow && chipLow.pathLength === '1' && chipLow.commands === 5 &&
      chipLow.closed && Math.abs(chipLow.offset - 0.75) < 0.02,
      `${chipRings.length} rings, low offset ${n2(chipLow?.offset ?? -1)}`);
    // the list is read; shut the window so the map's own marks are what the next checks touch
    await page.click('#world-panel-close');

    // ---- 2. the ring is the cell's own hex, draining by fraction -----------------------------
    const incoming = await ringData(page, 'in-1');
    const outgoing = await ringData(page, 'out-1');
    check(`[${tag}] a ring is drawn for a pending incoming challenge`, !!incoming);
    check(`[${tag}] a ring is drawn for a pending outgoing challenge`, !!outgoing);
    if (incoming && outgoing) {
      check(`[${tag}] the ring traces the cell's OWN 6-point path (identical d)`,
        incoming.d === incoming.lineD && outgoing.d === outgoing.lineD, `${incoming.d.slice(0, 24)}…`);
      check(`[${tag}] the ring is a closed 6-point hexagon`,
        incoming.commands === 5 && incoming.closed && outgoing.commands === 5 && outgoing.closed,
        `${incoming.commands} line segments`);
      check(`[${tag}] the ring drains as a fraction of pathLength=1`,
        incoming.pathLength === '1' && outgoing.pathLength === '1');
      // 22 h left of 24 h → offset ≈ 1 - 22/24 = .083; 6 h left → .75.
      check(`[${tag}] a 22 h-old challenge has drained ~8% of its ring`,
        Math.abs(incoming.offset - (1 - 22 / 24)) < 0.02, `offset ${n2(incoming.offset)}`);
      check(`[${tag}] a challenge under 6 h left has drained ~75% and breathes`,
        Math.abs(outgoing.offset - 0.75) < 0.02 && outgoing.low && outgoing.animation === 'world-ring-breath',
        `offset ${n2(outgoing.offset)}, ${outgoing.animation}`);
      // No new colour: each ring resolves --territory to the same value its own tile carries.
      check(`[${tag}] the ring uses the tile's own territory colour, not a new one`,
        /rgb/.test(incoming.stroke) && incoming.territory.length > 0 &&
        incoming.territory === incoming.lineTerritory && outgoing.territory === outgoing.lineTerritory,
        `${incoming.territory} / ${outgoing.territory}`);
    }

    // ---- 2b. the crossed swords on the contested tile (owner, 2026-10-24) --------------------
    const incomingSwords = await swordsData(page, own1);
    const outgoingSwords = await swordsData(page, rival2);
    const swordCount = await page.evaluate(() => document.querySelectorAll('.world-swords').length);
    check(`[${tag}] the crossed swords mark the DEFENDER's contested tile`, !!incomingSwords &&
      incomingSwords.side === 'incoming' && incomingSwords.glyphPaths === 1 && incomingSwords.glyphD > 0,
      `${incomingSwords?.side}, ${incomingSwords?.glyphPaths} path(s)`);
    check(`[${tag}] the crossed swords mark the CHALLENGER's contested tile`, !!outgoingSwords &&
      outgoingSwords.side === 'outgoing' && outgoingSwords.glyphPaths === 1 && outgoingSwords.glyphD > 0,
      `${outgoingSwords?.side}, ${outgoingSwords?.glyphPaths} path(s)`);
    check(`[${tag}] only contested tiles carry swords (no marker on a plain rival tile)`, swordCount === 2,
      `${swordCount} marker(s)`);
    // The glyph is a drawing OF the tile, not an overlay near it: the hit disc is centred on the hex.
    check(`[${tag}] the swords sit at the tile's centre, inside its ring`,
      !!incomingSwords && Math.abs(incomingSwords.dx) <= 1 && Math.abs(incomingSwords.dy) <= 1 &&
      Math.abs(outgoingSwords!.dx) <= 1 && Math.abs(outgoingSwords!.dy) <= 1,
      `offset ${n2(incomingSwords?.dx ?? -99)}, ${n2(incomingSwords?.dy ?? -99)}px`);
    check(`[${tag}] the swords' touch target is at least 44px`, !!incomingSwords &&
      incomingSwords.hit.w >= 44 && incomingSwords.hit.h >= 44,
      `${n2(incomingSwords?.hit.w ?? 0)}x${n2(incomingSwords?.hit.h ?? 0)}px`);
    check(`[${tag}] the glyph is a real, named button for keyboard and screen readers`,
      incomingSwords?.role === 'button' && incomingSwords.tabindex === '0' &&
      incomingSwords.label.startsWith('Challenge on this tile.') ,
      incomingSwords?.label ?? 'missing');
    check(`[${tag}] the marker says who, from each side`,
      incomingSwords?.label.includes('RYK challenged you') === true &&
      outgoingSwords?.label.includes('You challenged RYK') === true,
      `${incomingSwords?.label} / ${outgoingSwords?.label}`);
    check(`[${tag}] the swords glyph itself is static (no animation, no transition)`,
      incomingSwords?.animation === 'none' && incomingSwords.transition === '0s');
    // Tapping the SWORDS selects their tile; the tile bar's VIEW CHALLENGE opens the sheet that
    // already answers "who challenged". (`tapAndOpenSheet` takes whichever door the tap produced.)
    await tapSwords(page, own1);
    await tapAndOpenSheet(page);
    await page.waitForTimeout(500); // a fresh sheet ignores presses for its first 450 ms (the opening tap is spent)
    await settleSheet(page);
    const swordsSheet = await page.evaluate(() =>
      (document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-line') as HTMLElement | null)?.textContent ?? '');
    check(`[${tag}] tapping the swords says who challenged this tile`,
      swordsSheet.includes('RYK') && swordsSheet.includes('challenged your tile'), swordsSheet);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // ---- 3. the frontier mark, after selecting a cell of mine --------------------------------
    await page.keyboard.press('Escape');
    await tapCell(page, hub.id);
    const frontier = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.world-hex.frontier').length,
      marks: document.querySelectorAll('.world-frontier-mark').length,
    }));
    check(`[${tag}] rival tiles on my frontier are marked`, frontier.tiles >= 3, `${frontier.tiles} tiles`);
    check(`[${tag}] each frontier tile carries the notched corner`, frontier.marks === frontier.tiles,
      `${frontier.marks} marks`);

    // ---- 4. the send sheet: one primary key, and it sends -----------------------------------
    await tapCell(page, rival);
    await tapAndOpenSheet(page);
    await page.waitForTimeout(500); // a fresh sheet ignores presses for its first 450 ms (the opening tap is spent)
    await settleSheet(page);
    const sendSheet = await page.evaluate(() => {
      const sheet = document.querySelector('.world-challenge-sheet:not([hidden])') as HTMLElement;
      const primary = sheet.querySelector('.world-challenge-primary') as HTMLButtonElement;
      return {
        line: (sheet.querySelector('.world-challenge-line') as HTMLElement).textContent ?? '',
        primary: primary.textContent ?? '',
        visiblePrimary: !primary.hidden,
        primaries: sheet.querySelectorAll('.world-challenge-primary:not([hidden])').length,
        primaryHeight: primary.getBoundingClientRect().height,
        meta: (sheet.querySelector('.world-challenge-meta') as HTMLElement).textContent ?? '',
        // The card is a first-class interface surface: it arrives through interface-motion.ts like
        // every other sheet in the game (owner review, 2026-10-24), not with a raw `hidden` flip.
        surface: (sheet.querySelector('.world-challenge-card') as HTMLElement).dataset.ixSurface === '1',
        state: (sheet.querySelector('.world-challenge-card') as HTMLElement).dataset.ixState ?? '',
        y: window.scrollY,
      };
    });
    // The owner made challenging FREE (2026-10-29): the sheet must name the holder and state that a
    // TILE is at stake — and must NOT mention a Seed cost or a raw cell coordinate. This is the rule
    // the old `includes('50')` assertion encoded, so it is replaced, and made stricter: no Seeds, no
    // coordinate, and the words that say what losing costs.
    check(`[${tag}] the send sheet names the holder and the tile at stake, and never a price`,
      sendSheet.line.includes('RYK') &&
      /free/i.test(sendSheet.line) &&
      /at stake/i.test(sendSheet.line) &&
      !/50\b|Seeds?/i.test(sendSheet.line) &&
      !/-?\d+\s*,\s*-?\d+/.test(sendSheet.line),
      sendSheet.line);
    check(`[${tag}] the send sheet arrives as a shared interface surface`,
      sendSheet.surface && (sendSheet.state === 'open' || sendSheet.state === 'opening'), sendSheet.state);
    check(`[${tag}] the sheet's meta line carries no cell coordinate`,
      !/\d+\s*,\s*-?\d+/.test(sendSheet.meta), sendSheet.meta);
    check(`[${tag}] the send sheet has exactly ONE primary key, CHALLENGE`,
      sendSheet.visiblePrimary && sendSheet.primaries === 1 && sendSheet.primary === 'CHALLENGE', sendSheet.primary);
    check(`[${tag}] the sheet's primary key is 44px tall`, sendSheet.primaryHeight >= 44, `${n2(sendSheet.primaryHeight)}px`);
    check(`[${tag}] the sheet does not scroll the page`, sendSheet.y === 0);
    await activate(page, '.world-challenge-sheet:not([hidden]) .world-challenge-primary');
    // The exit choreography is 180ms (interface-motion), so the settled state is read after it.
    await page.waitForTimeout(600);
    check(`[${tag}] CHALLENGE sends the cell with a request id`,
      sent.length === 1 && sent[0]!.cellId === rival && typeof sent[0]!.requestId === 'string' && sent[0]!.requestId!.length >= 8,
      JSON.stringify(sent[0] ?? {}));
    check(`[${tag}] the sheet closes after sending`, await page.locator('.world-challenge-sheet').first().isHidden());

    // ---- 5. the defender sheet, and DECLINE --------------------------------------------------
    await tapCell(page, own1);
    await tapAndOpenSheet(page);
    await page.waitForTimeout(500); // a fresh sheet ignores presses for its first 450 ms (the opening tap is spent)
    await settleSheet(page);
    const defendSheet = await page.evaluate(() => {
      const sheet = document.querySelector('.world-challenge-sheet:not([hidden])') as HTMLElement;
      return {
        line: (sheet.querySelector('.world-challenge-line') as HTMLElement).textContent ?? '',
        meta: (sheet.querySelector('.world-challenge-meta') as HTMLElement).textContent ?? '',
        primary: (sheet.querySelector('.world-challenge-primary') as HTMLButtonElement).textContent ?? '',
        secondary: (sheet.querySelector('.world-challenge-secondary') as HTMLButtonElement).textContent ?? '',
      };
    });
    // THE RULE CHANGED (owner report, 2026-10-28): the defender is never charged, and the sheet used
    // to show the challenger's 50-Seed stake right above ACCEPT, which read as a price. The defender
    // is now asked to answer, on a live countdown, and told outright that it costs nothing. The old
    // expectation here pinned the misleading copy; it is updated to the new rule, not weakened.
    check(`[${tag}] the defender sheet states the countdown and never charges them`,
      /Answer within .+ to keep it/.test(defendSheet.line) && !/50|Seeds/i.test(defendSheet.line) &&
      defendSheet.meta === 'NO SEEDS TO PAY · YOUR TILE AT STAKE', `${defendSheet.line} | ${defendSheet.meta}`);
    check(`[${tag}] the defender sheet offers ACCEPT as the one primary key`,
      defendSheet.primary === 'ACCEPT' && defendSheet.secondary === 'DECLINE');
    // DECLINE is now armed by the first press (owner review, 2026-10-24): it is the one
    // irreversible key and it sits beside ACCEPT, so a single mis-tap must not end a neighbour's
    // challenge. The first press posts NOTHING and says what the second press will do.
    await activate(page, '.world-challenge-sheet:not([hidden]) .world-challenge-secondary');
    await page.waitForTimeout(180);
    const armed = await page.evaluate(() => {
      const key = document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-secondary') as HTMLButtonElement;
      return { text: key.textContent ?? '', armed: key.classList.contains('is-armed') };
    });
    check(`[${tag}] the first DECLINE press only arms the key`, answered.length === 0 && armed.armed && /AGAIN/i.test(armed.text),
      `${answered.length} posted, "${armed.text}"`);
    await activate(page, '.world-challenge-sheet:not([hidden]) .world-challenge-secondary');
    await page.waitForTimeout(400);
    check(`[${tag}] the second DECLINE press posts the answer`, answered.length === 1 && answered[0]!.accept === false,
      JSON.stringify(answered[0] ?? {}));
    // The answer closes the challenge in the data; the swords and the ring must leave with it.
    await page.waitForFunction(
      (id) => !document.querySelector(`.world-swords[data-cell-id="${id}"]`) &&
        !document.querySelector(`.world-ring[data-cell-id="${id}"]`),
      own1, { timeout: 5000 }).catch(() => undefined);
    const afterDecline = await page.evaluate((id) => ({
      swords: !!document.querySelector(`.world-swords[data-cell-id="${id}"]`),
      ring: !!document.querySelector(`.world-ring[data-cell-id="${id}"]`),
      markers: document.querySelectorAll('.world-swords').length,
    }), own1);
    check(`[${tag}] DECLINE clears the swords and the ring from that tile`,
      !afterDecline.swords && !afterDecline.ring && afterDecline.markers === 1,
      JSON.stringify(afterDecline));

    // ---- 6. a finished linked duel SETTLES ITSELF (owner, 2026-10-29) ------------------------
    // "after the match, automatically give the tile to the winner." The sheet therefore offers NO
    // primary key: the server applies the settlement on the read that follows. Requiring TAKE THE
    // GROUND is the rule the owner REPLACED, so this asserts the new one — and asserts it strictly:
    // there must be ZERO primaries, and the settlement must already have been applied server-side.
    // the chip lives in the challenge window: open it first (one MENU key + one CHALLENGES key)
    await openChallengeWindow(page);
    await activate(page, '.world-challenge-chip[data-challenge-id="out-2"]');
    await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
    await page.waitForTimeout(500); // a fresh sheet ignores presses for its first 450 ms (the opening tap is spent)
    await settleSheet(page);
    const confirmSheet = await page.evaluate(() => {
      const sheet = document.querySelector('.world-challenge-sheet:not([hidden])') as HTMLElement;
      return {
        line: (sheet.querySelector('.world-challenge-line') as HTMLElement).textContent ?? '',
        primaries: sheet.querySelectorAll('.world-challenge-primary:not([hidden])').length,
      };
    });
    check(`[${tag}] the settling sheet names the duel winner`, confirmSheet.line.includes('BloomHeron'), confirmSheet.line);
    check(`[${tag}] the settling sheet needs no key pressed — the server settled it`,
      confirmSheet.primaries === 0, `${confirmSheet.primaries} primary key(s)`);
    // The owner asked for the tile to be handed over AUTOMATICALLY. The page therefore settles on its
    // own the moment it sees a finished linked duel — nobody taps anything. That posted confirm is
    // the proof of automation, not a violation: the server's settlement is idempotent, so this call
    // and the server's own lazy sweep can never apply the tile twice.
    await page.waitForTimeout(600);
    check(`[${tag}] the page settled it by itself, with no tap`, confirmed.length >= 1, `${confirmed.length} automatic confirm(s)`);

    // ---- 7. no page scroll after every interaction, and no page errors ----------------------
    const after = await scrollState(page);
    check(`[${tag}] the page still has not scrolled`, after.y === 0 && after.height <= after.viewport + 1,
      `y ${after.y}, ${after.height}/${after.viewport}`);
    check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: join(OUT, `challenges-${tag}.png`) });
    await page.close();
  }

  // ---- 8. reduced motion: the breath stops, the drained length stays -------------------------
  console.log('\n=== reduced motion ===');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.route('**/v1/world/challenges*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...challenges, serverNow: NOW }),
  }));
  await page.route('**/v1/world', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
  await page.route('**/v1/seeds/wallet', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, wallet: { balance: 150, lifetimeEarned: 150, lifetimeSpent: 0, worldInvitationSeen: true } }),
  }));
  await page.route('**/v1/guests*', (route) => route.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'p1', kind: 'guest', displayName: 'BloomHeron' }, serverNow: NOW }),
  }));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
  // Readiness is the LOBBY installed (its world view injects the hardware-key icons), not the old
  // FIT icon the 2026-10-28 redesign removed.
  await page.waitForFunction(() => !!document.querySelector('#online-world-keys .world-key svg'), undefined, { timeout: 20_000 });
  await activate(page, '#menu-world');
  await page.waitForSelector('.world-ring.low', { timeout: 20_000 });
  const reduced = await page.evaluate(() => {
    const ring = document.querySelector('.world-ring.low') as SVGPathElement;
    const chip = document.querySelector('.world-chip-ring-path.low') as SVGPathElement | null;
    const style = getComputedStyle(ring);
    return {
      offset: Number(ring.getAttribute('stroke-dashoffset')),
      animation: style.animationName,
      transition: style.transitionDuration,
      chipAnimation: chip ? getComputedStyle(chip).animationName : null,
    };
  });
  check('[reduced] the breath is off', reduced.animation === 'none' && reduced.chipAnimation === 'none', reduced.animation);
  check('[reduced] the drain transition is off', reduced.transition === '0s', reduced.transition);
  check('[reduced] the ring still shows its drained length', reduced.offset > 0.5 && reduced.offset <= 1, `offset ${n2(reduced.offset)}`);
  // The swords are static in BOTH motion modes: there is nothing here to switch off, and the glyph is
  // still fully drawn (the marker is information, not decoration).
  const reducedSwords = await page.evaluate(() => {
    const glyph = document.querySelector('.world-swords-glyph') as SVGGElement | null;
    if (!glyph) return null;
    const style = getComputedStyle(glyph);
    return { animation: style.animationName, transition: style.transitionDuration, opacity: style.opacity };
  });
  check('[reduced] the swords stay drawn and static', !!reducedSwords &&
    reducedSwords.animation === 'none' && reducedSwords.transition === '0s' && reducedSwords.opacity === '1',
    JSON.stringify(reducedSwords ?? {}));
  await page.screenshot({ path: join(OUT, 'challenges-reduced-motion.png') });
  await page.close();

  await browser.close();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILURE(S)`}`);
  process.exit(failed === 0 ? 0 : 1);
} catch (error) {
  console.error(error);
  process.exit(1);
}
