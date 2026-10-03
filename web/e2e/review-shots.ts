// Screens for a design review: real mid-game positions (bots play the first turns), phone size.
//   npx tsx web/e2e/review-shots.ts --dir=<folder>
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { apply, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/review';
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4197, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

/** Bots play until it is my Grow step on turn `turn` (or later). */
const midGame = (seed: number, turn: number): State => {
  let s: State = newGame(seed);
  let i = 0;
  while (s.phase !== 'GAME_OVER' && !(s.turnNumber >= turn && s.actor === 0 && s.phase === 'ACT')) {
    s = apply(s, chooseLevelAction(viewFor(s, s.actor), 7, i++));
  }
  return s;
};

for (const [name, seed, turn] of [['mid', 31, 11], ['late', 44, 17]] as const) {
  const state = midGame(seed, turn);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.addInitScript(([st]) => {
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip', level: 8 }));
    localStorage.setItem('severgrow.save.v5', st as string);
    localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
  }, [JSON.stringify({ state, coach: { step: 99, taught: [], known: [], choice: 0, summaryDone: true }, level: 8 })]);
  await page.goto('http://localhost:4197/');
  await page.click('#menu-continue');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.locator('#hand .card').first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${name}-picked.png` });
  await page.close();
}
await browser.close();
await server.close();
console.log(`saved to ${dir}`);
