/**
 * THE STEADY WAIT (owner, 2026-11-20): while the opponent is thinking, the cockpit keeps a still,
 * dim WAIT — not a one-second red flash followed by a blank face. An action message still paints
 * over it, and the word returns when the message ends. The Blitz clock lives in its own key and is
 * untouched (its own suite covers it).
 */
import { chromium, webkit } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const ios = process.env.WAIT_WEBKIT === '1';
const served = await servePreview(4233, { logLevel: 'silent' });
const browser = await (ios ? webkit : chromium).launch(ios ? {} : { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const check = (ok: boolean, label: string, note = '') => {
  if (!ok) throw new Error(`${label}${note ? ` (${note})` : ''}`);
  console.log(`PASS  ${label}${note ? `  (${note})` : ''}`);
};
const mounted = async (page: Page) => page.waitForSelector('#smart-led-text', { state: 'attached', timeout: 20_000 });
type WaitState = { text: string; ambient: boolean; inkOpacity: string; blink: boolean };
const state = (page: Page): Promise<WaitState> => page.evaluate(() => ({
  text: (document.getElementById('smart-led-text')?.textContent ?? '').trim(),
  ambient: document.getElementById('smart-led-window')?.classList.contains('led-ambient') ?? false,
  inkOpacity: (() => { const ink = document.getElementById('smart-led-ink'); return ink ? getComputedStyle(ink).opacity : ''; })(),
  blink: document.getElementById('smart-led')?.classList.contains('led-alarm') ?? false,
}));

try {
  for (const [label, width, height, mobile] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    await page.addInitScript(() => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, reduceMotion: false, effects: 'high', speed: 'fast' }));
    });
    await page.goto(`${served.url}?seed=3`);
    await page.waitForSelector('#deck.ready');
    await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
    await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());
    await mounted(page);
    // Put the screen into the opponent's step the way the game does, then let the cockpit's own
    // render/sync path paint it. (A real bot turn at Speed Fast is over before a poll can catch it;
    // the STEADY behaviour itself is pinned by web/tests/display-machine.test.ts.)
    await page.evaluate(() => {
      document.documentElement.dataset.step = 'opp';
      (window as any).__severgrow.cockpitSync();
    });
    const wait = await page.waitForFunction(`(() => {
      const text = (document.getElementById('smart-led-text')?.textContent ?? '').trim();
      const ambient = document.getElementById('smart-led-window')?.classList.contains('led-ambient');
      if (!text.includes('WAIT') || !ambient) return false;
      const ink = document.getElementById('smart-led-ink');
      return { text, ambient, inkOpacity: ink ? getComputedStyle(ink).opacity : '', blink: document.getElementById('smart-led')?.classList.contains('led-alarm') };
    })()`, undefined, { timeout: 8000 }).then((handle) => handle.jsonValue() as Promise<WaitState>).catch(() => state(page));
    check(wait.text.includes('WAIT') && wait.ambient, `${label}: their turn shows a steady WAIT`, JSON.stringify(wait));
    check(Number(wait.inkOpacity) > 0 && Number(wait.inkOpacity) < .6, `${label}: it is dim, not the bright attention ink`, wait.inkOpacity);
    check(!wait.blink, `${label}: it never blinks like an alarm`);
    await page.waitForTimeout(2500);
    const steady = await state(page);
    check(steady.text.includes('WAIT') && steady.ambient && !steady.blink, `${label}: it stays (no blank beat, no alarm)`, JSON.stringify(steady));
    // Leaving their turn clears the state word and the score returns.
    await page.evaluate(() => {
      document.documentElement.dataset.step = 'grow';
      (window as any).__severgrow.cockpitSync();
    });
    const cleared = await page.waitForFunction(`(() => {
      const text = (document.getElementById('smart-led-text')?.textContent ?? '').trim();
      const ambient = document.getElementById('smart-led-window')?.classList.contains('led-ambient');
      return !ambient && text !== 'WAIT';
    })()`, undefined, { timeout: 5000 }).then(() => true).catch(() => false);
    check(cleared, `${label}: leaving their turn removes the WAIT`);
    await page.close();
  }
  console.log('ALL PASS');
} finally {
  await browser.close();
  await served.server.httpServer.close();
}
