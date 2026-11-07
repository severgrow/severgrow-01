// FUTASAKU BLITZ — the Practice tier, end to end in Chromium.
//
//   npm run check
//   npx tsx web/e2e/blitz.ts
//
// It builds BOTH builds the feature has to be distinguished in:
//   * CHANNEL=futa04 (the locked product)               -> the BLITZ tier must not exist;
//   * CHANNEL=futa05, served the way /test/ is (composed at /test/) -> BLITZ exists, and it starts a
//     Blitz match with the 0.82 LED stopwatch (21 s a turn, both players' clocks, no Undo / Match
//     Intel / Replay); at 00:00 my turn ends on its own and the match goes on (OWNER CHANGED THE RULE,
//     2026-11-06: was "a timeout loses the match"); drops the bot to 8 after two losses, survives a
//     reload, and returns to 9 after a win.
//
// OWNER CHANGED THE RULE (2026-11-06/07: "it's still a mode in PRACTICE MATCH ... promote to both live
// and test"; "cant see blitz mode in practice"): the same futa05 build at the live ROOT now HAS the tier.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { allNeighbors, apply, coordKey, homeCoord, newMatch, rootCoord, scores } from '../../src/engine/index.js';
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { __blitzErrors?: string[] }).__blitzErrors = errors;
  await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
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
  // 1. The locked product build: no BLITZ tier, no Blitz hook.
  // ---------------------------------------------------------------------------------------------
  servedA = await serveStaticDist(DIST_FUTA04);
  {
    const page = await open(servedA.url);
    await openPractice(page);
    const tiers = await page.locator('#level-grid .difficulty-tile').allTextContents();
    check(JSON.stringify(tiers) === JSON.stringify(['EASY', 'MEDIUM', 'HARD']), 'futa04 Practice has exactly EASY / MEDIUM / HARD');
    check(await page.locator('#level-grid [data-difficulty="pro"]').count() === 0, 'futa04 has no BLITZ tier');
    check((await blitz(page)) === null, 'futa04 has no Blitz hook');
    noErrors(page);
    await page.close();
  }

  // ---------------------------------------------------------------------------------------------
  // 2. BLITZ exists at the live ROOT and on the /test/ copy of the same build.
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
    check(await live.locator('#level-grid [data-difficulty="pro"]').count() === 1, 'the futa05 build at the LIVE ROOT has the BLITZ tier');
    check((await blitz(live)) !== null, 'the futa05 build at the LIVE ROOT has the Blitz hook');
    noErrors(live);
    await live.close();
  }

  const page = await open(TEST_URL);
  await openPractice(page);
  check(await page.locator('#level-grid [data-difficulty="pro"]').count() === 1, '/test/ Practice has the BLITZ tier');
  check((await page.locator('#level-grid .difficulty-tile').allTextContents()).at(-1) === 'BLITZ', 'BLITZ is the last Practice tier');

  // ---------------------------------------------------------------------------------------------
  // 3. Starting: a campaign board 30-70, bot 9, the 21 s LED stopwatch in place of Undo + Match Intel.
  // ---------------------------------------------------------------------------------------------
  await page.click('#level-grid [data-difficulty="pro"]');
  await page.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 30000 });
  const started = await blitz(page);
  check(started.turnMs === 21_000, 'the turn limit is 21 s');
  check(started.botLevel === 9, 'a fresh Blitz match starts at bot 9');
  check(started.nextBotLevel === 9, 'the ladder starts at 9');
  check(started.map >= 30 && started.map <= 70, `the board is a campaign map 30-70 (${started.map})`);
  const map = CAMPAIGN_LEVELS.find((level) => level.number === started.map)!;
  const boardKeys = await page.evaluate(() => Object.keys(((window as any).__severgrow.state() as State).board).sort());
  check(JSON.stringify(boardKeys) === JSON.stringify([...map.config.board!.cells].sort()), 'the board is that campaign level\'s own');

  // My clock runs once my turn is playable.
  await page.waitForFunction(() => {
    const b = (window as any).__severgrow?.blitz?.();
    return !!b && b.deadline !== null && b.side === 'mine' && b.clock?.running;
  }, undefined, { timeout: 30000 });
  const face = await page.evaluate(() => {
    const c = document.getElementById('blitz-clock')!;
    const r = c.getBoundingClientRect();
    const vis = (id: string) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).visibility !== 'hidden' && !e.hidden; };
    return {
      shown: getComputedStyle(c).display !== 'none' && r.width > 40 && r.height > 20,
      text: (window as any).__severgrow.blitz().clock.text as string,
      undo: vis('tool-undo'), intel: vis('futa04-help-button'), replay: vis('tool-replay'),
      ring: !!document.querySelector('.live-ring:not([hidden])'),
    };
  });
  check(face.shown, 'the LED stopwatch frame is on screen');
  check(/^00:(2[01]|1\d)$/.test(face.text), `it reads 00:21 counting down in whole seconds (${face.text})`);
  check(!face.undo && !face.intel && !face.replay, 'no Undo, no Match Intel, no Replay in Blitz');
  check(!face.ring, 'the old ring clock is gone');
  await page.screenshot({ path: '/tmp/blitz-clock-390.png' });
  await page.locator('#smart-panel').screenshot({ path: '/tmp/blitz-clock-panel.png' });

  // RELIABILITY (owner, 2026-11-06: "Make sure the clock never lags never slows down"): with the CPU 4x
  // slower, sample the shown seconds against the real time left for 5 s: never more than 1 behind
  // (a sample can land in the instant the second flips), and every second is shown in turn.
  {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const samples = await page.evaluate(async () => {
      const g = (window as any).__severgrow;
      const out: { shown: number; real: number }[] = [];
      for (let i = 0; i < 40; i++) {
        const b = g.blitz();
        const text = b.clock?.text as string;
        out.push({ shown: Number(text.slice(0, 2)) * 60 + Number(text.slice(3)), real: Math.ceil((b.remainingMs ?? 0) / 1000) });
        await new Promise((r) => setTimeout(r, 125));
      }
      return out;
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const worst = Math.max(...samples.map((x) => x.shown - x.real));
    const seen = new Set(samples.map((x) => x.shown));
    const span = samples[0]!.shown - samples.at(-1)!.shown;
    check(worst <= 1 && samples.every((x) => x.shown >= x.real), `at 4x slower CPU the clock is never behind real time by more than the flip instant (worst ${worst})`);
    check(seen.size >= span, `every second is shown in turn, none skipped (${[...seen].join(',')})`);
  }

  // Pressure: amber at 5 s, red at 3 s.
  await page.waitForFunction(() => (window as any).__severgrow.blitz().clock?.stage === 'amber', undefined, { timeout: 25000 });
  check(true, 'the clock turns amber in the last 5 s');
  await page.waitForFunction(() => (window as any).__severgrow.blitz().clock?.stage === 'red', undefined, { timeout: 5000 });
  check(true, 'and red in the last 3 s');
  await page.screenshot({ path: '/tmp/blitz-clock-red-390.png' });
  await page.locator('#smart-panel').screenshot({ path: '/tmp/blitz-clock-panel-red.png' });

  // 00:00: my turn ends on its own (lowest card thrown), the match goes on, THEIR clock runs.
  await page.waitForFunction(() => (window as any).__severgrow.blitz().timeouts === 1, undefined, { timeout: 8000 });
  await page.waitForFunction(() => {
    const g = (window as any).__severgrow;
    return g.state().turnPlayer === 1 || g.blitz().side === 'theirs';
  }, undefined, { timeout: 8000 });
  check(await page.locator('#gameover:not([hidden])').count() === 0, 'a timeout does not end the match');
  const t0 = (await blitz(page)).tempo;
  check(JSON.stringify(t0) === '[0]', `the timed-out turn counts 0 s of tempo (${JSON.stringify(t0)})`);
  await page.waitForFunction(() => (window as any).__severgrow.blitz().side === 'theirs', undefined, { timeout: 8000 }).catch(() => undefined);
  if ((await blitz(page)).side === 'theirs') await page.locator('#smart-panel').screenshot({ path: '/tmp/blitz-clock-panel-opp.png' });
  // the turn comes back to me with a fresh 21 s
  await page.waitForFunction(() => {
    const b = (window as any).__severgrow.blitz();
    return b.side === 'mine' && b.remainingMs !== null && b.remainingMs > 18_000;
  }, undefined, { timeout: 30000 });
  check(true, 'the next turn starts with a fresh 21 s');
  check(JSON.stringify(await page.evaluate(() => localStorage.getItem('severgrow.blitz.v1'))) === 'null', 'a timeout records nothing on the ladder');
  noErrors(page);
  await page.close();

  // ---------------------------------------------------------------------------------------------
  // 4. Two losses in a row drop the next match to bot 8; the drop survives a reload.
  //    (A loss is a real finished match: a near-loss save, one empty-handed EndAct from the end.)
  // ---------------------------------------------------------------------------------------------
  const endFixture = (winner: 0 | 1): string => {
    const level = CAMPAIGN_LEVELS.find((l) => l.number === 30)!;
    const start = newMatch(913_300, level.config);
    const owner = winner;
    const root = coordKey(rootCoord(owner, 'ring2', start.config.boardRadius));
    const theirs = coordKey(rootCoord(owner === 0 ? 1 : 0, 'ring2', start.config.boardRadius));
    const board = { ...start.board };
    board[root] = { ...board[root]!, owner, strength: 1 };
    for (const neighbor of allNeighbors(homeCoord(owner, start.config))) {
      const key = coordKey(neighbor);
      if (!(key in board) || key === root || key === theirs) continue;
      if (start.terrain[key] === 'rock') continue;
      if (allNeighbors(homeCoord(owner === 0 ? 1 : 0, start.config)).some((n) => coordKey(n) === key)) continue;
      board[key] = { owner, strength: 3 };
    }
    const near: State = { ...start, board, hands: [[], start.hands[1]] as [Card[], Card[]], deck: [], deckFinal: { first: 0, remaining: 1 }, phase: 'ACT', turnPlayer: 0, actor: 0, rotPick: null, lastResolution: null };
    const sc = scores(near);
    assert(winner === 0 ? sc[0] > sc[1] : sc[1] > sc[0], `the fixture is ${winner === 0 ? 'a win' : 'a loss'} on score`);
    const settled = apply(near, { t: 'EndAct' });
    assert.equal(settled.phase, 'GAME_OVER', 'the fixture ends on EndAct');
    assert.equal(settled.result?.winner, winner, 'the fixture ends as planned');
    return encodeSave({ seed: near.seed, actions: [], coach: null, level: 9, base: near, blitz: true, map: 30 });
  };
  const playFixture = async (save: string, ladder: object): Promise<Page> => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errs: string[] = [];
    p.on('pageerror', (e) => errs.push(e.message));
    (p as Page & { __blitzErrors?: string[] }).__blitzErrors = errs;
    await p.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
    await p.addInitScript(([saved, lad]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('futa05-test:severgrow.save.v7', saved as string);
      localStorage.setItem('futa05-test:severgrow.blitz.v1', lad as string);
      localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
    }, [save, JSON.stringify(ladder)]);
    await p.goto(TEST_URL);
    await p.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30000 });
    await p.waitForSelector('#menu-continue', { state: 'attached', timeout: 20000 });
    await p.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
    await p.waitForFunction(() => (window as any).__severgrow?.blitz?.()?.active === true, undefined, { timeout: 20000 });
    await idle(p);
    await p.evaluate(() => (window as any).__severgrow.playFor({ t: 'EndAct' }, 0));
    await p.waitForSelector('#gameover:not([hidden])', { timeout: 15000 });
    return p;
  };
  {
    const lost = await playFixture(endFixture(1), { level: 9, losses: 1 });
    check((await lost.locator('#gameover').getAttribute('class'))?.includes('lost') === true, 'the fixture is lost');
    check((await blitz(lost)).nextBotLevel === 8, 'two losses in a row drop the next Blitz game to bot 8');
    check(JSON.stringify(await lost.evaluate(() => JSON.parse(localStorage.getItem('severgrow.blitz.v1')!))) === JSON.stringify({ level: 8, losses: 2 }), 'the drop is persisted');
    check(await lost.locator('#go-replay').evaluate((e) => getComputedStyle(e).visibility === 'hidden' || (e as HTMLElement).hidden), 'the finish card offers no replay in Blitz');
    await lost.reload();
    await lost.waitForFunction(() => !!(window as any).__severgrow?.blitz?.(), undefined, { timeout: 30000 });
    check((await blitz(lost)).nextBotLevel === 8, 'after a reload the next Blitz game is still bot 8');
    noErrors(lost);
    await lost.close();
  }

  // ---------------------------------------------------------------------------------------------
  // 5. A win returns the ladder to 9.
  // ---------------------------------------------------------------------------------------------
  {
    const won = await playFixture(endFixture(0), { level: 8, losses: 2 });
    check((await won.locator('#gameover').getAttribute('class'))?.includes('won') === true, 'the fixture is won');
    check((await blitz(won)).nextBotLevel === 9, 'a win returns the ladder to bot 9');
    check(JSON.stringify(await won.evaluate(() => JSON.parse(localStorage.getItem('severgrow.blitz.v1')!))) === JSON.stringify({ level: 9, losses: 0 }), 'the win is persisted');
    noErrors(won);
    await won.close();
  }

  console.log(`\nblitz: ${checks} checks passed`);
} finally {
  await browser.close();
  await servedA?.server.close();
  await servedB?.server.close();
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
}
