// A film of a big Blast and a Bomb (Beta 0.8 heaviness), frame by frame, for a human eye: the freeze,
// the settle, the light dip and the dust. Not a CI gate.
//   CHANNEL=futa04 npm run web:build && node --import tsx web/e2e/blast-film.ts [outDir]
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { allNeighbors, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';

const OUT = process.argv[2] ?? '/tmp/blast-film';
const port = 4237;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });

const fixture = (): { state: State; blast: Action; bomb: Action } => {
  const base = newGame(3107);
  const target = { q: -1, r: 2 };
  const board = { ...base.board, [coordKey(target)]: { owner: 1 as Player, strength: 9 } };
  for (const nb of allNeighbors(target)) {
    if (board[coordKey(nb)] === null) board[coordKey(nb)] = { owner: 1 as Player, strength: 4 };
    for (const n2 of allNeighbors(nb)) if (board[coordKey(n2)] === null) board[coordKey(n2)] = { owner: 1 as Player, strength: 2 };
  }
  const state: State = { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board,
    hands: [[{ id: 1000, suit: null, rank: 0 }, { id: 1001, suit: null, rank: 0 }, ...base.hands[0].slice(0, 5)] as Card[], base.hands[1]] };
  const legal = legalActions(viewFor(state, 0));
  const blast = legal.find((a) => a.t === 'MegaBomb' && coordKey(a.target) === coordKey(target))!;
  const bomb = legal.find((a) => a.t === 'PlayFruit')!;
  return { state, blast, bomb };
};

for (const which of ['blast', 'bomb'] as const) {
  const f = fixture();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.addInitScript((save) => {
    (window as any).__name = (fn: unknown) => fn;
    localStorage.setItem('main2:severgrow.save.v7', save);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false }));
  }, positionSave({ state: f.state }));
  await page.goto(`http://localhost:${port}/`);
  await resumeSavedGame(page);
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
  await page.waitForTimeout(1500);
  const box = await page.locator('#board-wrap').boundingBox();
  await page.evaluate((a) => (window as any).__severgrow.playFor(a, 0), which === 'blast' ? f.blast : f.bomb);
  const t0 = Date.now();
  for (const at of [0, 90, 180, 300, 450, 650, 900, 1300]) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot(box ? { path: `${OUT}/${which}-${String(at).padStart(4, "0")}.png`, clip: box } : { path: `${OUT}/${which}-${String(at).padStart(4, "0")}.png` });
  }
  await page.close();
}
await browser.close();
await server.close();
console.log(`film written to ${OUT}`);
