// THE PLAY DOORWAY — it must open, settle, and come back, at both phone sizes (owner direction,
// 2026-10-22: "confirm the PLAY submenu opens reliably now that it animates via enterSurface").
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/play-menu.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/play-menu.ts
//
// Why this suite exists at all: the submenu used to be reported as "does not open" by an ad-hoc
// probe whose waits were so long that a real race read as a slow pass. The doorway itself is a
// three-step hand-off (`#menu-play` → `openPlayMenu` → `enterSurface`) and the surface now arrives
// through the Web Animations API starting at opacity 0, so "it is not [hidden]" is NOT the same
// fact as "the player can see it". Every check here therefore waits for the SETTLED surface —
// `data-ix-state="open"`, opacity 1, no animation left running — and then acts on it.
//
// What is pinned, per viewport (360x640 and 390x844, the two phone sizes the owner reviews):
//   1. PLAY is on the product menu, and tapping it makes #play-menu visibly present and settled;
//   2. the submenu carries the same three entries, in the owner's order — LEVEL <n>, Play online,
//      Practice match — and each VISIBLE one really opens what it names;
//   3. Play online is present but hidden on a build with no duel endpoint (the product rule), so
//      the online check runs only when that key is on show;
//   4. the back control returns to the menu, settled, with the submenu gone;
//   5. the cycle survives three repeats (open → back → open …): no glyph of an interrupted
//      entrance, no stuck `inert`, no stale animation — the old failure mode.
//
// A fifth context runs the SAME open/close with Reduce motion on, where the surface must be there
// at once (no animation may be required for the doorway to work).
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { assertDistChannel } from './helpers/dist-channel.js';
import { servePreview } from './helpers/preview-port.js';
import { LESSONS } from '../src/lessons/lessons.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
] as const;

const served = process.env.FUTA04_URL ? null : await servePreview(4312, { logLevel: 'silent' });
const BASE = process.env.FUTA04_URL ?? served!.url;
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
  ...(process.env.FUTA04_URL && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});

let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks += 1;
  console.log(`  ok  ${name}`);
};

/** A phone that has never played: the product menu, Reduce motion off unless asked otherwise. */
const boot = async (viewport: { width: number; height: number }, reduceMotion: boolean) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    ...(process.env.FUTA04_URL ? { ignoreHTTPSErrors: true } : {}),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((reduced: boolean) => {
    // esbuild decorates named functions with `__name`; the page must have it for `page.evaluate`
    // helpers (the same shim every suite in this folder installs).
    (window as unknown as { __name: (fn: unknown) => unknown }).__name = (fn: unknown) => fn;
    // A `CHANNEL=futa04` build installs the `main2:` prefix (`web/src/channel.ts`); the suite is
    // pinned to that build by `assertDistChannel` below, so the fixture can name the prefix.
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      sound: false, music: false, coach: false, speed: 'normal', reduceMotion: reduced, autoSkip: false, confirmPolicy: 'always',
    }));
  }, reduceMotion);
  await page.goto(BASE);
  await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30_000 });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById('menu')?.dataset.laidOut === '1', undefined, { timeout: 20_000 });
  // Wait for the menu's own arrival to land, so a tap is never taken mid-entrance.
  await settled(page, 'menu');
  return { context, page, errors };
};

/**
 * The one definition of "the player can see this surface": it is shown, it has finished arriving
 * (`data-ix-state="open"`, opacity 1) and no animation is still running on it. A surface that is
 * merely `:not([hidden])` can still be a 0-opacity frame — that is the reading that used to make a
 * broken probe look slow rather than wrong.
 */
const settled = (page: Page, id: string): Promise<void> =>
  page.waitForFunction((surfaceId) => {
    const el = document.getElementById(surfaceId);
    if (!el || el.hidden) return false;
    const cs = getComputedStyle(el);
    const state = el.dataset.ixState;
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) === 1
      && (state === undefined || state === 'open') && el.getAnimations().length === 0;
  }, id, { timeout: 10_000 }).then(() => undefined);

const openPlay = async (page: Page) => {
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await settled(page, 'play-menu');
};

const backToMenu = async (page: Page) => {
  await page.click('#play-back');
  await page.waitForFunction(() => (document.getElementById('play-menu') as HTMLElement).hidden, undefined, { timeout: 10_000 });
  await settled(page, 'menu');
};

/** What the submenu actually shows, in DOM order (which is the seen and tab order). */
const readPlayMenu = (page: Page) => page.evaluate(() => {
  const el = document.getElementById('play-menu') as HTMLElement;
  const r = el.getBoundingClientRect();
  const shown = (node: HTMLElement) => !node.hidden && !!node.getClientRects().length;
  return {
    box: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
    vw: window.innerWidth,
    vh: window.innerHeight,
    screenOverflow: Math.max(0, el.scrollHeight - el.clientHeight),
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
    title: (document.getElementById('play-title')?.textContent ?? '').trim(),
    entries: [...document.querySelectorAll('#play-actions > *')].map((node) => {
      const b = node as HTMLButtonElement;
      const br = b.getBoundingClientRect();
      return {
        id: b.id,
        text: (b.textContent ?? '').trim(),
        hidden: b.hidden,
        shown: shown(b),
        inside: br.top >= -1 && br.bottom <= window.innerHeight + 1 && br.left >= -1 && br.right <= window.innerWidth + 1,
      };
    }),
  };
});

try {
  for (const vp of VIEWPORTS) {
    console.log(`\n${vp.key} — the animated doorway`);
    const { context, page, errors } = await boot(vp, false);
    await assertDistChannel(page); // loud if the served dist is not the futa04 build this suite pins
    check(await page.locator('#menu-play').isVisible(), `${vp.key}: PLAY is on the product menu`);

    // ---- 1 + 2 + 4 + 5: three complete open → back cycles on ONE page. A surface that keeps
    // state between cycles (a stuck inert attribute, a half-finished entrance) fails on the second.
    for (let cycle = 1; cycle <= 3; cycle++) {
      await openPlay(page);
      const seen = await readPlayMenu(page);
      check(seen.title.length > 0, `${vp.key} cycle ${cycle}: the submenu has its own heading ("${seen.title}")`);
      check(seen.entries.length === 3, `${vp.key} cycle ${cycle}: three entries are there (${seen.entries.map((e) => e.id).join(', ')})`);
      check(
        seen.entries.map((e) => e.id).join(',') === 'menu-campaign,menu-online,menu-new',
        `${vp.key} cycle ${cycle}: LEVEL, Play online, Practice match — in that order`,
      );
      check(seen.entries[0]!.shown, `${vp.key} cycle ${cycle}: LEVEL is on show ("${seen.entries[0]!.text}")`);
      check(seen.entries[2]!.shown, `${vp.key} cycle ${cycle}: Practice match is on show ("${seen.entries[2]!.text}")`);
      for (const entry of seen.entries.filter((e) => e.shown)) {
        check(entry.inside, `${vp.key} cycle ${cycle}: ${entry.id} is fully inside the screen`);
      }
      check(!seen.pageWide, `${vp.key} cycle ${cycle}: the submenu does not widen the page`);
      check(seen.screenOverflow <= 1, `${vp.key} cycle ${cycle}: the submenu does not need to scroll (overflow ${seen.screenOverflow}px)`);
      // A doorway that opens behind a visible menu is not open at all: the menu is fully hidden.
      check(!(await page.locator('#menu').isVisible()), `${vp.key} cycle ${cycle}: the main menu stands down while PLAY is open`);

      await backToMenu(page);
      check(await page.locator('#play-menu').isHidden(), `${vp.key} cycle ${cycle}: back closes the submenu`);
      check(await page.locator('#menu-play').isVisible(), `${vp.key} cycle ${cycle}: back lands on the menu, PLAY still there`);
    }

    // ---- 3: Play online follows the build's own rule. With no duel endpoint the product hides the
    // key (a dead entry is never shown); when it is shown, it must open the hub.
    const onlineShown = await page.evaluate(() => {
      const b = document.getElementById('menu-online') as HTMLButtonElement;
      return !b.hidden && !!b.getClientRects().length;
    });
    if (onlineShown) {
      await openPlay(page);
      await page.click('#menu-online');
      await page.waitForSelector('#online-hub:not([hidden])', { timeout: 15_000 });
      check(await page.locator('#online-hub').isVisible(), `${vp.key}: Play online opens the duel hub`);
      await page.click('#online-back');
      await page.waitForSelector('#menu:not([hidden])', { timeout: 15_000 });
      check(await page.locator('#menu-play').isVisible(), `${vp.key}: leaving the hub returns to the menu`);
    } else {
      console.log(`  --  ${vp.key}: Play online is hidden in this build (no duel endpoint — the product rule)`);
    }

    // ---- the two entries that are always on show really open their destinations ----
    await openPlay(page);
    await page.click('#menu-campaign');
    // LEVEL <n> hands STRAIGHT into the level (there is no list to pick from). Levels 1-10 open
    // from their LESSON's authored position, so the seed on the board is the lesson's own —
    // asserting `CAMPAIGN_LEVELS[0].seed` here is what made the older suites claim a false failure.
    const lessonSeed = LESSONS[0]!.position.seed;
    await page.waitForFunction((seed: number) => (window as any).__severgrow.state()?.seed === seed, lessonSeed, { timeout: 30_000 });
    const opened = await page.evaluate(() => (window as any).__severgrow.state().seed as number);
    check(opened === lessonSeed, `${vp.key}: LEVEL opens level 1 on its lesson seed (${opened})`);
    check(await page.locator('#game').isVisible(), `${vp.key}: LEVEL really shows the board`);
    await context.close();
    check(errors.length === 0, `${vp.key}: no page errors (${errors.slice(0, 2).join(' | ')})`);

    // Practice match opens the picker; its own back returns to the menu.
    const second = await boot(vp, false);
    await openPlay(second.page);
    await second.page.click('#menu-new');
    await second.page.waitForSelector('#levels:not([hidden])', { timeout: 15_000 });
    check(await second.page.locator('#levels').isVisible(), `${vp.key}: Practice match opens the picker`);
    await second.page.click('#levels-back');
    await second.page.waitForSelector('#menu:not([hidden])', { timeout: 15_000 });
    check(await second.page.locator('#menu-play').isVisible(), `${vp.key}: the picker's back returns to the menu`);
    await second.context.close();
    check(second.errors.length === 0, `${vp.key}: no page errors on the picker path (${second.errors.slice(0, 2).join(' | ')})`);

    // ---- Reduce motion: the doorway is not allowed to depend on its animation ----
    const still = await boot(vp, true);
    await openPlay(still.page);
    check(await still.page.locator('#play-menu').isVisible(), `${vp.key} reduce motion: PLAY is visible with no motion at all`);
    await backToMenu(still.page);
    check(await still.page.locator('#menu-play').isVisible(), `${vp.key} reduce motion: back returns to the menu`);
    await still.context.close();
    check(still.errors.length === 0, `${vp.key} reduce motion: no page errors (${still.errors.slice(0, 2).join(' | ')})`);
  }
} finally {
  await browser.close().catch(() => undefined);
  await served?.server.close().catch(() => undefined);
}

console.log(`\n${checks} checks passed — the PLAY doorway opens, settles and comes back at both phone sizes.`);
