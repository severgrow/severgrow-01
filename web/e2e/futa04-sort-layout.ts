/** Pile positions must follow the turn phase, never a card's sort animation. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import type { Page } from 'playwright-core';

const BASE = process.env.FUTA04_URL ?? 'http://localhost:4192/';
const server = process.env.FUTA04_URL ? null : await preview({ configFile: 'web/vite.config.ts', preview: { port: 4192, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
let checks = 0;

type Position = { step: string; groupX: number; groupY: number; shift: string; deckX: number; discardX: number; deckCountX: number; discardCountX: number; order: string };
const position = (page: Page): Promise<Position> => page.evaluate(() => {
  const group = document.querySelector<HTMLElement>('#futa04-box > .piles')!;
  const deck = document.querySelector<HTMLElement>('#deck')!;
  const discard = document.querySelector<HTMLElement>('#discard')!;
  return {
    step: document.documentElement.dataset.step ?? '',
    groupX: group.getBoundingClientRect().x, groupY: group.getBoundingClientRect().y,
    shift: group.style.getPropertyValue('--futa04-draw-shift'),
    deckX: deck.offsetLeft, discardX: discard.offsetLeft,
    deckCountX: document.querySelector<HTMLElement>('#deck-count')!.offsetLeft,
    discardCountX: document.querySelector<HTMLElement>('#discard-count')!.offsetLeft,
    order: [...document.querySelectorAll<HTMLElement>('#hand .card')].map(card => card.dataset.card).join(','),
  };
});

async function sortWithoutPileTravel(page: Page, name: string, phase: 'draw' | 'grow') {
  const start = await position(page);
  assert.equal(start.step, phase, `${name}: expected ${phase}`);
  const orders = new Set([start.order]);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      (window as any).__sortSamples = [];
      const until = performance.now() + 450;
      const sample = () => {
        const group = document.querySelector<HTMLElement>('#futa04-box > .piles')!;
        (window as any).__sortSamples.push({ x: group.getBoundingClientRect().x, y: group.getBoundingClientRect().y, shift: group.style.getPropertyValue('--futa04-draw-shift') });
        if (performance.now() < until) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.locator('#hand-sort').click();
    await page.waitForTimeout(500);
    const samples = await page.evaluate(() => (window as any).__sortSamples as { x: number; y: number; shift: string }[]);
    assert(samples.length > 2, `${name}: captured sort frames`); checks++;
    for (const sample of samples) {
      assert(Math.abs(sample.x - start.groupX) <= 1 && Math.abs(sample.y - start.groupY) <= 1,
        `${name}: ${phase} pile group moved during sort ${i + 1}: ${sample.x},${sample.y} vs ${start.groupX},${start.groupY}`);
      assert.equal(sample.shift, start.shift, `${name}: Draw alignment changed during sort ${i + 1}`);
      checks += 2;
    }
    const now = await position(page);
    orders.add(now.order);
    for (const key of ['deckX', 'discardX', 'deckCountX', 'discardCountX'] as const) {
      assert.equal(now[key], start[key], `${name}: ${key} moved within the cockpit`); checks++;
    }
  }
  assert(orders.size > 1, `${name}: sort exercised both card orders`); checks++;
}

try {
  for (const [width, height, side] of [[360, 640, 'right'], [390, 844, 'right'], [430, 932, 'right'], [390, 844, 'left'], [1280, 800, 'right']] as const) {
    const name = `${width}x${height} ${side}`;
    const mobile = width < 600;
    const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(s => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow-thumb', JSON.stringify({ side: s }));
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: false, handSort: 'suit' }));
    }, side);
    await page.goto(`${BASE}?seed=2`);
    await page.waitForSelector('#hand .card');
    await page.waitForFunction(() => (window as any).__severgrow && !(window as any).__severgrow.busy());
    await page.waitForTimeout(1100); // let the intended Draw entrance settle before measuring
    await sortWithoutPileTravel(page, name, 'draw');
    const draw = await position(page);
    await page.locator('#deck').click({ force: true });
    await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());
    await page.waitForTimeout(450);
    const grow = await position(page);
    if (side === 'right') { assert.notEqual(draw.shift, grow.shift, `${name}: intended Draw shift must return for Grow`); checks++; }
    await sortWithoutPileTravel(page, name, 'grow');
    assert.equal(errors.length, 0, `${name}: page errors ${errors.join(' | ')}`); checks++;
    console.log(`${name}: Draw and Grow sorts stable`);
    await page.close();
  }
  console.log(`${checks} pile layout checks passed`);
} finally {
  await browser.close();
  if (server) await new Promise<void>(resolve => server.httpServer.close(() => resolve()));
}
