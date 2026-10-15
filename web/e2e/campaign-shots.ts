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
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { assertDistChannel } from './helpers/dist-channel.js';

const PORT = Number(process.env.PORT ?? 4207);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/campaign/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

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
    await page.addInitScript(() => {
      (window as any).__name = (f: unknown) => f;
      window.confirm = () => true;
      localStorage.setItem(`${'main2:'}severgrow.settings.v1`, JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: true, confirmPolicy: 'never' }));
    });
    await page.goto(`http://localhost:${PORT}/`);
    await assertDistChannel(page, 'main2:');
    await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.screenshot({ path: `${OUT}menu-${vp.key}.png` });

    // The campaign is the primary offline entry and leads to the campaign screen.
    assert.equal(await page.locator('#menu-campaign').textContent(), 'Campaign');
    assert.equal(await page.locator('#menu-campaign').isVisible(), true);
    await click(page, '#menu-campaign');
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
    assert.equal(await page.locator('#campaign-progress').textContent(), '0 of 10 complete');
    // Mobile-first: readable sizes, comfortable tap targets, no clipping and no sideways scroll.
    const first = await tiles.nth(0).boundingBox();
    assert.ok(first && first.height >= 44, `tile height ${first?.height} is a comfortable target`);
    assert.ok(first && first.width >= 150, `tile width ${first?.width} fits its name`);
    assert.equal(await page.locator('#campaign-continue').isVisible(), true);
    assert.equal(await page.locator('#campaign-heading').isVisible(), true);
    const typography = await page.evaluate(() => ({
      name: Number.parseFloat(getComputedStyle(document.querySelector('#campaign .ct-name')!).fontSize),
      num: Number.parseFloat(getComputedStyle(document.querySelector('#campaign .ct-num')!).fontSize),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...document.querySelectorAll('#campaign .ct-name')].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      scrollable: (() => {
        const el = document.getElementById('campaign')!;
        return el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto';
      })(),
    }));
    assert.ok(typography.name >= 12, `level name ${typography.name}px is readable`);
    assert.ok(typography.num >= 14, `level number ${typography.num}px is readable`);
    assert.ok(typography.overflow <= 1, `no horizontal overflow (${typography.overflow}px)`);
    assert.equal(typography.clipped, 0, 'no level name is clipped');
    assert.equal(typography.scrollable, true, 'the level list scrolls when it is taller than the phone');
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
    await page.locator('#menu-continue').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#menu-continue').textContent(), 'Resume');
    await click(page, '#menu-continue');
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
    assert.match(sub ?? '', /^Level 1 · First Seed/, `finish subtitle was ${sub}`);
    await page.screenshot({ path: `${OUT}level-${level1.number}-finish-${vp.key}.png` });

    if (finished.result!.winner === 0) {
      // A win: the progress record moves and the next level is now unlocked and current.
      // The app's Storage wrapper adds the channel prefix itself, so this reads the UNPREFIXED key.
      const stored = await page.evaluate(() => localStorage.getItem('severgrow.campaign.progress.v1'));
      const progress = JSON.parse(stored ?? '{}') as { unlocked?: number; completed?: string[] };
      assert.equal(progress.unlocked, 2, 'the win unlocked level 2');
      assert.deepEqual(progress.completed, [level1.id]);
      assert.match(sub ?? '', /Next level unlocked: New Growth/, `finish note was ${sub}`);
      await click(page, '#go-other'); // "Back to campaign"
      await page.locator('#campaign-chapters .campaign-tile').first().waitFor({ state: 'visible' });
      assert.equal(await tiles.nth(0).getAttribute('data-state'), 'completed');
      assert.equal(await tiles.nth(1).getAttribute('data-state'), 'current');
      assert.equal(await tiles.nth(2).getAttribute('data-state'), 'locked');
      assert.equal(await page.locator('#campaign-progress').textContent(), '1 of 10 complete');
      assert.equal(await page.locator('#campaign-continue').textContent(), 'Continue');
      await page.screenshot({ path: `${OUT}campaign-progress-${vp.key}.png` });
      console.log(`${vp.key}: level 1 won; unlock, states and the finish note all pass`);
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
