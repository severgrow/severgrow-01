// THE UNDO NUDGE, in a real browser.
//
// The owner asked for a pulse on the "redo" button; there is no redo, only `#tool-undo` ("Take back
// your last move"), and it stays live only until the throw. This suite plants two positions as a
// saved game (the save format accepts a full `base` state) and proves what the player actually sees:
//
//   1. A Grow step ended while the win was on the table: the Undo key pulses, the pulse breathes,
//      the key does not change size, and one press of Undo takes the move back.
//   2. The same position, then the throw: the pulse is gone, because there is nothing left to undo
//      (the deadline this feature is built on).
//   3. A clean Grow step: no pulse at all.
//   4. Reduce motion: the glow is still there (an affordance, not decoration) but it does not move.
//   5. Effects Low: the same pulse, quieter.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/undo-nudge.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { allNeighbors, coordKey, homeCoord, newGame, onBoard, parseKey } from '../../src/engine/index.js';
import type { Card, State, Tile } from '../../src/engine/index.js';
import { encodeSave } from '../src/logic/persist.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp/mistakes';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const allCards = (s: State): Card[] => [...s.deck, ...s.hands[0], ...s.hands[1]];
const mine = (): Tile => ({ owner: 0, strength: 5 });

/** Player 0 to act in the Grow step, holding one low card and (when `bad`) one claim from a win. */
const position = (bad: boolean): { state: State; card: Card } => {
  const s = newGame(1);
  const board = { ...s.board };
  if (bad) {
    // Their home is surrounded by mine except for one empty door: the classic "skip the surround".
    const theirHome = homeCoord(1, s.config);
    const doors = allNeighbors(theirHome).filter((n) => onBoard(n, s.config) && s.terrain[coordKey(n)] !== 'rock');
    const door = parseKey('1,-1');
    const keys = [...doors.filter((d) => coordKey(d) !== coordKey(door)).map(coordKey), '-1,2', '-1,1', '0,0', '1,0'];
    for (const k of keys) board[k] = mine();
  }
  const card = allCards(s).find((c) => c.suit !== null && c.rank === 1)!;
  return {
    state: {
      ...s,
      board,
      hands: [[card], s.hands[1].filter((c) => c.id !== card.id)],
      deck: s.deck.filter((c) => c.id !== card.id),
      phase: 'ACT',
      turnPlayer: 0,
      actor: 0,
      sproutsThisTurn: 0,
    },
    card,
  };
};

/** Mid-match coach progress: the opening 15 hints are over, so the nudge is not muted by them. */
const COACH_DONE = { step: 40, taught: [], known: [], choice: 0, summaryDone: true };

const open = async (page: Page, origin: string, bad: boolean) => {
  const { state, card } = position(bad);
  const save = encodeSave({ seed: state.seed, actions: [], coach: COACH_DONE, level: 7, base: state });
  await page.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:', 'futa05:', 'futa-test:', 'test:']) localStorage.setItem(`${prefix}severgrow.save.v7`, raw);
  }, save);
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.evaluate(() => (document.getElementById('menu-continue') as HTMLButtonElement | null)?.click());
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return h && !h.busy() && h.state()?.phase === 'ACT' && h.canUndo() === false;
  }, undefined, { timeout: 30_000 });
  return card;
};

const nudgeClass = (page: Page) =>
  page.evaluate(() => document.getElementById('tool-undo')?.classList.contains('mistake-nudge') === true);
const quietClass = (page: Page) =>
  page.evaluate(() => document.getElementById('tool-undo')?.classList.contains('mistake-nudge-quiet') === true);
const halo = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('#tool-undo .nudge-halo');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = document.getElementById('tool-undo')!.getBoundingClientRect();
    return { opacity: Number(cs.opacity), animation: cs.animationName, w: Math.round(r.width), h: Math.round(r.height) };
  });
const endGrowStep = async (page: Page) => {
  // The player's own "end the Grow step", never the app's auto-skip: this position has a legal
  // Grow, so autoAdvance cannot fire. In the FUTASAKU 0.4 cockpit the moves row itself is
  // `visibility: hidden` and the controls are the glass key (#smart-context), which mirrors the
  // row and calls the real `#moves .end` button — so tap that key, and fall back to the row.
  const glass = page.locator('#smart-context[data-action="skip"]');
  if ((await glass.count()) > 0) await glass.click();
  else await page.evaluate(() => (document.querySelector('#moves .end') as HTMLButtonElement | null)?.click());
  await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'DISCARD', undefined, { timeout: 15_000 });
  await page.waitForTimeout(700); // the key only lights once the move stops animating (not busy)
};

const runBad = async (page: Page, origin: string, tag: string) => {
  await open(page, origin, true);
  const before = await halo(page);
  check(`${tag}: the key starts dark and un-nudged`, (await nudgeClass(page)) === false && before?.opacity === 0);
  await endGrowStep(page);
  const shown = await nudgeClass(page);
  check(`${tag}: ending the Grow step with the win on the table pulses the Undo key`, shown);
  await page.waitForTimeout(120);
  const a = await halo(page);
  await page.waitForTimeout(420);
  const b = await halo(page);
  await page.waitForTimeout(420);
  const c = await halo(page);
  check(`${tag}: the glow breathes (opacity moves)`, !!a && !!b && !!c && new Set([a.opacity, b.opacity, c.opacity]).size > 1, `${a?.opacity}/${b?.opacity}/${c?.opacity}`);
  check(`${tag}: the glow is an animation, not a static wash`, !!a && a.animation === 'undo-nudge-pulse', a?.animation);
  check(`${tag}: the 44px key does not change size`, !!before && !!a && a.w === before.w && a.h === before.h && a.w === 44, `${before?.w}x${before?.h} -> ${a?.w}x${a?.h}`);
  const label = await page.evaluate(() => document.getElementById('tool-undo')?.getAttribute('aria-label') ?? '');
  check(`${tag}: the key says why it is lit`, label.includes('the win was on the table'), label);
  await page.screenshot({ path: `${SHOTS}/${tag}-nudge-390x844.png` });
  return { a, b, c };
};

const { server, origin } = await servePreview(0, { logLevel: 'error' });
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  // 1. The pulse itself, and the throw deadline.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, speed: 'skip', reduceMotion: false, eyeCandy: false, effects: 'normal' });
    await runBad(page, origin, 'win');

    // The throw empties the undo stack: the pulse must go, because Undo cannot help any more.
    const save = await page.evaluate(() => (window as any).__severgrow.state() as State);
    const id = save.hands[0][0]!.id;
    await page.evaluate((card) => (window as any).__severgrow.playFor({ t: 'Discard', card }, 0), id);
    await page.waitForFunction(() => (window as any).__severgrow.state()?.phase !== 'DISCARD' || (window as any).__severgrow.canUndo() === false, undefined, { timeout: 15_000 });
    await page.waitForTimeout(400);
    check('after the throw: the pulse is gone (nothing left to undo)', (await nudgeClass(page)) === false);
    check('after the throw: canUndo() is false, as the nudge requires', (await page.evaluate(() => (window as any).__severgrow.canUndo())) === false);
    await page.screenshot({ path: `${SHOTS}/after-throw-390x844.png` });
    await context.close();
  }
  // 2. One press of Undo takes the move back, and the pulse goes with the position.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, speed: 'skip', reduceMotion: false, eyeCandy: false, effects: 'normal' });
    await runBad(page, origin, 'undo');
    const stateBefore = await page.evaluate(() => JSON.stringify((window as any).__severgrow.state()));
    await page.locator('#tool-undo').click();
    await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 15_000 });
    await page.waitForTimeout(500);
    check('one press of Undo returns to the Grow step', (await page.evaluate(() => (window as any).__severgrow.state()?.phase)) === 'ACT');
    check('undo really moved the position back', (await page.evaluate(() => JSON.stringify((window as any).__severgrow.state()))) !== stateBefore);
    check('the pulse belongs to the position: it is gone after the take-back', (await nudgeClass(page)) === false);
    await page.screenshot({ path: `${SHOTS}/after-undo-390x844.png` });
    await context.close();
  }
  // 3. A clean Grow step says nothing.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, speed: 'skip', reduceMotion: false, eyeCandy: false, effects: 'normal' });
    await open(page, origin, false);
    await endGrowStep(page);
    await page.waitForTimeout(600);
    check('a good Grow step: no pulse at all', (await nudgeClass(page)) === false);
    await page.screenshot({ path: `${SHOTS}/good-move-390x844.png` });
    await context.close();
  }
  // 4. Reduce motion: still an affordance, simply still.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, speed: 'skip', reduceMotion: true, eyeCandy: false, effects: 'normal' });
    await open(page, origin, true);
    await endGrowStep(page);
    const reduced = (await nudgeClass(page)) && (await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')));
    check('reduce motion: the nudge is still offered', reduced);
    const h1 = await halo(page);
    await page.waitForTimeout(500);
    const h2 = await halo(page);
    check('reduce motion: the glow is static (no animation, same opacity)', !!h1 && !!h2 && h1.animation === 'none' && h1.opacity === h2.opacity && h1.opacity > 0.3, `${h1?.animation} ${h1?.opacity}->${h2?.opacity}`);
    await page.screenshot({ path: `${SHOTS}/reduce-motion-390x844.png` });
    await context.close();
  }
  // 5. Effects Low: the same pulse, quieter.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, speed: 'skip', reduceMotion: false, eyeCandy: false, effects: 'low' });
    await open(page, origin, true);
    await endGrowStep(page);
    check('effects low: the nudge is marked quiet', await quietClass(page));
    let peak = 0;
    for (let i = 0; i < 6; i++) {
      const h = await halo(page);
      peak = Math.max(peak, h?.opacity ?? 0);
      await page.waitForTimeout(300);
    }
    check('effects low: the pulse stays under half strength', peak > 0 && peak <= 0.55, String(peak));
    await page.screenshot({ path: `${SHOTS}/effects-low-390x844.png` });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.log(`${failed} undo-nudge checks failed`);
  process.exit(1);
}
console.log('undo-nudge checks passed');
process.exit(0);
