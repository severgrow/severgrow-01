// FUTASAKU 0.5 combined evidence: online duels + the tutorial IA + the display-glow optics measured
// together on the merged tip. Writes docs/screens/combined/ at 390x844 and 1280x800:
//   menu            — the main menu with exactly one "Tutorial" entry,
//   online-hub      — the "Play online" submenu screen,
//   invite          — the created-duel invite screen,
//   duel-chip       — the live duel board carrying the who-starts chip,
//   match-intel     — Match Intel opened on its "How to" tab,
//   cockpit-glow    — the cockpit panel showing the reflected-light optics.
//
// A local in-memory duel API is baked into a CHANNEL=futa05 build, so two contexts can stage a real
// live duel with no network and no database rows.
//
//   npx tsx web/e2e/combined-shots.ts
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

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/combined/', import.meta.url).pathname;
const VIEWPORTS = [
  { tag: '390x844', width: 390, height: 844 },
  { tag: '1280x800', width: 1280, height: 800 },
] as const;

mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---------------------------------------------------------------------------- local duel API

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;
console.log(`local duel API on ${apiBase}`);

const buildWithApi = async (base: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'futa05', VITE_FIND_OPPONENT: '1', VITE_DUEL_API_URL: base },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed (${code})`))));
  });

await buildWithApi(apiBase);

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: 4221, strictPort: true },
  logLevel: 'error',
});
const origin = `http://127.0.0.1:4221/`;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(origin);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ---------------------------------------------------------------------------- helpers

const openApp = async (
  browser: Browser,
  viewport: { width: number; height: number },
  identity?: { token: string; playerId: string; displayName: string | null },
): Promise<{ context: BrowserContext; page: Page }> => {
  const touch = viewport.width < 500;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.addInitScript((id) => {
    try {
      localStorage.clear();
      localStorage.setItem(
        'futa05:severgrow.settings.v1',
        JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: false, eyeCandy: true }),
      );
      if (id) localStorage.setItem('futa05:severgrow.duel.identity.v1', JSON.stringify({ ...id, kind: 'guest' }));
    } catch {
      /* ignore */
    }
  }, identity ?? null);
  await context.addInitScript({ content: 'try { window.confirm = function () { return true; }; } catch (e) {}' });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  await page.evaluate(() => (window as unknown as { __severgrow?: { ready?: () => boolean } }).__severgrow?.ready?.());
  return { context, page };
};

const openHub = async (page: Page): Promise<void> => {
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  const firstOk = page.locator('#online-first-ok');
  if (await firstOk.isVisible().catch(() => false)) await firstOk.click();
  await page.locator('#online-hub:not([hidden])').waitFor({ state: 'visible', timeout: 10_000 });
};

const createDuel = async (page: Page): Promise<string> => {
  await page.click('#online-create');
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  return ((await page.locator('#online-invite-code').textContent()) ?? '').trim();
};

const joinDuel = async (page: Page, invite: string): Promise<void> => {
  await page.click('#online-join-open');
  await page.waitForSelector('#online-join:not([hidden])', { timeout: 15_000 });
  await page.fill('#online-join-code', invite);
  await page.click('#online-join-submit');
};

const shoot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `${OUT}${name}.png` });
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  for (const vp of VIEWPORTS) {
    // --- creator context: menu, hub, invite ------------------------------------------------
    const a = await openApp(browser, vp);
    await a.page.waitForTimeout(400);
    check(`[${vp.tag}] menu has exactly one Tutorial entry`, (await a.page.locator('#menu-tutorial').count()) === 1);
    check(`[${vp.tag}] menu Tutorial reads "Tutorial"`, ((await a.page.locator('#menu-tutorial').textContent()) ?? '').trim() === 'Tutorial');
    await shoot(a.page, `menu-${vp.tag}`);

    await openHub(a.page);
    await a.page.waitForTimeout(400);
    await shoot(a.page, `online-hub-${vp.tag}`);

    const invite = await createDuel(a.page);
    check(`[${vp.tag}] invite screen shows a code`, new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(invite), invite);
    await a.page.waitForTimeout(400);
    await shoot(a.page, `invite-${vp.tag}`);

    // --- joiner context: live join, both land on the board with the chip -------------------
    const b = await openApp(browser, vp);
    await openHub(b.page);
    await joinDuel(b.page, invite);
    await b.page.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
    await a.page.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
    await a.page.waitForSelector('#starter-lottery[hidden]', { timeout: 15_000 }).catch(() => undefined);
    await a.page.waitForSelector('[data-duel-starter]:not([hidden])', { timeout: 20_000 });
    await a.page.waitForTimeout(600);
    const chip = await a.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-duel-starter]');
      return el ? (document.querySelector('[data-duel-starter-word]')?.textContent ?? '').trim() : null;
    });
    check(`[${vp.tag}] duel board shows the who-starts chip`, !!chip && /start/i.test(chip), chip ?? 'missing');
    await shoot(a.page, `duel-chip-${vp.tag}`);

    // --- Match Intel on the "How to" tab ---------------------------------------------------
    await a.page.click('#futa04-help-button');
    await a.page.waitForSelector('#futasaku-glass .intel-tabs', { timeout: 15_000 });
    await a.page.click('.intel-tab[data-intel-tab="howto"]');
    await a.page.waitForSelector('[data-intel-panel="howto"]', { timeout: 10_000 });
    check(`[${vp.tag}] Match Intel has a "How to" tab`, true);
    await a.page.waitForTimeout(300);
    await shoot(a.page, `match-intel-howto-${vp.tag}`);

    // --- cockpit reflected-light optics ----------------------------------------------------
    await a.page.click('#futasaku-glass .intel-close');
    await a.page.waitForSelector('#futasaku-glass', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    await a.page.waitForTimeout(400);
    const panel = await a.page.locator('#smart-panel').boundingBox();
    check(`[${vp.tag}] cockpit panel is present`, !!panel);
    if (panel) {
      await a.page.locator('#smart-panel').screenshot({ path: `${OUT}cockpit-glow-${vp.tag}.png` });
    }

    await a.context.close();
    await b.context.close();
  }
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} combined-shot checks failed`);
  process.exit(1);
}
console.log(`\nCombined screenshots written to ${OUT}`);
