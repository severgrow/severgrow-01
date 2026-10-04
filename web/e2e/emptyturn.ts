// Step 2 (Fruit cards task): an empty turn in the browser. Counts my taps for a turn with nothing
// to play (auto-skip on: draw, throw = 2 taps; off: draw, Continue, throw = 3), checks the plain
// throw asks nothing, Undo stays until the throw, and times the opponent's empty turn at Normal
// speed (target about 400ms). Needs a built page (npm run web:build).
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { stuckBoard } from './empty-positions.js';

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
// DIST=/other/dir serves another build (so a long test on web/dist can keep running)
const server = await preview({ configFile: 'web/vite.config.ts', ...(process.env.DIST ? { build: { outDir: process.env.DIST } } : {}), preview: { port: 4193, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4193/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const until = (page: Page, fn: string, ms = 8000) => page.waitForFunction(fn, undefined, { timeout: ms });
const HOOK = '(window.__severgrow)';

const open = async (autoSkip: boolean) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([st, auto]) => {
    if (sessionStorage.getItem('ready')) return;
    sessionStorage.setItem('ready', '1');
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'normal', autoSkip: auto, eyeCandy: false }));
    localStorage.setItem('severgrow.save.v6', st as string);
    localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
  }, [JSON.stringify({ state: stuckBoard(), coach: { step: 99, taught: [], known: [], choice: 0, summaryDone: true }, level: 7 }), autoSkip] as const);
  await page.goto(BASE);
  await page.click('#menu-continue');
  await until(page, `${HOOK}.state()?.phase === 'DRAW' && !${HOOK}.busy()`);
  return { page, errors };
};

/** Times the opponent's turn: from the moment it starts showing (the turn pill) to my next Draw step, ready to tap. */
// (a plain string: tsx would wrap a named function in a helper the page does not have)
const timeOpponent = (page: Page): Promise<number> =>
  page.evaluate(`new Promise((resolve) => {
    const h = window.__severgrow;
    let t0 = -1;
    const tick = () => {
      const s = h.state();
      if (t0 < 0 && document.body.dataset.turn === 'opponent') t0 = performance.now();
      if (t0 >= 0 && s.actor === 0 && s.phase === 'DRAW' && !h.busy()) return resolve(performance.now() - t0);
      requestAnimationFrame(tick);
    };
    tick();
  })`);

// --- auto-skip on (the default) ---
{
  const { page, errors } = await open(true);
  let taps = 0;
  await page.click('#deck');
  taps++;
  await until(page, `${HOOK}.state()?.phase === 'DISCARD' && !${HOOK}.busy()`);
  const caption = await page.locator('body').innerText();
  check('auto-skip on: the Grow step skips itself and says "Nothing to play this turn"', caption.includes('Nothing to play this turn'));
  const undoOn = await page.locator('#tool-undo').isEnabled();
  check('Undo is still there in the Throw step (until the throw)', undoOn);
  const timer = timeOpponent(page);
  await page.locator('#hand .card').first().click();
  taps++;
  const confirm = await page.locator('#confirm-play:visible').count();
  check('a plain throw never asks for a second confirmation', confirm === 0);
  const opp = await timer;
  check('an empty turn takes two taps (draw, throw)', taps === 2, `${taps} taps`);
  // a second round, for a steadier number
  await page.click('#deck');
  await until(page, `${HOOK}.state()?.phase === 'DISCARD' && !${HOOK}.busy()`);
  const timer2 = timeOpponent(page);
  await page.locator('#hand .card').first().click();
  const opp2 = await timer2;
  const mean = (opp + opp2) / 2;
  check("the opponent's empty turn takes about 400ms at Normal speed (300-500ms, mean of two)", mean >= 300 && mean <= 500, `${Math.round(opp)}ms, ${Math.round(opp2)}ms`);
  check('no page errors (auto-skip on)', errors.length === 0, errors[0]);
  await page.close();
}

// --- auto-skip off ---
{
  const { page, errors } = await open(false);
  let taps = 0;
  await page.click('#deck');
  taps++;
  await until(page, `${HOOK}.state()?.phase === 'ACT' && !${HOOK}.busy()`);
  const reason = await page.locator('#moves .empty-reason').innerText().catch(() => '');
  check('auto-skip off: the reason shows, with a Continue button', reason.startsWith('Nothing to play this turn') && (await page.locator('#moves .empty-continue').isVisible()), reason);
  await page.click('#moves .empty-continue');
  taps++;
  await until(page, `${HOOK}.state()?.phase === 'DISCARD' && !${HOOK}.busy()`);
  await page.locator('#hand .card').first().click();
  taps++;
  await until(page, `${HOOK}.state()?.actor === 1 || ${HOOK}.state()?.turnNumber > 5`);
  check('with auto-skip off an empty turn takes three taps (draw, Continue, throw)', taps === 3, `${taps} taps`);
  check('no page errors (auto-skip off)', errors.length === 0, errors[0]);
  await page.close();
}

await browser.close();
server.httpServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
