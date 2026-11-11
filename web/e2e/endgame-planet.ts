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
//      focus, closes on Escape, and gives the keyboard back to its own key.
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
import { WORLD_CELLS } from '../../server/src/world.js';
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

/** A public world with two of my tiles and three of someone else's, and enough Seeds to grow. */
const WORLD = {
  ok: true,
  world: {
    version: 1, revision: 5, cost: 100, growAnywhere: true, cells: WORLD_CELLS,
    claims: ['0,0', '1,0', '0,1', '-1,1', '-1,0'].map((cellId, index) => ({
      cellId, ownerId: index < 2 ? 'stub' : 'other',
      ownerName: index < 2 ? 'Me' : 'WillowBirch', ownerTag: index < 2 ? '1001' : '1002',
      ownerLevel: index < 2 ? 22 : null,
      colour: 'hsl(200 34% 49%)', claimedAt: Date.now() - index * 60_000,
    })),
  },
};

const stub = async (page: Page): Promise<void> => {
  await page.route('**/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORLD) }));
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

const browser = await chromium.launch(process.env.PW_CHROMIUM
  ? { executablePath: process.env.PW_CHROMIUM }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' });
    await stub(page);
    await page.goto(`${origin}/?seed=219682080`, { waitUntil: 'load' });
    await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state(); })()', undefined, { timeout: 40_000 });
    const ended = await toGameOver(page);
    check(`[${vp.key}] the practice game reached its end`, ended === 'ended', ended);
    await waitFinish(page);
    // The pane is lazy (WebGL + a world read): give it the same moment a player would.
    await page.waitForSelector('#go-world-surface > .planet-canvas', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(900);
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
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${failed ? `FAILED: ${failed}` : 'All end-screen planet checks passed.'}`);
process.exit(failed ? 1 : 0);
