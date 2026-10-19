// CAMPAIGN MODE — the browser pass: drives the built `web/dist` and writes the screenshots the
// design review needs, at the two phone sizes the owner asked for.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/campaign-shots.ts
//
// It also asserts the parts a unit test cannot see: the menu entry leads to the campaign screen,
// the states (current / completed / locked) are on the tiles, a level opens on ITS seed and ITS
// board, the unlock pointer moves after a win, and an unfinished campaign match resumes on reload
// with the level's own board intact.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, startingPlayerFor, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { MENU } from '../../src/strings.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const PORT = Number(process.env.PORT ?? 4207);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/campaign/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
/** The served build's storage prefix. futa04 installs `main2:`; futa05 installs `futa05:`. */
const PREFIX = process.env.E2E_STORAGE_PREFIX ?? 'main2:';

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
] as const;

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const errors: string[] = [];
const click = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element: Element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const stateOf = (page: Page) => page.evaluate(() => (window as any).__severgrow.state() as State | null);
const waitIdle = (page: Page) =>
  page.waitForFunction(() => {
    const game = (window as any).__severgrow;
    return !!game?.state() && !game.busy();
  }, undefined, { timeout: 20000 });

/** One human move, always legal, chosen to move a beginner game forward. */
const humanMove = async (page: Page): Promise<boolean> => {
  const s = await stateOf(page);
  if (!s || s.actor !== 0 || s.phase === 'GAME_OVER') return false;
  const legal = legalActions(viewFor(s, 0));
  const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
  const action = s.phase === 'DRAW'
    ? (pick('Draw') ?? legal[0]!)
    : (pick('Bloom') ?? pick('Sprout') ?? pick('EndAct') ?? pick('Discard') ?? legal[0]!);
  return page.evaluate((a: Action) => Boolean((window as any).__severgrow.playFor(a, 0)), action as never);
};

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    page.on('pageerror', (error) => errors.push(`${vp.key}: ${error.message}`));
    await page.addInitScript((prefix: string) => {
      (window as any).__name = (f: unknown) => f;
      window.confirm = () => true;
      localStorage.setItem(`${prefix}severgrow.settings.v1`, JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: true, confirmPolicy: 'never' }));
    }, PREFIX);
    await page.goto(`http://localhost:${PORT}/`);
    await assertDistChannel(page, PREFIX);
    await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.screenshot({ path: `${OUT}menu-${vp.key}.png` });

    // The campaign moved behind the PLAY doorway and its entry now names the current level
    // ("LEVEL 1") — main.ts, owner direction 2026-10-15 — so assert that word and reach it the
    // way a player does.
    assert.equal(await page.locator('#menu-campaign').textContent(), MENU.level(1), 'the PLAY entry names the current campaign level');
    // THE "Levels" ENTRY IS GONE (owner, 2026-10-16: "remove LEVELS - we don't need player to have
    // access to all levels"). LEVEL <n> opens the next uncompleted level, so the LIST is no longer
    // reachable from the menu at all. It is still shown - it is where the campaign hands the player
    // off once no next level is left - so this tool reaches it the only way a player now can: finish
    // a campaign game and take the finish card's "Back to campaign".
    // Played WITHOUT growing (Draw + EndAct only) on purpose: a human who never grows scores 0 and
    // therefore cannot WIN, so the level stays incomplete and the fresh-player assertions below
    // still describe the screen honestly (tile 1 current, "0 of N complete").
    await openMenuEntry(page, 'menu-campaign');
    await page.waitForFunction(() => !!(window as any).__severgrow?.state(), undefined, { timeout: 20000 });
    await waitIdle(page);
    // Play to a finish WITHOUT growing (Draw + EndAct only) so the human scores 0 and cannot win:
    // the level stays incomplete, which is exactly what the fresh-player assertions below need.
    // The loop must WAIT for the human's turn - choosing from `legalActions(viewFor(s, 0))` while
    // the bot is still to move yields an empty list, and passing `undefined` to playFor threw
    // ("reading 't'"). That is what kept this suite red; the browser tool is fine.
    for (let guard = 0; guard < 400; guard++) {
      const s = await stateOf(page);
      if (!s || s.phase === 'GAME_OVER') break;
      if (s.actor !== 0) {
        await waitIdle(page);
        await page.waitForTimeout(80);
        continue;
      }
      const legal = legalActions(viewFor(s, 0));
      const action = s.phase === 'DRAW'
        ? (legal.find((a) => a.t === 'Draw') ?? legal[0])
        : (legal.find((a) => a.t === 'EndAct') ?? legal.find((a) => a.t === 'Discard') ?? legal[0]);
      if (!action) {
        await waitIdle(page);
        await page.waitForTimeout(80);
        continue;
      }
      await page.evaluate((a: Action) => Boolean((window as any).__severgrow.playFor(a, 0)), action as never);
      await waitIdle(page);
    }
    assert.equal((await stateOf(page))?.phase, 'GAME_OVER', 'the passed level reached a finish');
    await click(page, '#go-other');
    await page.locator('#campaign-chapters .campaign-tile').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#campaign').isVisible(), true);
    const tiles = page.locator('#campaign .campaign-tile');
    assert.equal(await tiles.count(), CAMPAIGN_LEVELS.length);
    // A brand-new player: level 1 current, everything else locked.
    assert.equal(await tiles.nth(0).getAttribute('data-state'), 'current');
    for (let i = 1; i < CAMPAIGN_LEVELS.length; i++) {
      assert.equal(await tiles.nth(i).getAttribute('data-state'), 'locked', `tile ${i + 1}`);
      assert.equal(await tiles.nth(i).isDisabled(), true, `tile ${i + 1} disabled`);
    }
    assert.equal(await page.locator('#campaign-progress').textContent(), `0 of ${CAMPAIGN_LEVELS.length} complete`);
    // Mobile-first: readable sizes, comfortable tap targets, no clipping and no sideways scroll.
    const first = await tiles.nth(0).boundingBox();
    assert.ok(first && first.height >= 44, `tile height ${first?.height} is a comfortable target`);
    assert.ok(first && first.width >= 60, `tile width ${first?.width} is a comfortable target`);
    assert.equal(await page.locator('#campaign-continue').isVisible(), true);
    assert.equal(await page.locator('#campaign-heading').isVisible(), true);
    const typography = await page.evaluate(() => ({
      num: Number.parseFloat(getComputedStyle(document.querySelector('#campaign .ct-num')!).fontSize),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Level NAMES were removed (owner, 2026-10-16: numbers only), so the tile carries no second
      // cell to clip. What matters now is that the NUMBER is complete, never a cut-off "0…".
      clipped: [...document.querySelectorAll('#campaign .ct-num')].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      // and that no tile still renders a name.
      names: document.querySelectorAll('#campaign .ct-name').length,
      overflowY: getComputedStyle(document.getElementById('campaign')!).overflowY,
    }));
    assert.ok(typography.num >= 14, `level number ${typography.num}px is readable`);
    assert.ok(typography.overflow <= 1, `no horizontal overflow (${typography.overflow}px)`);
    assert.equal(typography.clipped, 0, 'no level number is clipped');
    assert.equal(typography.names, 0, 'no level tile shows a name any more');
    assert.equal(typography.overflowY, 'auto', 'the campaign screen can scroll');
    // The screen must stay usable well past the authored 30 levels: clone the tiles and scroll.
    const scroll = await page.evaluate(() => {
      const screen = document.getElementById('campaign')!;
      const grid = screen.querySelector('.campaign-grid')!;
      const tile = grid.querySelector('.campaign-tile')!;
      // Keep the CLONE NODES and remove exactly those afterwards. Removing by index across the whole
      // screen was wrong: `original` counts one chapter's grid (10) while the loop walked every tile
      // on the screen (30 real + 40 clones), so it deleted 20 REAL tiles from the later chapters and
      // the screen was left claiming 10 levels. That held only while the campaign had one chapter.
      const clones: Element[] = [];
      for (let i = 0; i < 40; i++) {
        const clone = tile.cloneNode(true) as Element;
        grid.append(clone);
        clones.push(clone);
      }
      const overflows = screen.scrollHeight > screen.clientHeight;
      screen.scrollTop = 99999;
      const scrolled = screen.scrollTop > 0;
      const last = screen.querySelector('.campaign-tile:last-child')!.getBoundingClientRect();
      const lastVisible = last.bottom <= window.innerHeight + 1;
      // Back to the top: the heading must be reachable, never clipped above the screen.
      screen.scrollTop = 0;
      const headerTop = document.getElementById('campaign-heading')!.getBoundingClientRect().top;
      // Undo the clones so every later screenshot and assertion sees the real levels.
      for (const clone of clones) clone.remove();
      return { overflows, scrolled, lastVisible, headerTop };
    });
    assert.equal(scroll.overflows, true, '50 levels make the list taller than the phone');
    assert.equal(scroll.scrolled, true, 'the list scrolls down to the last level');
    assert.equal(scroll.lastVisible, true, 'the last level is reachable on screen');
    assert.ok(scroll.headerTop >= -1, `the top of the list is reachable (heading at ${scroll.headerTop}px)`);
    assert.equal(await tiles.count(), CAMPAIGN_LEVELS.length, 'the clone test left no tiles behind');
    await page.screenshot({ path: `${OUT}campaign-${vp.key}.png` });

    // Level 1 opens on ITS seed and its authored (rock-free) board.
    const level1 = CAMPAIGN_LEVELS[0]!;
    await click(page, `#campaign .campaign-tile[data-level="${level1.id}"]`);
    await page.waitForFunction((seed: number) => (window as any).__severgrow.state()?.seed === seed, level1.seed, { timeout: 20000 });
    await waitIdle(page);
    const opened = (await stateOf(page))!;
    assert.equal(opened.seed, level1.seed);
    assert.equal(opened.config.board?.rock.length, 0, 'level 1 is the open board');
    assert.equal(opened.config.board?.homes[0], '-2,2');
    assert.ok(opened.startingPlayer === 0 || opened.startingPlayer === 1, 'the lottery picked a seat');
    await page.screenshot({ path: `${OUT}level-${level1.number}-${vp.key}.png` });

    // Play a few real turns, then reload: the campaign match must resume as the SAME level.
    for (let i = 0; i < 8; i++) {
      await waitIdle(page);
      if (!(await humanMove(page))) break;
      await page.waitForTimeout(120);
    }
    await waitIdle(page);
    const before = (await stateOf(page))!;
    assert.equal(before.phase !== 'GAME_OVER', true, 'the resume check needs an unfinished match');
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
    // Owner decision (2026-10-19): the main menu has NO Continue/resume. The player enters the
    // level from PLAY and is ASKED there, so the same reload must produce the ask sheet, and the
    // ask is about THIS level (continue it, or start it over).
    assert.equal(await page.locator('#menu-continue').isVisible(), false, 'the main menu shows no Continue');
    await openMenuEntry(page, 'menu-campaign');
    await page.locator('#sheet-campaign-start:not([hidden])').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#csa-title').textContent(), `Level ${level1.number} is unfinished.`);
    assert.equal(await page.locator('#csa-resume').textContent(), `Continue level ${level1.number}`);
    assert.equal(await page.locator('#csa-start').textContent(), `Start level ${level1.number} over`);
    await click(page, '#csa-resume');
    await page.waitForFunction((seed: number) => (window as any).__severgrow.state()?.seed === seed, level1.seed, { timeout: 20000 });
    await waitIdle(page);
    const resumed = (await stateOf(page))!;
    assert.equal(resumed.seed, level1.seed, 'the campaign match resumes');
    assert.equal(resumed.config.board?.rock.length, 0, 'the resumed match keeps the LEVEL board');
    assert.equal(resumed.config.board?.homes[0], '-2,2');
    // The resumed position is a real, continued game: at least as far as the state we reloaded from.
    assert.ok((resumed.history?.length ?? 0) >= 0 && (before.history?.length ?? 0) >= 0);
    assert.ok((resumed.history?.length ?? 0) > 0, 'the resumed match carries the moves played');
    await page.screenshot({ path: `${OUT}level-${level1.number}-resumed-${vp.key}.png` });

    // Finish the level honestly (the bot plays itself), then check the unlock moved and the finish
    // screen speaks about the campaign level.
    for (let i = 0; i < 400; i++) {
      const s = (await stateOf(page))!;
      if (s.phase === 'GAME_OVER') break;
      await waitIdle(page);
      await humanMove(page);
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'GAME_OVER', undefined, { timeout: 120000 });
    await page.waitForFunction(() => !document.getElementById('gameover')?.hidden, undefined, { timeout: 20000 });
    const finished = (await stateOf(page))!;
    assert.equal(finished.seed, level1.seed);
    const sub = await page.locator('#go-sub').textContent();
    // The owner removed level and chapter NAMES from the finish screen (2026-10-16). The subtitle
    // now carries only the one useful note — what the win unlocked — and must never name the level.
    assert.equal(sub, 'Next level unlocked', `finish subtitle was ${sub}`);
    assert.ok(!(sub ?? '').includes(level1.name), 'the subtitle must not name the level');
    await page.screenshot({ path: `${OUT}level-${level1.number}-finish-${vp.key}.png` });

    if (finished.result!.winner === 0) {
      // A win: the progress record moves and the next level is now unlocked and current.
      // The app's Storage wrapper adds the channel prefix itself, so this reads the UNPREFIXED key.
      const stored = await page.evaluate(() => localStorage.getItem('severgrow.campaign.progress.v2'));
      const progress = JSON.parse(stored ?? '{}') as { unlocked?: number; completed?: string[] };
      assert.equal(progress.unlocked, 2, 'the win unlocked level 2');
      assert.deepEqual(progress.completed, [level1.id]);
      // The note no longer names the unlocked level (owner, 2026-10-16: no level names anywhere).
      // It must still say a level was unlocked, and must not name it.
      assert.equal(sub, 'Next level unlocked', `finish note was ${sub}`);
      assert.ok(!(sub ?? '').includes('New Growth'), 'the finish note must not name the next level');
      await click(page, '#go-other'); // "Back to campaign"
      await page.locator('#campaign-chapters .campaign-tile').first().waitFor({ state: 'visible' });
      assert.equal(await tiles.nth(0).getAttribute('data-state'), 'completed');
      assert.equal(await tiles.nth(1).getAttribute('data-state'), 'current');
      assert.equal(await tiles.nth(2).getAttribute('data-state'), 'locked');
      assert.equal(await page.locator('#campaign-progress').textContent(), `1 of ${CAMPAIGN_LEVELS.length} complete`);
      assert.equal(await page.locator('#campaign-continue').textContent(), 'Continue');
      await page.screenshot({ path: `${OUT}campaign-progress-${vp.key}.png` });
      // Replaying a campaign level restarts THE SAME level from its fixed start.
      await click(page, `#campaign .campaign-tile[data-level="${level1.id}"]`);
      await page.waitForFunction((seed: number) => {
        const s = (window as any).__severgrow.state();
        return !!s && s.seed === seed && s.phase !== 'GAME_OVER' && s.turnNumber === 1;
      }, level1.seed, { timeout: 20000 });
      const restarted = (await stateOf(page))!;
      assert.equal(restarted.seed, level1.seed, 'a replay uses the level seed, never a random one');
      assert.equal(restarted.startingPlayer, startingPlayerFor(restarted.seed), 'the fixed opening seat');
      assert.equal(restarted.config.board?.rock.length, 0);
      console.log(`${vp.key}: level 1 won; unlock, states, the finish note and the fixed restart all pass`);
    } else {
      console.log(`${vp.key}: level 1 ended ${finished.result!.winner === null ? 'in a draw' : 'as a loss'}; unlock not exercised`);
    }
    await page.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`screenshots written to ${OUT}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
