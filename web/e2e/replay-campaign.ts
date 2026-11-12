// THE CAMPAIGN REPLAY (owner brief, 2026-10-25): "if its easy to do, allow it also in campaign and
// practice matches − so every match you finish you can rewatch".
//
// The practice path is `replay-offline.ts`; this plays a REAL campaign level through the real menu
// and asserts the same entry point on ITS finish card, from the level's own authored opening (not
// the seed's deal). One whole level, no simulation shortcuts.
//
// Screenshots go to docs/screens/replay/ (or $SHOTS).
//   CHANNEL=futa04 vite build --config web/vite.config.ts
//   CHANNEL=futa04 npx tsx web/e2e/replay-campaign.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = process.env.SHOTS?.trim() || new URL('../../docs/screens/replay/', import.meta.url).pathname;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitVisible = async (page: Page, sel: string, ms = 25_000) => {
  await page.waitForSelector(`${sel}:not([hidden])`, { timeout: ms });
};
const state = (page: Page) => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
const idle = (page: Page) =>
  page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 30_000 });

const dismissInstall = async (page: Page) => {
  await page.evaluate(() => {
    for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
    const prompt = document.getElementById('install-prompt');
    if (prompt && !prompt.hidden) prompt.hidden = true;
  });
};

/**
 * Play this level out with the engine's own strongest chooser; the bot answers itself. A surface
 * still handing over can refuse a legal move for a few frames (the same rule the practice suite
 * uses), so a refusal is retried before another legal move is tried, and only a persistent refusal
 * of every legal action is a failure.
 */
const playToEnd = async (page: Page, level: number, maxSteps = 400): Promise<string> => {
  let refused = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await state(page);
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    if (s.actor !== 0) {
      await idle(page);
      await page.waitForTimeout(60);
      continue;
    }
    const view = viewFor(s, 0);
    const legal = legalActions(view);
    if (!legal.length) return `no legal move (${s.phase})`;
    const pick = Math.min(9, 4 + level) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    const best = chooseLevelAction(view, 9, botSeed(s.seed, pick, s.turnNumber, s.history?.length ?? 0));
    const candidates: Action[] = [best, ...legal.filter((a) => JSON.stringify(a) !== JSON.stringify(best))];
    let applied = false;
    for (const action of candidates) {
      applied = await page.evaluate(
        ([a]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, 0)),
        [action] as const,
      );
      if (applied) break;
    }
    if (!applied) {
      if (++refused > 10) return `the page refused every legal action (${s.phase})`;
      await page.waitForTimeout(200);
      continue;
    }
    refused = 0;
    await idle(page);
  }
  return `still playing after ${maxSteps} steps`;
};

type ReplayNow = { index: number; playing: boolean; elapsed: number; total: number; ended: boolean; board: string; turn: number | null };
const replayNow = async (page: Page): Promise<ReplayNow | null> =>
  (await page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { replay?: () => unknown } }).__severgrow;
    return hook?.replay?.() ?? null;
  })) as ReplayNow | null;

const { server, origin } = await servePreview(4333, { logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
mkdirSync(SHOTS, { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // A tester's device: level 1 is the only one open.
  await page.goto(`${origin}/?levels=1`);
  await waitVisible(page, '#menu', 30_000);
  await page.click('#menu-play');
  await waitVisible(page, '#menu-campaign', 15_000);
  await dismissInstall(page);
  await page.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement).click());
  await page.waitForFunction(
    () => !!(window as unknown as { __severgrow?: { state?: () => unknown } }).__severgrow?.state?.(),
    undefined,
    { timeout: 20_000 },
  );
  await waitVisible(page, '#game', 20_000);
  await page.waitForFunction(
    '(() => { const l = window.__severgrow.lesson?.(); return !!l && !l.stage && l.handSettled; })()',
    undefined,
    { timeout: 20_000 },
  );

  const ended = await playToEnd(page, 1);
  check('a real campaign level reaches its finish card', ended === 'ended', ended);
  await waitVisible(page, '#gameover', 30_000);
  await page.waitForFunction('(() => !window.__severgrow.busy())()', undefined, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await dismissInstall(page);

  const titleBefore = ((await page.locator('#go-title').textContent()) ?? '').trim();
  check('the campaign finish card offers "Watch replay"', await page.locator('#go-replay').isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/finish-campaign-390x844.png` });

  await page.locator('#go-replay').click();
  await waitVisible(page, '#replay', 20_000);
  const first = await replayNow(page);
  check('the campaign replay mounts with a real clock', !!first && first.total > 0, `${((first?.total ?? 0) / 1000).toFixed(1)}s`);
  const names = (await page.evaluate(() =>
    [...document.querySelectorAll('#replay .rp-name')].map((n) => (n.textContent ?? '').trim()),
  )) as string[];
  check('the campaign replay names the player "You"', names[0] === 'You' && (names[1]?.length ?? 0) > 0, names.join(' / '));
  check(
    'the campaign replay is board-only',
    (await page.evaluate(() => {
      const root = document.getElementById('replay');
      return !root?.querySelector('#hand, #dock, #hud, .cockpit, .card, #deck, #discard, #lesson-plate');
    })) === true,
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/replay-campaign-mid-390x844.png` });

  // A seek out of the level's authored opening paints a later, different position.
  const box = await page.locator('#replay .rp-scrub').boundingBox();
  if (!box) throw new Error('no scrub bar');
  const seek = async (fraction: number) => {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(90);
    return replayNow(page);
  };
  const early = await seek(0.1);
  const late = await seek(0.75);
  check(
    'the campaign replay seeks (frame and board move)',
    !!early && !!late && late.index > early.index && late.board !== early.board,
    `${early?.index} → ${late?.index}`,
  );

  await page.locator('#replay [data-rp="close"]').click();
  await page.locator('#replay').waitFor({ state: 'hidden', timeout: 5_000 });
  check('leaving the campaign replay returns to the result card', await page.locator('#gameover').isVisible());
  const titleAfter = ((await page.locator('#go-title').textContent()) ?? '').trim();
  check('the campaign result card is untouched', titleAfter === titleBefore, `${titleBefore} → ${titleAfter}`);
  check('no page errors during the campaign replay', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`${failed} campaign replay checks failed`);
  process.exit(1);
}
console.log('replay-campaign checks passed');
