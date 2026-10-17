// The campaign's first ten levels are the game's tutorial: the tutorial's own top window says the
// one next thing, the board lights the places you may grow, and nothing extra opens on the way in.
//
// This suite drives that from a real browser at phone size, because the whole point is what a
// beginner sees, not what the functions return (web/tests/onboarding.test.ts covers the logic).
//
//   npx tsx web/e2e/onboarding.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const served = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));

const check = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  console.log(`  ok  ${what}`);
};

/** A helper, not a bare deepEqual: comparing `errors` directly narrows it to never[] in TS. */
const checkNoErrors = (list: readonly string[]) =>
  assert.deepEqual([...list], [], `no page errors: ${list.join(' | ')}`);

const title = () => page.evaluate(() => document.querySelector('#futasaku-glass .glass-led-sr')?.textContent?.trim() ?? '');
const line = () => page.evaluate(() => document.querySelector('#futasaku-glass .glass-why')?.textContent?.trim() ?? '');
const count = (selector: string) => page.evaluate((s) => document.querySelectorAll(s).length, selector);
const state = () => page.evaluate(() => (window as any).__severgrow?.state?.() ?? null);

/** Tap a card in the hand by its spoken name (Moss 6, Ash 3, …). */
const tapCard = async (name: string) => {
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll<HTMLElement>('.hand .card')]
      .find((c) => (c.getAttribute('aria-label') ?? c.textContent ?? '').includes(n));
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, name);
  await page.waitForTimeout(450);
};

try {
  await page.goto(`${served.url}?onboarding=1`, { waitUntil: 'networkidle' });
  // A fresh browser has no progress: LEVEL 1 is the entry, behind PLAY.
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 15000 });
  await page.click('#menu-play');
  await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
  const entry = await page.textContent('#menu-campaign');
  check(/LEVEL\s*1/i.test(entry ?? ''), `the menu entry says LEVEL 1 (${entry?.trim()})`);

  await page.click('#menu-campaign');
  await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
  await page.waitForTimeout(600);

  // 1. No lottery: a campaign opening is fixed by its seed, so there is nothing to draw for.
  const lottery = await page.evaluate(() => {
    const el = document.getElementById('starter-lottery');
    return el ? !el.hidden : false;
  });
  check(!lottery, 'no "drawing lots" window on a campaign level');

  // 2. The tutorial's own top window is up, and it names the very next touch.
  await page.waitForSelector('#futasaku-glass:not([hidden])', { timeout: 10000 });
  const mode = await page.evaluate(() => document.getElementById('futasaku-glass')?.dataset.mode);
  check(mode === 'tutorial', `the guidance uses the tutorial window (${mode})`);
  check((await title()) === 'THE GOAL', `step 1 states the objective (${await title()})`);
  check(/surround/i.test(await line()), `the objective names how to win (${await line()})`);
  check((await line()).length > 0, `step 1 has one line under it (${await line()})`);

  // 3. The window reserves the top of the map, so it never sits on the board.
  const pad = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tutorial-pad-top')) || 0);
  check(pad > 20, `the map is padded under the window (${Math.round(pad)}px)`);

  // 4. The cockpit is simplified, not stripped: shortcuts recede, nothing legal disappears.
  const replay = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.getElementById('tool-replay')!).opacity));
  check(replay < 0.5, `replay recedes on level 1 (opacity ${replay})`);
  const deck = await page.isVisible('#deck');
  check(deck, 'the Draw pile is still there and tappable');

  // 5. Drawing moves the words on, and the board shows every place a card could go.
  // The pile breathes while it is the hero, so a DOM click is used: the point is the tap, not
  // whether the animation has finished moving.
  await page.evaluate(() => document.getElementById('deck')?.click());
  await page.waitForTimeout(1200);
  check((await state())?.phase === 'ACT', 'drawing reaches the play phase');
  check((await title()) === 'PICK A CARD', `step 2 says PICK A CARD (${await title()})`);
  const available = await count('.available');
  check(available > 0, `the board lights the places to grow (${available} hexes)`);

  // 6. Picking a card turns those quiet rings into the card's real targets.
  await tapCard('Ash 3');
  await page.waitForTimeout(500);
  check((await title()) === 'GROW', `step 3 says GROW (${await title()})`);
  check((await count('.available')) === 0, 'the quiet rings give way once a card is picked');
  check((await count('.target')) > 0, 'the picked card’s legal tiles are lit');

  checkNoErrors(errors);
  console.log('\nOnboarding: the top window, the lit board and the quiet cockpit all work on a phone.');

  // Desktop keeps the same window, docked in the cockpit's column, never over the map.
  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desk.on('pageerror', (error) => errors.push(error.message));
  await desk.goto(`${served.url}?onboarding=desk`, { waitUntil: 'networkidle' });
  await desk.waitForSelector('#menu-play:not([hidden])', { timeout: 15000 });
  await desk.evaluate(() => document.getElementById('menu-play')?.click());
  await desk.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
  await desk.evaluate(() => document.getElementById('menu-campaign')?.click());
  await desk.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
  await desk.waitForTimeout(900);
  const desktop = await desk.evaluate(() => {
    const panel = document.getElementById('futasaku-glass')!.getBoundingClientRect();
    const hits = [...document.querySelectorAll('.hex-cell')].some((cell) => {
      const r = cell.getBoundingClientRect();
      return panel.left < r.right && r.left < panel.right && panel.top < r.bottom && r.top < panel.bottom;
    });
    return {
      mode: document.getElementById('futasaku-glass')?.dataset.mode,
      title: document.querySelector('#futasaku-glass .glass-led-sr')?.textContent?.trim(),
      hits,
      placedUnderChrome: panel.top > 0,
    };
  });
  check(desktop.mode === 'tutorial', 'desktop uses the same window');
  check(desktop.title === 'THE GOAL', `desktop states the objective (${desktop.title})`);
  check(desktop.placedUnderChrome, 'desktop window is placed below the chrome, not at the very top');
  check(!desktop.hits, 'desktop window never covers a playable hex');
  checkNoErrors(errors);
  console.log('Onboarding: desktop docks the same window beside the board, clear of it.');
} finally {
  await browser.close();
  await served.server.close();
}
