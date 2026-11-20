/**
 * THE CARD'S SUIT DETAIL, IN THE GAME'S OWN MATERIAL (owner, 2026-11-20).
 *
 * The browser's grey `title="Ash"` tooltip is gone. Hovering the suit, focusing the card, or a touch
 * long-press shows the same quiet detail bubble the board already uses. Keyboard access is the card
 * button's own aria-label (full card name), so nothing is lost there.
 */
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const ios = process.env.CARD_TIP_WEBKIT === '1';
const served = await servePreview(4234, { logLevel: 'silent' });
const browser = await (ios ? webkit : chromium).launch(ios ? {} : { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const check = (ok: boolean, label: string, note = '') => {
  if (!ok) throw new Error(`${label}${note ? ` (${note})` : ''}`);
  console.log(`PASS  ${label}${note ? `  (${note})` : ''}`);
};
const tip = (page: import('playwright-core').Page) => page.evaluate(() => {
  const el = document.getElementById('card-tip');
  return { hidden: el?.hidden ?? true, text: (el?.textContent ?? '').trim(), role: el?.getAttribute('role') };
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: ios, hasTouch: true });
  await page.addInitScript(() => {
    (window as any).__name = (fn: unknown) => fn;
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, reduceMotion: true, speed: 'skip' }));
  });
  await page.goto(`${served.url}?seed=3`);
  await page.waitForSelector('#deck.ready');
  await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT');
  await page.waitForSelector('#hand .card [data-card-detail]');
  const noTitles = await page.evaluate(() => document.querySelectorAll('#hand .card [title], #hand .card[title]').length);
  check(noTitles === 0, 'no browser-native title remains on the hand', String(noTitles));
  const spoken = await page.locator('#hand .card').first().getAttribute('aria-label');
  check(!!spoken && /(Moss|Ash|Dew|Ember)/.test(spoken), 'the card button still speaks its full name (keyboard access)', spoken ?? '');
  // Mouse hover on the suit glyph.
  await page.hover('#hand .card [data-card-detail]');
  await page.waitForFunction(() => !(document.getElementById('card-tip') as HTMLElement | null)?.hidden, undefined, { timeout: 3000 });
  const hovered = await tip(page);
  check(hovered.role === 'tooltip' && /^(Moss|Ash|Dew|Ember|Bomb)$/.test(hovered.text), 'hover shows the suit detail in the game bubble', JSON.stringify(hovered));
  await page.mouse.move(4, 4);
  await page.waitForFunction(() => (document.getElementById('card-tip') as HTMLElement | null)?.hidden === true, undefined, { timeout: 3000 });
  check(true, 'leaving the card hides it');
  // Keyboard: focusing the card shows the same detail.
  await page.locator('#hand .card').first().focus();
  await page.waitForFunction(() => !(document.getElementById('card-tip') as HTMLElement | null)?.hidden, undefined, { timeout: 3000 });
  const focused = await tip(page);
  check(/^(Moss|Ash|Dew|Ember|Bomb)$/.test(focused.text), 'focusing the card shows it', focused.text);
  await page.locator('#hand .card').first().blur();
  // Touch long-press (450 ms).
  const box = await page.locator('#hand .card [data-card-detail]').first().boundingBox();
  assert(box, 'the suit glyph has a box');
  await page.dispatchEvent('#hand .card [data-card-detail]', 'pointerdown', { pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
  const pressed = await page.waitForFunction(() => !(document.getElementById('card-tip') as HTMLElement | null)?.hidden, undefined, { timeout: 2500 }).then(() => true).catch(() => false);
  check(pressed, 'a touch long-press opens it', JSON.stringify(await tip(page)));
  await page.close();
  console.log('ALL PASS');
} finally {
  await browser.close();
  await served.server.httpServer.close();
}
