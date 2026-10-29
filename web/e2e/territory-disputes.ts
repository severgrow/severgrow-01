// THE DISPUTE LAYER (owner, 2026-10-29, verbatim):
//
//   "at the moment as RYK I have a duel over a tile in territory - but theres no swords icon on the
//    tile that is being challenged right now - it should always show one. also find a smart way to
//    have that icon on EVERY players tile that is in duel challenge right now, but also, other people
//    challenges -- clear distinction between my tiles that are challenged -- and challenges other
//    people have over tiles, but similar u get me."
//
// This suite is the owner's receipt in a real browser on a 390x844 phone:
//   1. an ACCEPTED (live duel) challenge keeps its swords on MY tile — the exact reported bug;
//   2. another pair's dispute is drawn too, quiet — and differs from mine by SHAPE and interaction,
//      not colour;
//   3. one marker per disputed cell however the two sources overlap, and the count stays linear when
//      the map carries a hundred disputes (no rebuild of the map, no page errors).
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   tsx web/e2e/territory-disputes.ts [--dist=web/dist]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { WORLD_CELLS, worldNeighbours } from '../../server/src/world.js';
import type { WorldChallengeWire, WorldDispute } from '../../server/src/seeds/types.js';

const OUT = '/tmp/territory-disputes';
mkdirSync(OUT, { recursive: true });

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

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
const own1 = around[1]!;    // mine, nobody disputes it
const mineLive = around[4]!; // rival tile: MY challenge, already accepted (a duel is running)
const otherWait = around[3]!; // two other players, still waiting for an answer
const otherLive = around[5]!; // two other players, already fighting

/** The viewer is p1. `r1`/`r2`/`r3` are other players. */
const claims = [hub.id, own1, mineLive, otherWait, otherLive].map((cellId) => ({
  cellId,
  ownerId: cellId === hub.id || cellId === own1 ? 'p1' : cellId === otherWait ? 'r2' : cellId === otherLive ? 'r3' : 'r1',
  ownerName: cellId === hub.id || cellId === own1 ? 'BloomHeron' : cellId === otherWait ? 'Lidwingo' : 'RYK',
  ownerLevel: null,
  ownerTag: '1001',
  colour: cellId === hub.id || cellId === own1 ? 'hsl(80 34% 49%)' : 'hsl(220 34% 49%)',
  claimedAt: NOW - 5 * 60_000,
}));

/**
 * THE PUBLIC DISPUTE LIST. `mineLive` is deliberately listed here TOO, as a server would: it is a
 * disputed tile like any other. The client must draw it ONCE, as MINE (its private row knows more),
 * never twice and never as somebody else's.
 */
const initialDisputes = (): WorldDispute[] => [
  { cellId: mineLive, challengerId: 'p1', defenderId: 'r1', live: true },
  { cellId: otherWait, challengerId: 'r2', defenderId: 'r3', live: false },
  { cellId: otherLive, challengerId: 'r3', defenderId: 'r2', live: true },
];
/** One mutable list, reset per viewport so a later size never inherits the hundred-dispute step. */
const state: { disputes: WorldDispute[] } = { disputes: initialDisputes() };

const world = () => ({
  ok: true,
  world: {
    version: 2, revision: 5, cost: 100, challengeStake: 0,
    cells: WORLD_CELLS, claims, disputes: state.disputes,
  },
});

const base = {
  challengerId: 'p1', defenderId: 'r1', challengerName: 'BloomHeron', defenderName: 'RYK',
  fromMe: true, stake: 0, stakeCellId: hub.id, respondedAt: NOW - 2 * HOUR, matchId: 'm-1', matchFinished: false,
  matchWinnerId: null, winnerId: null, resolvedAt: null, remainingMs: 0, serverNow: NOW,
};
/** MY accepted challenge: the live duel the owner was in, with no swords before this change. */
const myChallenge: WorldChallengeWire = {
  ...base, id: 'my-live', cellId: mineLive, status: 'accepted',
  createdAt: NOW - 3 * HOUR, expiresAt: NOW - 2 * HOUR,
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const n2 = (value: number) => Number(value.toFixed(2));

const marker = (page: Page, cellId: string) => page.evaluate((id) => {
  const node = document.querySelector(`.world-swords[data-cell-id="${id}"]`) as SVGElement | null;
  if (!node) return null;
  const tile = document.querySelector(`.world-hex[data-cell-id="${id}"]`) as SVGPathElement | null;
  if (!tile) return null;
  const nb = node.getBoundingClientRect();
  const tb = tile.getBoundingClientRect();
  const hit = node.querySelector('.world-swords-hit') as SVGCircleElement | null;
  const glyph = (node.querySelector('.world-swords-glyph') ?? node) as SVGElement;
  const style = getComputedStyle(glyph);
  return {
    tag: node.tagName.toLowerCase(),
    side: node.getAttribute('data-side') ?? '',
    role: node.getAttribute('role') ?? hit?.getAttribute('role') ?? '',
    tabindex: node.getAttribute('tabindex') ?? hit?.getAttribute('tabindex') ?? '',
    label: node.getAttribute('aria-label') ?? hit?.getAttribute('aria-label') ?? '',
    quiet: node.classList.contains('world-swords-quiet'),
    hasHit: !!hit,
    hitW: hit ? hit.getBoundingClientRect().width : 0,
    // The distinction that must never be colour alone: filled vs hollow, independent vs interactive.
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    filter: style.filter,
    scale: node.getAttribute('transform') ?? '',
    dx: (nb.left + nb.width / 2) - (tb.left + tb.width / 2),
    dy: (nb.top + nb.height / 2) - (tb.top + tb.height / 2),
  };
}, cellId);

const count = (page: Page) => page.evaluate(() => ({
  markers: document.querySelectorAll('.world-swords').length,
  mine: document.querySelectorAll('.world-swords-layer .world-swords').length,
  quiet: document.querySelectorAll('.world-swords-quiet').length,
  cells: new Set([...document.querySelectorAll('.world-swords')].map((n) => n.getAttribute('data-cell-id'))).size,
}));

/** A tile-sized crop of the map, so the two weights can be compared by eye. */
const closeup = async (page: Page, cellId: string, path: string) => {
  const box = await page.evaluate((id) => {
    const tile = document.querySelector(`.world-hex[data-cell-id="${id}"]`) as SVGPathElement | null;
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, cellId);
  if (!box) return;
  const pad = 30;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(page.viewportSize()!.width - x, box.width + pad * 2);
  const height = Math.min(page.viewportSize()!.height - y, box.height + pad * 2);
  await page.screenshot({ path, clip: { x, y, width, height } });
};

/** The product's own re-read path: the tab coming back to the foreground calls refresh(). */
const reread = async (page: Page) => {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(900);
};

try {
  const { server, url: BASE } = await serveStaticDist(DIST);
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

  for (const size of [{ w: 390, h: 844 }, { w: 320, h: 568 }] as const) {
    const tag = `${size.w}x${size.h}`;
    console.log(`\n=== ${tag} ===`);
    state.disputes = initialDisputes();
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    page.setDefaultTimeout(120_000);
    await page.addInitScript(() => localStorage.clear());
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    await page.route('**/v1/world', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(world()),
    }));
    await page.route(/\/v1\/world\/challenges(\/.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, incoming: [], outgoing: [myChallenge], serverNow: NOW,
        }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, challenge: myChallenge, replayed: false }) });
    });
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
      if (message.type() === 'error' && !message.text().includes('ERR_UNSAFE_PORT')) errors.push(`console: ${message.text()}`);
    });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
    // Readiness is the LOBBY being installed, not just the page loading: the world view injects its
    // hardware-key icons when it is constructed, and that is the moment `#menu-world` has a handler.
    await page.waitForFunction(() => !!document.querySelector('#online-world-keys .world-key svg'), undefined, { timeout: 20_000 });
    await page.locator('#menu-world').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
    await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForSelector('.world-swords', { timeout: 20_000 });
    await page.waitForTimeout(400);

    // ---- 1. THE OWNER'S BUG: an accepted challenge keeps its swords --------------------------
    const mine = await marker(page, mineLive);
    check(`[${tag}] an ACCEPTED challenge still shows swords on that tile (the reported bug)`,
      !!mine && mine.side === 'outgoing', mine?.side ?? 'missing');
    check(`[${tag}] my marker is the solid, tappable one`,
      !!mine && !mine.quiet && mine.hasHit && mine.hitW >= 44 && mine.fill !== 'none' && /rgb/.test(mine.fill),
      `${mine?.fill ?? '-'} / hit ${n2(mine?.hitW ?? 0)}px`);
    check(`[${tag}] my marker is a named button for keyboard and screen readers`,
      !!mine && mine.role === 'button' && mine.tabindex === '0' && mine.label.includes('You challenged RYK'),
      `${mine?.role}/${mine?.tabindex} ${mine?.label ?? ''}`);
    check(`[${tag}] my marker sits at the tile's centre`, !!mine && Math.abs(mine.dx) <= 1 && Math.abs(mine.dy) <= 1,
      `${n2(mine?.dx ?? -99)}, ${n2(mine?.dy ?? -99)}px`);

    // ---- 2. other people's disputes, quiet and distinguishable without colour ----------------
    const waiting = await marker(page, otherWait);
    const fighting = await marker(page, otherLive);
    check(`[${tag}] another pair's dispute is on the map too`, !!waiting && !!fighting);
    check(`[${tag}] their mark is side "others" — a third state, not my incoming/outgoing`,
      waiting?.side === 'others' && fighting?.side === 'others', `${waiting?.side} / ${fighting?.side}`);
    check(`[${tag}] theirs is the HOLLOW mark: no fill, a stroke, no bloom`,
      !!waiting && waiting.quiet && waiting.fill === 'none' && waiting.stroke !== 'none' && waiting.filter === 'none',
      `fill ${waiting?.fill ?? '-'}, stroke ${waiting?.stroke ?? '-'}, filter ${waiting?.filter ?? '-'}`);
    check(`[${tag}] the two weights differ by SHAPE and size, not only by hue`,
      !!mine && !!waiting && waiting.fill !== mine.fill && /scale\(/.test(waiting.scale) && !/scale\(/.test(mine.scale),
      `mine ${mine?.fill ?? '-'} vs theirs ${waiting?.fill ?? '-'}`);
    check(`[${tag}] their mark is information, not a button: no tap target, no tab stop`,
      !!waiting && !waiting.hasHit && waiting.role === 'img' && waiting.tabindex === '',
      `${waiting?.role}/${waiting?.tabindex || 'none'}`);
    check(`[${tag}] it still says what it is to assistive tech, and never names an id`,
      !!waiting && waiting.label.length > 0 && !waiting.label.includes('r2') && !waiting.label.includes(otherWait),
      waiting?.label ?? '');
    check(`[${tag}] waiting and fighting say different things`,
      !!waiting && !!fighting && waiting.label !== fighting.label &&
      /challenged/i.test(waiting.label) && /duel/i.test(fighting.label),
      `${waiting?.label} | ${fighting?.label}`);
    check(`[${tag}] their mark is centred on its tile`,
      !!waiting && Math.abs(waiting.dx) <= 1 && Math.abs(waiting.dy) <= 1,
      `${n2(waiting?.dx ?? -99)}, ${n2(waiting?.dy ?? -99)}px`);

    // ---- 3. one marker per cell, however the sources overlap --------------------------------
    const before = await count(page);
    check(`[${tag}] a tile listed by BOTH sources is marked once, as mine`,
      before.markers === 3 && before.mine === 1 && before.quiet === 2 && before.cells === 3,
      JSON.stringify(before));
    check(`[${tag}] no page errors, and the page does not scroll`,
      errors.length === 0 && await page.evaluate(() => window.scrollY === 0),
      errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: join(OUT, `layer-${tag}.png`) });
    await closeup(page, mineLive, join(OUT, `closeup-mine-${tag}.png`));
    await closeup(page, otherWait, join(OUT, `closeup-others-waiting-${tag}.png`));
    await closeup(page, otherLive, join(OUT, `closeup-others-live-${tag}.png`));

    // ---- 4. a hundred disputes: linear, no duplicates, and no rebuild of the map -------------
    await page.evaluate(() => {
      (window as unknown as { __svg?: Element | null }).__svg = document.querySelector('.world-map-svg');
    });
    const free = WORLD_CELLS.filter((cell) => !claims.some((claim) => claim.cellId === cell.id)).slice(0, 100);
    state.disputes = [
      { cellId: mineLive, challengerId: 'p1', defenderId: 'r1', live: true },
      ...free.map((cell, i) => ({ cellId: cell.id, challengerId: `x${i}`, defenderId: `y${i}`, live: i % 2 === 0 })),
    ];
    await reread(page);
    const many = await count(page);
    check(`[${tag}] 100 disputes draw one marker per tile, never two`,
      many.markers === 101 && many.quiet === 100 && many.cells === 101,
      JSON.stringify(many));
    check(`[${tag}] the map itself is NOT rebuilt to add them (the layers are attribute-only)`,
      await page.evaluate(() =>
        (window as unknown as { __svg?: Element | null }).__svg === document.querySelector('.world-map-svg')));
    await page.waitForTimeout(1200);
    check(`[${tag}] the layer is stable between polls (nothing animates or duplicates itself)`,
      (await count(page)).markers === 101, JSON.stringify(await count(page)));
    check(`[${tag}] no page errors with a hundred of them`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: join(OUT, `many-${tag}.png`) });

    // ---- 5. closing a dispute removes its mark on the next read -----------------------------
    state.disputes = state.disputes.filter((dispute) => dispute.cellId !== otherWait);
    await reread(page);
    check(`[${tag}] a closed dispute takes its mark with it`,
      (await marker(page, otherWait)) === null, `${(await count(page)).markers} marker(s)`);
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
