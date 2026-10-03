// The Seed look in every palette, at Normal and Low effects: a real mid-game Seed board
// (bots play the first turns), the board only, on a phone.
//   npx tsx web/e2e/seed-palettes.ts [--dir=docs/screens/seed/palettes]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { RULESETS, apply, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { THEME_IDS } from '../src/logic/themes.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/seed/palettes';
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4199, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

let state: State = newGame(31, RULESETS.seed);
for (let i = 0; !(state.turnNumber >= 11 && state.actor === 0 && state.phase === 'ACT'); i++) state = apply(state, chooseLevelAction(viewFor(state, state.actor), 7, i));

const errors: string[] = [];
for (const palette of THEME_IDS)
  for (const effects of ['normal', 'low'] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([s, st]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', st as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    }, [JSON.stringify({ sound: false, coach: false, speed: 'skip', palette, effects }), JSON.stringify({ state, coach: { step: 99, taught: [], known: [], choice: 0, summaryDone: true }, level: 7 })]);
    await page.goto('http://localhost:4199/');
    await page.click('#menu-continue');
    await page.mouse.move(385, 840);
    await page.waitForTimeout(1600);
    await page.locator('#board').screenshot({ path: `${dir}/${palette}-${effects}.png` });
    await page.close();
  }
await browser.close();
await server.close();
console.log(errors.length ? `errors: ${errors.join(' | ')}` : `saved to ${dir}`);
