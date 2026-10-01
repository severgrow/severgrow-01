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
import { botCut, cutDemo, endgame } from './positions.js';

const THEMES = ['ink'] as const; // one look since v0.4 (the theme switch was removed)
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

type Hook = { state: () => State | null; settings: () => Record<string, unknown>; busy: () => boolean };
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
    [JSON.stringify({ theme, sound: false, ...settings }), save ? JSON.stringify({ state: save, coach: doneCoach }) : null],
  );
  await page.goto(BASE);
  await page.waitForTimeout(250);
  return { page, errors };
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
        const t = page.locator('.l-over .target').first();
        if ((await t.count()) > 0) {
          await tapHex(page, (await t.getAttribute('data-key'))!);
          if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
          else await page.click('#confirm-cancel').catch(() => {});
        } else await page.locator('#moves .cancel').click();
      } else await page.locator('#moves .end').click();
    } else if (s.phase === 'DISCARD') {
      await page.locator('#hand .card.playable').first().click();
      await page.click('#confirm-play');
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
      else await page.click({ confirm: '#confirm-play', deck: '#deck', discard: '#discard', end: '#moves .end', cancel: '#confirm-cancel', button: '#moves .btn.primary' }[t]!);
      if (((await getState(page))!.history?.length ?? 0) > before) break;
    }
    if (((await getState(page))!.history?.length ?? 0) > before) followed++;
    await idle(page);
  }
  check('coach arrow: following it plays the suggested moves', followed >= 5 && errors.length === 0, `${followed} moves`);
  await page.close();
}

for (const theme of THEMES) {
  const dir = shotsDir ?? null;
  if (dir) mkdirSync(dir, { recursive: true });

  // --- smoke: menu, a fresh game, a few turns with animations on ---
  {
    const { page, errors } = await openPage(theme, 'phone', { speed: 'fast' });
    await page.click('#menu-play');
    await idle(page);
    for (let t = 0; t < 3; t++) await playTurn(page);
    const s = await getState(page);
    check(`${theme}: a fresh game plays several turns`, !!s && s.turnNumber >= 5, `turn ${s?.turnNumber}`);
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
    const cards = page.locator('#hand .card.playable');
    await cards.nth(0).click();
    const t = page.locator('.l-over .target').first();
    await tapHex(page, (await t.getAttribute('data-key'))!);
    const hadPreview = (await page.locator('.l-over .ghost').count()) > 0;
    await page.click('#confirm-cancel');
    const cleared = (await page.locator('.l-over .ghost, .l-over .target, #hand .card.lifted').count()) === 0;
    await cards.nth(1).click();
    const lifted = await page.locator('#hand .card.lifted').count();
    const before = JSON.stringify(demo.state);
    check(`${theme}: ADVERSARIAL 1 tap card, cancel, tap another`, hadPreview && cleared && lifted === 1 && (await stateJson(page)) === before);
    await page.close();
  }

  // --- adversarial 2 + the cut, previews and screenshots ---
  for (const size of ['phone', 'desktop'] as const) {
    const { page, errors } = await openPage(theme, size, { speed: 'normal' }, demo.state);
    if (dir) await page.screenshot({ path: `${dir}/${size}-menu.jpg`, quality: 82 });
    await page.click('#menu-continue');
    await page.mouse.move(1, 1); // no hover tooltip in the picture
    await page.waitForTimeout(300);
    if (dir) await page.screenshot({ path: `${dir}/${size}-midgame.jpg`, quality: 82 });
    await page.click(`#hand [data-card="${demo.card}"]`);
    await tapHex(page, demo.hex);
    for (let i = 0; i < demo.option; i++) await page.click('#confirm-other');
    await page.mouse.move(1, 1);
    const chip = await page.textContent('#confirm-chip');
    check(`${theme} ${size}: preview chip shows the cut`, !!chip && chip.includes(`cuts ${demo.cuts}`), chip ?? '');
    if (dir) await page.screenshot({ path: `${dir}/${size}-preview.jpg`, quality: 82 });
    const histBefore = ((await getState(page))!.history?.length ?? 0);
    await page.dblclick('#confirm-play'); // ADVERSARIAL 2: a double tap plays once
    const histAfter = ((await getState(page))!.history?.length ?? 0);
    const s = await getState(page);
    const playedOnce = histAfter > histBefore && s!.hands[0].length === demo.state.hands[0].length - (demo.action.t === 'Sprout' ? 1 : (demo.action as { cards: number[] }).cards.length);
    if (size === 'phone') check(`${theme}: ADVERSARIAL 2 double tap on Confirm plays once`, playedOnce);
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
    await page.click(`#hand [data-card="${demo.card}"]`);
    await tapHex(page, demo.hex);
    for (let i = 0; i < demo.option; i++) await page.click('#confirm-other');
    await page.click('#confirm-play');
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
    await page.click(`#hand [data-card="${demo.card}"]`);
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

await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
