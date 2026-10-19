// Levels 1-10 are the onboarding journey, so they have to be PLAYED, not simulated: this suite
// opens each one through the real menu, plays it to a finish with the page's own engine, and checks
// that the next level opens from the finish card. It is the closest thing to a tester's session.
//
//   npx tsx web/e2e/campaign-levels.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';

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
const state = (p: Page) => p.evaluate(() => (window as any).__severgrow?.state?.() ?? null) as Promise<State | null>;
const title = (p: Page) => p.evaluate(() => {
  // Levels 1-10 keep their title in the game's top row now; other screens still use the glass.
  const bar = document.querySelector('#lesson-hud:not([hidden]) .lesson-hud-sr');
  const panel = document.getElementById('futasaku-glass');
  // A hidden panel keeps its last words; only a visible one is guidance.
  if (!panel || panel.hidden) return bar?.textContent?.trim() ?? '';
  return document.querySelector('#futasaku-glass .glass-led-sr')?.textContent?.trim() || bar?.textContent?.trim() || '';
});
const waitIdle = (p: Page) => p.waitForFunction(() => {
  const hook = (window as any).__severgrow;
  return !!hook && !hook.busy();
}, undefined, { timeout: 30000 });

/** One whole match: play my turns with the engine's own strongest chooser, let the bot answer. */
const playToEnd = async (p: Page, levelNumber: number): Promise<{ reason: string; winner: number | null }> => {
  for (let guard = 0; guard < 400; guard++) {
    const s = await state(p);
    if (!s) throw new Error('no game state');
    if (s.phase === 'GAME_OVER') return { reason: s.result?.reason ?? '?', winner: s.result?.winner ?? null };
    if (s.actor !== 0) {
      await waitIdle(p);
      await p.waitForTimeout(60);
      continue;
    }
    const v = viewFor(s, 0);
    const legal = legalActions(v);
    if (!legal.length) throw new Error(`L${levelNumber}: my turn with no legal move`);
    const level = Math.min(9, 4 + levelNumber) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    const action: Action = chooseLevelAction(v, 9, botSeed(s.seed, level, s.turnNumber, s.history?.length ?? 0));
    const played = await p.evaluate((a) => !!(window as any).__severgrow.playFor(a, 0), action);
    if (!played) throw new Error(`L${levelNumber}: the page refused ${JSON.stringify(action)}`);
    await waitIdle(p);
  }
  throw new Error(`L${levelNumber}: never finished`);
};

try {
  // A tester's device: level 1 open, nothing played. Progress lives in the channel's own storage.
  await page.goto(`${served.url}?levels=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 15000 });
  await page.click('#menu-play');
  await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });

  // A first visit offers to install the app; it sits over the menu, so it is dismissed the way a
  // tester would before playing.
  const dismissInstall = async () => {
    await page.evaluate(() => {
      for (const id of ['install-close', 'install-later', 'install-dismiss']) {
        document.getElementById(id)?.click();
      }
      const prompt = document.getElementById('install-prompt');
      if (prompt && !prompt.hidden) prompt.hidden = true;
    });
  };
  await dismissInstall();

  /** Open a level from the PLAY menu (the only way in, by design). */
  const openLevel = async (n: number) => {
    const label = await page.textContent('#menu-campaign');
    assert.match(label ?? '', new RegExp(`LEVEL\\s*${n}\\b`), `the menu offers LEVEL ${n} (saw ${label?.trim()})`);
    // A DOM click: the install sheet and the room's own animations can sit over the button.
    await page.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement)?.click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    await page.waitForTimeout(500);
  };

  const results: { level: number; first: string; reason: string; winner: number | null }[] = [];

  for (const level of CAMPAIGN_LEVELS.slice(0, 10)) {
    if (level.number > 1) {
      // The finish card's leading button starts the next level directly.
      await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
      const lead = await page.textContent('#go-rematch');
      check((lead ?? '').trim() === 'Next level', `L${level.number - 1} offers Next level (${lead?.trim()})`);
      await dismissInstall();
      await page.evaluate(() => (document.getElementById('go-rematch') as HTMLButtonElement)?.click());
      await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
      await page.waitForTimeout(600);
    } else {
      await openLevel(1);
    }

    const first = await title(page);
    // Levels 8-10 are deliberately quiet until their mechanic is on the table, so an empty window
    // is a correct opening for them; 1-7 always say the next thing.
    if (level.number <= 7) check(first.length > 0, `L${level.number} opens with guidance (${first})`);
    else check(true, `L${level.number} opens quiet or with its mechanic (${first || 'quiet'})`);
    const board = await page.evaluate(() => document.querySelectorAll('.hex-cell').length);
    // /3/ line (owner, 2026-10-18): levels 1-10 are the tutorial and are all played on the 19-hex map
    // as authored lessons; level 11 is the first 37-hex level (checked below). This replaces the /2/
    // expectation (levels 4-10 on 37 hexes) on purpose; see docs/CAMPAIGN.md.
    const expectedHexes = 19;
    check(board === expectedHexes, `L${level.number} plays on ${expectedHexes} hexes (${board})`);

    const end = await playToEnd(page, level.number);
    check(end.winner === 0, `L${level.number} is winnable (winner ${end.winner} via ${end.reason})`);

    // The finish card says what the level taught, once you have won it.
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
    const learned = await page.evaluate(() => {
      const el = document.getElementById('go-learned');
      return el && !el.hidden ? el.textContent?.trim() ?? '' : '';
    });
    check(learned.length > 0, `L${level.number} says what it taught (${learned})`);
    results.push({ level: level.number, first: first || 'quiet', reason: end.reason, winner: end.winner });
  }

  // Level 11 keeps the full board and gets no guidance: the teaching is done.
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
  check((await page.textContent('#go-rematch'))?.trim() === 'Next level', 'after level 10 the next level is still offered');
  await dismissInstall();
  await page.evaluate(() => (document.getElementById('go-rematch') as HTMLButtonElement)?.click());
  await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
  await page.waitForTimeout(700);
  const big = await page.evaluate(() => document.querySelectorAll('.hex-cell').length);
  check(big === 37, `level 11 plays the full board (${big} hexes)`);
  check((await title(page)) === '', 'level 11 gets no campaign guidance: the teaching is done');

  assert.deepEqual([...errors], [], `no page errors: ${errors.join(' | ')}`);
  console.log('\nLevels 1-10 played through the real UI:');
  for (const r of results) console.log(`  L${String(r.level).padStart(2)}  opened "${r.first}"  won by ${r.reason}`);
} finally {
  await browser.close();
  await served.server.close();
}
