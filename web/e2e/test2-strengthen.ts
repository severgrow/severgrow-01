import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { PREVIOUS_RULES_VERSION, apply, coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import { fruitPosition, NINE_CHAIN } from './fruitcards-pos.js';
import { positionSave } from './position.js';

const port = 4199;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
try {
  const initial = fruitPosition(NINE_CHAIN, [[0,8]], 0);
  const old = { ...initial, config: { ...initial.config, strengthenLimitPerGame: 2 }, strengthenUsed: [2,0] as [number,number] };
  const before = { ...old, config: { ...old.config, strengthenLimitPerGame: -1 } };
  const oldSave = JSON.parse(positionSave({state:old}));
  oldSave.rules = PREVIOUS_RULES_VERSION;
  const action = legalActions(viewFor(before,0)).find(a => a.t === 'Sprout' && coordKey(a.coord) === '-1,1');
  assert(action?.t === 'Sprout');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(save => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('main2:severgrow.save.v7', save);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound:false,music:false,coach:false,reduceMotion:true,autoSkip:false }));
  },JSON.stringify(oldSave));
  await page.goto(`http://localhost:${port}/`);
  await page.locator('#menu-continue').click();
  await page.waitForFunction(() => !(window as any).__severgrow.busy());
  assert.deepEqual(await page.evaluate(() => (window as any).__severgrow.state()), before);
  await page.locator(`#hand [data-card="${action.card}"]`).click();
  const targets = await page.locator('#board .target.kind-strengthen').count();
  console.log(`Strengthen targets after rank-8 selection: ${targets}`);
  await page.locator('#board g.hex-cell[data-key="-1,1"]').click();
  await page.waitForFunction(() => !(window as any).__severgrow.busy());
  const after = await page.evaluate(() => (window as any).__severgrow.state());
  assert.deepEqual(after,apply(before,action));
  console.log('Rank-8 Strengthen of owned rank-3 tile passed');
} finally {
  await browser.close();
  await server.httpServer.close();
}
