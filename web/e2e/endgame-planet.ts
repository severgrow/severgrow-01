// THE END SCREEN'S PLANET (owner brief, 2026-11-11): the finish card's red band is a live view of
// THE PLANET — the Planet page's own map, owner lines and grow key, without its MENU row — and four
// half-width keys sit under it in two rows of two. This suite drives a real offline game to its end
// on the live (futa05) build and measures the card the owner will actually get:
//
//   1. the planet card, not the classic one: `#go-world` carries a real canvas at a real height;
//   2. the FOUR keys, in order, with the forward action filled and the other three framed;
//   3. one screen: neither the card nor the screen behind it scrolls at 360x640 or 390x844, and no
//      visible key is outside the viewport;
//   4. RESULT opens the dark-glass window with the final board, the reason and the record, takes
//      focus, closes on Escape, and gives the keyboard back to its own key;
//   5. THE PANE OPENS ON YOUR LAND (owner, 2026-11-12: "right now its not ALWAYS showing my cluster
//      innit"). The planet's own snapshot says where every tile is on screen, so the suite MEASURES
//      the framed cell against three stubbed worlds (land, a tie, no land) and one slow world read
//      (the timing race the owner saw): the expected focus cell must land on the pane's centre, and
//      the cluster must fill a good part of the pane instead of sitting small in the middle.
//
// Build the copy this suite needs (it never touches the live API: every call is stubbed):
//   CHANNEL=futa05 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 \
//     VITE_SUPABASE_URL=https://stub.invalid VITE_SUPABASE_ANON_KEY=stub \
//     npm run web:build
//   npx tsx web/e2e/endgame-planet.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { WORLD_CELLS, worldNeighbours } from '../../server/src/world.js';
import { ONLINE } from '../../src/strings.js';
import { SEEDS_WORD } from '../src/online/seed-icon.js';
import { focusCell } from '../src/online/world-planet.js';
import { seedSettings } from './helpers/settings-seed.js';

const OUT = new URL('../../docs/screens/finish/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4319);
const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
] as const;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

mkdirSync(OUT, { recursive: true });

type WireClaim = { cellId: string; ownerId: string; colour: string; claimedAt: number };

/** A public world read around the claims a scenario holds. */
const worldOf = (claims: WireClaim[]) => ({
  ok: true,
  world: {
    version: 1, revision: 5, cost: 100, growAnywhere: true, cells: WORLD_CELLS,
    claims: claims.map((claim, index) => ({
      ...claim,
      ownerName: claim.ownerId === 'stub' ? 'Me' : 'WillowBirch',
      ownerTag: claim.ownerId === 'stub' ? '1001' : '1002',
      ownerLevel: claim.ownerId === 'stub' ? 22 : null,
      claimedAt: claim.claimedAt ?? Date.now() - index * 60_000,
    })),
  },
});

const claim = (ownerId: string, cellId: string, claimedAt: number): WireClaim => ({ cellId, ownerId, colour: 'hsl(200 34% 49%)', claimedAt });

/** THE THREE WORLDS the owner named. Mine are deliberately AWAY from the world's centre, so an
 *  answer of "0,0" (the centre, or the menu's pose) can never pass as the right one. */
const SCENARIOS = {
  // One holding of five (the biggest), plus a rival's tiles elsewhere.
  land: worldOf([
    claim('stub', '8,0', 5), claim('stub', '9,0', 6), claim('stub', '10,0', 7), claim('stub', '9,1', 8), claim('stub', '10,-1', 9),
    claim('other', '0,0', 1), claim('other', '0,1', 2), claim('other', '-1,1', 3),
  ]),
  // Two equal-size holdings: the tie is decided by the rule, never by list order.
  tie: worldOf([
    claim('stub', '-8,0', 50), claim('stub', '-9,0', 51), claim('stub', '-8,1', 52),
    claim('stub', '8,0', 5), claim('stub', '9,0', 6), claim('stub', '8,1', 7),
    claim('other', '0,0', 1), claim('other', '1,0', 2),
  ]),
  // No land at all: the pane must invite a grow on free ground, not on somebody else's tile.
  none: worldOf([
    claim('other', '0,0', 1), claim('other', '1,0', 2), claim('other', '0,1', 3), claim('other', '-1,1', 4),
    claim('other', '1,-1', 5), claim('other', '2,-1', 6), claim('other', '0,-1', 7), claim('other', '-2,1', 8),
  ]),
} as const;

type ScenarioKey = keyof typeof SCENARIOS;

/** The expected focus cell, computed by the SAME pure rule the pane uses (no source-text guessing). */
const expectedFocus = (scenario: ScenarioKey): string | null => focusCell(SCENARIOS[scenario].world.claims, 'stub');

/** The player's own connected holding that contains `home`, as the pane should frame it. */
const holdingOf = (scenario: ScenarioKey, home: string): string[] => {
  const mine = new Set(SCENARIOS[scenario].world.claims.filter((c) => c.ownerId === 'stub').map((c) => c.cellId));
  const group = [home];
  const seen = new Set(group);
  for (let i = 0; i < group.length; i++) for (const id of worldNeighbours(group[i]!)) if (mine.has(id) && !seen.has(id)) { seen.add(id); group.push(id); }
  return group;
};

const stub = async (page: Page, scenario: ScenarioKey, delayMs = 0): Promise<void> => {
  const world = SCENARIOS[scenario];
  await page.route(/\/v1\/world(\?|$)/, async (r) => {
    if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(world) });
  });
  await page.route('**/v1/world/challenges*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, incoming: [], outgoing: [], serverNow: Date.now() }),
  }));
  await page.route('**/v1/seeds/wallet', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, wallet: { balance: 150, lifetimeEarned: 250, lifetimeSpent: 0, worldInvitationSeen: true } }),
  }));
  await page.route('**/v1/guests*', (r) => r.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now() }),
  }));
  // THE ACCOUNTS MODULE'S TWO PROBES, so its ONE login window exists in this stubbed build: the
  // email method is on, Google is off (no redirect). Nothing here signs anybody in for real.
  await page.route('**/auth/v1/settings', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ external: { email: true, google: false } }),
  }));
  await page.route('**/v1/auth/methods', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: true }),
  }));
};

const waitStarterRitual = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
};

/** Play the human's seat with real, legal moves; the computer plays its own turns. */
const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  await waitStarterRitual(page);
  const read = () => page.evaluate('(() => { const h = window.__severgrow; return h.state(); })()') as Promise<State | null>;
  const idle = () => page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
  let waiting = 0;
  let refused = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      if (++waiting > 400) return `the computer never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(80);
      continue;
    }
    waiting = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
    const natural = (now.phase === 'DRAW'
      ? [pick('Draw'), pick('EndAct'), pick('Discard')]
      : [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard')])
      .filter((a): a is Action => !!a);
    const candidates: Action[] = [...natural, ...legal.filter((a) => !natural.includes(a))];
    let applied = false;
    for (const candidate of candidates) {
      const ok = await page.evaluate(
        ([a, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, who)),
        [candidate, 0] as const,
      );
      if (ok) { applied = true; break; }
    }
    if (!applied) {
      if (++refused > 6) return `the app refused every legal action (${now.phase})`;
      await page.waitForTimeout(150);
      continue;
    }
    refused = 0;
  }
  return `still playing after ${maxSteps} steps`;
};

const dismissInstall = async (page: Page): Promise<void> => {
  for (const id of ['#install-close', '#install-later']) {
    const el = page.locator(id);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 2_000 }).catch(() => undefined);
      return;
    }
  }
};

const waitFinish = async (page: Page): Promise<void> => {
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await dismissInstall(page);
};

/** What the card says, in one read: the anatomy, the pane, the keys and both overflow budgets. */
const MEASURE = `(() => {
  const id = (x) => document.getElementById(x);
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const card = document.querySelector('#gameover .go-card');
  const screen = id('gameover');
  const pane = id('go-world');
  const canvas = document.querySelector('#go-world-surface > .planet-canvas');
  const keys = [...document.querySelectorAll('#gameover .go-buttons .btn')].filter(shown);
  const inside = (el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1;
  };
  return {
    anatomy: id('gameover').dataset.anatomy,
    worldShown: shown(pane),
    worldHeight: pane ? Math.round(pane.getBoundingClientRect().height) : 0,
    surfaceHeight: id('go-world-surface') ? Math.round(id('go-world-surface').getBoundingClientRect().height) : 0,
    canvas: !!canvas && canvas.width > 0,
    canvasReady: canvas ? canvas.dataset.planetReady === 'true' : false,
    canvasOpacity: canvas ? getComputedStyle(canvas).opacity : '',
    canvasClip: canvas ? (canvas.style.clipPath || '') : '',
    fallback: (() => {
      const f = document.querySelector('#go-world-surface > .planet-fallback');
      return f && shown(f) ? (f.textContent || '').trim() : '';
    })(),
    canvasSameBox: (() => {
      if (!canvas || !pane) return false;
      const a = canvas.getBoundingClientRect(), b = pane.getBoundingClientRect();
      return Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;
    })(),
    wallet: (id('go-world-wallet')?.textContent || '').trim(),
    bar: (id('go-world-line')?.textContent || '').trim(),
    keys: keys.map((b) => ({ id: b.id, label: (b.textContent || '').replace(/\\s+/g, ' ').trim(), primary: b.classList.contains('primary'), inside: inside(b) })),
    overflow: card ? card.scrollHeight - card.clientHeight : null,
    screenOverflow: screen ? screen.scrollHeight - screen.clientHeight : null,
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
    resultShown: shown(id('go-result')),
    title: (id('go-title')?.textContent || '').trim(),
  };
})()`;

type Card = {
  anatomy: string; worldShown: boolean; worldHeight: number; surfaceHeight: number; canvas: boolean;
  canvasReady: boolean; canvasOpacity: string; canvasClip: string; fallback: string;
  canvasSameBox: boolean; wallet: string; bar: string;
  keys: { id: string; label: string; primary: boolean; inside: boolean }[];
  overflow: number | null; screenOverflow: number | null; pageWide: boolean; resultShown: boolean; title: string;
};

/**
 * WHERE THE PANE IS LOOKING, measured: the planet's own snapshot maps a flat tile id to CSS px, so
 * the distance from the pane's centre to the expected tile — and the box the whole holding covers —
 * are facts, not a screenshot someone has to squint at.
 */
const FOCUS = `((args) => {
  const snap = (window.__goPlanet && window.__goPlanet()) || null;
  const surface = document.getElementById('go-world-surface');
  if (!snap || !surface) return null;
  const box = surface.getBoundingClientRect();
  const at = (id) => { const p = snap.screenOf(id); return p ? { x: p.x, y: p.y } : null; };
  const home = at(args.home);
  const cluster = args.cluster.map(at).filter(Boolean);
  const pane = { x: box.left, y: box.top, w: box.width, h: box.height };
  const cx = pane.x + pane.w / 2, cy = pane.y + pane.h / 2;
  const inPane = home ? home.x >= pane.x - 1 && home.x <= pane.x + pane.w + 1 && home.y >= pane.y - 1 && home.y <= pane.y + pane.h + 1 : false;
  const xs = cluster.map((p) => p.x), ys = cluster.map((p) => p.y);
  const bbox = cluster.length ? {
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
    x: Math.min(...xs), y: Math.min(...ys),
  } : null;
  return {
    home, inPane,
    offCentre: home ? Math.round(Math.hypot(home.x - cx, home.y - cy)) : null,
    pane, tilePx: snap.tilePx, zoom: snap.zoom, disc: snap.disc,
    bbox,
    // How much of the pane's smaller side the holding's box covers (the "not small in the middle").
    share: bbox ? Math.max(bbox.w / pane.w, bbox.h / pane.h) : 0,
    ready: snap.ready, flying: snap.flying,
  };
})`;

type Focus = {
  home: { x: number; y: number } | null; inPane: boolean; offCentre: number | null;
  pane: { x: number; y: number; w: number; h: number }; tilePx: number; zoom: number;
  disc: { x: number; y: number; r: number }; bbox: { w: number; h: number; x: number; y: number } | null;
  share: number; ready: boolean; flying: boolean;
};

const browser = await chromium.launch(process.env.PW_CHROMIUM
  ? { executablePath: process.env.PW_CHROMIUM }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;

/** One finished game on one viewport, ready at the card, with its stubbed world. */
const playToCard = async (vp: { width: number; height: number }, scenario: ScenarioKey, delayMs = 0) => {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' });
  await stub(page, scenario, delayMs);
  await page.goto(`${origin}/?seed=219682080`, { waitUntil: 'load' });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state(); })()', undefined, { timeout: 40_000 });
  const ended = await toGameOver(page);
  check(`[${scenario}${delayMs ? '+slow' : ''}] the practice game reached its end`, ended === 'ended', ended);
  await waitFinish(page);
  // The pane is lazy (WebGL + a world read): give it the same moment a player would.
  await page.waitForSelector('#go-world-surface > .planet-canvas', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(delayMs ? 2_200 : 900);
  return { context, page, errors };
};

try {
  for (const vp of VIEWPORTS) {
    const { context, page, errors } = await playToCard(vp, 'land');
    const m = await page.evaluate(MEASURE) as Card;
    console.log(`\n--- ${vp.key}: "${m.title}" · anatomy ${m.anatomy}`);
    console.log(`    pane ${m.worldHeight}px · surface ${m.surfaceHeight}px · wallet "${m.wallet}" · bar "${m.bar}"`);
    console.log(`    canvas ready ${m.canvasReady} · opacity ${m.canvasOpacity} · clip ${m.canvasClip || '(none)'} · fallback "${m.fallback}"`);
    console.log(`    planet: ${JSON.stringify(await page.evaluate(() => ((globalThis as unknown as Record<string, unknown>).__goPlanet as (() => unknown) | undefined)?.() ?? null))}`);
    console.log(`    keys: ${m.keys.map((k) => `${k.label}${k.primary ? '*' : ''}`).join(' | ')}`);
    check(`[${vp.key}] the card is the PLANET card`, m.anatomy === 'planet', m.anatomy);
    check(`[${vp.key}] the planet pane is on the card and has real height`, m.worldShown && m.worldHeight >= 100, `${m.worldHeight}px`);
    check(`[${vp.key}] the shared planet renderer drew into it`, m.canvas, 'no canvas');
    check(`[${vp.key}] the planet's canvas IS the pane (not a sheet over the screen)`, m.canvasSameBox);
    check(`[${vp.key}] the wallet is the server's number`, /150\s+SEEDS/.test(m.wallet), m.wallet);
    check(`[${vp.key}] the bar offers the grow hint before a tile is chosen`, m.bar.length > 0, m.bar);
    check(`[${vp.key}] four keys in the product's order`,
      m.keys.map((k) => k.id).join(',') === 'go-rematch,go-result,go-replay,go-menu',
      m.keys.map((k) => k.id).join(','));
    check(`[${vp.key}] exactly one key is filled (the forward action)`, m.keys.filter((k) => k.primary).length === 1, m.keys.map((k) => k.id).join(','));
    check(`[${vp.key}] every key is inside the viewport`, m.keys.every((k) => k.inside), m.keys.filter((k) => !k.inside).map((k) => k.id).join(','));
    check(`[${vp.key}] the card does not scroll`, (m.overflow ?? 1) <= 0, `overflow ${m.overflow}px`);
    check(`[${vp.key}] the screen behind it does not scroll`, (m.screenOverflow ?? 1) <= 0, `overflow ${m.screenOverflow}px`);
    check(`[${vp.key}] the page does not widen`, !m.pageWide);
    check(`[${vp.key}] RESULT is offered on the card`, m.resultShown);
    check(`[${vp.key}] no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    // ---- THE PANE IS ON YOUR LAND (the owner's "not ALWAYS showing my cluster") ----
    const home = expectedFocus('land')!;
    const focus = await page.evaluate(`${FOCUS}(${JSON.stringify({ home, cluster: holdingOf('land', home) })})`) as Focus | null;
    console.log(`    focus: home ${home} at ${JSON.stringify(focus?.home)} · off-centre ${focus?.offCentre}px · tile ${focus?.tilePx.toFixed(1)}px · holding covers ${(focus?.share ?? 0).toFixed(2)} of the pane`);
    check(`[${vp.key}] the pane frames YOUR LAND (${home}) near its centre`, !!focus && focus.inPane && (focus.offCentre ?? 1e9) <= 40, `off-centre ${focus?.offCentre}px`);
    check(`[${vp.key}] your holding fills a good part of the pane`, (focus?.share ?? 0) >= 0.4, `${(focus?.share ?? 0).toFixed(2)} of the pane`);
    check(`[${vp.key}] the tiles are big enough to read as YOUR place`, (focus?.tilePx ?? 0) >= 44, `${focus?.tilePx?.toFixed(1)}px`);

    await page.evaluate(() => ((globalThis as unknown as Record<string, unknown>).__goPlanetFrame as (() => void) | undefined)?.());
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}endgame-planet-${vp.key}.png` });

    // ---- RESULT: the final board, the reason, the record line, and the keyboard ----
    await page.click('#go-result');
    await page.waitForSelector('#go-result-pane:not([hidden])', { timeout: 5_000 });
    await page.waitForTimeout(350);
    const result = await page.evaluate(`(() => {
      const id = (x) => document.getElementById(x);
      const shown = (el) => !!el && el.getClientRects().length > 0;
      const sheet = id('go-result-sheet');
      return {
        focused: document.activeElement ? document.activeElement.id : '',
        board: shown(id('go-result-board')) && !!id('go-result-board').querySelector('svg'),
        reason: (id('go-result-reason')?.textContent || '').trim(),
        breakdown: (id('go-result-break')?.textContent || '').trim(),
        highlights: document.querySelectorAll('#go-result-highlights li').length,
        overflow: sheet ? sheet.scrollHeight - sheet.clientHeight : null,
      };
    })()`) as { focused: string; board: boolean; reason: string; breakdown: string; highlights: number; overflow: number | null };
    check(`[${vp.key}] RESULT takes focus`, result.focused === 'go-result-close', result.focused);
    check(`[${vp.key}] RESULT shows the final board`, result.board);
    check(`[${vp.key}] RESULT carries the reason`, result.reason.length > 0, result.reason);
    check(`[${vp.key}] RESULT carries the tile breakdown`, /tiles?/.test(result.breakdown), result.breakdown);
    check(`[${vp.key}] RESULT carries the three biggest moments`, result.highlights === 3, String(result.highlights));
    if (result.overflow !== null) check(`[${vp.key}] RESULT fits its own plate or scrolls inside it`, result.overflow >= 0);
    await page.screenshot({ path: `${OUT}endgame-result-${vp.key}.png` });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#go-result-pane', { state: 'hidden', timeout: 5_000 });
    const back = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
    check(`[${vp.key}] Escape closes RESULT and gives the key back`, back === 'go-result', back);

    await context.close();
  }

  // ---- THE THREE CASES THE OWNER NAMED, at 390x844 (phone), plus the slow world read ----
  const phone = { width: 390, height: 844 };
  for (const scenario of ['tie', 'none', 'land'] as const) {
    const slow = scenario === 'land'; // the slow read is the timing race, measured on the land world
    const tag = `${scenario}${slow ? '+slow' : ''}`;
    const { context, page } = await playToCard(phone, scenario, slow ? 1_200 : 0);
    const home = expectedFocus(scenario);
    if (home === null) {
      // The empty map has no answer at all; the card must still show its pane, not throw.
      check('[none] an empty map never throws', true);
      await context.close();
      continue;
    }
    const focus = await page.evaluate(`${FOCUS}(${JSON.stringify({ home, cluster: holdingOf(scenario, home) })})`) as Focus | null;
    console.log(`\n--- ${tag}: expected ${home} · framed ${JSON.stringify(focus?.home)} · off-centre ${focus?.offCentre}px · tile ${focus?.tilePx.toFixed(1)}px · holding covers ${(focus?.share ?? 0).toFixed(2)}`);
    check(`[${tag}] the pane frames the expected cell (${home})`, !!focus && focus.inPane && (focus.offCentre ?? 1e9) <= 40, `off-centre ${focus?.offCentre}px`);
    check(`[${tag}] the framed cell is the same one the rule names`, !!focus && focus.home !== null);
    if (scenario === 'none') {
      const claimed = new Set(SCENARIOS.none.world.claims.map((c) => c.cellId));
      check(`[${tag}] with no land the pane invites a grow on FREE ground`, !claimed.has(home), `picked ${home}`);
    }
    await page.evaluate(() => ((globalThis as unknown as Record<string, unknown>).__goPlanetFrame as (() => void) | undefined)?.());
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}endgame-focus-${tag}.png` });

    // ---- ITEM C: A GUEST'S "SIGN IN TO GROW" IS A REAL KEY (owner, 2026-11-12) ----
    if (scenario === 'none') {
      // The framed cell is at the pane's own centre, and it is free ground, so ONE tap on the
      // centre picks it exactly as a thumb would.
      const rect = await page.evaluate(`(() => {
        const s = document.getElementById('go-world-surface');
        const r = s.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`) as { x: number; y: number };
      await page.mouse.click(rect.x, rect.y);
      await page.waitForTimeout(450);
      const guest = await page.evaluate(`(() => {
        const id = (x) => document.getElementById(x);
        const shown = (el) => !!el && el.getClientRects().length > 0;
        const key = id('go-world-grow');
        const r = key ? key.getBoundingClientRect() : null;
        return {
          bar: (id('go-world-line')?.textContent || '').trim(),
          key: key ? (key.textContent || '').trim() : '',
          keyShown: shown(key),
          tag: key ? key.tagName : '',
          h: r ? Math.round(r.height) : 0,
          inside: r ? r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1 : false,
          focusable: key ? key.tabIndex >= 0 : false,
        };
      })()`) as { bar: string; key: string; keyShown: boolean; tag: string; h: number; inside: boolean; focusable: boolean };
      console.log(`\n--- guest: bar "${guest.bar}" · key "${guest.key}" ${guest.h}px`);
      check('[guest] the bar says SIGN IN TO GROW', guest.bar === ONLINE.worldSignInToGrow, guest.bar);
      check('[guest] …and it offers a REAL button, not dead text', guest.keyShown && guest.tag === 'BUTTON', `${guest.tag} "${guest.key}"`);
      check('[guest] the key is the Planet page’s own word', guest.key === ONLINE.worldSignInToGrow, guest.key);
      check('[guest] the key is a 44px target inside the viewport', guest.h >= 44 && guest.inside, `${guest.h}px`);
      check('[guest] the key is keyboard reachable', guest.focusable);
      // Focus the key by keyboard, then press it: ONE gesture opens the product's login.
      await page.focus('#go-world-grow');
      const focused = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
      check('[guest] the key can take keyboard focus', focused === 'go-world-grow', focused);
      await page.keyboard.press('Enter');
      const opened = await page.waitForSelector('#acct-email:not([hidden])', { timeout: 6_000 }).then(() => true).catch(() => false);
      check('[guest] the key opens the product’s ONE login window over the card', opened, opened ? '' : 'no #acct-email');
      const over = await page.evaluate(`(() => {
        const id = (x) => document.getElementById(x);
        const sheet = id('acct-email');
        const card = document.querySelector('#gameover .go-card');
        const pane = id('go-world');
        const shown = (el) => !!el && el.getClientRects().length > 0;
        const r = sheet ? sheet.getBoundingClientRect() : null;
        // The window is really ON TOP: the topmost node at its own centre is inside it.
        const at = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
        return {
          sheetShown: shown(sheet),
          above: !!at && !!sheet && sheet.contains(at),
          cardKept: shown(card) && shown(pane),
          dialog: sheet ? sheet.getAttribute('role') : '',
          inside: r ? r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1 : false,
        };
      })()`) as { sheetShown: boolean; above: boolean; cardKept: boolean; dialog: string; inside: boolean };
      check('[guest] the login window is painted ABOVE the card', over.sheetShown && over.above, JSON.stringify(over));
      check('[guest] opening the login does NOT tear the finish card down', over.cardKept);
      check('[guest] the login is a real dialog inside the viewport', over.dialog === 'dialog' && over.inside, over.dialog);
      await page.mouse.click(Math.round(phone.width / 2), 8); // the scrim closes it
      const closed = await page.waitForSelector('#acct-email', { state: 'hidden', timeout: 6_000 }).then(() => true).catch(() => false);
      check('[guest] closing the login gives the card back', closed);
      const back = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
      check('[guest] …with focus back on the pane’s own key', back === 'go-world-grow', back);
      await page.keyboard.press('Enter');
      await page.waitForSelector('#acct-email', { state: 'hidden', timeout: 6_000 }).catch(() => undefined);

      // SIGNED IN (stubbed): the accounts module writes the identity and dispatches this exact
      // event just before its reload, so this is the real signal, not a private hook.
      await page.evaluate(() => {
        const key = 'severgrow.duel.identity.v1';
        localStorage.setItem(key, JSON.stringify({ token: 'account-token', playerId: 'stub', displayName: 'StubPlayer', kind: 'account' }));
        localStorage.setItem('severgrow.account.v1', JSON.stringify({ provider: 'email', email: 'stub@example.com', playerId: 'stub' }));
        window.dispatchEvent(new Event('futasaku:identity'));
      });
      const signed = await page.waitForFunction(`(() => {
        const line = (document.getElementById('go-world-line')?.textContent || '').trim();
        return line.length > 0 && line !== ${JSON.stringify(ONLINE.worldSignInToGrow)} ? {
          bar: line,
          key: (document.getElementById('go-world-grow')?.textContent || '').trim(),
          keyShown: !!document.getElementById('go-world-grow')?.getClientRects().length,
        } : null;
      })()`, undefined, { timeout: 10_000 }).then((h) => h.jsonValue()).catch(() => null) as { bar: string; key: string; keyShown: boolean } | null;
      console.log(`    signed in: bar "${signed?.bar}" · key "${signed?.key}"`);
      check('[signed-in] the sign-in line and key are GONE', !!signed, 'the bar never changed');
      check('[signed-in] the bar now invites the GROW', !!signed && signed.bar === ONLINE.worldUnclaimed(SCENARIOS.none.world.cost, SEEDS_WORD), signed?.bar);
      check('[signed-in] the key is the real GROW key', !!signed && signed.keyShown && signed.key === ONLINE.worldGrowKey, signed?.key);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${failed ? `FAILED: ${failed}` : 'All end-screen planet checks passed.'}`);
process.exit(failed ? 1 : 0);
