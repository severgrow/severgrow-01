// The finish card gained a line ("what this level taught"), so the smallest phone with Large text
// gets a direct check: the card must fit, and its main button must be reachable without scrolling.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';

const served = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const check = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  console.log(`  ok  ${what}`);
};

try {
  for (const large of [false, true] as const) {
    const w = 320, h = 568;
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await page.goto(`${served.url}?finish=${large ? 'large' : 'normal'}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#menu-play:not([hidden])', { timeout: 15000 });
    await page.evaluate(() => document.getElementById('menu-play')?.click());
    await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('menu-campaign')?.click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    if (large) await page.evaluate(() => document.documentElement.classList.add('large-text'));
    await page.waitForTimeout(800);

    const state = () => page.evaluate(() => (window as any).__severgrow?.state?.() ?? null) as Promise<State | null>;
    for (let guard = 0; guard < 400; guard++) {
      const s = await state();
      if (!s || s.phase === 'GAME_OVER') break;
      if (s.actor !== 0) {
        await page.waitForFunction(() => !(window as any).__severgrow?.busy(), undefined, { timeout: 20000 });
        await page.waitForTimeout(30);
        continue;
      }
      const v = viewFor(s, 0);
      const legal = legalActions(v);
      if (!legal.length) break;
      const action: Action = chooseLevelAction(v, 9, botSeed(s.seed, 5, s.turnNumber, s.history?.length ?? 0));
      await page.evaluate((a) => (window as any).__severgrow.playFor(a, 0), action);
      await page.waitForFunction(() => !(window as any).__severgrow?.busy(), undefined, { timeout: 20000 });
    }
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
    await page.waitForTimeout(1200);

    const m = await page.evaluate(() => {
      const card = document.querySelector('#gameover .go-card')!.getBoundingClientRect();
      const lead = document.getElementById('go-rematch')!.getBoundingClientRect();
      const learned = document.getElementById('go-learned');
      return {
        cardTop: card.top, cardBottom: card.bottom, cardH: card.height,
        leadTop: lead.top, leadBottom: lead.bottom,
        vh: innerHeight,
        learned: learned && !learned.hidden ? learned.textContent?.trim() ?? '' : '',
      };
    });
    const label = large ? 'large text' : 'normal';
    check(m.learned.length > 0, `${w}x${h} ${label}: the card says what the level taught (${m.learned})`);
    check(m.cardTop >= -1 && m.cardTop < m.vh, `${w}x${h} ${label}: the card starts on screen (top ${Math.round(m.cardTop)})`);
    check(m.leadBottom <= m.vh + 1, `${w}x${h} ${label}: "Next level" is on screen without scrolling (bottom ${Math.round(m.leadBottom)} of ${m.vh})`);
    await page.screenshot({ path: `/tmp/ob-shots/finish-${label.replace(' ', '-')}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  await served.server.close();
}
