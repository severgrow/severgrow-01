// The quick check for `TEST:` work (AGENTS.md): the built page loads with no console errors, a new
// game starts from the menu (difficulty, "Who starts?"), and a normal game against the opponent
// plays for several turns on a phone and a desktop screen.
// Build first (npm run web:build), then: node --import tsx web/e2e/quick-smoke.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';

const PORT = 4196;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const state = (p: Page) => p.evaluate(() => (window as any).__severgrow.state() as State | null);
const myMove = (p: Page) => p.waitForFunction(() => {
  const h = (window as any).__severgrow;
  const s = h?.state();
  return !!s && !h.busy() && !document.getElementById('starter-draw') && (s.actor === 0 || s.phase === 'GAME_OVER');
}, undefined, { timeout: 60_000 });

try {
  for (const [width, height] of [[390, 844], [1280, 800]] as const) {
    const phone = width < 600;
    const page = await browser.newPage({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
    await page.goto(`http://localhost:${PORT}/`);
    // the page is ready once its test hook exists (the menu's buttons are wired by then)
    await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30_000 });
    await page.click('#menu-new');
    await page.click('[data-difficulty="medium"]');
    // the "Who starts?" draw shows, then the game begins (whoever starts)
    await page.waitForSelector('#starter-draw', { timeout: 10_000 });
    await page.click('#starter-draw');
    await myMove(page);
    assert.equal(await page.locator('#board g.hex-cell').count(), 37, `${width}: the board`);

    // play my turns through the game's own hook, choosing a simple legal move each time
    let turns = 0;
    for (let i = 0; i < 80 && turns < 4; i++) {
      const s = await state(page);
      assert(s, 'a game is running');
      if (s.phase === 'GAME_OVER') break;
      const legal = legalActions(viewFor(s, 0));
      const pick: Action = legal.find((a) => a.t === 'Draw') ?? legal.find((a) => a.t === 'Sprout') ?? legal.find((a) => a.t === 'EndAct') ?? legal[0]!;
      assert(await page.evaluate((a) => (window as any).__severgrow.playFor(a, 0), pick), `${width}: the page accepts ${pick.t}`);
      if (pick.t === 'Discard') turns++;
      await myMove(page);
    }
    const end = await state(page);
    assert(end && (turns >= 4 || end.phase === 'GAME_OVER'), `${width}: four turns played (${turns})`);
    assert(end.turnNumber > 4 || end.phase === 'GAME_OVER', `${width}: the opponent played too`);
    assert.deepEqual(errors, [], `${width}: no console errors`);
    console.log(`${width}x${height}: quick smoke passed (${turns} turns each)`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}
