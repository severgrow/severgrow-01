/**
 * REAL /test SMOKE (read-only; never run in CI). A fresh phone visitor — no identity, no cache, as in
 * iPhone Private Browsing — opens the Planet, Global chat and achievements on the REAL site and the
 * REAL server, and each must show content within SMOKE_MS.
 *
 *   node --import tsx web/e2e/real-test-smoke.ts                      # futasaku.com/test/, Chromium + WebKit
 *   SMOKE_URL=https://futasaku.com/ node --import tsx web/e2e/real-test-smoke.ts   # live, for comparison
 *   SMOKE_ENGINES=webkit SMOKE_RUNS=3 node --import tsx web/e2e/real-test-smoke.ts
 *
 * It writes nothing but the one guest a fresh visitor always gets, and every request it sends to the
 * API carries `x-futasaku-traffic: test`, so that guest is stored as test traffic (`players.is_test`).
 * Prints, per run: guest created, Planet painted, chat messages, achievements shown (seconds after
 * the Planet opened), every API request that failed or never answered, and page errors.
 */
import { chromium, webkit, devices } from 'playwright-core';
import type { Page } from 'playwright-core';

const URL0 = process.env.SMOKE_URL ?? 'https://futasaku.com/test/';
const ENGINES = (process.env.SMOKE_ENGINES ?? 'chromium,webkit').split(',');
const RUNS = Number(process.env.SMOKE_RUNS ?? 1);
const SMOKE_MS = Number(process.env.SMOKE_MS ?? 45_000);
const API = /\/functions\/v1\/duel\//;

const SAMPLE = `(() => {
  const shown = (id) => { const n = document.getElementById(id); return n && !n.hidden && n.getClientRects().length ? (n.textContent || '').trim() : ''; };
  const key = document.getElementById('world-key-achievements');
  return { notice: shown('online-world-notice'), planet: !!window.__severgrow?.planet?.()?.ready,
    chatRows: document.querySelectorAll('#world-chat-list > li').length, chatEmpty: shown('world-chat-empty'), chatStatus: shown('world-chat-status'),
    achKey: !!key && !key.hidden, achRows: document.querySelectorAll('#online-world-achievements .world-achievement').length, achLine: shown('world-achievements-empty') };
})()`;

type Sample = { notice: string; planet: boolean; chatRows: number; chatEmpty: string; chatStatus: string; achKey: boolean; achRows: number; achLine: string };

const smoke = async (page: Page) => {
  const t0 = Date.now();
  const reqs: { path: string; start: number; end?: number; status?: number; failed?: string }[] = [];
  const open = new Map<object, (typeof reqs)[number]>();
  const errors: string[] = [];
  page.on('request', (r) => { if (API.test(r.url())) { const q = { path: r.method() + ' ' + new URL(r.url()).pathname.replace(/^.*\/duel/, ''), start: Date.now() - t0 }; open.set(r, q); reqs.push(q); } });
  page.on('requestfinished', async (r) => { const q = open.get(r); if (q) { q.end = Date.now() - t0; const status = (await r.response().catch(() => null))?.status(); if (status !== undefined) q.status = status; } });
  page.on('requestfailed', (r) => { const q = open.get(r); if (q) { q.end = Date.now() - t0; q.failed = r.failure()?.errorText ?? 'failed'; } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 60_000 });
  await page.locator('#menu-world').click({ timeout: 20_000 });
  const opened = Date.now();
  await page.waitForSelector('#online-world-chat', { state: 'attached', timeout: 20_000 });
  // As a person does: MENU unfolds the row of keys, then the chat key.
  await page.evaluate("(() => { const m = document.getElementById('online-world-menu'); if (m && m.getAttribute('aria-expanded') !== 'true') m.click(); })()");
  await page.waitForTimeout(300);
  await page.evaluate("document.getElementById('online-world-chat')?.click()");
  const done: Record<'planet' | 'chat' | 'achievements', number | null> = { planet: null, chat: null, achievements: null };
  let paneOpen = false;
  let last: Sample | null = null;
  while (Date.now() - opened < SMOKE_MS) {
    const s = await page.evaluate(SAMPLE) as Sample;
    last = s;
    const at = Date.now() - opened;
    const worldServed = reqs.some((q) => /^GET \/v1\/world/.test(q.path) && q.status === 200);
    if (done.planet === null && worldServed && s.planet && s.notice === '') done.planet = at;
    if (done.chat === null && (s.chatRows > 0 || s.chatEmpty)) done.chat = at;
    if (!paneOpen && done.chat !== null && s.achKey) {
      paneOpen = true;
      await page.evaluate("document.getElementById('world-chat-back')?.click()");
      await page.waitForTimeout(400);
      await page.evaluate("(() => { const m = document.getElementById('online-world-menu'); if (m && m.getAttribute('aria-expanded') !== 'true') m.click(); })()");
      await page.waitForTimeout(300);
      await page.evaluate("document.getElementById('world-key-achievements')?.click()");
    }
    if (paneOpen && done.achievements === null && s.achRows > 0) done.achievements = at;
    if (done.planet !== null && done.chat !== null && done.achievements !== null) break;
    await page.waitForTimeout(150);
  }
  const guest = reqs.find((q) => q.path.startsWith('POST /v1/guests') && q.status && q.status < 300);
  return { done, guestMs: guest?.end === undefined ? null : guest.end - (opened - t0), last, errors,
    unanswered: reqs.filter((q) => q.end === undefined || q.failed || (q.status ?? 0) >= 500).map((q) => `${q.path} ${q.failed ?? q.status ?? 'no answer'} @${((q.start - (opened - t0)) / 1000).toFixed(1)}s`) };
};

let failures = 0;
const sec = (v: number | null) => (v === null ? 'NOT SHOWN' : `${(v / 1000).toFixed(1)} s`);
for (const engine of ENGINES) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' && process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  for (let run = 1; run <= RUNS; run++) {
    const context = await browser.newContext(engine === 'webkit' ? { ...devices['iPhone 13'] } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.route(API, (route) => route.continue({ headers: { ...route.request().headers(), 'x-futasaku-traffic': 'test' } }));
    try {
      const r = await smoke(await context.newPage());
      const ok = r.done.planet !== null && r.done.chat !== null && r.done.achievements !== null && r.errors.length === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${engine} #${run} ${URL0}: guest ${sec(r.guestMs)} · Planet ${sec(r.done.planet)} · chat ${sec(r.done.chat)} · achievements ${sec(r.done.achievements)}`);
      if (!ok) console.log('  on screen:', JSON.stringify(r.last));
      if (r.unanswered.length) console.log('  requests that failed or never answered:', r.unanswered.join('; '));
      if (r.errors.length) console.log('  page errors:', r.errors.join(' | '));
    } catch (error) {
      failures++;
      console.log(`FAIL ${engine} #${run}: ${(error as Error).message.split('\n')[0]}`);
    }
    await context.close();
  }
  await browser.close();
}
process.exit(failures ? 1 : 0);
