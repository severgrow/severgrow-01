// FUTASAKU 0.5 — the ONLINE finish screen, score bar and exits must say and do exactly what
// OFFLINE does. Owner decision: offline is the reference; online matches it.
//
//   npx tsx web/e2e/online-finish-parity.ts
//
// Builds CHANNEL=futa05 against a local duel API (with a controllable clock) and asserts, from the
// players' own screens:
//   1. the finish screen carries the same information as offline (perspective reason sentence,
//      final score, tile breakdown, and highlights present or explicitly hidden — never blank
//      furniture); the reason text is compared against the SAME function offline uses
//      (`web/src/logic/log.ts`), so a pass means offline and online literally agree;
//   2. the score bar reads `You : Opponent` and the turn pill never shows a `Level N` online;
//   3. every exit route (pause Main menu / New game, finish Back to menu) tears the online session
//      down — the duel HUD hides, the driver stops polling, and a following offline game is offline;
//   4. the deadline urgency indicator is hidden at 24h, amber under 2h, red under 15m, is text not
//      colour alone, and never overlaps the menu button, the brand/logo or the board.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, Request } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike } from '../../server/src/client.js';
import { resultReason, resultTitle } from '../src/logic/log.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const CHROME = process.env.PW_CHROMIUM;
const OUT = new URL('../../docs/screens/offline-vs-online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4231);
const PREFIX = 'futa05:';
const HOUR = 3_600_000;

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---------------------------------------------------------------- local duel API (controllable clock)

let now = 1_800_000_000_000;
const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 24 * HOUR, maxOpenMatchesPerPlayer: 30 },
  now: () => now,
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;

// ---------------------------------------------------------------- build + preview

const buildWithApi = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'futa05', VITE_DUEL_API_URL: apiBase },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

await buildWithApi();
const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const origin =
  previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
  `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? PORT}`;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${origin}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ---------------------------------------------------------------- guests + matches

const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });
const guestA = await api.createGuest();
const guestB = await api.createGuest();

/** A fresh waiting match, joined by B so it goes active with a 24h deadline. */
const makeMatch = async (): Promise<{ matchId: string; inviteCode: string }> => {
  // Guard B against the open-match cap while these scenarios run.
  const created = await api.createMatch(guestA.token);
  await api.joinMatch(guestB.token, created.match.inviteCode);
  return { matchId: created.match.matchId, inviteCode: created.match.inviteCode };
};

const identityKey = `${PREFIX}severgrow.duel.identity.v1`;
const sessionKey = `${PREFIX}severgrow.duel.session.v1`;

const newContext = async (browser: Browser, seat: 0 | 1, matchId: string, viewport = { width: 390, height: 844 }): Promise<{ context: BrowserContext; page: Page }> => {
  const touch = viewport.width < 700;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const identity = seat === 0 ? guestA : guestB;
  await context.addInitScript(
    ({ idKey, sessKey, id, session }) => {
      try {
        localStorage.clear();
        localStorage.setItem(idKey, JSON.stringify(id));
        localStorage.setItem(sessKey, JSON.stringify(session));
        localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
        localStorage.setItem(
          'futa05:severgrow.settings.v1',
          JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: false }),
        );
      } catch {
        /* ignore */
      }
    },
    {
      idKey: identityKey,
      sessKey: sessionKey,
      id: { token: identity.token, playerId: identity.player.id, displayName: identity.player.displayName, kind: 'guest' as const },
      session: { token: identity.token, matchId, seat },
    },
  );
  // Keep the browser confirm() out of the way for resign / new-game prompts.
  await context.addInitScript({ content: 'try { window.confirm = function () { return true; }; } catch (e) {}' });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  return { context, page };
};

const openDuel = async (page: Page, matchId: string): Promise<void> => {
  if (await page.locator('#menu:not([hidden])').isVisible().catch(() => false)) {
    await openMenuEntry(page, 'menu-online', { timeout: 40_000 });
  }
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
  await page.waitForTimeout(400);
};

const text = (page: Page, selector: string): Promise<string> =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : ''; })()`);

const visible = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 1 && r.height > 1; })()`,
  );

const countPolls = async (page: Page, ms: number): Promise<number> => {
  let count = 0;
  const handler = (req: Request): void => {
    if (/\/view(\?|$)/.test(req.url())) count++;
  };
  page.on('request', handler);
  await new Promise((r) => setTimeout(r, ms));
  page.off('request', handler);
  return count;
};

// The header lane collapsed to ONE word slot (`[data-duel-turn]`, class `duel-msg`): the deadline
// urgency is written there as the "danger" word, with its tone on that same element
// (`web/src/online/duel-hud.ts` fillDuelHud). The old `[data-duel-urgency]` slot now only hosts the
// live clock. Read the tone + word from the lane, and treat "urgency showing" as a lit danger tone
// (a full day left leaves the tone empty and the lane showing the ordinary turn word).
const urgency = (page: Page): Promise<{ present: boolean; visible: boolean; tone: string; label: string }> =>
  page.evaluate(`(() => {
    const el = document.querySelector('#duel-hud [data-duel-turn]');
    if (!el) return { present: false, visible: false, tone: '', label: '' };
    const r = el.getBoundingClientRect();
    const tone = el.getAttribute('data-tone') || '';
    const lit = tone === 'amber' || tone === 'red';
    return { present: true, visible: lit && !el.closest('[hidden]') && r.width > 1, tone, label: (el.textContent || '').trim() };
  })()`) as Promise<{ present: boolean; visible: boolean; tone: string; label: string }>;

const overlap = (page: Page): Promise<{ menu: number; brand: number; board: number; hudHeight: number }> =>
  page.evaluate(`(() => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const hit = (a, b) => { if (!a || !b) return 0; const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0.5 && h > 0.5 ? w * h : 0; };
    const hud = rect(document.getElementById('duel-hud'));
    const tiles = [...document.querySelectorAll('.l-tiles .tile[data-key]')].map((t) => t.getBoundingClientRect());
    const tileBox = tiles.length ? { x: Math.min(...tiles.map((t) => t.left)), y: Math.min(...tiles.map((t) => t.top)), w: Math.max(...tiles.map((t) => t.right)) - Math.min(...tiles.map((t) => t.left)), h: Math.max(...tiles.map((t) => t.bottom)) - Math.min(...tiles.map((t) => t.top)) } : null;
    return { menu: hit(hud, rect(document.getElementById('hud-menu'))), brand: hit(hud, rect(document.getElementById('hud-brand'))), board: tileBox ? hit(hud, tileBox) : 0, hudHeight: hud ? hud.h : 0 };
  })()`) as Promise<{ menu: number; brand: number; board: number; hudHeight: number }>;

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  // ---------------- match 1: the finish screen, seen by both players
  const match1 = await makeMatch();
  const a = await newContext(browser, 0, match1.matchId);
  const b = await newContext(browser, 1, match1.matchId);
  try {
    await openDuel(a.page, match1.matchId);
    await openDuel(b.page, match1.matchId);

    check('[A] the score bar reads "You"', (await text(a.page, '#score-you-label')) === 'You', await text(a.page, '#score-you-label'));
    check('[A] the other side reads "Opponent"', (await text(a.page, '#score-bot-label')) === 'Opponent', await text(a.page, '#score-bot-label'));
    check('[A] the turn pill shows no "Level N" online', !/level\s*\d/i.test(await text(a.page, '#turn')), await text(a.page, '#turn'));
    check('[B] the turn pill shows no "Level N" online', !/level\s*\d/i.test(await text(b.page, '#turn')), await text(b.page, '#turn'));

    const u0 = await urgency(a.page);
    check('[A] deadline urgency is hidden with a full day left', !u0.visible, JSON.stringify(u0));

    // A resigns (server keeps the match finished; the wire reason is `resigned`).
    await a.page.click('#hud-menu');
    await a.page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
    await a.page.evaluate(`(() => { const x = document.getElementById('gm-resign'); if (x) x.click(); })()`);
    await a.page.waitForFunction(() => { const go = document.getElementById('gameover'); return !!go && !go.hidden; }, undefined, { timeout: 30_000 });
    await b.page.waitForFunction(() => { const go = document.getElementById('gameover'); return !!go && !go.hidden; }, undefined, { timeout: 30_000 });
    await a.page.waitForTimeout(600);

    const scoresA = ((await text(a.page, '#go-score')).match(/\d+/g) ?? []).map(Number) as number[];
    const wire = { winner: 1 as const, reason: 'resigned' as const, scores: [scoresA[0] ?? 0, scoresA[1] ?? 0] as [number, number] };
    const expectedLost = resultReason(wire, 0);
    const expectedWon = resultReason(wire, 1);

    check('[A] the finish title is the offline word for a loss', (await text(a.page, '#go-title')) === resultTitle(wire, 0), await text(a.page, '#go-title'));
    check('[B] the other player sees the opposite, offline title', (await text(b.page, '#go-title')) === resultTitle(wire, 1), await text(b.page, '#go-title'));
    check('[A] the reason is the full perspective sentence offline uses', (await text(a.page, '#go-reason')) === expectedLost, `"${await text(a.page, '#go-reason')}"  !=  "${expectedLost}"`);
    check('[B] the reason is the full perspective sentence offline uses', (await text(b.page, '#go-reason')) === expectedWon, `"${await text(b.page, '#go-reason')}"  !=  "${expectedWon}"`);
    check('[A] the final score is shown', /\d/.test(await text(a.page, '#go-score')), await text(a.page, '#go-score'));
    check('[A] the tile breakdown is filled in (not empty)', /tiles?/.test(await text(a.page, '#go-break')), await text(a.page, '#go-break'));
    check('[A] the reason is not repeated in the subtitle', (await text(a.page, '#go-sub')) !== (await text(a.page, '#go-reason')), `"${await text(a.page, '#go-sub')}" vs "${await text(a.page, '#go-reason')}"`);
    const highlightsText = await text(a.page, '#go-highlights');
    const highlightsShown = await visible(a.page, '#go-highlights');
    check('[A] highlights carry content or are hidden (never blank furniture)', !highlightsShown || highlightsText.length > 0, `visible=${highlightsShown} text="${highlightsText}"`);
    // JPEG at 82, matching the folder's convention (retina PNGs are ~3x the size).
    await a.page.screenshot({ path: `${OUT}online-finish-after-390x844.jpg`, type: 'jpeg', quality: 82 }).catch(() => undefined);

    // 3a. finish "Back to menu" tears the duel down
    await a.page.evaluate(`(() => { const x = document.getElementById('go-menu'); if (x) x.click(); })()`);
    await a.page.waitForSelector('#menu:not([hidden])', { timeout: 15_000 });
    check('[A] finish Back to menu hides the duel HUD', !(await visible(a.page, '#duel-hud')));
    check('[A] finish Back to menu stops the duel polling', (await countPolls(a.page, 4_000)) === 0);
  } finally {
    await a.context.close();
    await b.context.close();
  }

  // The same finished duel at desktop size, for the before/after evidence pair.
  {
    const d = await newContext(browser, 0, match1.matchId, { width: 1280, height: 800 });
    try {
      await openMenuEntry(d.page, 'menu-online', { timeout: 40_000 });
      await d.page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
      if (await d.page.locator('#online-first-ok').isVisible().catch(() => false)) await d.page.click('#online-first-ok');
      await d.page.locator(`#online-matches li[data-match-id="${match1.matchId}"]`).click();
      await d.page.waitForSelector('#gameover:not([hidden])', { timeout: 25_000 });
      await d.page.waitForTimeout(700);
      await d.page.screenshot({ path: `${OUT}online-finish-after-1280x800.jpg`, type: 'jpeg', quality: 82 });
    } catch (error) {
      check('[A] the desktop finish screenshot was captured', false, String(error).slice(0, 140));
    } finally {
      await d.context.close();
    }
  }

  // ---------------- match 2: the exit routes + the deadline urgency
  const match2CreatedNow = now;
  const match2 = await makeMatch();
  const c = await newContext(browser, 0, match2.matchId);
  try {
    // 3b. pause "Main menu" tears the duel down, and the match stays resumable server-side
    await openDuel(c.page, match2.matchId);
    check('[A] the duel is alive before leaving', await visible(c.page, '#duel-hud'));
    await c.page.click('#hud-menu');
    await c.page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
    await c.page.evaluate(`(() => { const x = document.getElementById('gm-main'); if (x) x.click(); })()`);
    await c.page.waitForSelector('#menu:not([hidden])', { timeout: 15_000 });
    check('[A] pause Main menu hides the duel HUD', !(await visible(c.page, '#duel-hud')));
    check('[A] pause Main menu stops the duel polling', (await countPolls(c.page, 4_000)) === 0);

    await openDuel(c.page, match2.matchId);
    check('[A] the same duel reopens after leaving (server kept it)', await visible(c.page, '#duel-hud'));

    // 3c. pause "New game" tears the duel down
    await c.page.click('#hud-menu');
    await c.page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
    await c.page.evaluate(`(() => { const x = document.getElementById('gm-new'); if (x) x.click(); })()`);
    await c.page.waitForSelector('#levels:not([hidden])', { timeout: 15_000 });
    check('[A] pause New game hides the duel HUD', !(await visible(c.page, '#duel-hud')));
    check('[A] pause New game stops the duel polling', (await countPolls(c.page, 4_000)) === 0);

    // 3d. an offline game started after leaving never runs the online path
    await c.page.click('#level-grid .difficulty-tile');
    await c.page.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
    await c.page.waitForTimeout(600);
    check('[A] an offline game after leaving never shows the duel HUD', !(await visible(c.page, '#duel-hud')));

    // 4b/4c/4d. urgency thresholds + never-overlap, on the same active duel
    const deadline2 = match2CreatedNow + 24 * HOUR;
    now = deadline2 - 90 * 60_000;
    await c.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await openDuel(c.page, match2.matchId);
    const uAmber = await urgency(c.page);
    check('[A] urgency is amber under 2 hours', uAmber.visible && uAmber.tone === 'amber', JSON.stringify(uAmber));
    check('[A] the amber urgency is a word, not colour alone', uAmber.label.length > 0, uAmber.label);
    const ovAmber = await overlap(c.page);
    check('[A] the amber strip never covers the menu button', ovAmber.menu === 0, `${Math.round(ovAmber.menu)}px²`);
    check('[A] the amber strip never covers the brand/logo', ovAmber.brand === 0, `${Math.round(ovAmber.brand)}px²`);
    check('[A] the amber strip never covers the board tiles', ovAmber.board === 0, `${Math.round(ovAmber.board)}px²`);
    check('[A] the strip stays slim with urgency on', ovAmber.hudHeight > 0 && ovAmber.hudHeight <= 60, `${Math.round(ovAmber.hudHeight)}px`);

    now = deadline2 - 10 * 60_000;
    await c.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await openDuel(c.page, match2.matchId);
    const uRed = await urgency(c.page);
    check('[A] urgency is red under 15 minutes', uRed.visible && uRed.tone === 'red', JSON.stringify(uRed));
    check('[A] the red urgency is a word, not colour alone', uRed.label.length > 0, uRed.label);
    await c.page.screenshot({ path: `${OUT}online-finish-urgency-red-390x844.jpg`, type: 'jpeg', quality: 82 }).catch(() => undefined);

    now = match2CreatedNow;
    await c.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await openDuel(c.page, match2.matchId).catch(() => undefined);
    const uFull = await urgency(c.page);
    check('[A] urgency is hidden again with a full day left', !uFull.visible, JSON.stringify(uFull));
  } finally {
    await c.context.close();
  }
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} online finish-parity checks failed`);
  process.exit(1);
}
console.log('\nOnline finish-parity checks passed.');
