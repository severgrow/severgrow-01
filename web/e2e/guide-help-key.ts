// THE QUIET HELP KEY (owner + agreed design, 2026-11-10). A brand-new player in a practice game:
//   - the Match Intel key shows "?" ("How to play"), a touch brighter; no label, no window, no pulse;
//   - the first time Grow is possible, ONE soft edge light on the key, gone by itself after ~1.5 s;
//   - a tap opens the Grow lesson lit on the real board; a tap elsewhere closes it;
//   - once the player is no longer new, the key is the bulb again and opens Match Intel.
// Run: node --import tsx web/e2e/guide-help-key.ts   (serves web/dist: CHANNEL=futa04 build)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const out = process.env.SHOTS ?? '/tmp/guide-help-key';
mkdirSync(out, { recursive: true });
const served = await servePreview(4199, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const glassOpen = (mode: string) => `(() => { const g = document.getElementById('futasaku-glass'); return !!g && !g.hidden && g.dataset.mode === '${mode}'; })()`;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
  await page.goto(`${served.url}?seed=219682080`);
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return !!h?.state() && h.state().actor === 0 && !h.busy(); }, undefined, { timeout: 30000 });
  // the "who starts" card leaves the table first
  await page.waitForFunction(() => { const r = document.getElementById('starter-lottery'); return !r || r.hidden || !r.getClientRects().length; }, undefined, { timeout: 30000 });
  await page.waitForTimeout(500);
  const key = page.locator('#futa04-help-button');

  // 1. Draw: "?" in the key, brighter; nothing else on screen.
  await page.waitForFunction(() => document.documentElement.classList.contains('futasaku-guide-fresh'), undefined, { timeout: 8000 });
  const look = await key.evaluate((el) => ({
    q: getComputedStyle(el.querySelector('.guide-q')!).display !== 'none',
    bulb: getComputedStyle(el.querySelector(':scope > .i:not(.guide-q)')!).display !== 'none',
    name: el.getAttribute('aria-label'), filter: getComputedStyle(el).filter,
    pulse: el.getAnimations({ subtree: true }).some((a) => a.effect?.getTiming().iterations === Infinity),
  }));
  console.log(`draw: ${JSON.stringify(look)}`);
  assert(look.q && !look.bulb, 'a new player sees "?" in the help key');
  assert.equal(look.name, 'How to play');
  assert(/brightness/.test(look.filter), 'slightly brighter');
  assert(!look.pulse, 'it never pulses');
  assert.equal(await page.locator('#futasaku-guide-label').count(), 0, 'no label above the keys');
  assert.equal(await page.evaluate(glassOpen('tutorial')), false, 'no window opens by itself');
  assert.equal(await key.evaluate((el) => el.classList.contains('guide-hint')), false, 'no light on Draw (the display names it)');
  await page.screenshot({ path: `${out}/draw.png` });

  // 2. Draw -> Grow is possible for the first time: one edge light, gone by itself.
  await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => document.getElementById('futa04-help-button')!.classList.contains('guide-hint'), undefined, { timeout: 8000 });
  const lit = Date.now();
  await page.waitForTimeout(500); // the light at full strength
  await page.screenshot({ path: `${out}/grow-light.png` });
  await page.waitForFunction(() => !document.getElementById('futa04-help-button')!.classList.contains('guide-hint'), undefined, { timeout: 4000 });
  const ms = Date.now() - lit;
  console.log(`grow: the edge light lasted ~${ms} ms`);
  assert(ms >= 1000 && ms <= 2500, `the light lasts about 1.5 s (${ms} ms)`);
  await page.waitForTimeout(600);
  assert.equal(await key.evaluate((el) => el.classList.contains('guide-hint')), false, 'once only');
  assert.equal(await page.evaluate(glassOpen('tutorial')), false, 'still nothing opens by itself');

  // 3. A tap opens the Grow lesson on the real board; a tap elsewhere closes it.
  await key.click();
  await page.waitForFunction(glassOpen('tutorial'), undefined, { timeout: 5000 });
  const words = (await page.locator('#futasaku-glass').innerText()).replace(/\s+/g, ' ');
  console.log(`tap: lesson "${words.slice(0, 60)}"`);
  assert(/grow/i.test(words), 'the lesson for the action possible now');
  // The key reads as pressed in while its lesson is open.
  const pressed = await key.evaluate((el) => ({ aria: el.getAttribute('aria-pressed'), shadow: getComputedStyle(el).boxShadow }));
  assert.equal(pressed.aria, 'true', 'pressed while the lesson is open');
  assert(/inset/.test(pressed.shadow), `drawn pressed in (${pressed.shadow})`);
  await page.screenshot({ path: `${out}/grow-lesson.png` });
  await page.locator('#smart-led').dispatchEvent('pointerdown');
  await page.waitForFunction(`!${glassOpen('tutorial')}`, undefined, { timeout: 5000 });
  assert.equal(await key.getAttribute('aria-pressed'), null, 'released when the lesson closes');
  console.log('a tap elsewhere closed it');
  // The keyboard too: Escape closes the lesson, and focus stays on the key.
  await key.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(glassOpen('tutorial'), undefined, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(`!${glassOpen('tutorial')}`, undefined, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'futa04-help-button', 'focus stays on the help key');
  console.log('Escape closed it');

  // 4. No longer new (every action has had its light): the bulb is back and opens Match Intel.
  await page.evaluate(() => {
    localStorage.setItem('severgrow.guide.local.v1', JSON.stringify({ hinted: ['blast', 'bloom', 'bomb', 'cut', 'strengthen', 'grow'], finished: 0, base: 0, reenabled: false }));
  });
  await page.goto(`${served.url}?seed=219682080`);
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return !!h?.state() && !h.busy(); }, undefined, { timeout: 30000 });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('futasaku-guide-fresh')), false, 'no longer new');
  assert.match(await key.getAttribute('aria-label') ?? '', /Match Intel/, 'the key has its usual name');
  await key.click();
  await page.waitForFunction(glassOpen('intel'), undefined, { timeout: 5000 });
  console.log('regular player: the bulb opens Match Intel');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS guide help key');
} finally { await browser.close(); await served.server.close(); }
