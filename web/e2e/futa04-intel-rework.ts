// Match Intel rework (owner, 2026-10-29): Tips are strategic reads of THIS match, not lesson
// labels. This suite renders the real panel at four viewports and checks the information design:
// the scope line (Tips = this match, Rules = the reference), the readout, the ranked tip cards,
// no horizontal overflow, and a static reduce-motion path. Screenshots land in docs/screens/.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { allNeighbors, coordKey, homeCoord, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { matchObservation } from '../src/logic/match-intel.js';
import { positionSave } from './position.js';

const served = await servePreview(4193, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const dir = 'docs/screens/match-intel';
mkdirSync(dir, { recursive: true });
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const KINDS = ['DANGER', 'OPPORTUNITY', 'TEMPO', 'ENDGAME'];

/** A deliberately loud position: both homes two sides from falling, and a four-card Draw pile. */
const intentPosition = (seed: number): State => {
  const state = newGame(seed);
  const view = viewFor(state, 0);
  const board = { ...state.board };
  const mine = allNeighbors(homeCoord(0, view.config)).map(coordKey).filter((k) => k in board && view.terrain[k] !== 'rock');
  const theirs = allNeighbors(homeCoord(1, view.config)).map(coordKey).filter((k) => k in board && view.terrain[k] !== 'rock');
  for (const k of mine.slice(0, mine.length - 2)) board[k] = { owner: 1, strength: 5 };
  for (const k of theirs.slice(0, theirs.length - 2)) board[k] = { owner: 0, strength: 4 };
  return { ...state, board, deck: state.deck.slice(0, 4) };
};

const openIntel = async (page: Page) => {
  await page.locator('#futa04-help-button').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => document.querySelector('#futasaku-glass')?.getAttribute('data-mode') === 'intel');
  await page.locator('#futasaku-glass .intel-tab').first().waitFor({ state: 'visible' });
};
const tab = async (page: Page, id: 'now' | 'tips' | 'rules') => {
  await page.locator(`#futasaku-glass .intel-tab[data-intel-tab="${id}"]`).click();
  await page.waitForFunction((want) => document.querySelector(`#futasaku-glass .intel-tab[data-intel-tab="${want}"]`)?.getAttribute('aria-selected') === 'true', id);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};

try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]] as const) {
    const mobile = width < 600;
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((save) => {
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: true, speed: 'fast' }));
      localStorage.setItem('main2:severgrow.save.v7', save);
    }, positionSave({ state: intentPosition(11) }));
    await page.goto(served.url);
    await resumeSavedGame(page);
    await assertDistChannel(page);
    await page.waitForFunction(() => !(window as any).__severgrow.busy());
    const state = await page.evaluate(() => (window as any).__severgrow.state() as State);
    const view = viewFor(state, 0);
    const mine = Object.values(view.board).filter((t) => t?.owner === 0).length;
    const theirs = Object.values(view.board).filter((t) => t?.owner === 1).length;

    await openIntel(page);
    await tab(page, 'tips');
    const tips = await page.evaluate(() => {
      const glass = document.querySelector('#futasaku-glass') as HTMLElement;
      const box = glass.getBoundingClientRect();
      const body = glass.querySelector('.intel-body') as HTMLElement;
      const nodes = [...glass.querySelectorAll<HTMLElement>('*')];
      return {
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        scope: glass.querySelector('[data-intel-scope="tips"] b')?.textContent,
        stats: [...glass.querySelectorAll('.intel-stat')].map((n) => ({
          key: n.getAttribute('data-key'), value: n.querySelector('.intel-stat-v')?.textContent,
        })),
        tips: [...glass.querySelectorAll<HTMLElement>('.intel-tip')].map((n) => ({
          rank: Number(n.dataset.rank), kind: n.getAttribute('data-kind'), severity: n.getAttribute('data-severity'),
          kindLabel: n.querySelector('.intel-kind')?.textContent?.replace(/[▲◆▸■]/g, '').trim(),
          primary: n.classList.contains('intel-tip--primary'),
          headline: n.querySelector('.intel-tip-headline')?.textContent,
          detail: n.querySelector('.intel-tip-detail')?.textContent,
          facts: [...n.querySelectorAll('.intel-fact b')].map((b) => b.textContent),
          mark: n.querySelector('.intel-tip-mark')?.textContent,
          text: n.textContent ?? '',
        })),
        observation: glass.querySelector('.intel-observation')?.textContent,
        bodyOverflow: body.scrollWidth > body.clientWidth + 1,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        outside: nodes.filter((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
        }).length,
        animation: getComputedStyle(body).animationName,
        running: glass.getAnimations({ subtree: true }).length,
      };
    });
    check(tips.scope === 'THIS MATCH', `${width}: Tips says which surface it is (${tips.scope})`);
    check(tips.stats.length === 5, `${width}: five-fact readout`);
    check(tips.stats.find((s) => s.key === 'land')?.value === `${mine}–${theirs}`, `${width}: LAND reads the board (${mine}–${theirs})`);
    check(tips.tips.length >= 1 && tips.tips.length <= 3, `${width}: one to three ranked tips (${tips.tips.length})`);
    check(tips.tips[0]!.primary, `${width}: the first tip is the primary line`);
    check(tips.tips.every((t, i) => t.rank === i), `${width}: ranks are 0..n in order`);
    check(tips.tips.every((t) => KINDS.includes(t.kindLabel ?? '')), `${width}: every tip carries a verdict word (${tips.tips.map((t) => t.kindLabel).join(', ')})`);
    check(tips.tips.every((t) => !/LESSON\s*\d+/i.test(t.text)), `${width}: no lesson label anywhere in Tips`);
    check(tips.tips.every((t) => t.headline && t.headline.length > 8 && t.detail && t.detail.length > 8), `${width}: every tip has a read and a decision`);
    check(tips.tips.every((t) => t.facts.length >= 1), `${width}: every tip carries evidence`);
    check(tips.tips.some((t) => t.severity === 'critical'), `${width}: the loudest read is marked critical`);
    check(!tips.bodyOverflow && !tips.pageOverflow && tips.outside === 0, `${width}: nothing scrolls or bleeds sideways (${JSON.stringify({ body: tips.bodyOverflow, page: tips.pageOverflow, outside: tips.outside })})`);
    check(tips.box.left >= 0 && tips.box.right <= width + 1 && tips.box.top >= 0 && tips.box.bottom <= height + 1, `${width}: the glass fits the viewport`);
    check(tips.animation === 'none' && tips.running === 0, `${width}: reduce motion leaves the panel static`);
    await page.screenshot({ path: `${dir}/tips-${width}x${height}.png` });

    // A tip opens the rule it rests on — the link is behind the verdict word, never a label.
    await page.locator('#futasaku-glass .intel-tip').first().click();
    check(await page.locator('#futasaku-glass [data-intel-scope="rules"] b').textContent() === 'HOW THE GAME WORKS',
      `${width}: a tip hands over to the reference, clearly marked as rules`);
    check(await page.locator('#futasaku-glass .intel-rule[aria-expanded="true"]').count() === 1,
      `${width}: the tip opens exactly one lesson card`);
    check(await page.locator('#futasaku-glass .intel-rule').count() === 10, `${width}: the reference keeps all ten lessons`);
    check(await page.locator('#futasaku-glass .intel-tip').count() === 0, `${width}: Rules shows no tips — the tabs stay distinct`);
    await page.screenshot({ path: `${dir}/rules-${width}x${height}.png` });

    await tab(page, 'now');
    const now = await page.evaluate(() => ({
      scope: document.querySelector('#futasaku-glass [data-intel-scope="now"] b')?.textContent,
      observation: document.querySelector('#futasaku-glass .intel-observation')?.textContent,
      stats: document.querySelectorAll('#futasaku-glass .intel-stat').length,
      lead: document.querySelector('#futasaku-glass .intel-lead')?.textContent,
    }));
    check(now.scope === 'THE MATCH' && now.stats === 5 && !!now.lead, `${width}: Now keeps the match header and readout`);
    check(!!now.observation && !/LESSON|seed/i.test(now.observation ?? ''), `${width}: Now carries one strategic observation`);
    check(now.observation === matchObservation(view), `${width}: the observation follows the engine's read`);
    await page.screenshot({ path: `${dir}/now-${width}x${height}.png` });

    check(errors.length === 0, `${width}: no browser errors (${errors.join(' | ')})`);
    await page.close();
  }

  // A quiet board still looks composed: the fallback is a read of the position, not an empty tab.
  const quietPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await quietPage.addInitScript((save) => {
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: true, speed: 'fast' }));
    localStorage.setItem('main2:severgrow.save.v7', save);
  }, positionSave({ state: newGame(4) }));
  await quietPage.goto(served.url);
  await resumeSavedGame(quietPage);
  await quietPage.waitForFunction(() => !(window as any).__severgrow.busy());
  await openIntel(quietPage);
  await tab(quietPage, 'tips');
  const quiet = await quietPage.evaluate(() => ({
    tips: document.querySelectorAll('#futasaku-glass .intel-tip').length,
    text: document.querySelector('#futasaku-glass .intel-tips')?.textContent ?? document.querySelector('#futasaku-glass .intel-quiet')?.textContent ?? '',
    stats: document.querySelectorAll('#futasaku-glass .intel-stat').length,
  }));
  check(quiet.tips >= 1 && quiet.text.trim().length > 20 && quiet.stats === 5, 'quiet board: the tab still reads as intel, never blank');
  await quietPage.screenshot({ path: `${dir}/quiet-390x844.png` });
  await quietPage.close();

  // Motion ON keeps the interface vocabulary: the body arrives with the shared token, not a new one.
  const motionPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await motionPage.addInitScript((save) => {
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'fast' }));
    localStorage.setItem('main2:severgrow.save.v7', save);
  }, positionSave({ state: intentPosition(11) }));
  await motionPage.goto(served.url);
  await resumeSavedGame(motionPage);
  await motionPage.waitForFunction(() => !(window as any).__severgrow.busy());
  await openIntel(motionPage);
  await tab(motionPage, 'tips');
  const animation = await motionPage.locator('#futasaku-glass .intel-body').evaluate((el) => {
    const style = getComputedStyle(el);
    return { name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction };
  });
  check(animation.name === 'intel-tab-in', 'motion on: the panel uses the intel arrival animation');
  check(animation.duration === '0.15s', `motion on: the arrival uses --ix-open (${animation.duration})`);
  await motionPage.close();

  console.log(`${checks} Match Intel rework checks passed`);
} finally {
  await browser.close();
  served.server.httpServer.close();
}
