import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { tutorialAccepts, tutorialLesson, TUTORIAL_CHAPTER_COUNT } from '../src/logic/tutorial-script.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4201, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const reducedMotion = process.env.FUTASAKU_REDUCED_MOTION !== '0';
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const progress = () => page.evaluate(() => (window as any).__severgrow.tutorial() as { chapter: number; step: number } | null);
const state = () => page.evaluate(() => (window as any).__severgrow.state() as State);
const waitReady = () => page.waitForFunction(() => !!(window as any).__severgrow && !(window as any).__severgrow.busy(), undefined, { timeout: 15000 });
const waitStep = (chapter: number, step: number) => page.waitForFunction(({ chapter, step }) => {
  const p = (window as any).__severgrow?.tutorial();
  return !!p && (p.chapter > chapter || p.chapter === chapter && p.step > step);
}, { chapter, step }, { timeout: 25000 });
try {
  await page.addInitScript(reduced => localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ speed: 'fast', reduceMotion: reduced, sound: false, music: false, coach: false, eyeCandy: !reduced })), reducedMotion);
  await page.goto('http://localhost:4201/?tutorial=1&chapter=1');
  await page.waitForFunction(() => !!(window as any).__severgrow?.tutorial());
  for (let moves = 0; moves < 100; moves++) {
    const p = await progress();
    assert(p, 'tutorial remains active');
    if (p.chapter === TUTORIAL_CHAPTER_COUNT - 1 && tutorialLesson(p.chapter, p.step)?.action === 'FreeTurn') break;
    const lesson = tutorialLesson(p.chapter, p.step);
    if (!lesson) {
      await waitStep(p.chapter, p.step);
      continue;
    }
    if (lesson.autoDiscard || lesson.action === 'Opponent') {
      await waitStep(p.chapter, p.step);
      continue;
    }
    await waitReady();
    if (lesson.action === 'Next') {
      await page.locator('#futasaku-glass [data-tut="next"]').evaluate(el => (el as HTMLElement).click());
    } else {
      const s = await state();
      const action = legalActions(viewFor(s, 0)).find(a => tutorialAccepts(lesson, a, s));
      assert(action, `legal ${lesson.id}`);
      assert(await page.evaluate(a => (window as any).__severgrow.playFor(a, 0), action), `play ${lesson.id}`);
    }
    await waitStep(p.chapter, p.step);
  }
  assert.equal(tutorialLesson((await progress())!.chapter, (await progress())!.step)?.action, 'FreeTurn');
  await waitReady();
  // These are actual mobile taps, unlike the engine hook used for the authored chapters.
  const tap = async (selector: string) => {
    const rect = await page.locator(selector).first().boundingBox();
    assert(rect, `visible tap target ${selector}`);
    await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  };
  await tap('#deck');
  await waitReady();
  let s = await state();
  assert.equal(s.phase, 'ACT', 'free turn Draw reached Grow');
  const grow = legalActions(viewFor(s, 0)).find((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout');
  assert(grow, 'free turn offers a legal Grow');
  await tap(`#hand .card[data-card="${grow.card}"]`);
  await page.waitForSelector(`#board .target[data-key="${coordKey(grow.coord)}"]`);
  await tap(`#board .target[data-key="${coordKey(grow.coord)}"]`);
  await page.waitForFunction(key => !!(window as any).__severgrow.state().board[key], coordKey(grow.coord));
  await waitReady();
  s = await state();
  assert.equal(s.board[coordKey(grow.coord)]?.owner, 0, 'touch placement used the real engine');
  const end = legalActions(viewFor(s, 0)).find(a => a.t === 'EndAct');
  assert(end, 'the free turn may finish Grow');
  // The context slot is the normal way to proceed when Bloom is skipped.
  await tap('#smart-context');
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'DISCARD', undefined, { timeout: 8000 });
  await tap('#hand .card');
  await tap('#hand .card.lifted');
  await page.waitForFunction(() => !document.getElementById('menu')!.hidden, undefined, { timeout: 15000 });
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [844, 390], [900, 700], [1280, 800], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('http://localhost:4201/?tutorial=1&chapter=1');
    await page.waitForFunction(() => !!(window as any).__severgrow?.tutorial());
    const geometry = await page.evaluate(() => {
      const glass = document.querySelector('#futasaku-glass')!.getBoundingClientRect();
      const menu = document.querySelector('#hud-menu')!.getBoundingClientRect();
      const logo = document.querySelector('#hud-brand')!.getBoundingClientRect();
      const next = document.querySelector('#futasaku-glass [data-tut="next"]')!.getBoundingClientRect();
      return { glassTop: glass.top, glassRight: glass.right, headerBottom: Math.max(menu.bottom, logo.bottom),
        nextHeight: next.height, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        layout: document.documentElement.dataset.layout };
    });
    assert(geometry.glassTop >= geometry.headerBottom, `${width}x${height}: tutorial clears menu and logo`);
    assert(geometry.glassRight <= width + 1 && geometry.scrollWidth <= geometry.viewport + 1, `${width}x${height}: no horizontal clipping`);
    assert(geometry.nextHeight >= 44, `${width}x${height}: NEXT is a full touch target`);
  }
  assert.equal(errors.length, 0, `browser errors: ${errors.join('; ')}`);
  console.log('Complete tutorial, touch-controlled free turn, and eight responsive layouts passed');
} finally {
  await page.close();
  await browser.close();
  server.httpServer.close();
}
