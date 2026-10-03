// Browser smoke test and screenshots for the playable page.
//   npx tsx web/e2e/smoke.ts                 smoke + adversarial checks, all themes
//   npx tsx web/e2e/smoke.ts --shots=docs/screens   also saves screenshots
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome,
// or one installed with `npx playwright-core install chromium`).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import type { State } from '../../src/engine/index.js';
import { bigCutDemo, botCut, botReplace, cutDemo, endgame, goldCutDemo, tripleDemo } from './positions.js';
import type { CutDemo } from './positions.js';
import { EMPTY_SEL, kindOf, options, tapCard, targetHexes } from '../src/logic/interaction.js';
import { drawMeld } from './drawing.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import { THEME_IDS } from '../src/logic/themes.js';

const THEMES = ['soil'] as const; // the full suite runs on the default palette; every palette gets a quick game below
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;
const shotsDir = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
const results: { name: string; ok: boolean; note?: string | undefined }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4174, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4174/';
const browser: Browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const demo = cutDemo();
const end = endgame();
const bigBotCut = botCut();
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

type Hook = { state: () => State | null; settings: () => Record<string, unknown>; busy: () => boolean; particles: () => { alive: number; peak: number } };
const getState = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
const isBusy = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.busy());
const stateJson = (page: Page) => page.evaluate(() => JSON.stringify((window as unknown as { __severgrow: Hook }).__severgrow.state()));
const idle = async (page: Page, ms = 15000) => {
  await page.waitForFunction(() => {
    const h = (window as unknown as { __severgrow: Hook }).__severgrow;
    const s = h.state();
    return !h.busy() && (!s || s.actor === 0 || s.phase === 'GAME_OVER');
  }, undefined, { timeout: ms });
};
const boardTiles = (page: Page) => page.locator('.l-tiles .tile').count();
const stateTiles = (page: Page) => page.evaluate(() => Object.values((window as unknown as { __severgrow: Hook }).__severgrow.state()!.board).filter((t) => t).length);

const openPage = async (theme: string, size: keyof typeof SIZES, settings: Record<string, unknown> = {}, save?: State) => {
  const page = await browser.newPage({ viewport: SIZES[size], deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(
    ([s, saved]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      if (saved) localStorage.setItem('severgrow.save.v5', saved as string);
    },
    [JSON.stringify({ palette: theme, sound: false, ...settings }), save ? JSON.stringify({ state: save, coach: doneCoach }) : null],
  );
  await page.goto(BASE);
  await page.waitForTimeout(250);
  return { page, errors };
};

/** Play → level screen → the given level (default 7): starts a new game. */
const newGame = async (page: Page, level = 7) => {
  await page.click('#menu-sprout');
  await page.click(`#level-grid [data-level="${level}"]`);
};

/** Picks the demo move's card: a line or clump needs its button first (a card tap alone picks Sprout). */
type Pick = { action: CutDemo['action']; card: number; hex: string; option: number };
const pickCard = async (page: Page, d: Pick) => {
  if (d.action.t === 'MeldRun' || d.action.t === 'MeldSet') await page.click(`#moves [data-kind="${kindOf(d.action)}"]`);
  await page.click(`#hand [data-card="${d.card}"]`);
};

/** Picks the demo's card, then its spot (a line or clump is drawn on the board), then confirms (does not wait). */
const startMove = async (page: Page, d: Pick) => {
  const before = (await getState(page))!.history?.length ?? 0;
  await pickCard(page, d);
  if (((await getState(page))!.history?.length ?? 0) > before) return; // the card's only spot: played at once
  const meld = d.action.t === 'MeldRun' || d.action.t === 'MeldSet';
  if (meld && !(await page.locator('#confirm-play').isVisible())) await drawMeld(page, d.action);
  else if (!(await page.locator('#confirm-play').isVisible())) await tapHex(page, d.hex);
  if (((await getState(page))!.history?.length ?? 0) > before) return; // a drawn move with Confirm moves off: placed at once
  if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
};
/** Picks a target hex for the selected card (a clear choice then plays at once; several ways show a preview). */
const pickTarget = async (page: Page) => {
  if (await page.locator('#confirm-play').isVisible()) return true;
  if (await isBusy(page)) return true; // the card's only spot already played
  const t = page.locator('.l-over .target').first();
  if ((await t.count()) === 0) return false;
  await tapHex(page, (await t.getAttribute('data-key'))!);
  return true;
};

const tapHex = async (page: Page, key: string) => {
  const box = await page.locator(`.hex-cell[data-key="${key}"] path.hex`).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
};

/** Plays one full player turn with simple choices, by tapping like a person would. */
const playTurn = async (page: Page) => {
  for (let i = 0; i < 12; i++) {
    const s = await getState(page);
    if (!s || s.phase === 'GAME_OVER' || s.actor !== 0) return;
    if (s.phase === 'DRAW') await page.click('#deck');
    else if (s.phase === 'ACT') {
      const card = page.locator('#hand .card.playable').first();
      if ((await card.count()) > 0 && i < 6) {
        await card.click();
        if (await pickTarget(page)) {
          if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
          else await page.click('#confirm-cancel').catch(() => {});
        } else await page.locator('#moves .cancel').click({ timeout: 2000 }).catch(() => {}); // the game may have moved on to Throw (auto-advance)
      } else {
        // When nothing can grow, the game moves on to the Throw step by itself (auto-advance),
        // which can remove this button while we tap it: then just carry on with the new step.
        await page.locator('#moves .end').click({ timeout: 2000 }).catch(() => {});
      }
    } else if (s.phase === 'DISCARD') {
      // Throw step: tapping a card throws it at once (no Confirm).
      await page.locator('#hand .card.playable').first().click();
    }
    await idle(page);
  }
};

// --- the coach's arrow: following it plays the suggested move, step by step ---
{
  const { page, errors } = await openPage('ink', 'phone', { speed: 'fast', coach: true });
  await page.click('#menu-tutorial');
  await idle(page);
  let followed = 0;
  for (let step = 0; step < 6; step++) {
    const before = (await getState(page))!.history?.length ?? 0;
    if (!(await page.locator('#coach-show').isVisible())) break;
    await page.click('#coach-show');
    for (let i = 0; i < 5; i++) {
      if (!(await page.locator('#guide-arrow').isVisible())) break;
      const t = (await page.getAttribute('#guide-arrow', 'data-target'))!;
      if (t.startsWith('card:')) await page.click(`#hand [data-card="${t.slice(5)}"]`);
      else if (t.startsWith('hex:')) await tapHex(page, t.slice(4));
      else if (t.startsWith('kind:')) await page.click(`#moves [data-kind="${t.slice(5)}"]`);
      else await page.click({ confirm: '#confirm-play', deck: '#deck', discard: '#discard', end: '#moves .end', cancel: '#confirm-cancel', button: '#moves .btn.primary' }[t]!);
      if (((await getState(page))!.history?.length ?? 0) > before) break;
    }
    if (((await getState(page))!.history?.length ?? 0) > before) followed++;
    await idle(page);
  }
  check('coach arrow: following it plays the suggested moves', followed >= 5 && errors.length === 0, `${followed} moves`);
  await page.close();
}

// --- new player, bot level, undo ---
{
  const { page, errors } = await openPage('ink', 'phone', { speed: 'skip' });
  await page.evaluate(() => {
    localStorage.removeItem('severgrow.settings.v1');
    localStorage.removeItem('severgrow.seen');
  });
  await page.reload();
  check('first visit: the menu suggests the tutorial', await page.locator('#menu-welcome').isVisible());
  await newGame(page, 3);
  await idle(page);
  const level = await page.evaluate(() => (window as unknown as { __severgrow: { settings: () => { level: number } } }).__severgrow.settings().level);
  const hud = (await page.textContent('#turn')) ?? '';
  check('the level screen starts a game at the picked level', level === 3 && hud.includes('Level 3'), `${level} · ${hud.trim().slice(0, 40)}`);
  {
    const hiddenFirst = !(await page.locator('#hint').isVisible());
    await page.click('#hint-btn');
    const shown = await page.locator('#hint').isVisible();
    await page.click('#hint-btn');
    check('the tip hides behind the ? button', hiddenFirst && shown && !(await page.locator('#hint').isVisible()));
  }
  await page.goto(BASE);
  await page.click('#menu-continue').catch(() => {});
  if (!(await getState(page))) await newGame(page);
  await page.click('#deck');
  await idle(page);
  const before = await stateJson(page);
  const card = page.locator('#hand .card.playable').first();
  let undone = false;
  if ((await card.count()) > 0) {
    await card.click();
    if (await pickTarget(page)) {
      if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
      await idle(page);
      await page.click('#moves .undo');
      undone = (await stateJson(page)) === before && (await boardTiles(page)) === (await stateTiles(page));
    }
  }
  check('undo takes back a move exactly', undone);
  check('new-player checks: no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

for (const theme of THEMES) {
  const dir = shotsDir ?? null;
  if (dir) mkdirSync(dir, { recursive: true });

  // --- smoke: menu, a fresh game, a few turns with animations on ---
  {
    const { page, errors } = await openPage(theme, 'phone', { speed: 'fast' });
    await newGame(page);
    await idle(page);
    for (let t = 0; t < 3; t++) await playTurn(page);
    const s = await getState(page);
    // A quick Strangle can legitimately end a game early: that counts, being stuck does not.
    const progressed = !!s && (s.turnNumber >= 5 || (s.phase === 'GAME_OVER' && !!s.result));
    check(`${theme}: a fresh game plays several turns (or ends properly)`, progressed, `turn ${s?.turnNumber}, ${s?.phase}`);
    check(`${theme}: board on screen matches the game`, (await boardTiles(page)) === (await stateTiles(page)));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}: no horizontal scroll at 390px`, !overflow);
    check(`${theme}: no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // --- adversarial 1: tap a card, cancel, tap another ---
  {
    const { page } = await openPage(theme, 'phone', {}, demo.state);
    await page.click('#menu-continue');
    // Two cards with several spots each, so picking one shows targets and plays nothing.
    const dv = viewFor(demo.state, 0);
    const dl = legalActions(dv);
    const many = dv.hand.filter((c) => targetHexes(dv, dl, tapCard(dv, dl, EMPTY_SEL, c.id)).size >= 2).map((c) => c.id);
    await page.click(`#hand [data-card="${many[0]}"]`);
    const hadTargets = (await page.locator('.l-over .target').count()) >= 2;
    await page.click('#moves .cancel');
    const cleared = (await page.locator('.l-over .ghost, .l-over .target, #hand .card.lifted').count()) === 0;
    await page.click(`#hand [data-card="${many.find((id) => id !== many[0]) ?? many[0]}"]`);
    const lifted = await page.locator('#hand .card.lifted').count();
    const before = JSON.stringify(demo.state);
    const hadPreview = hadTargets && many.length >= 2;
    check(`${theme}: ADVERSARIAL 1 tap card, cancel, tap another`, hadPreview && cleared && lifted === 1 && (await stateJson(page)) === before);
    await page.close();
  }

  // --- adversarial 2 + the cut, previews and screenshots ---
  for (const size of ['phone', 'desktop'] as const) {
    const { page, errors } = await openPage(theme, size, { speed: 'normal', confirmDraw: true }, demo.state);
    if (dir) await page.screenshot({ path: `${dir}/${size}-menu.jpg`, quality: 82 });
    await page.click('#menu-continue');
    await page.mouse.move(1, 1); // no hover tooltip in the picture
    await page.waitForTimeout(300);
    if (dir) await page.screenshot({ path: `${dir}/${size}-midgame.jpg`, quality: 82 });
    const histBefore = ((await getState(page))!.history?.length ?? 0);
    await pickCard(page, demo);
    const meld = demo.action.t === 'MeldRun' || demo.action.t === 'MeldSet';
    if (meld && !(await page.locator('#confirm-play').isVisible())) await drawMeld(page, demo.action);
    // A clear choice plays at once (no Confirm); a double tap on the spot must still play once.
    if (!meld && ((await getState(page))!.history?.length ?? 0) === histBefore && !(await page.locator('#confirm-play').isVisible())) {
      const box = await page.locator(`.hex-cell[data-key="${demo.hex}"] path.hex`).boundingBox();
      const dv = viewFor(demo.state, 0);
      const dl = legalActions(dv);
      const sel = { ...tapCard(dv, dl, demo.action.t === 'Sprout' ? EMPTY_SEL : { ...EMPTY_SEL, kind: kindOf(demo.action) }, demo.card), hex: demo.hex };
      // One move on that spot: a double tap must play it once. Several: one tap shows the choice.
      if (options(dv, dl, sel).length === 1) await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2); // ADVERSARIAL 2
      else await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    }
    if (await page.locator('#confirm-play').isVisible()) {
      const chip = await page.textContent('#confirm-chip');
      check(`${theme} ${size}: preview chip shows the cut`, !!chip && chip.includes(`cuts ${demo.cuts}`), chip ?? '');
      await page.dblclick('#confirm-play'); // ADVERSARIAL 2
    }
    await page.mouse.move(1, 1);
    const histAfter = ((await getState(page))!.history?.length ?? 0);
    const s = await getState(page);
    const playedOnce = histAfter > histBefore && s!.hands[0].length === demo.state.hands[0].length - (demo.action.t === 'Sprout' ? 1 : (demo.action as { cards: number[] }).cards.length);
    if (size === 'phone') check(`${theme}: ADVERSARIAL 2 a double tap plays the move once, with no Confirm needed`, playedOnce);
    if (dir) {
      await page.waitForSelector('.float', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${dir}/${size}-cut.jpg`, quality: 82 });
    }
    await page.waitForFunction(() => !(window as unknown as { __severgrow: Hook }).__severgrow.busy(), undefined, { timeout: 8000 });
    await page.waitForTimeout(150);
    if (dir) await page.screenshot({ path: `${dir}/${size}-after-cut.jpg`, quality: 82 });
    // Danger view and opportunities.
    await page.click('#tool-weak');
    await page.click('#tool-targets');
    await page.mouse.move(1, 1);
    if (dir) await page.screenshot({ path: `${dir}/${size}-danger.jpg`, quality: 82 });
    check(`${theme} ${size}: no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // --- adversarial 3: turn animations off in the middle of one ---
  {
    const { page } = await openPage(theme, 'phone', { speed: 'slow' }, demo.state);
    await page.click('#menu-continue');
    await startMove(page, demo);
    await page.waitForTimeout(400); // mid-animation
    const midBusy = await isBusy(page);
    await page.click('#hud-menu');
    await page.click('#gm-settings');
    await page.locator('#speed-seg .seg-btn', { hasText: 'Off' }).click();
    await page.click('#sheet-settings [data-close]');
    await page.waitForTimeout(100);
    const same = (await boardTiles(page)) === (await stateTiles(page));
    check(`${theme}: ADVERSARIAL 3 animations off mid-animation leaves a correct board`, midBusy && same && !(await isBusy(page)));
    await page.close();
  }

  // --- adversarial 4: a bot turn that cuts a lot at once ---
  {
    const { page, errors } = await openPage(theme, 'phone', { speed: 'fast' }, bigBotCut.state);
    await page.click('#menu-continue');
    const cap = await page.waitForSelector('.caption.bad', { timeout: 20000 }).then((e) => e.textContent()).catch(() => null);
    await idle(page, 30000);
    const same = (await boardTiles(page)) === (await stateTiles(page));
    check(`${theme}: ADVERSARIAL 4 a bot turn that cuts a lot`, !!cap && cap.includes(`cut off ${bigBotCut.cut}`) && same && errors.length === 0, cap ?? 'no caption');
    await page.close();
  }

  // --- adversarial 5: change a display setting and rotate mid-game ---
  {
    const { page } = await openPage(theme, 'phone', {}, demo.state);
    await page.click('#menu-continue');
    await pickCard(page, demo);
    const before = await stateJson(page);
    await page.click('#hud-menu');
    await page.click('#gm-settings');
    await page.locator('[data-setting="largeText"]').click();
    await page.click('#sheet-settings [data-close]');
    await page.setViewportSize({ width: 844, height: 390 }); // rotate to landscape
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const after = await stateJson(page);
    await page.reload(); // a reload (some phones reload on rotation) keeps the game too
    await page.click('#menu-continue');
    const reloaded = await stateJson(page);
    check(`${theme}: ADVERSARIAL 5 a settings change and rotation keep the game`, before === after && after === reloaded && (await boardTiles(page)) === (await stateTiles(page)));
    await page.close();
  }

  // --- game over ---
  for (const size of ['phone', 'desktop'] as const) {
    const { page, errors } = await openPage(theme, size, { speed: 'skip' }, end);
    await page.click('#menu-continue');
    for (let t = 0; t < 4; t++) await playTurn(page);
    const shown = await page.locator('#gameover').isVisible();
    await page.waitForTimeout(700); // let the screen fade in
    if (size === 'phone') check(`${theme}: game-over screen with highlights`, shown && (await page.locator('#go-highlights li').count()) === 3);
    if (dir && shown) await page.screenshot({ path: `${dir}/${size}-gameover.jpg`, quality: 82 });
    check(`${theme} ${size}: no errors through game over`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
}

// --- every palette: a fresh game, a few turns, no errors, board correct ---
for (const id of THEME_IDS) {
  const { page, errors } = await openPage(id, 'phone', { speed: 'fast' });
  await newGame(page);
  await idle(page);
  for (let t = 0; t < 3; t++) await playTurn(page);
  const look = await page.evaluate(() => document.documentElement.dataset.theme);
  check(`palette ${id}: plays a few turns with no errors, board correct`, look === id && errors.length === 0 && (await boardTiles(page)) === (await stateTiles(page)), errors.join(' | '));
  await page.close();
}

// --- juice: the 6 adversarial checks, frame rate and particles ---
const particleInfo = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.particles());
const settled = async (page: Page) => {
  await idle(page, 20000);
  await page.waitForTimeout(200);
  return (await boardTiles(page)) === (await stateTiles(page));
};
{
  const gold = goldCutDemo();
  const { page, errors } = await openPage('soil', 'phone', { speed: 'normal' }, gold.state);
  await page.click('#menu-continue');
  const goldKeys = Object.keys(gold.state.terrain).filter((k) => gold.state.terrain[k] === 'rich');
  await startMove(page, gold);
  const ok = await settled(page);
  const badges = await page.locator('.l-marks .gold-badge').count();
  check('juice ADVERSARIAL 1: a cut that removes a tile on a gold hex', ok && badges === goldKeys.length && errors.length === 0, `${badges}/${goldKeys.length} gold badges`);
  await page.close();
}
{
  const tri = tripleDemo();
  const { page, errors } = await openPage('soil', 'phone', { speed: 'normal', effects: 'high' }, tri.state);
  await page.click('#menu-continue');
  await startMove(page, tri);
  const ok = await settled(page);
  const p = await particleInfo(page);
  check('juice ADVERSARIAL 2: three effects in one turn (grow, gold or replace, cut)', ok && p.peak <= 60 && errors.length === 0, `peak ${p.peak} particles`);
  await page.close();
}
const big = bigCutDemo();
{
  const { page, errors } = await openPage('soil', 'phone', { speed: 'slow' }, big.state);
  await page.click('#menu-continue');
  await startMove(page, big);
  await page.waitForTimeout(450); // mid-cut
  const mid = await isBusy(page);
  await page.click('#tool-skip');
  const ok = await settled(page);
  check('juice ADVERSARIAL 3: skipping animations during the cut gives the exact board', mid && ok && errors.length === 0);
  await page.close();
}
{
  const { page, errors } = await openPage('soil', 'phone', { speed: 'normal', reduceMotion: true, effects: 'high' }, big.state);
  await page.click('#menu-continue');
  await startMove(page, big);
  let shook = false;
  for (let i = 0; i < 8; i++) {
    shook ||= await page.evaluate(() => document.getElementById('board-wrap')!.getAnimations().some((a) => JSON.stringify((a.effect as KeyframeEffect).getKeyframes()).includes('translate(')));
    await page.waitForTimeout(80);
  }
  const ok = await settled(page);
  const p = await particleInfo(page);
  check('juice ADVERSARIAL 4: Reduce motion with a big cut (no shake, no particles, board correct)', ok && !shook && p.peak === 0 && errors.length === 0, `shake ${shook}, peak ${p.peak}`);
  await page.close();
}
{
  const { page, errors } = await openPage('soil', 'phone', { speed: 'normal' }, bigBotCut.state);
  await page.click('#menu-continue').catch(() => {});
  for (let t = 0; t < 2 && (await getState(page))?.actor !== 0; t++) await idle(page, 30000);
  await playTurn(page);
  const ok = await settled(page);
  check('juice ADVERSARIAL 5: a bot turn that grows then cuts', ok && errors.length === 0);
  await page.close();
}
{
  const { page, errors } = await openPage('soil', 'phone', { speed: 'slow' }, big.state);
  await page.click('#menu-continue');
  await startMove(page, big);
  await page.waitForTimeout(400);
  await page.click('#hud-menu');
  await page.click('#gm-settings');
  await page.click('#palette-seg [data-value="moss"]');
  await page.click('#sheet-settings [data-close]');
  const ok = await settled(page);
  const look = await page.evaluate(() => document.documentElement.dataset.theme);
  check('juice ADVERSARIAL 6: switching palette mid-animation keeps a correct board', ok && look === 'moss' && errors.length === 0);
  await page.close();
}
// --- materials: 3 adversarial checks in the browser (1 and 2 are unit tests) ---
{
  // (3) a cut with animations skipped mid-way: the cut-off lava must show as cooled ash, nothing glowing left
  const { page, errors } = await openPage('soil', 'phone', { speed: 'slow' }, big.state);
  await page.click('#menu-continue');
  const before = new Set(Object.keys(big.state.board).filter((k) => big.state.board[k]?.owner === 1));
  await startMove(page, big);
  await page.waitForTimeout(450);
  const mid = await isBusy(page);
  await page.click('#tool-skip');
  const ok = await settled(page);
  const s = (await getState(page))!;
  const cutKeys = [...before].filter((k) => !s.board[k]);
  const cooled = await page.evaluate((keys) => keys.filter((k) => document.querySelector(`.l-scars .scar.cooled[data-key="${k}"]`)).length, cutKeys);
  const cooledCount = await page.locator(".l-scars .scar.cooled").count();
  const glowingOnCut = await page.evaluate((keys) => keys.filter((k) => document.querySelector(`.l-tiles .tile[data-key="${k}"]`)).length, cutKeys);
  check('material ADVERSARIAL 3: a cut skipped mid-way leaves cooled lava ash, no glow, exact board', mid && ok && cutKeys.length >= 4 && cooledCount === cutKeys.length && cooled === cutKeys.length && glowingOnCut === 0 && errors.length === 0, `${cooledCount}/${cutKeys.length} cooled`);
  await page.close();
}
{
  // (4) the bot grows over my tile (moss becomes lava) while I switch palette
  const rep = botReplace();
  const { page, errors } = await openPage('soil', 'phone', { speed: 'slow' }, rep.state);
  await page.click('#menu-continue').catch(() => {});
  await page.waitForFunction(() => (window as unknown as { __severgrow: Hook }).__severgrow.busy(), undefined, { timeout: 15000 }).catch(() => {});
  await page.click('#hud-menu');
  await page.click('#gm-settings');
  await page.click('#palette-seg [data-value="ink"]');
  await page.click('#sheet-settings [data-close]');
  const ok = await settled(page);
  const s = (await getState(page))!;
  const wrong = await page.evaluate((board) => {
    let bad = 0;
    for (const [k, t] of Object.entries(board)) {
      const tile = document.querySelector(`.l-tiles .tile[data-key="${k}"]`);
      if (!t) continue;
      if (!tile || !tile.classList.contains((t as { owner: number }).owner === 0 ? 'mat-moss' : 'mat-fire')) bad++;
    }
    return bad;
  }, s.board);
  const nowLava = rep.keys.every((k) => s.board[k]?.owner === 1 || !s.board[k]);
  check('material ADVERSARIAL 4: moss replaced by lava during a palette switch: every tile shows its owner\'s material', ok && wrong === 0 && nowLava && errors.length === 0 && (await page.evaluate(() => document.documentElement.dataset.theme)) === 'ink', `${wrong} wrong`);
  await page.close();
}
{
  // (5) Low detail mid-game: flat shapes with rim and shadow, no textures at all
  const { page, errors } = await openPage('soil', 'phone', { speed: 'fast', materialDetail: 'low' }, demo.state);
  await page.click('#menu-continue');
  for (let t = 0; t < 2; t++) await playTurn(page);
  const textures = await page.locator('pattern[id$="-noise"], .mat-grain, .moss-detail, .rock-facet, .rock-crack, .grass-blade, .pebble, .mat-photo').count();
  const rims = await page.locator('.l-tiles .lit').count();
  check('material ADVERSARIAL 5: Low detail mid-game draws no textures, keeps rim and shadow', textures === 0 && rims > 0 && (await boardTiles(page)) === (await stateTiles(page)) && errors.length === 0, `${textures} textured parts`);
  await page.close();
}

// Frame rate during a big cut, with the CPU slowed 4x (about a mid-range phone).
// Every step has a time limit, so a stuck page fails this check instead of hanging the run.
// (The timer is cleared when the check finishes, so it can never fire later as a false failure.)
let juiceTimer: ReturnType<typeof setTimeout> | undefined;
await Promise.race([
  (async () => {
  const { page, errors } = await openPage('soil', 'phone', { speed: 'normal', effects: 'normal' }, big.state);
  page.setDefaultTimeout(20_000);
  const cdp = await page.context().newCDPSession(page);
  await page.click('#menu-continue');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // (a plain string: the test runner's helpers do not exist inside the page)
  await page.evaluate(`window.__frames = []; (function tick(t) { window.__frames.push(t); if (window.__frames.length < 2000) requestAnimationFrame(tick); })(performance.now());`);
  await startMove(page, big);
  await idle(page, 30000);
  const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const gaps = frames.slice(1).map((t, i) => t - frames[i]!);
  const busyGaps = gaps.slice(0, Math.min(gaps.length, 150));
  const avg = busyGaps.reduce((a, b) => a + b, 0) / Math.max(busyGaps.length, 1);
  const worst = Math.max(...busyGaps);
  const p = await particleInfo(page);
  console.log(`FRAME RATE during a big cut (CPU 4x slower): about ${(1000 / avg).toFixed(0)} fps on average, slowest frame ${worst.toFixed(0)} ms; peak particles ${p.peak}`);
  check('juice: frame rate measured during a big cut, particles under the cap', errors.length === 0 && p.peak <= 60);
  await page.close();
  })(),
  new Promise<void>((resolve) => {
    juiceTimer = setTimeout(() => {
      check('juice: frame rate measured during a big cut, particles under the cap', false, 'timed out after 90 s');
      resolve();
    }, 90_000);
  }),
]);
clearTimeout(juiceTimer);

// Polish pass 3: the word "bot" never reaches the player. Scans visible text, aria-labels,
// alt and title text, the page title and description, in every state the page can reach.
const BOT_ALLOWLIST: readonly string[] = []; // intentional exceptions: none
// (a plain string: tsx would wrap a named function in a helper the page does not have)
const botWords = (page: Page): Promise<string[]> =>
  page.evaluate(`(() => {
    const allow = ${JSON.stringify(BOT_ALLOWLIST)};
    const re = /\\bbots?\\b/i;
    const found = [];
    const push = (where, t) => {
      if (t && re.test(t) && !allow.some((a) => t.includes(a))) found.push(where + ': ' + t.trim().slice(0, 80));
    };
    push('text', document.body.innerText);
    push('title', document.title);
    push('description', (document.querySelector('meta[name="description"]') || { getAttribute: () => '' }).getAttribute('content'));
    for (const el of document.querySelectorAll('[aria-label],[alt],[title],[placeholder]'))
      for (const a of ['aria-label', 'alt', 'title', 'placeholder']) push(a, el.getAttribute(a));
    return found;
  })()`);
{
  const found: string[] = [];
  const scan = async (page: Page, where: string) => found.push(...(await botWords(page)).map((f) => `${where} · ${f}`));
  const { page, errors } = await openPage('soil', 'phone', { speed: 'fast' });
  await scan(page, 'menu');
  await page.click('#menu-howto');
  await page.waitForTimeout(200);
  await scan(page, 'how to play');
  await page.keyboard.press('Escape');
  await page.locator('#sheet-howto [data-close]').click().catch(() => {});
  await page.click('#menu-settings');
  await page.waitForTimeout(200);
  await scan(page, 'settings');
  await page.locator('#sheet-settings [data-close]').click().catch(() => {});
  await page.click('#menu-sprout');
  await page.waitForTimeout(200);
  await scan(page, 'level picker');
  await page.click('#level-grid [data-level="7"]');
  await idle(page);
  await scan(page, 'draw step');
  await page.click('#deck');
  await idle(page);
  await scan(page, 'grow step');
  // a tile card on an opponent tile, then a picked card
  const opp = await page.evaluate(() => {
    const s = (window as unknown as { __severgrow: Hook }).__severgrow.state()!;
    return Object.keys(s.board).find((k) => s.board[k]?.owner === 1) ?? null;
  });
  if (opp) {
    await tapHex(page, opp);
    await scan(page, 'tile card');
  }
  const card = page.locator('#hand .card.playable').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(150);
    await scan(page, 'card picked');
  }
  // the opponent's turn (pill, captions), the history and the game menu, over a few turns
  for (let t = 0; t < 3; t++) {
    const s = await getState(page);
    if (!s || s.phase === 'GAME_OVER') break;
    if (t === 1) {
      await page.waitForFunction(() => document.querySelector('#turn-pill:not([hidden])') !== null, undefined, { timeout: 4000 }).catch(() => {});
      await scan(page, "opponent's turn");
    }
    await playTurn(page);
    await idle(page, 30000).catch(() => {});
    if (t === 2) {
      // a random deal can end early (a Strangle): the result screen then covers the board, so
      // close it with "See the board" first; History and the menu are still scanned
      if ((await getState(page))?.phase === 'GAME_OVER') {
        await idle(page, 30000).catch(() => {});
        await page.locator('#go-board:visible').click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
      await page.click('#hud-history');
      await page.waitForTimeout(200);
      await scan(page, 'history');
      await page.locator('#sheet-history [data-close]').click().catch(() => {});
      await page.click('#hud-menu');
      await page.waitForTimeout(200);
      await scan(page, 'game menu');
      await page.locator('#sheet-menu [data-close]').click().catch(() => {});
    }
  }
  await page.close();
  // the game-over screen: from the player's last draw of a whole game, a few taps to the end
  const { page: endPage } = await openPage('soil', 'phone', { speed: 'skip' }, end);
  await endPage.click('#menu-continue');
  for (let t = 0; t < 6 && (await getState(endPage))?.phase !== 'GAME_OVER'; t++) {
    await playTurn(endPage);
    await idle(endPage, 30000).catch(() => {});
  }
  if ((await getState(endPage))?.phase === 'GAME_OVER') await scan(endPage, 'game over');
  else found.push('(the scan did not reach game over)');
  await endPage.close();
  check('the word "bot" never shows: text, aria-labels, alt and title text, every state', found.length === 0 && errors.length === 0, found.slice(0, 3).join(' | ') || errors.slice(0, 2).join(' | '));
}

await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
