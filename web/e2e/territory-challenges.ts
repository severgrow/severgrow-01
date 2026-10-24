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
  ownerLevel: null,
  ownerTag: OWN.has(cellId) ? '1001' : '1002',
  colour: OWN.has(cellId) ? 'hsl(80 34% 49%)' : 'hsl(220 34% 49%)',
  claimedAt: NOW - 5 * 60_000,
}));

// `cost` is a TILE's price; `challengeStake` is what a challenge costs (owner, 2026-10-24: 50).
const SAMPLE = { ok: true, world: { version: 2, revision: 5, cost: 100, challengeStake: 50, cells: WORLD_CELLS, claims } };

const base = {
  challengerId: 'p1', defenderId: 'r1', challengerName: 'BloomHeron', defenderName: 'RYK',
  fromMe: true, stake: 50, respondedAt: null, matchId: null, matchFinished: false,
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
      ...base, id: 'out-1', cellId: rival2, status: 'pending',
      createdAt: NOW - 18 * HOUR, expiresAt: NOW + 6 * HOUR,
    },
    {
      ...base, id: 'out-2', cellId: rival3, status: 'accepted', matchId: 'm-1',
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

/** Keyboard activation of a real button: no mouse move across the hidden game board. */
const activate = async (page: Page, selector: string) => {
  await page.locator(selector).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
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

    const sent: { cellId?: string; requestId?: string }[] = [];
    const answered: { accept?: boolean }[] = [];
    const confirmed: string[] = [];

    // A regex, not a glob: the respond/confirm paths contain slashes, which a single `*` would not
    // cross. This is one handler for the list, the send and both transitions.
    await page.route(/\/v1\/world\/challenges(\/.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...challenges, serverNow: NOW }) });
        return;
      }
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      if (request.url().endsWith('/respond')) {
        answered.push({ accept: body.accept === true });
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
    // The map control is an ICON since 2026-10-23 (owner: no "FIT" word), so readiness is the icon
    // in place, not a text value. world-pan.ts waits on the same thing.
    await page.waitForFunction(() => !!document.querySelector('#online-world-fit .world-fit-icon'), undefined, { timeout: 20_000 });
    await activate(page, '#menu-world');
    await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
    await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForSelector('.world-challenge-chip', { timeout: 20_000 });
    await page.waitForTimeout(300);

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
      });
      await page.waitForTimeout(13_500);
      const survived = await page.evaluate(() => {
        const chip = document.querySelector('.world-challenge-chip') as HTMLElement | null;
        return { same: chip?.dataset.probe === 'kept', focused: document.activeElement === chip };
      });
      check(`[${tag}] a poll keeps the same chip nodes and the player's focus`, survived.same && survived.focused,
        `same node ${survived.same}, focus kept ${survived.focused}`);
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
    await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
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
    check(`[${tag}] the send sheet names the holder and the stake`,
      sendSheet.line.includes('RYK') && sendSheet.line.includes('50'), sendSheet.line);
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
    await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
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
    check(`[${tag}] the defender sheet spells out the stake and the time`,
      defendSheet.line.includes('50 Seeds') && /SEEDS · .* LEFT/.test(defendSheet.meta), defendSheet.meta);
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

    // ---- 6. a finished linked duel offers TAKE THE GROUND -----------------------------------
    await activate(page, '.world-challenge-chip[data-challenge-id="out-2"]');
    await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
    await settleSheet(page);
    const confirmSheet = await page.evaluate(() => {
      const sheet = document.querySelector('.world-challenge-sheet:not([hidden])') as HTMLElement;
      return {
        line: (sheet.querySelector('.world-challenge-line') as HTMLElement).textContent ?? '',
        primary: (sheet.querySelector('.world-challenge-primary') as HTMLButtonElement).textContent ?? '',
        primaries: sheet.querySelectorAll('.world-challenge-primary:not([hidden])').length,
      };
    });
    check(`[${tag}] the confirmation sheet names the duel winner`, confirmSheet.line.includes('BloomHeron'), confirmSheet.line);
    check(`[${tag}] the confirmation sheet's one key is TAKE THE GROUND`,
      confirmSheet.primary === 'TAKE THE GROUND' && confirmSheet.primaries === 1);
    await activate(page, '.world-challenge-sheet:not([hidden]) .world-challenge-primary');
    await page.waitForTimeout(400);
    check(`[${tag}] TAKE THE GROUND posts the confirm`, confirmed.length === 1, `${confirmed.length} confirm(s)`);

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
  // The map control is an ICON since 2026-10-23 (owner: no "FIT" word), so readiness is the icon
  // in place, not a text value. world-pan.ts waits on the same thing.
  await page.waitForFunction(() => !!document.querySelector('#online-world-fit .world-fit-icon'), undefined, { timeout: 20_000 });
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
