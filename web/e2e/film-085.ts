// MEASURING TOOL (not a CI gate): real-speed videos of the 0.85 moments (the ritual's kanji, the throw's
// boomerang) in a futa05 build, recorded by the browser. Writes FILM_DIR/ritual.webm, throw.webm and
// FILM_DIR/marks.json (when each moment starts, in seconds from the start of its video).
import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';

const OUT = process.env.FILM_DIR ?? '/tmp/film-085';
const PORT = 4261;
mkdirSync(OUT, { recursive: true });

const build = (): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:65534', VITE_SUPABASE_URL: 'http://127.0.0.1:65534', VITE_SUPABASE_ANON_KEY: 'k' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('build failed'))));
});

const settings = JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, vibration: false, autoSkip: false, bloomHints: false });

const recorder = async (browser: Browser): Promise<{ context: BrowserContext; page: Page; t0: number }> => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
  });
  await context.addInitScript((s) => {
    localStorage.setItem('futa05:severgrow.settings.v1', s);
    localStorage.setItem('futa05:severgrow.seen', '1');
    (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
  }, settings);
  const page = await context.newPage();
  return { context, page, t0: Date.now() };
};

const hook = (page: Page) => page.evaluate(() => {
  const h = (window as any).__severgrow;
  const s = h.state();
  return { phase: s.phase as string, turn: s.turnPlayer as number, busy: !!h.busy() };
});

const finish = async (context: BrowserContext, page: Page, name: string): Promise<void> => {
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), `${OUT}/${name}.webm`);
};

await build();
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const marks: Record<string, number> = {};
try {
  // 1. the ritual (and its kanji)
  if (!process.env.ONLY_THROW) {
    const { context, page, t0 } = await recorder(browser);
    await page.goto(`http://127.0.0.1:${PORT}/?seed=4242`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
    marks.ritualStart = (Date.now() - t0) / 1000;
    await page.waitForSelector('.ritual-kanji', { state: 'attached', timeout: 20_000 });
    marks.kanji = (Date.now() - t0) / 1000;
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 });
    marks.ritualEnd = (Date.now() - t0) / 1000;
    await page.waitForTimeout(1200);
    await finish(context, page, 'ritual');
  }
  // 2. the throw (my turn: draw, stop growing, throw)
  {
    const { context, page, t0 } = await recorder(browser);
    await page.goto(`http://127.0.0.1:${PORT}/?seed=2`, { waitUntil: 'domcontentloaded' });
    // the match opens with the ritual: let it come and go before the turn is played
    await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await page.waitForFunction(() => { const h = (window as any).__severgrow; const s = h?.state(); return s && s.turnPlayer === 0 && s.phase === 'DRAW' && !h.busy(); }, undefined, { timeout: 60_000 });
    await page.waitForTimeout(500);
    const play = async (pick: (a: any) => boolean): Promise<void> => {
      const st0 = await page.evaluate(() => (window as any).__severgrow.state());
      const act = legalActions(viewFor(st0, 0)).find(pick)!;
      await page.evaluate((x) => (window as any).__severgrow.playFor(x, 0), act);
      await page.waitForFunction(() => !(window as any).__severgrow.busy());
    };
    await play((x) => x.t === 'Draw' && x.from !== 'discard');
    await page.waitForTimeout(600);
    await play((x) => x.t === 'EndAct');
    await page.waitForFunction(() => { const h = (window as any).__severgrow; return h.state().phase === 'DISCARD' && !h.busy(); });
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => (window as any).__severgrow.state());
    const action = legalActions(viewFor(st, 0)).find((a) => a.t === 'Discard')! as { card: number };
    // a real throw: select the card, then tap the Throw pile (the hook's playFor skips the hand box)
    await page.locator(`#hand [data-card="${action.card}"]`).click({ force: true });
    await page.waitForTimeout(500);
    marks.throw = (Date.now() - t0) / 1000;
    await page.locator('#discard').click({ force: true });
    await page.waitForTimeout(1600);
    void hook;
    await finish(context, page, 'throw');
  }
  writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2));
  console.log('film-085:', JSON.stringify(marks));
} finally {
  await browser.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
