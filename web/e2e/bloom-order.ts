// THE BLOOM RECIPE MENU SHOWS THE BIGGEST BLOOM FIRST (owner, 2026-10-30: "when big bloom
// (4+cards) available and theres bloom menu opening - show the biggest/longest blooms first").
//
// The product channel asks `moveButtons(..., true)` for one button per recipe. That branch used to
// return `kindsAvailable`'s order: shortest first, then arbitrary. The position below holds one
// five-card run and one three-card run, so the menu has a 5-card recipe that MUST lead, followed by
// the four-card windows and then the three-card ones (non-increasing by the recipe's REAL cards).
// We read `data-kind` and the rendered mini-card count, never the label text.
//
//   CHANNEL=futa04 npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     npx tsx web/e2e/bloom-order.ts
//
// Screenshot: /tmp/bloom-order/390x844-menu.png
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { resumeSavedGame } from './helpers/menu-nav.js';

const OUT = '/tmp/bloom-order';
mkdirSync(OUT, { recursive: true });
const port = Number(process.env.BLOOM_ORDER_PORT ?? 4224);
const base = `http://localhost:${port}/`;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };

const card = (id: number, suit: Card['suit'], rank: number): Card => ({ id, suit, rank });
/** A five-card run (suit 0, 5-9) and a separate three-card run (suit 1, 1-3): sizes 5, 4 and 3. */
const HAND: Card[] = [
  card(900, 0, 5), card(901, 0, 6), card(902, 0, 7), card(903, 0, 8), card(904, 0, 9),
  card(910, 1, 1), card(911, 1, 2), card(912, 1, 3),
];
const position = (): State => {
  const start = newGame(11);
  const terrain = { ...start.terrain };
  for (const key of Object.keys(terrain)) terrain[key] = 'normal';
  return { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [[...HAND], start.hands[1]] };
};

/** The recipe's REAL card count, from the card ids inside `data-kind` — not the label text. */
const idCount = (kind: string) => kind.split('-').slice(2).join('-').split('.').filter(Boolean).length;

/** Every recipe button in the open menu, in render order (one synchronous read of the built DOM). */
const readMenu = (page: Page) => page.evaluate(() => {
  const panel = document.querySelector<HTMLElement>('#moves .bloom-options');
  if (!panel || panel.hidden) return null;
  return [...panel.querySelectorAll<HTMLButtonElement>('button[data-kind]')].map((b) => ({
    kind: b.dataset.kind ?? '',
    icons: b.querySelectorAll('.futa04-mini-card').length,
    label: b.getAttribute('aria-label') ?? '',
  }));
});

/** Open the product recipe drawer from the very control `renderControls` builds (it lives inside
 *  the information dock's visually hidden `#moves`, so the click is dispatched as a real DOM click —
 *  the same listener a finger fires when `#moves` is the layout). */
const openMenu = (page: Page) => page.evaluate(() => {
  const toggle = document.querySelector<HTMLButtonElement>('#moves .bloom-toggle');
  if (!toggle) return false;
  toggle.click();
  // `render()` rebuilds `#moves`, so the toggled element is new: read the control back, never the
  // detached node that was clicked.
  const fresh = document.querySelector<HTMLButtonElement>('#moves .bloom-toggle');
  const panel = document.querySelector<HTMLElement>('#moves .bloom-options');
  return !!panel && !panel.hidden && fresh?.getAttribute('aria-expanded') === 'true';
});

async function main() {
  const state = position();
  // The fixture really offers a five-card and a three-card Bloom (asserted before the browser).
  const legal = legalActions(viewFor(state, 0));
  const sizes = [...new Set(legal.filter((a) => a.t === 'Bloom').map((a) => a.cards.length))].sort((a, b) => a - b);
  equal(sizes, [3, 4, 5], 'fixture: the hand offers 3-, 4- and 5-card Blooms');

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.addInitScript((save) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.save.v7', save);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
        level: 7, sound: false, music: false, vibration: false, coach: false,
        speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always',
      }));
    }, positionSave({ state }));
    await page.goto(base);
    await assertDistChannel(page);
    await resumeSavedGame(page);
    await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 });
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    equal(await page.evaluate(() => (window as any).__severgrow.state()), state, 'the authored 5+3 position is live');

    // The one control the product builds for several recipes.
    const toggle = page.locator('#moves .bloom-toggle');
    equal(await toggle.count(), 1, 'several recipes build one Bloom toggle');
    check((await toggle.getAttribute('aria-haspopup')) === 'menu', 'the toggle opens a menu');

    check(await openMenu(page), 'the recipe drawer opens');
    const first = await readMenu(page);
    assert(first, 'the recipe drawer is readable');
    equal(first.map((b) => idCount(b.kind)), [5, 4, 4, 3, 3, 3, 3], 'biggest first, non-increasing by real card count');
    check(first[0]!.kind.startsWith('bloom-5-'), `the FIRST button is the five-card Bloom (${first[0]!.kind})`);
    check(first.some((b) => idCount(b.kind) === 3), 'a three-card Bloom is still offered');
    // The mini-card strip on each button is unchanged: one icon per card in the recipe.
    for (const b of first) equal(b.icons, idCount(b.kind), `${b.kind}: its mini-card strip shows every card`);
    // The accessible name still says the size and the cards, unaffected by the menu's order.
    for (const b of first) check(b.label.startsWith(`Bloom ${idCount(b.kind)} tile`), `${b.kind}: aria-label keeps its size (${b.label})`);
    // The toggle shows the first recipe's cards too (it mirrors kindButtons[0]).
    equal(await page.locator('#moves .bloom-toggle .futa04-mini-card').count(), 5, 'the toggle previews the five-card recipe');
    await page.screenshot({ path: `${OUT}/390x844-menu.png` });

    // Closing and reopening re-renders the panel: the same hand must produce the same order.
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#moves .bloom-toggle')?.click());
    check(await openMenu(page), 'the recipe drawer reopens');
    const second = await readMenu(page);
    assert(second, 'the reopened recipe drawer is readable');
    equal(second.map((b) => b.kind), first.map((b) => b.kind), 'the order is deterministic across renders');

    // The local build points the duel API at 127.0.0.1:9 (the placeholder from the build command);
    // Chrome refuses that port on its own, so that resource noise is not an app error.
    equal(errors.filter((e) => !e.includes('ERR_UNSAFE_PORT')), [], 'no browser errors');
    console.log(`bloom-order: ${checks} checks passed`);
  } finally {
    await page.close();
  }
}

try {
  await main();
} finally {
  await browser.close();
  await server.close();
}
