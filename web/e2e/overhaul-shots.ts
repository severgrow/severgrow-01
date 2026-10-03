// Screens for the UI overhaul review: mid-game positions with a move previewed (Confirm moves:
// Always, so the forecast bar shows), after a move (Undo lit), and the Throw step.
//   npx tsx web/e2e/overhaul-shots.ts --dir=<folder> [--w=390 --h=844]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { RULESETS, apply, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/overhaul';
const W = Number(arg('w') ?? 390);
const H = Number(arg('h') ?? 844);
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4198, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const midGame = (seed: number, turn: number): State => {
  let s: State = newGame(seed, RULESETS.sprout);
  let i = 0;
  while (s.phase !== 'GAME_OVER' && !(s.turnNumber >= turn && s.actor === 0 && s.phase === 'ACT')) s = apply(s, chooseLevelAction(viewFor(s, s.actor), 7, i++));
  return s;
};

const state = midGame(31, 11);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: W < 700, isMobile: W < 700 });
await page.addInitScript(([st]) => {
  localStorage.clear();
  localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip', level: 8, confirmPolicy: 'always' }));
  localStorage.setItem('severgrow.save.v5', st as string);
  localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
}, [JSON.stringify({ state, coach: { step: 99, taught: [], known: [], choice: 0, summaryDone: true }, level: 8 })]);
await page.goto('http://localhost:4198/');
await page.click('#menu-continue');
await page.waitForTimeout(1200);
const tag = `${W}x${H}`;
await page.screenshot({ path: `${dir}/${tag}-grow.png` });
// pick the first card that has somewhere to go, then its first target
for (const c of await page.locator('#hand .card').all()) {
  await c.click().catch(() => {});
  await page.waitForTimeout(200);
  if ((await page.locator('#board .l-over .target').count()) > 0) break;
}
const t = page.locator('#board .l-over .target').first();
const box = await t.boundingBox();
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/${tag}-forecast.png` });
await page.locator('#confirm-play').click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/${tag}-after-move.png` });
await page.close();
await browser.close();
await server.close();
console.log(`saved to ${dir}`);
