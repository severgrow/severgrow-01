// FUTASAKU 0.5 online duel HUD — the top status row must never cover the menu button, the
// brand/logo or the board, at any phone/desktop size or in landscape.
//
//   PHASE=before npx tsx web/e2e/online-hud-overlap.ts
//   PHASE=after  npx tsx web/e2e/online-hud-overlap.ts
//
// Builds CHANNEL=futa05 against a local duel API, opens the duel board, and asserts bounding-box
// non-overlap plus that the strip is slim and its controls keep their tap targets.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike } from '../../server/src/client.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PHASE = process.env.PHASE === 'before' ? 'before' : 'after';
const PORT = Number(process.env.PREVIEW_PORT ?? 4213);
const PREFIX = 'futa05:';

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type Box = { x: number; y: number; width: number; height: number };

type Measure = {
  menu: Box | null;
  brand: Box | null;
  hud: Box | null;
  tilesTop: number | null;
  boardTop: number | null;
  viewport: { w: number; h: number };
  hudHeight: number;
  hudOverflowsX: boolean;
  childOverflow: string[];
  children: { cls: string; w: number; x: number }[];
  menuLogoGap: number | null;
  hudMenuOverlap: number;
  hudBrandOverlap: number;
  hudBoardOverlap: number;
  turnText: string;
  presenceText: string;
  /** True if the strip still carries the removed Resign / who-starts / deadline chips. */
  removedChips: boolean;
};

const MEASURE_SRC = `(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0.5 && h > 0.5 ? w * h : 0;
  };
  const menu = rect(document.getElementById('hud-menu'));
  const brand = rect(document.getElementById('hud-brand'));
  const hudEl = document.getElementById('duel-hud');
  const hud = rect(hudEl);
  const tiles = [...document.querySelectorAll('.l-tiles .tile[data-key]')].map((t) => t.getBoundingClientRect());
  const tilesTop = tiles.length ? Math.min(...tiles.map((t) => t.top)) : null;
  const boardTop = rect(document.getElementById('board-wrap'))?.y ?? null;
  const childOverflow = [];
  const children = [];
  let hudOverflowsX = false;
  if (hudEl && hud) {
    for (const child of hudEl.children) {
      const c = child.getBoundingClientRect();
      if (c.width === 0) continue;
      children.push({ cls: String(child.className || child.tagName), w: Math.round(c.width), x: Math.round(c.left) });
      if (c.right > hud.x + hud.width + 0.5 || c.left < hud.x - 0.5) childOverflow.push(child.className || child.tagName);
    }
    hudOverflowsX = hud.x < 0 || hud.x + hud.width > window.innerWidth + 0.5;
  }
  const tileBox = tiles.length
    ? {
        x: Math.min(...tiles.map((t) => t.left)),
        y: Math.min(...tiles.map((t) => t.top)),
        width: Math.max(...tiles.map((t) => t.right)) - Math.min(...tiles.map((t) => t.left)),
        height: Math.max(...tiles.map((t) => t.bottom)) - Math.min(...tiles.map((t) => t.top)),
      }
    : null;
  return {
    menu,
    brand,
    hud,
    tilesTop,
    boardTop,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    hudHeight: hud ? hud.height : 0,
    hudOverflowsX,
    childOverflow,
    children,
    menuLogoGap: menu && brand ? Math.round(brand.x - (menu.x + menu.width)) : null,
    hudMenuOverlap: overlap(hud, menu),
    hudBrandOverlap: overlap(hud, brand),
    hudBoardOverlap: tileBox ? overlap(hud, tileBox) : 0,
    turnText: (document.querySelector('[data-duel-turn]')?.textContent || '').trim(),
    presenceText: (document.querySelector('[data-duel-presence]')?.textContent || '').trim(),
    removedChips: !!document.querySelector('#duel-hud [data-duel-deadline], #duel-hud [data-duel-starter], #duel-hud #duel-resign'),
  };
})()`;

const measure = async (page: Page): Promise<Measure> => (await page.evaluate(MEASURE_SRC)) as Measure;

const buildWithApi = async (apiBase: string): Promise<void> =>
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

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 24 * 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = (apiServer.address() as AddressInfo).port;
const apiBase = `http://127.0.0.1:${apiPort}`;

await buildWithApi(apiBase);
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

const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });
const guestA = await api.createGuest();
const guestB = await api.createGuest();
const created = await api.createMatch(guestA.token);
await api.joinMatch(guestB.token, created.match.inviteCode);
const identityKey = `${PREFIX}severgrow.duel.identity.v1`;
const sessionKey = `${PREFIX}severgrow.duel.session.v1`;

const newContext = async (
  browser: Browser,
  viewport: { width: number; height: number },
  seat: 0 | 1,
): Promise<{ context: BrowserContext; page: Page }> => {
  const touch = viewport.width < 700;
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  const identity = seat === 0 ? guestA : guestB;
  const identityRecord = {
    token: identity.token,
    playerId: identity.player.id,
    displayName: identity.player.displayName,
    kind: 'guest' as const,
  };
  await context.addInitScript(
    ({ idKey, sessKey, identity, session }) => {
      localStorage.clear();
      localStorage.setItem(idKey, JSON.stringify(identity));
      localStorage.setItem(sessKey, JSON.stringify(session));
      localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
      localStorage.setItem(
        'futa05:severgrow.settings.v1',
        JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: false }),
      );
    },
    {
      idKey: identityKey,
      sessKey: sessionKey,
      identity: identityRecord,
      session: { token: identity.token, matchId: created.match.matchId, seat },
    },
  );
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  return { context, page };
};

const openDuelFromList = async (page: Page, matchId: string): Promise<void> => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
  await page.waitForTimeout(500); // let the board paint its tiles
};

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 844, height: 390 }, // landscape phone
] as const;

const browser = await chromium.launch({ executablePath: CHROME });
try {
  for (const seat of [0, 1] as const) {
    for (const vp of VIEWPORTS) {
      const { context, page } = await newContext(browser, vp, seat);
      try {
        await openDuelFromList(page, created.match.matchId);
        const m = await measure(page);
        const vpName = `${vp.width}x${vp.height}`;
        const tag = `seat${seat} ${vpName}`;
        check(`[${tag}] the duel status row is visible`, !!m.hud, m.hud ? '' : 'missing');
        check(`[${tag}] status row never covers the menu button`, m.hudMenuOverlap === 0, `${Math.round(m.hudMenuOverlap)}px²`);
        check(`[${tag}] status row never covers the brand/logo`, m.hudBrandOverlap === 0, `${Math.round(m.hudBrandOverlap)}px²`);
        check(`[${tag}] status row never covers the board's tiles`, m.hudBoardOverlap === 0, `${Math.round(m.hudBoardOverlap)}px²`);
        check(`[${tag}] status row stays on screen`, !m.hudOverflowsX, JSON.stringify(m.hud));
        check(`[${tag}] status row stays slim (one row on wide, two tidy rows on phones)`, m.hudHeight > 0 && m.hudHeight <= 60, `${Math.round(m.hudHeight)}px`);
        check(`[${tag}] no control spills out of the row`, m.childOverflow.length === 0, m.childOverflow.join(','));
        check(`[${tag}] the trimmed strip carries no removed chips`, !m.removedChips);
        check(`[${tag}] status is not colour-only (turn word + presence word)`, m.turnText.length > 0 && m.presenceText.length > 0, `${m.turnText} / ${m.presenceText}`);
        // Resign now lives in the pause menu: open it and measure the real tap target there.
        await page.click('#hud-menu');
        await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
        const resign = (await page.evaluate(`(() => {
          const b = document.getElementById('gm-resign');
          if (!b || b.hidden) return null;
          const r = b.getBoundingClientRect();
          return { width: Math.round(r.width), height: Math.round(r.height) };
        })()`)) as { width: number; height: number } | null;
        check(`[${tag}] pause-menu Resign keeps a >=44 tap target`, !!resign && resign.height >= 44 && resign.width >= 44, resign ? `${resign.width}x${resign.height}` : 'missing');
        await page.click('#sheet-menu [data-close]').catch(() => undefined);
        if (vp.width === 390 || vp.width === 1280) {
          await page.screenshot({ path: `${OUT}hud-overlap-${PHASE}-${vpName}.png` });
        }
        if (vp.width === 390 || vp.width === 360) console.log(`    ${tag}: hud=${JSON.stringify(m.hud)} tilesTop=${m.tilesTop} boardTop=${m.boardTop} menuLogoGap=${m.menuLogoGap} children=${JSON.stringify(m.children)}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} duel HUD overlap checks failed (phase ${PHASE})`);
  process.exit(1);
}
console.log(`\nDuel HUD overlap checks passed (phase ${PHASE}).`);
