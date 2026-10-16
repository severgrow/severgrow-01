// Beta feedback in a real browser, against a local API (never the real Supabase project):
// Report a problem from the pause menu, a silent crash report, the #beta tester guide, and a report
// written offline that goes out when the connection returns. Waits on state, never fixed sleeps.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/beta-feedback.ts
//   SHOTS=1 ... also writes docs/screens/beta/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { MemoryFeedbackStore, createFeedbackRouter } from '../../server/src/feedback/feedback.js';
import { CHROME } from './helpers/local-duel.js';
import { FEEDBACK } from '../../src/strings.js';

const PORT = 4241;
const SHOTS = process.env.SHOTS === '1';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return true;
    } catch {
      /* navigating */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
const service = new MatchService({ storage, config });
const store = new MemoryFeedbackStore();
const feedback = createFeedbackRouter({ store, storage, authenticate: (t) => service.authenticate(t), now: () => Date.now() });
const apiServer = createHttpServer({ service, config, live: feedback });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const previewServer = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync('docs/screens/beta', { recursive: true });
  await page.screenshot({ path: `docs/screens/beta/${name}.png` });
};
const rows = () => store.rows;

try {
  for (const [w, h] of [[390, 844], [360, 640]] as const) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const label = `${w}x${h}`;
    // 0. The beta line on the main menu: between the wordmark and the buttons; its link opens the form.
    await page.goto(`${origin}/`);
    check(`${label}: the main menu shows the beta line`, await waitFor(() => page.locator('#menu-beta').isVisible(), 20_000));
    const order = (await page.evaluate(`(() => { const t = document.querySelector('#menu .title').getBoundingClientRect(); const n = document.getElementById('menu-beta').getBoundingClientRect(); const b = document.querySelector('#menu .menu-buttons').getBoundingClientRect(); return t.bottom <= n.top && n.bottom <= b.top && n.left >= 0 && n.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()`)) as boolean;
    check(`${label}: it sits between the title and the buttons, inside the screen`, order);
    check(`${label}: every menu button stays on screen`, (await page.evaluate(`[...document.querySelectorAll('#menu .menu-buttons .btn')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().bottom <= innerHeight)`)) as boolean);
    check(`${label}: it says the current version (${FEEDBACK.betaVersion})`, (await page.locator('#menu-beta').innerText()).includes(FEEDBACK.betaVersion));
    await shot(page, `menu-${label}`);
    await page.locator('#menu-beta button').click();
    check(`${label}: "let us know here" opens Report a problem`, await waitFor(() => page.locator('#fb-report').isVisible()));
    await page.locator('#fb-report button', { hasText: 'Cancel' }).click();
    await page.goto(`${origin}/?seed=4242`);
    await page.waitForSelector('#game:not([hidden])');
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 }).catch(() => undefined);
    await waitFor(() => page.evaluate('!window.__severgrow.busy()') as Promise<boolean>);

    // 1. Report a problem from the pause menu.
    await page.evaluate(() => document.getElementById('hud-menu')?.click());
    check(`${label}: the pause menu offers Report a problem`, await waitFor(() => page.locator('#gm-report').isVisible()));
    await page.locator('#gm-report').click();
    check(`${label}: the report dialog opens over the game`, await waitFor(() => page.locator('#fb-report').isVisible()));
    const before = rows().length;
    await page.locator('#fb-report [data-fb="send"]').click();
    check(`${label}: an empty report is not sent`, (await page.locator('#fb-report .fb-status').innerText()).length > 0 && rows().length === before);
    await page.locator('#fb-report textarea').fill(`After my Bloom the board froze (${label}).`);
    await shot(page, `report-${label}`);
    await page.locator('#fb-report [data-fb="send"]').click();
    check(`${label}: the report reaches the server`, await waitFor(() => rows().some((r) => r.kind === 'report' && r.message === `After my Bloom the board froze (${label}).`)));
    const r = rows().find((x) => x.message === `After my Bloom the board froze (${label}).`)!;
    check(`${label}: it carries build, screen and game position`, !!r.build && (r.context.viewport as { w: number }).w === w && (r.context.game as { phase?: string } | null)?.phase !== undefined, JSON.stringify({ build: r.build, viewport: r.context.viewport, game: r.context.game }));
    const text = JSON.stringify(r);
    check(`${label}: it carries no cards, deck, seed or token`, !/"hand"|"deck"|"seed"|"token"/.test(text));
    check(`${label}: the dialog says thanks and closes`, await waitFor(async () => !(await page.locator('#fb-report').isVisible())));

    // 2. A crash is reported silently, once.
    const crashes = rows().filter((x) => x.kind === 'crash').length;
    await page.evaluate("setTimeout(() => { throw new Error('beta-e2e boom') }, 0); setTimeout(() => { throw new Error('beta-e2e boom') }, 0);");
    await waitFor(() => rows().filter((x) => x.kind === 'crash').length > crashes, 5_000);
    check(`${label}: a crash is reported once (deduplicated)`, await waitFor(() => rows().filter((x) => x.kind === 'crash').length === crashes + 1) && (await new Promise((res) => setTimeout(() => res(rows().filter((x) => x.kind === 'crash').length === crashes + 1), 800))) as boolean);
    check(`${label}: the game keeps running after a crash report`, (await page.evaluate("window.__severgrow.state() !== null")) as boolean);

    // 3. Offline: the report is saved and goes out when the connection returns.
    await page.evaluate(() => document.getElementById('hud-menu')?.click());
    await page.locator('#gm-report').click();
    await context.setOffline(true);
    await page.locator('#fb-report textarea').fill('Written on the train.');
    await page.locator('#fb-report [data-fb="send"]').click();
    check(`${label}: offline, the report is saved for later`, await waitFor(async () => (await page.locator('#fb-report .fb-status').innerText()).includes('Saved')));
    await context.setOffline(false);
    await page.evaluate("window.dispatchEvent(new Event('online'))");
    check(`${label}: back online, the saved report is sent`, await waitFor(() => rows().some((x) => x.message === 'Written on the train.')));

    // 4. The tester guide at #beta.
    await page.goto(`${origin}/#beta`);
    check(`${label}: futasaku.com/#beta opens the tester guide`, await waitFor(() => page.locator('#fb-guide').isVisible(), 20_000));
    await shot(page, `guide-${label}`);
    const fits = (await page.evaluate(`(() => { const r = document.getElementById('fb-guide').getBoundingClientRect(); const b = [...document.querySelectorAll('#fb-guide button')].every(x => x.getBoundingClientRect().height >= 44); return r.left >= 0 && r.right <= innerWidth && b && document.documentElement.scrollWidth <= innerWidth; })()`)) as boolean;
    check(`${label}: the guide fits the screen with 44px buttons`, fits);
    await page.locator('#fb-guide button').last().click();
    check(`${label}: closing the guide clears the #beta link`, await waitFor(async () => !(await page.locator('#fb-guide').isVisible()) && !(await page.evaluate('location.hash'))));
    await context.close();
  }
} finally {
  await browser.close().catch(() => undefined);
  await previewServer.close().catch(() => undefined);
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
