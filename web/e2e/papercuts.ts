// PAPERCUTS: friction a thumb meets in the real built page, never a rule.
//
// Three small guarantees, each proved on a phone-sized touch viewport against the built app:
//   1. the pause menu opens on the FIRST tap, even while a lesson's intro stage is playing (the
//      stage used to swallow that tap to skip itself, so leaving a level cost two taps);
//   2. closing a sheet gives the keyboard back to the control that opened it, so a keyboard
//      player does not restart from the top of the page;
//   3. controls outside the board answer a tap at once (touch-action: manipulation), instead of
//      leaving the double-tap zoom gesture armed on the menu key and the settings choices.
//
// Build first (CHANNEL=futa05 + its online config), then run this file with tsx.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { CHROME } from './helpers/local-duel.js';

const served = await servePreview(4193, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? CHROME, args: ['--no-sandbox'] });
let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks++;
  console.log(`  ok  ${name}`);
};

/** A fresh tester's phone: level 1 is open and nothing has been played. */
const phone = async (w = 360, h = 640): Promise<{ page: Page; context: BrowserContext; errors: string[] }> => {
  const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  // No audio in a headless run: a machine without an output device raises an AudioContext error
  // that has nothing to do with what this suite asserts.
  await page.addInitScript(() => {
    localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ sound: false, music: false }));
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|net::ERR|127\.0\.0\.1:9/.test(message.text())) errors.push(message.text());
  });
  await page.goto(served.url, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30000 });
  return { page, context, errors };
};

const lessonState = (page: Page) =>
  page.evaluate(() => (window as any).__severgrow.lesson?.() as null | { stage: boolean; stageLeft: number });

/** Open LEVEL 1 the way a player does: PLAY, then the campaign entry. */
const startLevelOne = async (page: Page) => {
  await page.evaluate(() => {
    // A first visit offers the install sheet; it sits over the menu.
    for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
    const prompt = document.getElementById('install-prompt');
    if (prompt) prompt.hidden = true;
  });
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 15000 });
  await page.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement)?.click());
  await page.waitForFunction(() => !!(window as any).__severgrow.state?.(), undefined, { timeout: 20000 });
};

/**
 * The intro stage is ~1.2 s and starts with the level, so a suite that waits for the board to be
 * idle can arrive at its tail. Re-enter until there is a clear window left, then report it.
 */
const startLevelDuringStage = async (): Promise<{ page: Page; context: BrowserContext; errors: string[]; left: number }> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { page, context, errors } = await phone();
    await startLevelOne(page);
    await page.waitForFunction(() => {
      const lesson = (window as any).__severgrow.lesson?.();
      return !!lesson && lesson.stage === true;
    }, undefined, { timeout: 15000, polling: 25 });
    const left = (await lessonState(page))!.stageLeft;
    if (left > 400) return { page, context, errors, left };
    await context.close();
  }
  throw new Error('the intro stage never left a clear window to tap in');
};

try {
  // ---- 1. the pause menu answers the first tap, even during the intro stage -------------
  const { page, context, errors, left } = await startLevelDuringStage();
  const box = await page.locator('#hud-menu').boundingBox();
  assert(box, '#hud-menu has a box');
  console.log(`  the intro stage is running (${left} ms left)`);
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(250);
  const afterTap = await page.evaluate(() => ({
    menuOpen: !document.getElementById('sheet-menu')!.hidden,
    stage: (window as any).__severgrow.lesson?.()?.stage as boolean,
  }));
  check(!afterTap.stage, 'one tap on Menu skips the intro stage');
  check(afterTap.menuOpen, 'one tap on Menu opens the pause menu (it never needed two)');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);

  // The rest needs a sheet whose opener is a real focus target: a keyboard player opens the pause
  // menu with the same keys the app listens to, and that is the control Escape must give back.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator('#hud-menu').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8000 });

  // ---- 2. every chrome control answers a tap immediately -------------------------------
  await page.locator('#gm-settings').click();
  await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 8000 });
  const answers = await page.evaluate(() => ({
    menu: getComputedStyle(document.getElementById('hud-menu')!).touchAction,
    close: getComputedStyle(document.querySelector('#sheet-settings [data-close]')!).touchAction,
    seg: getComputedStyle(document.querySelector('#sheet-settings .seg-btn')!).touchAction,
    pauseRow: getComputedStyle(document.getElementById('gm-settings')!).touchAction,
  }));
  check(answers.menu === 'manipulation', `the Menu key answers at once (touch-action: ${answers.menu})`);
  check(answers.close === 'manipulation', `the sheet's Close answers at once (touch-action: ${answers.close})`);
  check(answers.seg === 'manipulation', `a Settings choice answers at once (touch-action: ${answers.seg})`);
  check(answers.pauseRow === 'manipulation', `a pause-menu row answers at once (touch-action: ${answers.pauseRow})`);

  // ---- 3. closing a sheet hands the keyboard back to its opener ------------------------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const focus = await page.evaluate(() => ({
    id: document.activeElement?.id || '',
    sheetClosed: document.getElementById('sheet-settings')!.hidden,
    scrim: document.getElementById('scrim')!.hidden,
  }));
  check(focus.sheetClosed && focus.scrim, 'Escape closes the sheet and its scrim');
  check(focus.id === 'hud-menu', `focus returns to the control that opened it (saw "${focus.id || 'nothing'}")`);
  await context.close();

  // ---- the 44 px rule outside the board, at the two narrowest phones --------------------
  for (const [w, h] of [[320, 568], [390, 844]] as const) {
    const { page: p, context: c } = await phone(w, h);
    await startLevelOne(p);
    await p.waitForTimeout(400);
    await p.locator('#hud-menu').click();
    await p.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8000 });
    const small = await p.evaluate(() => {
      const rows: { what: string; w: number; h: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('#sheet-menu button, #hud-menu, #hud button')) {
        if (el.hidden || !el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        // Sub-pixel tolerance: a 44px key can measure 43.99 in a scaled layout, and a test that
        // demands 44.0000 would fail on a control the player experiences as exactly 44. Half a
        // pixel is far below anything a thumb can tell apart.
        if (r.width < 43.5 || r.height < 43.5) rows.push({ what: el.id || el.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return rows;
    });
    check(small.length === 0, `${w}x${h}: pause menu and HUD controls are at least 44 px (${JSON.stringify(small)})`);
    await c.close();
  }
} finally {
  await browser.close();
  await served.server.close();
}

console.log(`\npapercuts: ${checks} checks passed`);
