// scratch: what does the Grow step actually show in the futa04 cockpit?
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
page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 200)));
await page.addInitScript((raw) => {
  for (const prefix of ['', 'main2:', 'futa04:', 'futa05:', 'futa-test:', 'test:']) localStorage.setItem(`${prefix}severgrow.save.v7`, raw);
}, save);
await page.goto(origin + '/');
await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30000 });
await page.evaluate(() => (document.getElementById('menu-continue') as HTMLButtonElement | null)?.click());
await page.waitForFunction(() => { const h = (window as any).__severgrow; return h && !h.busy() && h.state()?.phase === 'ACT'; }, undefined, { timeout: 30000 });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const ids = ['moves', 'smart-panel', 'smart-context', 'futa04-actions', 'dock', 'futa04-box'];
  const lines: string[] = ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return `${id}: MISSING`;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return `${id}: display=${cs.display} vis=${cs.visibility} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} hidden=${(el as HTMLElement).hidden}`;
  });
  const vis = [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
  lines.push('BUTTONS:');
  for (const b of vis) {
    const r = b.getBoundingClientRect();
    lines.push(`  ${b.id || b.className.split(' ').slice(0, 3).join('.')}: "${b.textContent?.trim().slice(0, 24)}" [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]`);
  }
  return lines.join('\n');
}));
await page.screenshot({ path: '/tmp/mistakes/debug-grow.png' });
await browser.close();
await server.close();
process.exit(0);
