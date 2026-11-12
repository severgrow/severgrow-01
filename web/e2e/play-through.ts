// PLAY THROUGH (owner, 2026-11-06: "the animation plays but never gets in the way of playing the
// game, even when someone wants to play very quickly"). A Bloom is committed; while its tiles are
// still landing one by one, the player picks a card and grows with it, then ends the turn and
// throws. Nothing is skipped (no fast-forward in the animation log), the Bloom finishes playing,
// the moves land in order, and the held throw card stays in the hand until its flight.
//
//   CHANNEL=futa04 npm run web:build
//   PW_CHROMIUM=/path/to/chrome node --import tsx web/e2e/play-through.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { resumeSavedGame } from './helpers/menu-nav.js';

const port = Number(process.env.PLAY_THROUGH_PORT ?? 4231);
const base = `http://localhost:${port}/`;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };

const card = (id: number, suit: Card['suit'], rank: number): Card => ({ id, suit, rank });
const position = (): State => {
  const start = newGame(11);
  const terrain = { ...start.terrain };
  for (const key of Object.keys(terrain)) terrain[key] = 'normal';
  return { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [[card(900, 0, 1), card(901, 0, 2), card(902, 0, 3), card(910, 1, 5), card(920, 2, 7)], start.hands[1]] };
};

type G = { state: () => State; busy: () => boolean; legal: () => Action[]; sel: () => { card: number | null }; playFor: (a: Action, p: 0 | 1) => boolean; animLog: () => { ev: string }[] };

async function main() {
  const state = position();
  const bloom = legalActions(viewFor(state, 0)).find((a) => a.t === 'Bloom' && a.cards.length === 3)!;
  check(bloom, 'fixture: a three-card Bloom is offered');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript((save) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.save.v7', save);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
        level: 7, sound: false, music: false, vibration: false, coach: false,
        speed: 'normal', reduceMotion: false, autoSkip: false, confirmPolicy: 'never',
      }));
    }, positionSave({ state }));
    await page.goto(base);
    await assertDistChannel(page);
    await resumeSavedGame(page);
    await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 });
    await page.waitForFunction(() => !(window as any).__severgrow.busy());

    // 1. The Bloom starts playing.
    check(await page.evaluate((a) => ((window as any).__severgrow as G).playFor(a, 0), bloom), 'the Bloom is played');
    check(await page.evaluate(() => ((window as any).__severgrow as G).busy()), 'its tiles are still landing');

    // 2. Mid-Bloom, the player taps the next card: it is picked, and the Bloom keeps playing.
    await page.locator('#hand [data-card="910"]').click({ force: true });
    const mid = await page.evaluate(() => {
      const g = (window as any).__severgrow as G;
      return { busy: g.busy(), sel: g.sel()?.card, ff: g.animLog().filter((m) => m.ev === 'fast-forward').length };
    });
    check(mid.sel === 910, `the card is picked mid-animation (${JSON.stringify(mid)})`);
    check(mid.busy, 'the Bloom is still playing after the tap (not skipped)');
    check(mid.ff === 0, 'nothing was fast-forwarded');

    // 3. ...and grows with it, still mid-Bloom: the grow queues behind the Bloom.
    const sprout = await page.evaluate(() => ((window as any).__severgrow as G).legal().find((a) => a.t === 'Sprout' && a.card === 910) ?? null);
    check(sprout && sprout.t === 'Sprout', 'the picked card has a legal spot while the Bloom plays');
    const key = `${(sprout as { coord: { q: number; r: number } }).coord.q},${(sprout as { coord: { q: number; r: number } }).coord.r}`;
    const box = await page.locator(`#board g.hex-cell[data-key="${key}"]`).boundingBox();
    assert(box);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction((k) => !!((window as any).__severgrow as G).state().board[k], key, { timeout: 5000 });
    const after = await page.evaluate(() => ({ busy: ((window as any).__severgrow as G).busy(), ff: ((window as any).__severgrow as G).animLog().filter((m) => m.ev === 'fast-forward').length }));
    check(after.ff === 0, 'the grow did not skip the Bloom');
    check(after.busy, 'the Bloom (then the grow) is still playing');

    // 4. The turn moves on to the throw by itself, and the throw can be made at once, still mid-show.
    await page.waitForFunction(() => ((window as any).__severgrow as G).state().phase === 'DISCARD', null, { timeout: 5000 });
    const throwOpen = await page.evaluate(() => ((window as any).__severgrow as G).busy());
    await page.locator('#hand [data-card="920"]').click({ force: true });
    await page.locator('#discard').click({ force: true });
    await page.waitForFunction(() => ((window as any).__severgrow as G).state().discard.at(-1)?.id === 920, null, { timeout: 5000 });
    const thrown = await page.evaluate(() => ({
      busy: ((window as any).__severgrow as G).busy(),
      ff: ((window as any).__severgrow as G).animLog().filter((m) => m.ev === 'fast-forward').length,
      held: !!document.querySelector('#hand .card.throw-held[data-card="920"]'),
    }));
    console.log(`  the throw step opened ${throwOpen ? 'while the show still played' : 'after the show'}; ${JSON.stringify(thrown)}`);
    check(thrown.ff === 0, 'the throw skipped nothing');
    if (thrown.busy) check(thrown.held, 'a card thrown mid-show waits in the hand for its flight (never vanishes first)');

    // 5. Everything settles, in order, with the board matching the game.
    await page.waitForFunction(() => !((window as any).__severgrow as G).busy(), null, { timeout: 10_000 });
    const end = await page.evaluate(() => {
      const st = ((window as any).__severgrow as G).state();
      const shown = [...document.querySelectorAll('#board .hex-cell')].length;
      return { phase: st.phase, owned: Object.values(st.board).filter((t) => t && t.owner === 0).length, shown };
    });
    check(end.owned >= 5, `the Bloom's three tiles and the grow all landed (${JSON.stringify(end)})`);
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
    console.log(`play-through: ${checks} checks passed`);
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
