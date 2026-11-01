// THE TERRITORY ENTRY'S TWO READ-OUTS (owner brief, 2026-10-20) — measured on the real page.
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=… npm run web:build
//   npx tsx web/e2e/menu-territory.ts            (SHOTS=docs/screens/menu-territory for pictures)
//
// What this proves, against a stubbed duel API (no network, no quota):
//   1. with a wallet and a map, the entry shows the balance on the LEFT and the player's OWN tiles on
//      the RIGHT, both in the game's glyphs, wrapped around one centred "TERRITORY" label;
//   2. the two halves are symmetric: equal outer inset from the entry's edges, equal distance from
//      the label, one shared baseline, and the label still geometrically centred in the button;
//   3. the button keeps its 100%-width click target and its >= 44px height (the same frame as the
//      other menu entries), and the press still reaches it;
//   4. the menu STILL fits with no scrolling — logo, wordmark and every entry inside the screen —
//      at 320x568, 360x640, 390x844 and 844x390, and at 320x568 with Large text;
//   5. an unknown value never shows a lie: signed out / offline / failed request / no map all hide
//      BOTH numbers and keep "TERRITORY" exactly where it was;
//   6. Continue stays hidden on the product menu, and nothing else in the menu order moved.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { MENU, ONLINE } from '../../src/strings.js';

const SHOTS = process.env.SHOTS ?? '';
const DIST = resolve(process.env.FUTA_DIST ?? 'web/dist');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const { server, url: BASE } = await serveStaticDist(DIST);
const check = (ok: boolean, what: string) => { assert.ok(ok, what); console.log(`  ok  ${what}`); };

/** One world, two of MY tiles and three of someone else's — so "mine" cannot pass by luck. */
const WORLD = {
  ok: true,
  world: {
    version: 1,
    revision: 9,
    cost: 100,
    cells: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, q: i % 4, r: Math.floor(i / 4) })),
    claims: [
      { cellId: 'c0', ownerId: 'stub', ownerName: 'StubGuest', ownerTag: '1', ownerLevel: null, colour: 'hsl(200 34% 49%)', claimedAt: 0 },
      { cellId: 'c1', ownerId: 'stub', ownerName: 'StubGuest', ownerTag: '1', ownerLevel: null, colour: 'hsl(200 34% 49%)', claimedAt: 0 },
      { cellId: 'c5', ownerId: 'other', ownerName: 'Other', ownerTag: '2', ownerLevel: null, colour: 'hsl(20 34% 49%)', claimedAt: 0 },
      { cellId: 'c6', ownerId: 'other', ownerName: 'Other', ownerTag: '2', ownerLevel: null, colour: 'hsl(20 34% 49%)', claimedAt: 0 },
      { cellId: 'c7', ownerId: 'other', ownerName: 'Other', ownerTag: '2', ownerLevel: null, colour: 'hsl(20 34% 49%)', claimedAt: 0 },
    ],
  },
};
const WALLET = { ok: true, wallet: { balance: 128, lifetimeEarned: 288, lifetimeSpent: 160, worldInvitationSeen: true } };
const GUEST = { ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now() };

/**
 * THE TWO LIVE SIGNALS (owner brief, 2026-11-01), answered by the stub and changed between reads so
 * the page can be watched transitioning — no server, no clock racing the test:
 *   - an incoming PENDING challenge puts its time left on the Territory entry in place of tiles;
 *   - an ACTIVE match whose turn is mine puts "your move" on the Play online key.
 */
type LiveChallenge = {
  id: string; cellId: string; challengerId: string; defenderId: string; challengerName: string | null;
  defenderName: string | null; fromMe: boolean; status: string; stake: number; stakeCellId: string | null;
  createdAt: number; expiresAt: number; respondedAt: number | null; matchId: string | null;
  matchFinished: boolean; matchWaitingForMe: boolean; matchWinnerId: string | null; winnerId: string | null;
  resolvedAt: number | null; remainingMs: number; serverNow: number;
};
const liveChallenge = (status: string, leftMs: number): LiveChallenge => ({
  id: `ch-${status}`, cellId: 'c5', challengerId: 'other', defenderId: 'stub',
  challengerName: 'Other', defenderName: 'StubGuest', fromMe: false, status, stake: 0,
  stakeCellId: 'c6', createdAt: Date.now() - 60_000, expiresAt: Date.now() + leftMs,
  respondedAt: null, matchId: null, matchFinished: false, matchWaitingForMe: status === 'accepted',
  matchWinnerId: null, winnerId: null, resolvedAt: null, remainingMs: leftMs, serverNow: Date.now(),
});
const liveMatch = (turnPlayer: 0 | 1, status = 'active') => ({
  matchId: 'm-live', status, mySeat: 0, turnPlayer: status === 'active' ? turnPlayer : null,
  turnDeadlineAt: Date.now() + 6 * 3_600_000, opponentName: 'Other', opponentTag: '2',
  lastActivityAt: Date.now(), unseenTurn: turnPlayer === 0, revision: 4, graceUsed: [0, 0],
  gracePeriods: 1, result: null,
});
let challengeWire: LiveChallenge[] = [];
let matchWire: ReturnType<typeof liveMatch>[] = [];

type Mode = 'known' | 'no-map' | 'wallet-fails' | 'world-fails' | 'no-guest' | 'zero';

/** Every API answer the page can need, per scenario. Registered MOST-GENERIC FIRST: Playwright
 *  checks routes newest-first, so the wallet and world answers (added last) win over the catch-all. */
const stub = async (page: Page, mode: Mode) => {
  // Anything else online (seed proof flush, invitation ack) answers emptily rather than 404-noise.
  await page.route('**/v1/seeds/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, awarded: [], reason: null }) }));
  await page.route('**/v1/guests*', (r) => (mode === 'no-guest'
    ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'UNAVAILABLE', message: 'no' }) })
    : r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(GUEST) })));
  await page.route('**/v1/seeds/wallet*', (r) => (mode === 'wallet-fails'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'BOOM', message: 'no' }) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'zero'
      ? { ok: true, wallet: { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: true } }
      : WALLET) })));
  // An unreadable map: the request is aborted, so `worldMap()` rejects like an offline phone.
  await page.route('**/v1/world*', (r) => {
    if (mode === 'no-map' || mode === 'world-fails') return r.abort('failed');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'zero'
      ? { ok: true, world: { ...WORLD.world, claims: [] } }
      : WORLD) });
  });
};

const MEASURE = `(() => {
  const btn = document.getElementById('menu-world');
  const inner = document.querySelector('#menu .menu-inner');
  const logo = document.getElementById('logo');
  const wordmark = document.querySelector('#menu .title');
  const sides = ['menu-world-seeds', 'menu-world-tiles'].map((id) => document.getElementById(id));
  const label = document.getElementById('menu-world-label');
  const menu = document.getElementById('menu');
  const show = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) }; };
  // The visible ink of a side: its glyph plus its value (there is no divider to exclude).
  const ink = (side) => {
    if (!show(side)) return null;
    const rects = [...side.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
    return { left: +left.toFixed(1), right: +right.toFixed(1), top: +top.toFixed(1), bottom: +bottom.toFixed(1), cx: +((left + right) / 2).toFixed(1) };
  };
  const bb = box(btn), lb = box(label), ib = box(inner), lgb = box(logo), wb = box(wordmark);
  const cs = btn ? getComputedStyle(btn) : null;
  return {
    vw: innerWidth, vh: innerHeight,
    button: bb,
    label: lb,
    labelHidden: !show(label),
    labelText: label ? label.textContent.trim() : '',
    sides: sides.map((s) => ({ id: s ? s.id : '?', shown: show(s), box: box(s), ink: ink(s), text: s ? s.textContent.trim() : '' })),
    aria: btn ? btn.getAttribute('aria-label') : null,
    padL: cs ? Number.parseFloat(cs.paddingLeft) : 0,
    padR: cs ? Number.parseFloat(cs.paddingRight) : 0,
    inner: ib, logo: lgb, wordmark: wb,
    menuScroll: menu ? Math.max(0, menu.scrollHeight - menu.clientHeight) : 0,
    innerScroll: inner ? Math.max(0, inner.scrollHeight - inner.clientHeight) : 0,
    docScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    docWide: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    overflowY: menu ? getComputedStyle(menu).overflowY : '',
    visibleButtons: [...document.querySelectorAll('#menu .menu-buttons .btn')].filter((b) => b.offsetParent !== null).map((b) => b.id),
    continueHidden: document.getElementById('menu-continue').hidden,
    territoryIcon: (() => {
      const hex = document.querySelector('#menu-world-tiles [data-icon="tile"] svg, #menu-world-tiles svg');
      const seed = document.querySelector('#menu-world-seeds svg.seed-icon');
      const glyph = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1) }; };
      return { seed: glyph(seed), tile: glyph(hex) };
    })(),
  };
})()`;

type Box = { x: number; y: number; w: number; h: number; right: number; bottom: number; cx: number; cy: number };
type Measure = {
  vw: number; vh: number; button: Box | null; label: Box | null; labelHidden: boolean; labelText: string;
  sides: { id: string; shown: boolean; box: Box | null; ink: { left: number; right: number; top: number; bottom: number; cx: number } | null; text: string }[];
  aria: string | null; padL: number; padR: number;
  inner: Box | null; logo: Box | null; wordmark: Box | null;
  menuScroll: number; innerScroll: number; docScroll: number; docWide: number; overflowY: string;
  visibleButtons: string[]; continueHidden: boolean;
  territoryIcon: {
    seed: { x: number; y: number; w: number; h: number; right: number; cx: number } | null;
    tile: { x: number; y: number; w: number; h: number; right: number; cx: number } | null;
  };
};

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

/**
 * The two LIVE answers, registered AFTER `stub` so they win (Playwright matches newest-first) over
 * the catch-all map route. Each request rebuilds `serverNow`, so the page's corrected clock and the
 * deadline always agree.
 */
const stubLive = async (page: Page) => {
  await page.route('**/v1/world/challenges*', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, incoming: challengeWire, outgoing: [], serverNow: Date.now() }),
  }));
  await page.route('**/v1/players/me/matches*', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, matches: matchWire, serverNow: Date.now() }),
  }));
};

/** Open the menu with a stubbed API answer for the given scenario, and let the read settle. */
const open = async (page: Page, mode: Mode, largeText = false) => {
  await page.addInitScript(() => localStorage.clear());
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await stub(page, mode);
  await stubLive(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 20_000 });
  if (largeText) await page.evaluate(() => document.documentElement.classList.add('large-text'));
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
  await page.waitForSelector('#menu-beta', { timeout: 8_000 }).catch(() => undefined);
  // One menu-show read (wallet + map) plus the layout it causes; no polling exists to wait for.
  await page.waitForTimeout(700);
};

const measure = (page: Page) => page.evaluate(MEASURE) as Promise<Measure>;

try {
  // ---- 1. A KNOWN PAIR: the numbers, in the game's glyphs, either side of a centred label ----
  console.log('\nknown wallet + map (390x844):');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await open(page, 'known');
      const m = await measure(page);
      check(m.button !== null && m.button.h >= 44, `the entry keeps its tap height (${m.button?.h}px)`);
      check(m.button!.w > 260, `the entry keeps the column's full width (${m.button!.w}px)`);
      check(!m.labelHidden && m.labelText === MENU.world, `the label is intact and centred in source ("${m.labelText}")`);
      const [seeds, tiles] = m.sides;
      check(seeds!.shown && tiles!.shown, 'both read-outs are shown for a known pair');
      check(seeds!.text === '128', `Seeds shows the server balance (${seeds!.text})`);
      check(tiles!.text === '2', `tiles shows only MY claims (${tiles!.text} of 5 filled)`);
      check((m.aria ?? '').includes('128 SEEDS') && (m.aria ?? '').includes(ONLINE.worldHeld(2, 12)),
        `the spoken line reuses the game's own words ("${m.aria}")`);
      check((m.aria ?? '').startsWith(MENU.world), 'the spoken line still names Territory first');
      check(m.territoryIcon.seed !== null && m.territoryIcon.seed.w >= 12, `Seeds carries the authored seed glyph (${m.territoryIcon.seed?.w}px)`);
      check(m.territoryIcon.tile !== null && m.territoryIcon.tile.w >= 12, `tiles carries the board's hexagon (${m.territoryIcon.tile?.w}px)`);

      // SYMMETRY, measured once from the finished layout. The two halves are MIRRORED: each glyph is
      // pinned the same distance inside its own edge, the numbers grow inward toward the label, and
      // the label sits on the button's own centre line.
      const b = m.button!, l = m.label!, si = seeds!.ink!, ti = tiles!.ink!;
      const sg = m.territoryIcon.seed!, tg = m.territoryIcon.tile!;
      check(Math.abs((sg.x - b.x) - (b.right - tg.right)) <= 1,
        `the glyphs are pinned symmetrically (${(sg.x - b.x).toFixed(1)}px in from the left, ${(b.right - tg.right).toFixed(1)}px in from the right)`);
      check(Math.abs((b.cx - sg.cx) - (tg.cx - b.cx)) <= 1,
        `the glyphs mirror about the centre (${(b.cx - sg.cx).toFixed(1)}px vs ${(tg.cx - b.cx).toFixed(1)}px)`);
      check(sg.w === tg.w && sg.h === tg.h, `both glyphs are the same size (${sg.w}x${sg.h})`);
      check(Math.abs(sg.y - tg.y) <= 0.5, `the glyphs share a baseline (${sg.y} vs ${tg.y})`);
      check(Math.abs(l.cx - b.cx) <= 0.75, `the label is on the button's centre line (${l.cx} vs ${b.cx})`);
      check(Math.abs((b.cx - si.cx) - (ti.cx - b.cx)) <= 2, `the two halves mirror about the centre (${(b.cx - si.cx).toFixed(1)}px vs ${(ti.cx - b.cx).toFixed(1)}px)`);
      const baselineSpread = Math.max(Math.abs(si.top - ti.top), Math.abs(si.bottom - ti.bottom));
      check(baselineSpread <= 1, `one shared baseline (spread ${baselineSpread.toFixed(1)}px)`);
      // Optically balanced: the label's ink is between the two sides, not overlapping either.
      check(si.right <= l.x + 0.5 && ti.left >= l.right - 0.5, 'the label sits between the read-outs, never under them');

      // The press still reaches the entry (pointer-down paints the shared press state).
      await page.click('#menu-world', { delay: 30 }).catch(() => undefined);
      await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 15_000 });
      check(true, 'the entry still opens the Territory screen');
      await page.click('#online-world-back');
      await page.waitForSelector('#menu:not([hidden])');
      const back = await measure(page);
      check(back.sides.every((s) => s.shown), 'returning to the menu re-shows the pair without another request');
      check(m.continueHidden && back.continueHidden, 'Continue stays hidden on the product menu');
      // Order is unchanged: PLAY, then TERRITORY, then Settings (LOG IN may join above Settings once
      // the Google probe answers — this build's probe fails, so it stays hidden).
      const order = back.visibleButtons.filter((id) => id !== 'menu-login');
      check(JSON.stringify(order) === JSON.stringify(['menu-play', 'menu-world', 'menu-settings']),
        `the menu order is unchanged: ${order.join(' | ')}`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'territory-known-390x844.png') });
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    } finally {
      await page.close();
    }
  }

  // ---- 2. NEVER A LIE: signed out / offline / failed / zero ----
  for (const mode of ['wallet-fails', 'world-fails', 'no-map', 'no-guest'] as const) {
    console.log(`\n${mode}:`);
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    try {
      await open(page, mode);
      const m = await measure(page);
      const [seeds, tiles] = m.sides;
      check(!seeds!.shown && !tiles!.shown, `${mode}: BOTH numbers are hidden (no half pair)`);
      check(!m.labelHidden && m.labelText === MENU.world, `${mode}: the label is intact ("${m.labelText}")`);
      check(m.button!.h >= 44, `${mode}: the entry stays a full tap target (${m.button!.h}px)`);
      check(m.aria === MENU.world, `${mode}: the spoken label is just Territory ("${m.aria}")`);
      // The label keeps the button's centre line with both sides hidden.
      check(Math.abs(m.label!.cx - m.button!.cx) <= 0.75, `${mode}: the label is still centred (${m.label!.cx} vs ${m.button!.cx})`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `territory-${mode}-360x640.png`) });
    } finally {
      await page.close();
    }
  }

  // Zero is a REAL value, not an unknown: 0 Seeds and 0 tiles are shown honestly.
  console.log('\nzero (a real 0, not an unknown):');
  {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    try {
      await open(page, 'zero');
      const m = await measure(page);
      check(m.sides.every((s) => s.shown), 'zero: both read-outs are shown');
      check(m.sides[0]!.text === '0' && m.sides[1]!.text === '0', 'zero: they read 0 and 0');
      check((m.aria ?? '').includes('0 SEEDS') && (m.aria ?? '').includes(ONLINE.worldHeld(0, 12)), `zero: spoken honestly ("${m.aria}")`);
    } finally {
      await page.close();
    }
  }

  // ---- 3. IT STILL FITS: no scrolling, logo on screen, 44px targets ----
  for (const size of [
    { w: 320, h: 568, name: 'small phone' },
    { w: 360, h: 640, name: 'phone' },
    { w: 390, h: 844, name: 'tall phone' },
    { w: 844, h: 390, name: 'phone landscape' },
  ] as const) {
    console.log(`\nfit ${size.name} ${size.w}x${size.h}:`);
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, isMobile: size.w < 800, hasTouch: size.w < 800 });
    try {
      await open(page, 'known');
      const m = await measure(page);
      const tag = `${size.w}x${size.h}`;
      check(m.overflowY === 'hidden', `${tag}: the menu cannot scroll`);
      check(m.menuScroll <= 1 && m.innerScroll <= 1, `${tag}: no menu overflow (${m.menuScroll}/${m.innerScroll})`);
      check(m.docScroll <= 1, `${tag}: no page scroll (${m.docScroll}px)`);
      check(m.docWide <= 1, `${tag}: nothing runs off the side (${m.docWide}px)`);
      check(!!m.logo && m.logo.y >= -0.5 && m.logo.bottom <= m.vh + 0.5, `${tag}: the logo is fully on screen`);
      check(!!m.label && m.label.y >= -0.5 && m.label.bottom <= m.vh + 0.5, `${tag}: TERRITORY is on screen`);
      check(m.button!.h >= 44, `${tag}: the entry is at least 44px tall (${m.button!.h}px)`);
      check(m.button!.bottom <= m.vh + 0.5 && m.button!.x >= -0.5 && m.button!.right <= m.vw + 0.5, `${tag}: the entry is fully inside`);
      check(m.sides.every((s) => s.shown), `${tag}: both read-outs still fit (they never push the row wider)`);
      // The label's centre line is the button's, at every size, with the numbers present.
      check(Math.abs(m.label!.cx - m.button!.cx) <= 0.75, `${tag}: the label stays centred (${m.label!.cx} vs ${m.button!.cx})`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `territory-fit-${tag}.png`) });
    } finally {
      await page.close();
    }
  }

  // ---- 4. LARGE TEXT on the smallest phone ----
  console.log('\nlarge text 320x568:');
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    try {
      await open(page, 'known', true);
      const m = await measure(page);
      check(m.docScroll <= 1 && m.menuScroll <= 1, `large text: no scroll (${m.docScroll}/${m.menuScroll})`);
      check(!!m.logo && m.logo.bottom <= m.vh + 0.5, 'large text: the logo is on screen');
      check(m.button!.h >= 44 && m.button!.bottom <= m.vh + 0.5, `large text: the entry fits and stays tappable (${m.button!.h}px)`);
      check(m.label!.bottom <= m.button!.bottom && m.label!.y >= m.button!.y, 'large text: the label is inside the entry');
      check(Math.abs(m.label!.cx - m.button!.cx) <= 1, `large text: the label stays centred (${m.label!.cx} vs ${m.button!.cx})`);
      for (const side of m.sides) {
        check(side.ink!.left >= m.button!.x && side.ink!.right <= m.button!.right,
          `large text: ${side.id} stays inside the entry (${side.ink!.left}..${side.ink!.right} in ${m.button!.x}..${m.button!.right})`);
      }
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'territory-large-text-320x568.png') });
    } finally {
      await page.close();
    }
  }
  // ---- 5. THE TWO LIVE SIGNALS (owner brief, 2026-11-01) ----
  //   · an incoming challenge that needs MY answer replaces the TILE COUNT with the time left,
  //     ticking, and goes back to tiles when it is accepted or resolved (or the window closes);
  //   · an unfinished duel on MY turn says "your move" on the Play online key, and reverts.
  // Both ride the read the menu already makes on show (`futasaku:menu`): no new poll, no endpoint.
  console.log('\nlive signals 390x844:');
  {
    challengeWire = [];
    matchWire = [liveMatch(0)];
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await open(page, 'known');
      /** Re-run the menu's own show read, exactly the signal a menu return sends. */
      const refresh = async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('futasaku:menu')));
        await page.waitForTimeout(700);
      };
      const sideText = () => page.evaluate(() => document.getElementById('menu-world-tiles-value')?.textContent ?? '');
      const onlineText = () => page.evaluate(() => document.getElementById('menu-online')?.textContent ?? '');

      check((await sideText()) === '2', `with no challenge the tile count is back (${await sideText()})`);
      check((await onlineText()) === ONLINE.yourMove, `a duel on my turn says "your move" (${await onlineText()})`);

      // APPEARS: the countdown replaces the count, and nothing else in the entry moves.
      challengeWire = [liveChallenge('pending', 2 * 3_600_000 + 5 * 60_000 + 30_000)];
      await refresh();
      const waiting = await sideText();
      check(/^\d+h \d+m$/.test(waiting), `a waiting challenge shows only the compact time (${waiting})`);
      check(waiting !== '2', 'the tile count is replaced, never shown beside the time');
      {
        const m = await measure(page);
        const b = m.button!, l = m.label!, t = m.sides[1]!;
        check(t.shown && t.text === waiting, `the tiles half carries the countdown (${t.text})`);
        check(t.ink!.right <= b.right + 0.5 && t.ink!.left >= b.x - 0.5, 'the countdown stays inside the entry');
        check(t.ink!.left >= l.right - 0.5, 'the countdown never overlaps the centred label');
        check(m.sides[0]!.text === '128', `the Seeds half is untouched (${m.sides[0]!.text})`);
        if (SHOTS) await page.screenshot({ path: join(SHOTS, 'territory-answer-390x844.png') });
      }

      // TICKING: a short window visibly counts down, then hands the half back to the count itself.
      challengeWire = [liveChallenge('pending', 6_000)];
      await refresh();
      const ticked0 = await sideText();
      await page.waitForTimeout(2_200);
      const ticked1 = await sideText();
      check(/^\d+s$/.test(ticked0) && /^\d+s$/.test(ticked1), `short windows tick (${ticked0} → ${ticked1})`);
      check(ticked0 !== ticked1, 'the countdown actually moves while it waits');
      await page.waitForFunction(() => document.getElementById('menu-world-tiles-value')?.textContent === '2', undefined, { timeout: 12_000 })
        .then(() => check(true, 'a closed window stops ticking and the tile count returns'))
        .catch(() => check(false, 'a closed window stops ticking and the tile count returns'));

      // ACCEPTED / RESOLVED: no answer window left, so the tile count is back.
      challengeWire = [liveChallenge('accepted', 0)];
      await refresh();
      check((await sideText()) === '2', `an accepted challenge reads as tiles again (${await sideText()})`);
      challengeWire = [liveChallenge('resolved', 0)];
      await refresh();
      check((await sideText()) === '2', `a resolved challenge reads as tiles again (${await sideText()})`);

      // THE SMALLEST PHONE: the wider countdown never leaves the entry or shifts the label.
      challengeWire = [liveChallenge('pending', 2 * 3_600_000 + 5 * 60_000 + 30_000)];
      await page.setViewportSize({ width: 320, height: 568 });
      await refresh();
      {
        const m = await measure(page);
        const b = m.button!, l = m.label!, t = m.sides[1]!;
        check(t.text === '2h 5m', `320x568: the countdown fits the small phone (${t.text})`);
        check(t.ink!.left >= b.x && t.ink!.right <= b.right, `320x568: it stays inside the entry (${t.ink!.left}..${t.ink!.right} in ${b.x}..${b.right})`);
        check(t.ink!.left >= l.right - 0.5, '320x568: it never overlaps the label');
        check(Math.abs(l.cx - b.cx) <= 0.75, `320x568: the label stays centred (${l.cx} vs ${b.cx})`);
        check(m.menuScroll <= 1 && m.docScroll <= 1, `320x568: still no scrolling (${m.menuScroll}/${m.docScroll})`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await refresh();

      // THE TURN PASSES, THEN THE MATCH ENDS: the generic label comes back.
      matchWire = [liveMatch(1)];
      await refresh();
      check((await onlineText()) === ONLINE.playOnline, `their turn reverts to the generic label (${await onlineText()})`);
      matchWire = [liveMatch(0, 'finished')];
      await refresh();
      check((await onlineText()) === ONLINE.playOnline, `a finished match reverts too (${await onlineText()})`);
      matchWire = [liveMatch(0)];
      await refresh();
      check((await onlineText()) === ONLINE.yourMove, `a new turn brings "your move" back (${await onlineText()})`);

      // NO OVERLAP: inside PLAY, the live key stays its own 50px row, clear of its neighbours.
      await page.click('#menu-play');
      await page.waitForSelector('#play-menu:not([hidden])', { timeout: 8_000 });
      await page.waitForTimeout(400);
      const boxes = await page.evaluate(() => {
        const id = (key: string) => document.getElementById(key);
        const box = (el: HTMLElement | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
        };
        return {
          vw: innerWidth, vh: innerHeight,
          online: box(id('menu-online')), campaign: box(id('menu-campaign')), practice: box(id('menu-new')),
          text: id('menu-online')?.textContent ?? '',
        };
      });
      check(boxes.text === ONLINE.yourMove, `the PLAY entry carries the live word (${boxes.text})`);
      check(boxes.online !== null && boxes.online.h >= 44, `it keeps its tap height (${boxes.online?.h}px)`);
      check(!!boxes.online && boxes.online.x >= -0.5 && boxes.online.right <= boxes.vw + 0.5 && boxes.online.bottom <= boxes.vh + 0.5,
        'it stays fully on screen');
      const clear = (a: typeof boxes.online, b: typeof boxes.online) =>
        !!a && !!b && (a.bottom <= b.y + 0.5 || b.bottom <= a.y + 0.5);
      check(clear(boxes.online, boxes.campaign) && clear(boxes.online, boxes.practice),
        'it overlaps neither LEVEL nor Practice match');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'play-online-live-390x844.png') });
      await page.click('#play-back');
      await page.waitForSelector('#menu:not([hidden])', { timeout: 8_000 });

      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    } finally {
      await page.close();
    }
  }

  console.log('\nterritory menu checks passed');
} finally {
  await browser.close();
  await server.close();
}
