// The Lab's one quick smoke run (test copy only; lite mode: not part of npm run e2e).
//   CHANNEL=test npm run web:build && npx tsx web/e2e/lab-smoke.ts
// Opens the test build, checks the page loads with no console errors, opens the Lab, plays a
// whole "Classic" game against the opponent, then starts "Huge hex" and opens a share link.
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { PRESETS, encodeSetup } from '../src/lab-mode/setup.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4179/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
type Hook = { state: () => State | null; busy: () => boolean; playFor: (a: Action, w: number) => boolean };
const state = (p: Page) => p.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());

const open = async (hash = '') => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    // the test copy's own storage prefix
    localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast' }));
  });
  await page.goto(BASE + hash);
  await page.waitForTimeout(400);
  return { page, errors };
};

/** Plays my moves with a level-5 opponent's choices until the game ends. */
const playOut = async (page: Page, maxMs: number) => {
  const t0 = Date.now();
  let moves = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForFunction(() => {
      const h = (window as unknown as { __severgrow: Hook }).__severgrow;
      const s = h.state();
      return !h.busy() && (!s || s.actor === 0 || s.phase === 'GAME_OVER');
    }, undefined, { timeout: 60000 });
    const s = (await state(page))!;
    if (s.phase === 'GAME_OVER') return { s, moves };
    const a = chooseLevelAction(viewFor(s, 0), 5, moves);
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), a);
    moves++;
  }
  return { s: (await state(page))!, moves };
};

const pickPreset = async (page: Page, name: string) => {
  await page.click('#menu-lab');
  const i = PRESETS.findIndex((p) => p.name === name);
  await page.selectOption('#sheet-lab select[data-sel="name"]', String(i));
  await page.click('#sheet-lab .lab-buttons [data-lab="play"]');
  await page.waitForTimeout(500);
};

// 1. the page loads, the Lab opens
{
  const { page, errors } = await open();
  check('menu shows the Lab button and the Test build line', (await page.locator('#menu-lab').isVisible()) && (await page.locator('.lab-line').innerText()).includes('Test build'));
  await page.click('#menu-lab');
  check('the Lab sheet opens with a map preview', (await page.locator('#sheet-lab .lab-preview polygon').count()) === 37);
  await page.click('#sheet-lab [data-lab="close"]');
  // 2. Classic against the opponent, to the end
  await pickPreset(page, 'Classic');
  const first = (await state(page))!;
  check('Classic: the classic board (no Lab board, no reshuffle)', first.config.board === null && first.config.reshuffleDiscard === false && Object.keys(first.board).length === 37);
  const { s, moves } = await playOut(page, 240000);
  check('Classic: a whole game against the opponent ends normally', s.phase === 'GAME_OVER', `${moves} of my moves, result ${JSON.stringify(s.result)}`);
  check('no console errors (Classic)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// 3. Huge hex starts, fits, and the opponent answers
{
  const { page, errors } = await open();
  await pickPreset(page, 'Huge hex');
  const s = (await state(page))!;
  check('Huge hex: 127 hexes, reshuffle on, 60 turns', Object.keys(s.board).length === 127 && s.config.reshuffleDiscard && s.config.maxTurnsPerPlayer === 60);
  check('Huge hex: every tile drawn', (await page.locator('.hex-cell').count()) === 127);
  const r = await playOut(page, 25000);
  check('Huge hex: the game runs (moves made, opponent answered)', r.moves > 3, `${r.moves} of my moves in 25 s, turn ${r.s.turnNumber}`);
  check('the header shows turns left from the turn limit', /left|turn/i.test(await page.locator('#turn').innerText()));
  check('no console errors (Huge hex)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// 4. a share link opens the Lab with "Play this experiment"
{
  const ring = PRESETS.find((p) => p.name === 'Ring')!;
  const { page, errors } = await open(`#lab=${encodeSetup({ ...ring, name: 'Shared ring' })}`);
  check('a share link opens the Lab with "Play this experiment"', (await page.locator('#sheet-lab .lab-link-note').isVisible()) && (await page.locator('#sheet-lab').innerText()).includes('Shared ring'));
  await page.click('#sheet-lab .lab-link-note [data-lab="play"]');
  await page.waitForTimeout(500);
  const s = (await state(page))!;
  check('the shared experiment starts (ring board)', Object.keys(s.board).length === 84);
  await page.click('#hud-menu').catch(() => {});
  const { page: p2, errors: e2 } = await open('#lab=9.garbage!!');
  check('a broken link is ignored safely', !(await p2.locator('#sheet-lab').isVisible().catch(() => false)));
  check('no console errors (links)', errors.length + e2.length === 0, [...errors, ...e2].slice(0, 3).join(' | '));
  await page.close();
  await p2.close();
}

await browser.close();
server.httpServer.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
