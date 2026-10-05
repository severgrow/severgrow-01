// Test copy, lite: step guidance and the new font. 390x844, 360x640 and 360x640 with Large text
// on the Classic map: the cue's time from the step starting to it showing, nothing overflowing
// (header, cards, badges, buttons, menu), the font in use, no console errors. One screenshot per
// step (Draw, Grow, Throw, Opponent's turn) and the font bake-off page, in docs/screens/guidance-font/.
//   CHANNEL=test npm run web:build && npx tsx web/e2e/guidance-font-check.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';

const OUT = 'docs/screens/guidance-font';
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4191, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
type Hook = { state: () => State | null; busy: () => boolean; playFor: (a: Action, w: number) => boolean };
const cueTimes: number[] = [];

const overflow = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.game button, .game .btn, .hand .card, .pile-label, .pile-count, #step-cue .cue-text, #step-cue .cue-kicker, #sheet-menu .btn, .gm-status *')]
      .filter((e) => e.offsetParent && getComputedStyle(e).visibility !== 'hidden' && e.clientWidth > 0)
      .filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' ? true : e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1)
      .map((e) => `${e.id || e.className}: "${(e.textContent ?? '').trim().slice(0, 20)}" [${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)} of ${innerWidth}; ${e.style.left} ${e.querySelector<HTMLElement>(".cue-in")?.style.fontSize ?? ""}]`),
  );

const waitMine = (page: Page) =>
  page.waitForFunction(() => {
    const h = (window as unknown as { __severgrow: Hook }).__severgrow;
    const st = h.state();
    return !h.busy() && (!st || st.actor === 0 || st.phase === 'GAME_OVER');
  }, undefined, { timeout: 60000 });

for (const [w, h, large] of [[390, 844, false], [360, 640, false], [360, 640, true]] as const) {
  const tag = `${w}x${h}${large ? '-large' : ''}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript((lg) => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast', largeText: lg }));
  }, large);
  await page.goto('http://localhost:4191/');
  await page.waitForTimeout(600);
  await page.click('#menu-new');
  await page.click('#level-grid [data-level="7"]');
  await waitMine(page);
  await page.waitForTimeout(400);
  const font = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('font-new'), body: getComputedStyle(document.body).fontFamily, loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family) }));
  check(`${tag}: new font in use`, font.cls && font.body.includes('Plus Jakarta Sans') && font.loaded.some((f) => f.includes('Jakarta')) && font.loaded.some((f) => f.includes('Fraunces')), `${font.body.split(',')[0]}; loaded ${[...new Set(font.loaded)].join(', ')}`);
  const steps: string[] = [];
  let step = 0;
  for (let i = 0; i < 12 && steps.length < 4; i++) {
    await waitMine(page);
    const s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    if (!s || s.phase === 'GAME_OVER') break;
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => ({ step: document.documentElement.dataset.step, ms: Number(document.documentElement.dataset.cueMs), level: document.getElementById('step-cue')?.dataset.level, text: document.querySelector('#step-cue .cue-text')?.textContent }));
    if (g.step && !steps.includes(g.step) && g.step !== 'opp') {
      steps.push(g.step);
      cueTimes.push(g.ms);
      check(`${tag}: ${g.step}: the cue shows within 150ms ("${g.text}")`, g.ms <= 150 && g.level !== 'off', `${g.ms}ms, level ${g.level}`);
      const o = await overflow(page);
      check(`${tag}: ${g.step}: nothing overflows`, o.length === 0, o.slice(0, 3).join(' | '));
      if (!large) await page.screenshot({ path: `${OUT}/${tag}-${g.step}.png` });
    }
    // play like a level-5 player; right after my throw, catch the opponent's turn
    const a = chooseLevelAction(viewFor(s, 0), 5, step++);
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), a);
    if (s.phase === 'DISCARD' && !steps.includes('opp')) {
      await page.waitForFunction(() => document.documentElement.dataset.step === 'opp', undefined, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(200);
      const g2 = await page.evaluate(() => ({ step: document.documentElement.dataset.step, text: document.querySelector('#step-cue .cue-text')?.textContent, level: document.getElementById('step-cue')?.dataset.level }));
      if (g2.step === 'opp') {
        steps.push('opp');
        check(`${tag}: opponent's turn: the cue reads the opponent label`, (g2.text ?? '').toLowerCase() === 'opponent', `${g2.text}, level ${g2.level}`);
        if (!large) await page.screenshot({ path: `${OUT}/${tag}-opponent.png` });
      }
    }
  }
  check(`${tag}: saw every step`, ['draw', 'grow', 'throw', 'opp'].every((x) => steps.includes(x)), steps.join(','));
  await page.evaluate(() => document.getElementById('hud-menu')!.click());
  await page.waitForTimeout(300);
  const o = await overflow(page);
  check(`${tag}: menu: nothing overflows`, o.length === 0, o.slice(0, 3).join(' | '));
  if (!large) await page.screenshot({ path: `${OUT}/${tag}-menu.png` });
  check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// the bake-off page
const lab = await browser.newPage({ viewport: { width: 1400, height: 2200 }, deviceScaleFactor: 1 });
const labErr: string[] = [];
lab.on('pageerror', (e) => labErr.push(e.message));
await lab.goto('http://localhost:4191/?lab=1');
await lab.waitForSelector('.fb-col[data-overflow]', { timeout: 20000 });
await lab.waitForTimeout(800);
const fb = await lab.evaluate(() => [...document.querySelectorAll<HTMLElement>('.fb-col')].map((c) => `${c.dataset.pair}: ${c.dataset.overflow === 'true' ? 'overflows' : 'fits'}`));
console.log(`bake-off at 360px: ${fb.join(', ')}`);
await lab.locator('.fb-section').screenshot({ path: `${OUT}/font-bakeoff.png` });
check('bake-off page: no errors', labErr.length === 0, labErr.join(' | '));
console.log(`cue times (ms): ${cueTimes.join(', ')}`);
await browser.close();
server.httpServer.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
