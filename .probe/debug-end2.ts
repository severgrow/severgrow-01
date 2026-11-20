import { chromium } from 'playwright-core';
import { allNeighbors, coordKey, homeCoord, newGame, onBoard, parseKey } from '../src/engine/index.js';
import type { Card, State, Tile } from '../src/engine/index.js';
import { encodeSave } from '../web/src/logic/persist.js';
import { servePreview } from '../web/e2e/helpers/preview-port.js';
import { seedSettings } from '../web/e2e/helpers/settings-seed.js';

const allCards = (s: State): Card[] => [...s.deck, ...s.hands[0], ...s.hands[1]];
const mine = (): Tile => ({ owner: 0, strength: 5 });
const s = newGame(1);
const board = { ...s.board };
const theirHome = homeCoord(1, s.config);
const doors = allNeighbors(theirHome).filter((n) => onBoard(n, s.config) && s.terrain[coordKey(n)] !== 'rock');
const door = parseKey('1,-1');
for (const k of [...doors.filter((d) => coordKey(d) !== coordKey(door)).map(coordKey), '-1,2', '-1,1', '0,0', '1,0']) board[k] = mine();
const card = allCards(s).find((c) => c.suit !== null && c.rank === 1)!;
const state: State = { ...s, board, hands: [[card], s.hands[1].filter((c) => c.id !== card.id)], deck: s.deck.filter((c) => c.id !== card.id), phase: 'ACT', turnPlayer: 0, actor: 0, sproutsThisTurn: 0 };
const save = encodeSave({ seed: state.seed, actions: [], coach: { step: 40, taught: [], known: [], choice: 0, summaryDone: true }, level: 7, base: state });

const { server, origin } = await servePreview(0, { logLevel: 'error' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
await seedSettings(page, { sound: false, music: false, speed: 'skip', reduceMotion: false, eyeCandy: false, effects: 'normal' });
await page.addInitScript((raw) => {
  for (const prefix of ['', 'main2:', 'futa04:', 'futa05:', 'futa-test:', 'test:']) localStorage.setItem(`${prefix}severgrow.save.v7`, raw);
}, save);
await page.goto(origin + '/');
await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30000 });
await page.evaluate(() => (document.getElementById('menu-continue') as HTMLButtonElement | null)?.click());
await page.waitForFunction(() => { const h = (window as any).__severgrow; return h && !h.busy() && h.state()?.phase === 'ACT'; }, undefined, { timeout: 30000 });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const ctx = document.getElementById('smart-context')!;
  const moves = document.getElementById('moves')!;
  const sel = document.getElementById('smart-selector');
  return [
    `ctx action=${ctx.dataset.action} label=${ctx.getAttribute('aria-label')} haspopup=${ctx.getAttribute('aria-haspopup')} disabled=${(ctx as HTMLButtonElement).disabled}`,
    `ctx rect ${JSON.stringify(ctx.getBoundingClientRect().toJSON())}`,
    `moves children: ${[...moves.children].map((c) => `${c.tagName}.${c.className.split(' ').slice(0, 2).join('.')}`).join(' | ')}`,
    `selector: ${sel ? `${sel.hidden ? 'hidden' : 'open'} children=${sel.children.length}` : 'MISSING'}`,
    `state phase=${(window as any).__severgrow.state()?.phase}`,
  ].join('\n');
}));
await page.locator('#smart-context').click({ force: true });
await page.waitForTimeout(1200);
console.log('after glass click:', await page.evaluate(() => {
  const sel = document.getElementById('smart-selector');
  return `phase=${(window as any).__severgrow.state()?.phase} selector=${sel ? (sel.hidden ? 'hidden' : 'open') : 'MISSING'} action=${document.getElementById('smart-context')!.dataset.action}`;
}));
await page.evaluate(() => (document.querySelector('#moves .end') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(1200);
console.log('after dom click:', await page.evaluate(() => {
  const undo = document.getElementById('tool-undo')!;
  const halo = document.querySelector('#tool-undo .nudge-halo');
  return `phase=${(window as any).__severgrow.state()?.phase} canUndo=${(window as any).__severgrow.canUndo()} nudge=${undo.classList.contains('mistake-nudge')} op=${halo ? getComputedStyle(halo).opacity : 'none'}`;
}));
await page.screenshot({ path: '/tmp/mistakes/debug-end2.png' });
await browser.close();
await server.close();
process.exit(0);
