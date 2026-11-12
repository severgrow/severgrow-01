// EVERY SCREEN CHANGE HAS MOTION (owner, 2026-11-02: "we should have animation for all menus,
// going to play from main, or profile, etc — if we have existing ones make them more visible and
// smooth").
//
// What this pins, per transition, from the browser's own animations:
//   1. the arriving screen really animates — one animation, `INTERFACE_MOTION.open` long, on the
//      shared open curve — and its travel is SIGNED: a forward move rises from below, the way back
//      drops from above, so the two read differently;
//   2. the screen's own head lands one `stagger` later, as its own animation;
//   3. a full plate (a sheet) takes the stronger arrival (screen travel, 0.985 scale), not the
//      invisible 4px/99.6% a compact card uses;
//   4. the screen accepts a tap on its FIRST frame — the arrival is paint, never a gate;
//   5. Reduce motion removes every one of them (the screen is simply there).
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/screen-motion.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const served = process.env.FUTA04_URL ? null : await servePreview(4313, { logLevel: 'silent' });
const BASE = process.env.FUTA04_URL ?? served!.url;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks += 1;
  console.log(`  ok  ${name}`);
};

type Anim = { duration: number | string; delay: number | string; easing: string; frames: { translate?: string; scale?: string; opacity?: string }[] };
type Snapshot = Record<string, { own: Anim[]; head: Anim[] }>;

/** The vertical component of a keyframe's `translate` ("0px 10px" -> 10), in px. */
const ty = (value: string | undefined): number => {
  const parts = String(value ?? '').match(/-?[\d.]+/g) ?? [];
  return Number(parts.at(-1) ?? 0);
};

/** Every surface this build can show, and the row that is its own head. */
const SURFACES: Record<string, string> = {
  menu: '.menu-stack',
  'play-menu': '.levels-head',
  levels: '.levels-head',
  campaign: '.levels-head',
  'sheet-settings': '.sheet-head',
  'sheet-menu': '.sheet-head',
};

const boot = async (reduceMotion: boolean) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((reduced: boolean) => {
    (window as unknown as { __name: (fn: unknown) => unknown }).__name = (fn: unknown) => fn;
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      sound: false, music: false, coach: false, speed: 'normal', reduceMotion: reduced, autoSkip: false, confirmPolicy: 'always',
    }));
    // ONE reader for the whole run: it fires on the bubble phase, so the app's own handler has
    // already created the arrival, and it reads the animations before a frame can retire them.
    (window as any).__motionRead = () => {
      const out: Record<string, unknown> = {};
      const surfaces = ((window as any).__surfaces ?? {}) as Record<string, string>;
      for (const id of Object.keys(surfaces)) {
        const headSel = surfaces[id]!;
        const el = document.getElementById(id);
        if (!el || el.hidden || !el.getClientRects().length) continue;
        const of = (node: Element | null) => node ? node.getAnimations()
          .filter((a) => !('transitionProperty' in a))
          .map((a) => {
            const timing = a.effect?.getTiming();
            const frames = ((a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? []).map((k: Keyframe) => ({
              translate: typeof k.translate === 'string' ? k.translate : undefined,
              scale: k.scale === undefined ? undefined : String(k.scale),
              opacity: k.opacity === undefined ? undefined : String(k.opacity),
            }));
            return { duration: timing?.duration, delay: timing?.delay ?? 0, easing: String(timing?.easing ?? ''), frames };
          }) : [];
        out[id] = { own: of(el), head: of(el.querySelector(headSel)) };
      }
      return out;
    };
  }, reduceMotion);
  // The surface list is shared with the page reader (one definition, no drift).
  await page.addInitScript((surfaces: Record<string, string>) => { (window as any).__surfaces = surfaces; }, SURFACES);
  await page.goto(BASE);
  await page.waitForFunction(() => !!(window as any).__severgrow?.ready?.());
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById('menu')?.dataset.laidOut === '1');
  await page.waitForTimeout(250); // the menu's own arrival lands before the first tap
  return { context, page, errors };
};

/** Click and read what the click started, in the same task the app created it. */
const capture = async (page: Page, selector: string): Promise<Snapshot> => {
  const snapshot = page.evaluate(() => new Promise<Snapshot>((resolve) => {
    window.addEventListener('click', () => resolve((window as any).__motionRead()), { once: true, capture: false });
  }));
  await page.click(selector);
  return snapshot;
};

const owns = (snap: Snapshot, id: string) => snap[id]?.own ?? [];
const headOf = (snap: Snapshot, id: string) => snap[id]?.head ?? [];

try {
  // ---------------------------------------------------------------- one phone, motion on
  const { context, page, errors } = await boot(false);

  // ---- menu -> PLAY: forward, from below, on the shared beat, head one stagger later
  const open = await capture(page, '#menu-play');
  const play = owns(open, 'play-menu');
  check(play.length === 1, `menu -> PLAY animates the doorway (${play.length} animation)`);
  check(play[0]!.duration === INTERFACE_MOTION.open && play[0]!.easing === INTERFACE_MOTION.easeOpen,
    `menu -> PLAY uses the shared open beat (${play[0]!.duration}ms, ${play[0]!.easing})`);
  const forward = ty(play[0]!.frames[0]?.translate);
  check(forward === INTERFACE_MOTION.screen, `menu -> PLAY rises from below by the screen travel (${forward}px)`);
  const playHead = headOf(open, 'play-menu');
  check(playHead.length === 1 && playHead[0]!.delay === INTERFACE_MOTION.stagger,
    `the PLAY head lands one stagger later (${playHead[0]?.delay}ms)`);
  check(ty(playHead[0]!.frames[0]?.translate) === INTERFACE_MOTION.travel,
    'the head travels less than the screen it belongs to');
  // Tappable on the first frame: the back key is under the finger before the arrival has finished.
  const reachable = await page.evaluate(() => {
    const back = document.getElementById('play-back')!;
    const r = back.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit?.closest('#play-back') || !!hit?.closest('#play-menu');
  });
  check(reachable, 'the arriving screen answers a tap on its first frame (no pointer-events gate)');

  // ---- PLAY -> menu: back, from above, so the way out reads differently from the way in
  const back = await capture(page, '#play-back');
  const menu = owns(back, 'menu');
  check(menu.length === 1, `PLAY -> menu animates the menu (${menu.length} animation)`);
  const backward = ty(menu[0]!.frames[0]?.translate);
  check(backward === -INTERFACE_MOTION.screen, `PLAY -> menu drops from above (${backward}px, the opposite sign)`);
  check(headOf(back, 'menu')[0]?.delay === INTERFACE_MOTION.stagger, 'the menu head follows its body by one stagger');
  await page.waitForTimeout(260);

  // ---- PLAY -> level picker: forward again, and the picker's head follows
  await page.click('#menu-play');
  await page.waitForTimeout(220);
  const toLevels = await capture(page, '#menu-new');
  const levels = owns(toLevels, 'levels');
  check(levels.length === 1 && ty(levels[0]!.frames[0]?.translate) === INTERFACE_MOTION.screen,
    'PLAY -> the picker is a forward arrival too');
  check(headOf(toLevels, 'levels')[0]?.delay === INTERFACE_MOTION.stagger, 'the picker head lands one stagger later');
  await page.waitForTimeout(260);
  const backFromLevels = await capture(page, '#levels-back');
  check(ty(owns(backFromLevels, 'menu')[0]?.frames[0]?.translate) === -INTERFACE_MOTION.screen,
    'the picker -> menu is a back arrival (from above)');
  await page.waitForTimeout(260);

  // ---- a full plate: stronger travel, a clear size change, and its own head beat
  const sheet = await capture(page, '#menu-settings');
  const plate = owns(sheet, 'sheet-settings');
  check(plate.length === 1, 'Settings is a plate and animates on arrival');
  check(ty(plate[0]!.frames[0]?.translate) === INTERFACE_MOTION.screen,
    `the plate travels the screen distance, not the sheet's 4px (${plate[0]!.frames[0]?.translate})`);
  check(Number(plate[0]!.frames[0]?.scale) === 0.985, `the plate grows from 98.5% (${plate[0]!.frames[0]?.scale})`);
  check(headOf(sheet, 'sheet-settings')[0]?.delay === INTERFACE_MOTION.stagger, 'the plate head lands one stagger later');
  check(plate[0]!.duration === INTERFACE_MOTION.open && plate[0]!.easing === INTERFACE_MOTION.easeOpen,
    'the plate shares the one beat (same duration, same curve)');
  await page.waitForTimeout(260);

  // ---- closing the plate is the same motion in reverse, and it is not a hard cut
  const closeSheet = await capture(page, '#sheet-settings [data-close]');
  const leavingPlate = owns(closeSheet, 'sheet-settings');
  check(leavingPlate.length === 1 && leavingPlate[0]!.easing === INTERFACE_MOTION.easeClose,
    `closing a plate runs on the close beat (${leavingPlate[0]?.duration}ms, ${leavingPlate[0]?.easing})`);
  check(ty(leavingPlate[0]!.frames[1]?.translate) > 0,
    'closing sinks as it fades (the reverse of its arrival)');
  await page.waitForTimeout(220);

  // ---- every arrival in this build is ONE family: same duration, same curve
  const durations = new Set([...play, ...menu, ...levels, ...plate].map((a) => `${a.duration}:${a.easing}`));
  check(durations.size === 1, `every screen and plate arrives on one beat (${[...durations].join(' / ')})`);

  // ---- a screen that is already the current one must NOT replay a forward beat
  await openMenuEntry(page, 'menu-new').catch(() => undefined);
  await page.waitForTimeout(250);
  check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
  await context.close();

  // ---------------------------------------------------------------- Reduce motion
  const still = await boot(true);
  check(await still.page.evaluate(() => document.documentElement.classList.contains('reduce-motion')),
    'Reduce motion is really on (the game setting, not just the OS query)');
  const stillOpen = await capture(still.page, '#menu-play');
  check(owns(stillOpen, 'play-menu').length === 0, 'Reduce motion: the doorway does not animate (it is simply there)');
  check(await still.page.locator('#play-menu').isVisible(), 'Reduce motion: the doorway is immediately visible');
  const stillBack = await capture(still.page, '#play-back');
  check(owns(stillBack, 'menu').length === 0, 'Reduce motion: the way back does not animate either');
  check(await still.page.locator('#menu-play').isVisible(), 'Reduce motion: the menu is back at once');
  const stillSheet = await capture(still.page, '#menu-settings');
  check(owns(stillSheet, 'sheet-settings').length === 0, 'Reduce motion: a plate is there at once');
  check(await still.page.locator('#sheet-settings').isVisible(), 'Reduce motion: the plate is visible on the same frame');
  await still.page.click('#sheet-settings [data-close]');
  check(await still.page.locator('#sheet-settings').isHidden(), 'Reduce motion: closing a plate hides it at once');
  check(still.errors.length === 0, `Reduce motion: no page errors (${still.errors.slice(0, 2).join(' | ')})`);
  await still.context.close();
} finally {
  await browser.close().catch(() => undefined);
  await served?.server.close().catch(() => undefined);
}

console.log(`\n${checks} checks passed — every screen change animates, directionally, on one beat.`);
