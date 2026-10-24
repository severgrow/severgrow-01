// THE LEVEL FLOW (owner, 2026-10-24), driven as a player:
//
//   1. Play level 23 to its finish card, take "Back to levels", and prove the list opens on the
//      player's PLACE (the current tile is in view, the head/Continue are still there).
//   2. Replay level 1 from that list, win it, and prove the card leads back to the levels (never
//      "Next level") and that the place is still 24 — a replay moves nothing.
//   3. Leave a level-1 replay unfinished, return to PLAY, and prove the entry opens the PLACE (24),
//      not the replay save's level 1.
//   4. Settings → Tutorial: the first nine levels, replayed through the campaign's own data. Prove
//      the seed/config are the campaign's, the progress record is byte-identical afterwards, and the
//      finish card returns to the Tutorial.
//
//   CHANNEL=futa04 "$NODE" node_modules/vite/bin/vite.js build --config web/vite.config.ts
//   "$NODE" node_modules/tsx/dist/cli.mjs web/e2e/level-flow.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { lessonFor, lessonOpening } from '../src/lessons/lessons.js';
import { servePreview } from './helpers/preview-port.js';

const OUT = '/tmp/levelflow';
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PREFIX = 'main2:';
// Storage is PREFIXED AT BUILD TIME (`web/src/channel.ts` wraps Storage.prototype):
//   - the init script runs BEFORE that wrapper, so it must write the already-prefixed key;
//   - every read inside the running page goes through the wrapper, so it names the BARE key.
const KEY_PROGRESS = 'severgrow.campaign.progress.v3';
const KEY_SAVE = 'severgrow.campaign.save.v3';
const SEED_PROGRESS_KEY = `${PREFIX}${KEY_PROGRESS}`;
const PLACE = 23;
const level = (n: number) => CAMPAIGN_LEVELS[n - 1]!;
/**
 * The seed the MATCH really opens on. Levels 1-10 are lessons and open from their authored position
 * (`lessonOpening`), exactly as the campaign plays them; every other level opens on its own seed.
 */
const openSeed = (n: number): number => {
  const lesson = lessonFor(n);
  return lesson ? lessonOpening(lesson).seed : level(n).seed;
};

const served = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const errors: string[] = [];
const check = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  console.log(`  ok  ${what}`);
};

/** The device a returning player has: levels 1-22 won, level 23 is the place. */
const seedDevice = async (page: Page) => {
  await page.addInitScript(({ key, ids }) => {
    localStorage.setItem('main2:severgrow.seen', '1');
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, speed: 'fast', reduceMotion: true, autoSkip: true, confirmPolicy: 'never' }));
    localStorage.setItem(key, JSON.stringify({ version: 1, unlocked: 23, completed: ids, best: {} }));
  }, { key: SEED_PROGRESS_KEY, ids: CAMPAIGN_LEVELS.slice(0, PLACE - 1).map((l) => l.id) });
};

const state = (p: Page) => p.evaluate(() => (window as any).__severgrow?.state?.() ?? null) as Promise<State | null>;
const waitIdle = (p: Page) => p.waitForFunction(() => {
  const hook = (window as any).__severgrow;
  return !!hook?.state?.() && !hook.busy();
}, undefined, { timeout: 30000 });
const click = (p: Page, selector: string) => p.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), selector);
const dismissInstall = (p: Page) => p.evaluate(() => {
  for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
  const prompt = document.getElementById('install-prompt');
  if (prompt && !prompt.hidden) prompt.hidden = true;
});

/** The same move, as the engine would compare it (display coordinates, no hidden state). */
const sameAction = (a: Action, b: Action): boolean =>
  JSON.stringify([a.t, 'card' in a ? a.card : null, 'cards' in a ? a.cards : null, 'coord' in a ? a.coord : null, 'hexes' in a ? a.hexes : null])
  === JSON.stringify([b.t, 'card' in b ? b.card : null, 'cards' in b ? b.cards : null, 'coord' in b ? b.coord : null, 'hexes' in b ? b.hexes : null]);

const playToEnd = async (p: Page, n: number): Promise<{ winner: number | null; reason: string }> => {
  const botLevel = level(n).botLevel;
  for (let guard = 0; guard < 500; guard++) {
    const s = await state(p);
    if (!s) throw new Error('no game state');
    if (s.phase === 'GAME_OVER') return { winner: s.result?.winner ?? null, reason: s.result?.reason ?? '?' };
    if (s.actor !== 0) { await waitIdle(p); await p.waitForTimeout(40); continue; }
    // One move. The phase can step between this read and the press, so a refused pick is re-read
    // from the page rather than guessed at.
    let played = false;
    let diag: unknown = null;
    for (let attempt = 0; attempt < 3 && !played; attempt++) {
      const now = attempt === 0 ? s : await state(p);
      if (!now || now.phase === 'GAME_OVER' || now.actor !== 0) break;
      const v = viewFor(now, 0);
      // What the PAGE offers, not what the engine would: a lesson narrows the menu (`session.allow`,
      // e.g. no Bloom before it is taught), and the session refuses anything outside that menu.
      const offered = await p.evaluate(() => ((window as any).__severgrow.legal?.() ?? []) as Action[]);
      const legal = offered.length ? offered : legalActions(v);
      if (!legal.length) throw new Error(`L${n}: no legal move`);
      const first = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
      let action: Action;
      if (now.phase === 'DRAW') action = first('Draw') ?? legal[0]!;
      else if (now.phase === 'DISCARD') action = first('Discard') ?? legal[0]!;
      else {
        const chosen = chooseLevelAction(v, botLevel, botSeed(now.seed, botLevel, now.turnNumber, now.history?.length ?? 0));
        action = legal.find((a) => sameAction(a, chosen))
          ?? first('Bloom') ?? first('Sprout') ?? first('PlayFruit') ?? first('EndAct') ?? legal[0]!;
      }
      played = await p.evaluate((a) => !!(window as any).__severgrow.playFor(a, 0), action);
      if (!played) {
        diag = await p.evaluate((a) => {
          const h = (window as any).__severgrow;
          const st = h.state();
          return { phase: st.phase, actor: st.actor, action: a, legal: h.legal?.(), busy: h.busy(), selected: h.sel?.() };
        }, action);
        await p.waitForTimeout(120);
      }
    }
    if (!played) throw new Error(`L${n}: the page refused ${JSON.stringify(diag)}`);
    await waitIdle(p);
  }
  throw new Error(`L${n}: never finished`);
};

/** Wait for a fresh match on this seed (the old session is still on screen until its start lands). */
const waitSeed = async (p: Page, seed: number) => {
  try {
    await p.waitForFunction((s) => (window as any).__severgrow?.state?.()?.seed === s, seed, { timeout: 20000 });
  } catch (error) {
    const dump = await p.evaluate((k) => {
      const h = (window as any).__severgrow;
      const st = h?.state?.();
      return {
        seed: st?.seed ?? null, phase: st?.phase ?? null, lesson: h?.lesson?.()?.level ?? null,
        campaignHidden: (document.getElementById('campaign') as HTMLElement).hidden,
        gameHidden: (document.getElementById('game') as HTMLElement).hidden,
        gameoverHidden: (document.getElementById('gameover') as HTMLElement).hidden,
        save: (localStorage.getItem(k) ?? '').slice(0, 80),
        tiles: document.querySelectorAll('.campaign-tile').length,
      };
    }, KEY_SAVE);
    await p.screenshot({ path: `${OUT}/fail-seed.png` });
    throw new Error(`seed ${seed} never started: ${JSON.stringify(dump)} (${String(error)})`);
  }
};

const progressRaw = (p: Page) => p.evaluate((k) => localStorage.getItem(k), KEY_PROGRESS);
/** A lesson's opening stage takes ~1.2 s and keeps the HUD from opening the pause plate. */
const waitLessonStage = (p: Page) => p.waitForFunction(() => {
  const lesson = (window as any).__severgrow?.lesson?.();
  return !lesson || !lesson.stage;
}, undefined, { timeout: 10000 }).catch(() => undefined);
const currentTileInView = (p: Page) => p.evaluate(() => {
  const chapters = document.getElementById('campaign-chapters')!;
  const tile = chapters.querySelector<HTMLElement>('.campaign-tile[data-state="current"]');
  if (!tile) return null;
  const t = tile.getBoundingClientRect();
  const c = chapters.getBoundingClientRect();
  return {
    label: tile.getAttribute('aria-label'),
    visible: t.top >= c.top - 1 && t.bottom <= c.bottom + 1,
    scrollTop: chapters.scrollTop,
    headVisible: (() => { const h = document.querySelector<HTMLElement>('#campaign .levels-head')!.getBoundingClientRect(); return h.top >= 0 && h.bottom <= innerHeight; })(),
  };
});

try {
  // ---------- 1-3: the campaign's return path ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await seedDevice(page);
  await page.goto(served.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
  await page.locator('#menu').waitFor({ state: 'visible' });
  await dismissInstall(page);

  await click(page, '#menu-play');
  await page.waitForSelector('#menu-campaign:not([hidden])');
  check((await page.textContent('#menu-campaign'))?.trim() === 'LEVEL 23', 'the PLAY entry names the place (LEVEL 23)');
  await click(page, '#menu-campaign');
  await waitSeed(page, openSeed(PLACE));
  check(true, 'PLAY opens level 23 on its own seed');

  const end = await playToEnd(page, PLACE);
  // A loss is the owner's own report; a win is the same return path one level further on. Either
  // way the list must open on the PLACE that the result left behind.
  const placeAfter = end.winner === 0 ? PLACE + 1 : PLACE;
  check(end.winner === 0 || end.winner === 1, `level 23 finished (${end.reason})`);
  await page.waitForSelector('#gameover:not([hidden])');
  check((await page.textContent('#go-title'))?.includes(`Level ${PLACE}`) === true, 'the finish card names level 23');
  check((await page.textContent('#go-rematch'))?.trim() === (end.winner === 0 ? 'Next level' : 'Try again'), 'a normal campaign finish still leads with Next level (or Try again after a loss)');
  await dismissInstall(page);
  await click(page, '#go-other'); // Back to levels
  await page.waitForSelector('#campaign:not([hidden])');
  const anchored = await currentTileInView(page);
  check(anchored?.label === `Level ${placeAfter}. You are here.`, `the list opens on the place after the level (${anchored?.label})`);
  check(!!anchored?.visible && anchored.scrollTop > 0, `the current tile is scrolled into view (scrollTop ${anchored?.scrollTop})`);
  check(!!anchored?.headVisible, 'the head (Back) stays visible above the scrolled chapters');
  await page.screenshot({ path: `${OUT}/campaign-return-390x844.png` });

  // Replay level 1 from the list.
  await click(page, '.campaign-tile[data-level="c1-01"]');
  await waitSeed(page, openSeed(1));
  const replayState = await state(page);
  check(replayState?.seed === openSeed(1), "the level-1 replay opens the campaign's own level 1 position");
  const endReplay = await playToEnd(page, 1);
  check(endReplay.winner === 0, `the level-1 replay is won (${endReplay.reason})`);
  await page.waitForSelector('#gameover:not([hidden])');
  check((await page.textContent('#go-rematch'))?.trim() === 'Back to levels', 'a won REPLAY leads back to the levels, never "Next level"');
  check(await page.evaluate(() => (document.getElementById('go-other') as HTMLElement).hidden) === true, 'the replay card has no second level-list action');
  const afterReplay = JSON.parse((await progressRaw(page)) ?? 'null') as { completed: string[]; unlocked: number };
  check(afterReplay.completed.length === 22 + (placeAfter - PLACE) && afterReplay.completed.includes('c3-23'), `the replay added no completion and kept level 23 won (${JSON.stringify(afterReplay)})`);
  await dismissInstall(page);
  await click(page, '#go-rematch');
  await page.waitForSelector('#campaign:not([hidden])');
  const anchored2 = await currentTileInView(page);
  check(anchored2?.label === `Level ${placeAfter}. You are here.`, `the replay returns to the same place (Level ${placeAfter})`);
  await page.screenshot({ path: `${OUT}/replay-return-390x844.png` });

  // Leave a level-1 replay unfinished, then return through PLAY.
  await click(page, '.campaign-tile[data-level="c1-01"]');
  await waitSeed(page, openSeed(1));
  await waitIdle(page);
  await waitLessonStage(page);
  await click(page, '#hud-menu');
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 10000 });
  await click(page, '#gm-main');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10000 });
  const stale = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as { levelId?: string } | null, KEY_SAVE);
  check(stale?.levelId === 'c1-01', 'an unfinished replay save names level 1');
  await click(page, '#menu-play');
  await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
  check((await page.textContent('#menu-campaign'))?.trim() === `LEVEL ${placeAfter}`, `the PLAY entry still names the place (LEVEL ${placeAfter})`);
  const askOpen = await page.evaluate(() => !(document.getElementById('sheet-campaign-start') as HTMLElement).hidden);
  check(!askOpen, 'PLAY does not ask to resume the replay');
  await click(page, '#menu-campaign');
  await waitSeed(page, openSeed(placeAfter));
  check(true, `PLAY opens the place (level ${placeAfter}), never the replay save behind it`);

  // ---------- 4: Settings → Tutorial ----------
  await waitIdle(page);
  await waitLessonStage(page);
  await click(page, '#hud-menu');
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 10000 });
  await click(page, '#gm-main');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10000 });
  const beforeTutorial = await progressRaw(page);
  await click(page, '#menu-settings');
  await page.waitForSelector('#sheet-settings:not([hidden])');
  await click(page, '#settings-tutorial');
  await page.waitForSelector('#sheet-tutorial:not([hidden])');
  const tiles = await page.evaluate(() => [...document.querySelectorAll('#tutorial-levels .campaign-tile')].map((t) => t.getAttribute('aria-label')));
  check(tiles.length === 9, `the Tutorial offers nine levels (${tiles.length})`);
  check(tiles[0] === 'Level 1. Play the tutorial lesson.' && tiles[8] === 'Level 9. Play the tutorial lesson.', 'the tiles are the campaign levels 1-9');
  await page.screenshot({ path: `${OUT}/tutorial-picker-390x844.png` });

  const saveBeforeTutorial = await page.evaluate((k) => localStorage.getItem(k), KEY_SAVE);
  await click(page, '#tutorial-levels .campaign-tile:nth-child(3)');
  await waitSeed(page, openSeed(3));
  const tut = await state(page);
  check(tut?.seed === openSeed(3), "the tutorial opens the campaign's own level 3 position");
  const lessonLevel = await page.evaluate(() => (window as any).__severgrow.lesson?.()?.level);
  check(lessonLevel === 3, 'the tutorial plays level 3 with its campaign lesson');
  const saveDuringTutorial = await page.evaluate((k) => localStorage.getItem(k), KEY_SAVE);
  check(saveDuringTutorial === saveBeforeTutorial, 'the tutorial leaves the campaign resume save untouched');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/tutorial-in-play-390x844.png` });

  const tutEnd = await playToEnd(page, 3);
  // A tutorial replay is worth finishing either way (the outcome never changes the way out).
  check(true, `the tutorial lesson plays to its finish (${tutEnd.reason}, winner ${tutEnd.winner})`);
  await page.waitForSelector('#gameover:not([hidden])');
  check((await page.textContent('#go-rematch'))?.trim() === 'Back to Tutorial', 'a tutorial finish returns to the Tutorial');
  check((await page.textContent('#go-context'))?.trim() === 'Tutorial · Level 3', 'the card says it was a Tutorial lesson');
  check(await page.evaluate(() => (document.getElementById('go-other') as HTMLElement).hidden) === true, 'no "Back to levels" on a tutorial card');
  check(await page.evaluate(() => (document.getElementById('go-seeds') as HTMLElement).hidden) === true, 'a tutorial lesson pays no Seeds');
  await dismissInstall(page);
  await click(page, '#go-rematch');
  await page.waitForSelector('#sheet-tutorial:not([hidden])');
  check(true, 'the finish returns to the Tutorial picker');
  await page.screenshot({ path: `${OUT}/tutorial-return-390x844.png` });
  const afterTutorial = await progressRaw(page);
  check(afterTutorial === beforeTutorial, 'the whole tutorial run left CampaignProgress byte-identical');

  // ---------- the Settings row at both widths ----------
  await click(page, '#sheet-tutorial [data-close]');
  await page.waitForSelector('#sheet-settings:not([hidden])');
  await page.evaluate(() => document.getElementById('settings-tutorial')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${OUT}/settings-tutorial-390x844.png` });

  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desk.on('pageerror', (e) => errors.push(e.message));
  await seedDevice(desk);
  await desk.goto(served.url, { waitUntil: 'networkidle' });
  await desk.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
  await dismissInstall(desk);
  await click(desk, '#menu-settings');
  await desk.waitForSelector('#sheet-settings:not([hidden])');
  await desk.evaluate(() => document.getElementById('settings-tutorial')?.scrollIntoView({ block: 'center' }));
  await desk.screenshot({ path: `${OUT}/settings-tutorial-1280x800.png` });
  await click(desk, '#settings-tutorial');
  await desk.waitForSelector('#sheet-tutorial:not([hidden])');
  await desk.screenshot({ path: `${OUT}/tutorial-picker-1280x800.png` });

  assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
  console.log('\nLevel flow verified in Chromium; screenshots in', OUT);
} finally {
  await browser.close();
  await served.server.close();
}
