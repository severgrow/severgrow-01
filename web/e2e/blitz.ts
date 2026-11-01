// EXPERIMENTAL BLITZ — the /test/-only Practice tier, end to end in Chromium.
//
//   npm run check
//   npx tsx web/e2e/blitz.ts
//
// It builds BOTH builds the feature has to be distinguished in:
//   * CHANNEL=futa04 (the locked product)               -> the PRO tier must not exist;
//   * CHANNEL=futa05, served the way /test/ is (composed at /test/) -> PRO exists, and it starts a
//     Blitz match, enforces the 15 s clock with the existing live-duel ring/vignette, drops the bot
//     to 8 after two losses, survives a reload, and returns to 9 after a win.
//
// The live ROOT is the same futa05 build one promote behind /test/, so the same build is also
// served at `/` here and asserted to have NO PRO tier — that is the gate that protects live.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { allNeighbors, apply, coordKey, homeCoord, legalActions, newMatch, rootCoord, scores, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { encodeSave } from '../src/logic/persist.js';
import { serveStaticDist } from './helpers/preview-port.js';

const ROOT = new URL('../..', import.meta.url).pathname;
// Built OUTSIDE the checkout: these are scratch builds, not artefacts to commit.
const DIST_FUTA04 = mkdtempSync(join(tmpdir(), 'blitz-dist-futa04-'));
const DIST_TEST = mkdtempSync(join(tmpdir(), 'blitz-dist-futa05-'));

const build = (outDir: string, channel: string, online = false): void => {
  const env: NodeJS.ProcessEnv = { ...process.env, CHANNEL: channel };
  if (online) {
    env.VITE_DUEL_API_URL = 'http://127.0.0.1:9';
    env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
    env.VITE_SUPABASE_ANON_KEY = 'local-e2e-anon-key';
  }
  const run = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, env, stdio: 'inherit' });
  assert.equal(run.status, 0, `build ${channel} (${outDir})`);
};

let checks = 0;
const check = (ok: unknown, name: string): void => { assert.ok(ok, name); checks++; console.log(`  ok  ${name}`); };

const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const cleanup: string[] = [];
cleanup.push(DIST_FUTA04, DIST_TEST);
let servedA: Awaited<ReturnType<typeof serveStaticDist>> | null = null;
let servedB: Awaited<ReturnType<typeof serveStaticDist>> | null = null;

const open = async (url: string): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { __blitzErrors?: string[] }).__blitzErrors = errors;
  await page.goto(url);
  await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30000 });
  return page;
};
const errorsOf = (page: Page): string[] => (page as Page & { __blitzErrors?: string[] }).__blitzErrors ?? [];
const noErrors = (page: Page): void => { assert.deepEqual(errorsOf(page), [], 'no page errors'); checks++; };
const blitz = (page: Page) => page.evaluate(() => (window as any).__severgrow.blitz?.() ?? null);
const idle = (page: Page) => page.waitForFunction(() => {
  const h = (window as any).__severgrow;
  return !!h && !h.busy() && h.state()?.actor === 0 && h.state()?.phase !== 'GAME_OVER';
}, undefined, { timeout: 30000 });
const openPractice = async (page: Page): Promise<void> => {
  // PRODUCT MENU: PLAY opens the submenu that holds Practice ("Play offline" / "Practice match").
  await page.waitForSelector('#menu-play', { state: 'visible', timeout: 20000 });
  await page.click('#menu-play');
  await page.waitForSelector('#menu-new', { state: 'visible', timeout: 10000 });
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 10000 });
  await page.waitForSelector('#level-grid .difficulty-tile', { timeout: 10000 });
};

try {
  build(DIST_FUTA04, 'futa04');
  build(DIST_TEST, 'futa05', true);
  check(existsSync(join(DIST_FUTA04, 'index.html')) && existsSync(join(DIST_TEST, 'index.html')), 'both builds exist');

  // ---------------------------------------------------------------------------------------------
  // 1. The locked product build: no PRO tier, no Blitz hook.
  // ---------------------------------------------------------------------------------------------
  servedA = await serveStaticDist(DIST_FUTA04);
  {
    const page = await open(servedA.url);
    await openPractice(page);
    const tiers = await page.locator('#level-grid .difficulty-tile').allTextContents();
    check(JSON.stringify(tiers) === JSON.stringify(['EASY', 'MEDIUM', 'HARD']), 'futa04 Practice has exactly EASY / MEDIUM / HARD');
    check(await page.locator('#level-grid [data-difficulty="pro"]').count() === 0, 'futa04 has no PRO tier');
    check((await blitz(page)) === null, 'futa04 has no Blitz hook');
    noErrors(page);
    await page.close();
  }

  // ---------------------------------------------------------------------------------------------
  // 2. The /test/ copy: PRO exists; the live ROOT of the same build does not.
  // ---------------------------------------------------------------------------------------------
  const site = mkdtempSync(join(tmpdir(), 'blitz-site-'));
  cleanup.push(site);
  // The SAME futa05 bytes at the live ROOT and at /test/, exactly as the publisher composes them.
  cpSync(DIST_TEST, site, { recursive: true });
  cpSync(DIST_TEST, join(site, 'test'), { recursive: true });
  servedB = await serveStaticDist(site);
  const TEST_URL = `${servedB.url}test/index.html`;
  {
    const live = await open(servedB.url); // the same bytes, at the LIVE root path
    await openPractice(live);
    check(await live.locator('#level-grid [data-difficulty="pro"]').count() === 0, 'the futa05 build at the LIVE ROOT has no PRO tier');
    check((await blitz(live)) === null, 'the futa05 build at the LIVE ROOT has no Blitz hook');
    noErrors(live);
    await live.close();
  }

  const page = await open(TEST_URL);
  await openPractice(page);
  check(await page.locator('#level-grid [data-difficulty="pro"]').count() === 1, '/test/ Practice has the PRO tier');
  check((await page.locator('#level-grid .difficulty-tile').allTextContents()).at(-1) === 'PRO', 'PRO is the last Practice tier');

  // ---------------------------------------------------------------------------------------------
  // 3. Starting: a campaign board 30-70, bot 9, a 15 s limit, the live-duel ring.
  // ---------------------------------------------------------------------------------------------
  await page.click('#level-grid [data-difficulty="pro"]');
  await page.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 30000 });
  const started = await blitz(page);
  check(started.turnMs === 15_000, 'the turn limit is 15 s');
  check(started.botLevel === 9, 'a fresh Blitz match starts at bot 9');
  check(started.nextBotLevel === 9, 'the ladder starts at 9');
  check(started.map >= 30 && started.map <= 70, `the board is a campaign map 30-70 (${started.map})`);
  // ...and it IS that campaign level's authored board, not a regenerated one.
  const map = CAMPAIGN_LEVELS.find((level) => level.number === started.map)!;
  const boardKeys = await page.evaluate(() => {
    const s = (window as any).__severgrow.state() as State;
    return Object.keys(s.board).sort();
  });
  check(JSON.stringify(boardKeys) === JSON.stringify([...map.config.board!.cells].sort()), 'the board is that campaign level\'s own');
  check(await page.locator('#game:not([hidden])').count() === 1, 'the match is on screen');

  // The clock is the live duel's own ring on my home, with the red vignette near the end.
  await page.waitForFunction(() => {
    const b = (window as any).__severgrow?.blitz?.();
    return !!b && b.deadline !== null;
  }, undefined, { timeout: 20000 });
  await page.waitForSelector('.live-ring:not([hidden])', { timeout: 5000 });
  check((await page.locator('.live-ring').getAttribute('data-side')) === 'me', 'the clock ring sits on my home');
  // urgent at <= 10 s left; the red vignette (the "time near end" glow) at <= 5 s.
  await page.waitForSelector('.live-ring[data-urgent="1"]', { timeout: 12000 });
  check(true, 'the ring turns urgent as the 15 s runs out');
  await page.waitForSelector('.live-vignette[data-on="1"]', { timeout: 8000 });
  check(true, 'the existing red vignette glows in the last five seconds');
  // A turn past the limit is the online rule: the match is lost, not auto-played.
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 8000 });
  check((await page.locator('#go-reason').textContent())?.trim() === 'You ran out of time.', 'the finish card says the clock ran out');
  check((await page.locator('#gameover').getAttribute('class'))?.includes('lost') === true, 'the timeout is a loss');
  let after = await blitz(page);
  check(after.nextBotLevel === 9, 'one loss: the next Blitz game is still bot 9');
  check(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('severgrow.blitz.v1')!))) === JSON.stringify({ level: 9, losses: 1 }), 'one loss is persisted');
  check(await page.locator('.live-ring:not([hidden])').count() === 0, 'the ring is gone after the match');
  noErrors(page);

  // ---------------------------------------------------------------------------------------------
  // 4. Two losses in a row: the next match is bot 8.
  // ---------------------------------------------------------------------------------------------
  await page.click('#go-rematch'); // "Try again"
  await page.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 30000 });
  const second = await blitz(page);
  check(second.botLevel === 9, 'the second game still starts at 9 (only ONE loss so far)');
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 25000 });
  after = await blitz(page);
  check(after.nextBotLevel === 8, 'two losses in a row drop the next Blitz game to bot 8');
  check(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('severgrow.blitz.v1')!))) === JSON.stringify({ level: 8, losses: 2 }), 'the drop is persisted');
  noErrors(page);

  // Persistence across a reload: the ladder is still 8.
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30000 });
  await openPractice(page);
  await page.click('#level-grid [data-difficulty="pro"]');
  await page.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 30000 });
  const third = await blitz(page);
  check(third.botLevel === 8, 'after a reload the next Blitz game is still bot 8');
  noErrors(page);
  await page.close();

  // ---------------------------------------------------------------------------------------------
  // 5. A win returns the ladder to 9. The near-win position is a real save (the same decoder the
  //    product uses), one empty-handed EndAct from a deck-exhaustion win.
  // ---------------------------------------------------------------------------------------------
  const level = CAMPAIGN_LEVELS.find((l) => l.number === 30)!;
  const start = newMatch(913_300, level.config);
  const root = coordKey(rootCoord(0, 'ring2', start.config.boardRadius));
  const theirs = coordKey(rootCoord(1, 'ring2', start.config.boardRadius));
  const board = { ...start.board };
  board[root] = { ...board[root]!, owner: 0, strength: 1 };
  for (const neighbor of allNeighbors(homeCoord(0, start.config))) {
    const key = coordKey(neighbor);
    if (!(key in board) || key === root || key === theirs) continue;
    if (start.terrain[key] === 'rock') continue;
    // never next to THEIR home: this win is the deck, never a strangle
    if (allNeighbors(homeCoord(1, start.config)).some((n) => coordKey(n) === key)) continue;
    board[key] = { owner: 0, strength: 3 };
  }
  const nearWin: State = {
    ...start,
    board,
    hands: [[], start.hands[1]] as [Card[], Card[]],
    deck: [],
    deckFinal: { first: 0, remaining: 1 },
    phase: 'ACT',
    turnPlayer: 0,
    actor: 0,
    rotPick: null,
    lastResolution: null,
  };
  const sc = scores(nearWin);
  assert(sc[0] > sc[1], 'the fixture is ahead on score');
  assert(legalActions(viewFor(nearWin, 0)).some((a) => a.t === 'EndAct'), 'EndAct is legal in the fixture');
  const settled = apply(nearWin, { t: 'EndAct' });
  assert.equal(settled.phase, 'GAME_OVER', 'the fixture ends on EndAct');
  assert.equal(settled.result?.winner, 0, 'the fixture is a human win');
  const save = encodeSave({ seed: nearWin.seed, actions: [], coach: null, level: 8, base: nearWin, blitz: true, map: 30 });

  const winPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const winErrors: string[] = [];
  winPage.on('pageerror', (e) => winErrors.push(e.message));
  await winPage.addInitScript(([saved]) => {
    localStorage.clear();
    localStorage.setItem('futa05:severgrow.save.v7', saved as string);
    localStorage.setItem('futa05:severgrow.blitz.v1', JSON.stringify({ level: 8, losses: 2 }));
    localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
  }, [save]);
  await winPage.goto(TEST_URL);
  await winPage.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30000 });
  await winPage.waitForSelector('#menu-continue', { state: 'attached', timeout: 20000 });
  // The product menu hides Continue (owner decision); its listener is still bound, and clicking it
  // is exactly the resume path the classic save uses (see the same trick in cut-severe.ts).
  await winPage.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
  await winPage.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 20000 });
  check((await blitz(winPage)).botLevel === 8, 'the seeded game is a Blitz match at bot 8');
  await idle(winPage);
  await winPage.evaluate(() => (window as any).__severgrow.playFor({ t: 'EndAct' }, 0));
  await winPage.waitForSelector('#gameover:not([hidden])', { timeout: 15000 });
  check((await winPage.locator('#gameover').getAttribute('class'))?.includes('won') === true, 'the fixture is won');
  check((await blitz(winPage)).nextBotLevel === 9, 'a win returns the ladder to bot 9');
  check(JSON.stringify(await winPage.evaluate(() => JSON.parse(localStorage.getItem('severgrow.blitz.v1')!))) === JSON.stringify({ level: 9, losses: 0 }), 'the win is persisted');
  assert.deepEqual(winErrors, [], 'no page errors on the win path');
  checks++;
  await winPage.close();

  console.log(`\nblitz: ${checks} checks passed`);
} finally {
  await browser.close();
  await servedA?.server.close();
  await servedB?.server.close();
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
}
