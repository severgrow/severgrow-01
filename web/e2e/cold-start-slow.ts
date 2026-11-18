/**
 * COLD START AGAINST A REALISTIC SLOW SERVER (owner report, 2026-11-18: on a fresh iPhone visit to
 * /test/ "Global chat stays loading and achievements keep loading and never show").
 *
 * Measured on the real server the same day: an answer arrives in under 3 s, or not at all — guest
 * creation, the map, the wallet, the chat page each sometimes stayed open for 30 s and more while
 * the health check answered in 0.3 s. This suite serves the built page against a real HTTP API (no
 * browser interception, so WebKit's preflights are real) that behaves like that, all at once:
 *
 *   - the first guest creation, map read and chat read never answer; the next take 1.5 s;
 *   - the first two wallet reads never answer; the first achievements read fails (503).
 *
 * Owner, 2026-11-18, on the first version of this check (25 s to chat): "how is that fixed?". So
 * it fails on SLOW, not only on never: each must show within its limit below.
 *
 * A fresh visitor (no identity, no cached map: iPhone Private Browsing) opens the Planet and its
 * chat. Asserted on Chromium and WebKit (`cold-start-slow-ios`):
 *   - Planet, Global chat and achievements show content within LIMIT_MS (from the Planet tap);
 *   - no loading line ("Reading the map", "Connecting…", "Reading your progress…") stays on screen
 *     for more than LOADING_MAX_MS in a row: it becomes content or a quiet message that recovers.
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { chromium, webkit, devices } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';
import { achievementFacts, achievementViews } from '../../server/src/seeds/achievements.js';
import { ACHIEVEMENTS_UI } from '../src/online/achievement-copy.js';
import { ONLINE } from '../../src/strings.js';

const ios = process.env.COLD_WEBKIT === '1';
const COLD_DEADLINE_MS = 60_000;
/** Worst case: the Planet tapped within a second of opening while guest and chat both go silent once. */
const LOADING_MAX_MS = 10_000;
/** Measured with the fix: Planet ~4.5 s, chat ~8 s, achievements ~8 s on this fixture. */
const LIMIT_MS = { planet: 7_000, chat: 11_000, achievements: 11_000 } as const;
const PLAYER = '22222222-2222-4222-8222-222222222222';
const claim = (cellId: string) => ({ cellId, ownerId: 'other', ownerName: 'Cedar', ownerTag: 'ABCD', ownerLevel: 3, colour: 'hsl(150 32% 52%)', claimedAt: 1 });
const world = { version: WORLD_VERSION, revision: 7, cost: 100, challengeStake: 0, cells: seenWorld(['0,0', '1,0']), claims: [claim('0,0')], disputes: [] };
const views = achievementViews(achievementFacts({ playerId: PLAYER, claims: [], challenges: [], duels: [],
  campaign: { highestLevel: null, chaptersCleared: 0, lessonCleared: false, clears: [] }, opponentLevels: {} }), new Set());
const messages = [1, 2, 3].map((n) => ({ id: `m${n}`, sequence: n, text: `hello ${n}`, name: 'Cedar', tag: 'ABCD', mine: false, createdAt: n, requestId: `r${n}` }));

const seen = new Map<string, number>();
let worldAnswered = false;
const log: string[] = [];
const started = Date.now();
/** The fake server's behaviour, one call per request: an answer after `ms`, or `null` = silent. */
type Reply = { ms: number; status: number; body: unknown } | null;
const behave = (method: string, path: string): Reply => {
  const key = `${method} ${path}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  log.push(`${((Date.now() - started) / 1000).toFixed(1)} ${key} #${n}`);
  const r = (ms: number, status: number, body: unknown): Reply => ({ ms, status, body });
  switch (key) {
    case 'GET /v1/health': return r(0, 200, { ok: true, features: {} });
    case 'POST /v1/guests': return n === 1 ? null : r(1500, 201,
      { ok: true, player: { id: PLAYER, kind: 'guest', displayName: 'MossyGrove' }, token: 'slow-token', serverNow: Date.now() });
    case 'GET /v1/world': if (n === 1) return null; setTimeout(() => { worldAnswered = true; }, 1500); return r(1500, 200, { ok: true, world });
    case 'GET /v1/seeds/wallet': return n <= 2 ? null : r(100, 200, { ok: true, wallet: { balance: 40, lifetimeEarned: 40, lifetimeSpent: 0, worldInvitationSeen: true }, campaignHighestLevel: null });
    case 'GET /v1/world/challenges': return r(100, 200, { ok: true, incoming: [], outgoing: [], serverNow: Date.now() });
    case 'GET /v1/seeds/achievements': return n === 1 ? r(300, 503, { ok: false, code: 'UNAVAILABLE', message: 'cold' }) : r(200, 200, { ok: true, achievements: views });
    case 'GET /v1/territory/chat': return n === 1 ? null : r(1500, 200, { ok: true, messages });
    case 'GET /v1/world/colour': return r(100, 200, { ok: true, colour: { colourId: 0, colour: 'hsl(150 32% 52%)', name: 'Moss', chosen: false, canChange: true, nextChangeAt: null } });
    default: return r(50, 503, { ok: false, code: 'UNAVAILABLE', message: 'not in this fixture' });
  }
};
const cors = (origin: string | undefined, asked: string | undefined) => ({
  'content-type': 'application/json', 'access-control-allow-origin': origin ?? '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': asked ?? 'authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version',
});
const pathOf = (url: string) => new URL(url, 'http://local').pathname.replace(/^\/functions\/v1\/duel/, '');
// WebKit: a real HTTP server, so its preflights are real. (Chromium is served the same replies by
// request interception below: over this HTTP/1.1 server, Chrome's six connections per host fill with
// the silent requests and hold the 3 s copies back for 9 s. The real API is HTTP/2, which has no such
// limit; measured 2026-11-18, `curl -w %{http_version}` = 2.)
const api = createServer((req: IncomingMessage, res: ServerResponse) => {
  const headers = cors(req.headers.origin, req.headers['access-control-request-headers'] as string | undefined);
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
  req.resume();
  const reply = behave(req.method ?? 'GET', pathOf(req.url ?? '/'));
  if (!reply) return; // silent: the connection stays open, as measured on the real server
  setTimeout(() => { if (!res.destroyed) { res.writeHead(reply.status, headers); res.end(JSON.stringify(reply.body)); } }, reply.ms);
});
await new Promise<void>((resolve) => api.listen(65530, '127.0.0.1', resolve));
const fixture = await productFixture();
const browser = await (ios ? webkit : chromium).launch(ios ? {} : { executablePath: process.env.PW_CHROMIUM ?? chromium.executablePath(),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const SAMPLE = `(() => {
  const shown = (id) => { const n = document.getElementById(id); return n && !n.hidden && n.getClientRects().length ? (n.textContent || '').trim() : ''; };
  const p = window.__severgrow?.planet?.();
  return { notice: shown('online-world-notice'), planet: !!p?.ready,
    chatStatus: shown('world-chat-status'), chatRows: document.querySelectorAll('#world-chat-list > li').length,
    achEmpty: shown('world-achievements-empty'), achRows: document.querySelectorAll('#online-world-achievements .world-achievement').length };
})()`;

type Part = 'planet' | 'chat' | 'achievements';
const visit = async (name: string, menuWaitMs: number, limit: Record<Part, number>, loadingMax: number) => {
  seen.clear(); worldAnswered = false; log.length = 0;
  const context = await browser.newContext(ios ? { ...devices['iPhone 13'] } : { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  if (!ios) await page.route('http://127.0.0.1:65530/**', async (route) => {
    const req = route.request();
    const headers = cors(await req.headerValue('origin') ?? undefined, await req.headerValue('access-control-request-headers') ?? undefined);
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (/\/realtime\//.test(req.url())) { await route.abort(); return; }
    const reply = behave(req.method(), pathOf(req.url()));
    if (!reply) return; // silent: never fulfilled; the page's own abort ends it
    await new Promise((resolve) => setTimeout(resolve, reply.ms));
    await route.fulfill({ status: reply.status, headers, body: JSON.stringify(reply.body) }).catch(() => undefined);
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
    // When the PAGE asks (as opposed to when the request reaches the server): printed on failure.
    const asked: string[] = []; (window as any).__asked = asked;
    const t0 = performance.now(); const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(`${((performance.now() - t0) / 1000).toFixed(1)} ${init?.method ?? 'GET'} ${String(input).replace(/^.*\/duel/, '').replace(/\?.*$/, '')}`);
      return real(input, init);
    };
  });
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 30_000 });
  // The visitor stays on the main menu this long before tapping the Planet.
  if (menuWaitMs) await page.waitForTimeout(menuWaitMs);
  await page.locator('#menu-world').click();
  const t0 = Date.now();
  await page.waitForSelector('#online-world-chat', { state: 'attached', timeout: 15_000 });
  // As a person does: MENU unfolds the row of keys, then the chat key.
  await page.evaluate("(() => { const m = document.getElementById('online-world-menu'); if (m && m.getAttribute('aria-expanded') !== 'true') m.click(); })()");
  await page.waitForTimeout(300);
  await page.evaluate("document.getElementById('online-world-chat')?.click()");
  const loading = { world: ONLINE.worldLoading, chat: ONLINE.worldChatLoading, achievements: ACHIEVEMENTS_UI.waiting };
  const since: Record<string, number | null> = { world: null, chat: null, achievements: null };
  const longest: Record<string, number> = { world: 0, chat: 0, achievements: 0 };
  const done: Record<Part, number | null> = { planet: null, chat: null, achievements: null };
  let achievementsOpen = false;
  const timeline: string[] = [];
  while (Date.now() - t0 < COLD_DEADLINE_MS) {
    const s = await page.evaluate(SAMPLE) as { notice: string; planet: boolean; chatStatus: string; chatRows: number; achEmpty: string; achRows: number };
    const at = Date.now() - t0;
    const on = { world: s.notice === loading.world, chat: s.chatStatus === loading.chat, achievements: s.achEmpty === loading.achievements };
    for (const k of Object.keys(on) as (keyof typeof on)[]) {
      if (on[k]) { since[k] ??= at; longest[k] = Math.max(longest[k]!, at - since[k]!); } else since[k] = null;
    }
    // The map has been served and the Planet is drawn with no loading line over it.
    if (done.planet === null && worldAnswered && s.planet && s.notice === '') done.planet = at;
    if (done.chat === null && s.chatRows === messages.length) done.chat = at;
    // The achievements key appears once the guest exists; open the pane then, as a visitor would.
    if (!achievementsOpen && done.chat !== null) {
      const key = await page.evaluate("(() => { const k = document.getElementById('world-key-achievements'); return !!k && !k.hidden; })()");
      if (key) {
        achievementsOpen = true;
        await page.evaluate("document.getElementById('world-chat-back')?.click()");
        await page.waitForTimeout(400);
        await page.evaluate("(() => { const m = document.getElementById('online-world-menu'); if (m && m.getAttribute('aria-expanded') !== 'true') m.click(); })()");
        await page.waitForTimeout(300);
        await page.evaluate("document.getElementById('world-key-achievements')?.click()");
      }
    }
    if (achievementsOpen && done.achievements === null && s.achRows === views.length) done.achievements = at;
    if (timeline.length === 0 || timeline.at(-1)!.slice(timeline.at(-1)!.indexOf(' ') + 1) !== JSON.stringify(s)) timeline.push(`${(at / 1000).toFixed(1)} ${JSON.stringify(s)}`);
    if (done.planet !== null && done.chat !== null && done.achievements !== null) break;
    await page.waitForTimeout(250);
  }
  const result = { engine: ios ? 'webkit' : 'chromium', visit: name, doneMs: done, longestLoadingMs: longest, errors };
  console.log('COLD_START_SLOW', JSON.stringify(result));
  const failed = (Object.keys(limit) as Part[]).some((k) => done[k] === null || done[k]! > limit[k]) || Object.values(longest).some((v) => v > loadingMax) || errors.length > 0;
  if (failed) {
    console.log('TIMELINE\n' + timeline.join('\n'));
    console.log('REQUESTS (reaching the server)\n' + log.join('\n'));
    console.log('ASKED (by the page)\n' + (await page.evaluate('window.__asked') as string[]).join('\n'));
  }
  for (const k of ['planet', 'chat', 'achievements'] as const) {
    assert(done[k] !== null, `${name}: ${k} never showed`);
    assert(done[k]! <= limit[k], `${name}: ${k} took ${done[k]} ms (limit ${limit[k]} ms)`);
  }
  for (const [k, ms] of Object.entries(longest)) assert(ms <= loadingMax, `${name}: ${k} loading line stayed ${ms} ms`);
  assert.deepEqual(errors, []);
  await context.close();
};

try {
  // 1. Straight to the Planet the moment the menu is ready: everything is still on its way.
  await visit('straight to the Planet', 0, LIMIT_MS, LOADING_MAX_MS);
  // 2. READY BEFORE THE TAP (owner, 2026-11-18: "this should load as soon as player opens the game
  //    right? even on main menu"). The same slow server, but the visitor spends 12 s on the main
  //    menu first: chat and achievements must be on screen at once when the Planet opens.
  await visit('after 12 s on the main menu', 12_000, { planet: 1_500, chat: 1_500, achievements: 2_500 }, 1_500);
} finally {
  await browser.close();
  await fixture.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
  api.closeAllConnections?.();
}
