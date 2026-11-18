/**
 * COLD START AGAINST A REALISTIC SLOW SERVER (owner report, 2026-11-18: on a fresh iPhone visit to
 * /test/ "Global chat stays loading and achievements keep loading and never show").
 *
 * Measured on the real server the same day: an answer arrives in under 3 s, or not at all — guest
 * creation, the map, the wallet, the chat page each sometimes stayed open for 30 s and more while
 * the health check answered in 0.3 s. This suite serves the built page against a real HTTP API (no
 * browser interception, so WebKit's preflights are real) that behaves like that:
 *
 *   - the FIRST guest creation never answers; the next answers after 7 s;
 *   - the first map read takes 8 s; the first wallet read never answers;
 *   - the first achievements read fails (503); the first chat read takes 6 s.
 *
 * A fresh visitor (no identity, no cached map: iPhone Private Browsing) opens the Planet and its
 * chat. Asserted on Chromium and WebKit (`cold-start-slow-ios`):
 *   - Planet, Global chat and achievements all END IN CONTENT within COLD_DEADLINE_MS;
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
const LOADING_MAX_MS = 16_000;
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
const api = createServer((req: IncomingMessage, res: ServerResponse) => {
  const headers = {
    'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin ?? '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] ?? 'authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
  const path = new URL(req.url ?? '/', 'http://local').pathname.replace(/^\/functions\/v1\/duel/, '');
  const key = `${req.method} ${path}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  log.push(`${((Date.now() - started) / 1000).toFixed(1)} ${key} #${n}`);
  const answer = (ms: number, status: number, body: unknown) => setTimeout(() => {
    if (res.destroyed) return;
    res.writeHead(status, headers); res.end(JSON.stringify(body));
  }, ms);
  const stall = () => { /* never answers: the connection stays open, as measured on the real server */ };
  req.resume();
  switch (key) {
    case 'GET /v1/health': return answer(0, 200, { ok: true, features: {} });
    case 'POST /v1/guests': return n === 1 ? stall() : answer(n === 2 ? 7000 : 0, 201,
      { ok: true, player: { id: PLAYER, kind: 'guest', displayName: 'MossyGrove' }, token: 'slow-token', serverNow: Date.now() });
    case 'GET /v1/world': setTimeout(() => { worldAnswered = true; }, n === 1 ? 8000 : 200); return answer(n === 1 ? 8000 : 200, 200, { ok: true, world });
    case 'GET /v1/seeds/wallet': return n === 1 ? stall() : answer(100, 200, { ok: true, wallet: { balance: 40, lifetimeEarned: 40, lifetimeSpent: 0, worldInvitationSeen: true }, campaignHighestLevel: null });
    case 'GET /v1/world/challenges': return answer(100, 200, { ok: true, incoming: [], outgoing: [], serverNow: Date.now() });
    case 'GET /v1/seeds/achievements': return n === 1 ? answer(300, 503, { ok: false, code: 'UNAVAILABLE', message: 'cold' }) : answer(200, 200, { ok: true, achievements: views });
    case 'GET /v1/territory/chat': return answer(n === 1 ? 6000 : 150, 200, { ok: true, messages });
    case 'GET /v1/world/colour': return answer(100, 200, { ok: true, colour: { colourId: 0, colour: 'hsl(150 32% 52%)', name: 'Moss', chosen: false, canChange: true, nextChangeAt: null } });
    default: return answer(50, 503, { ok: false, code: 'UNAVAILABLE', message: 'not in this fixture' });
  }
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

try {
  const context = await browser.newContext(ios ? { ...devices['iPhone 13'] } : { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
  });
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 30_000 });
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
  const done: Record<string, number | null> = { planet: null, chat: null, achievements: null };
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
  const result = { engine: ios ? 'webkit' : 'chromium', doneMs: done, longestLoadingMs: longest, errors };
  console.log('COLD_START_SLOW', JSON.stringify(result));
  const failed = Object.values(done).some((v) => v === null) || Object.values(longest).some((v) => v > LOADING_MAX_MS) || errors.length > 0;
  if (failed) { console.log('TIMELINE\n' + timeline.join('\n')); console.log('REQUESTS\n' + log.join('\n')); }
  assert(done.planet !== null, 'the Planet painted the real map');
  assert(done.chat !== null, 'Global chat showed its messages');
  assert(done.achievements !== null, 'achievements showed their list');
  for (const [k, ms] of Object.entries(longest)) assert(ms <= LOADING_MAX_MS, `${k} loading line stayed ${ms} ms`);
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  await fixture.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
  api.closeAllConnections?.();
}
