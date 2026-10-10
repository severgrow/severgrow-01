// Normal-motion visual check for both connected networks. The broader turn suite
// deliberately uses Reduce motion, so it cannot verify travelling light.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { positionSave } from './position.js';
import { fruitPosition, NINE_CHAIN } from './fruitcards-pos.js';

const port = 4197;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
try {
  const game = fruitPosition(NINE_CHAIN, [[0,4],[1,6],[2,5]], 0);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('main2:severgrow.save.v7',save);
    localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,effects:'normal',reduceMotion:false}));
    localStorage.setItem('main2:severgrow.look.v3','1');
  },positionSave({state:game}));
  await page.goto(`http://localhost:${port}/`);
  await page.locator('#menu-continue').click({timeout:30000});
  await page.waitForFunction(() => document.querySelectorAll('#board .territory-pulse').length === 2,undefined,{timeout:10000}).catch(async error => {
    const detail = await page.evaluate(() => ({ count:document.querySelectorAll('#board .territory-pulse').length, sway:document.querySelector('#board')?.classList.contains('sway'), game:document.querySelector('#game')?.className, menu:document.querySelector('#menu')?.className, actor:(window as any).__severgrow?.state()?.actor, settings:localStorage.getItem('main2:severgrow.settings.v1'), keys:Object.keys(localStorage), url:location.href }));
    throw new Error(`${error.message}: ${JSON.stringify(detail)}; errors: ${errors.join('|')}`);
  });
  const read = async (owner: number) => page.locator(`#board .territory-pulse.p${owner} > g`).evaluate(el => {
    const m = (el as SVGGraphicsElement).getCTM(); return [m?.e ?? 0,m?.f ?? 0];
  });
  for (const owner of [0,1]) {
    const before = await read(owner);
    await page.waitForTimeout(220);
    const after = await read(owner);
    assert(Math.hypot(after[0]!-before[0]!,after[1]!-before[1]!) > .5,`player ${owner}: surface light is travelling`);
  }
  assert.equal(await page.locator('#board .l-veins > *, #board .ghost-vein').count(),0,'no permanent connectors');
  assert.equal(await page.locator('#board .skin-wing, #board .skin-flame, #board .skin-ember, #board .skin-mote.rise').count(),0,'butterflies and rising fire are absent');
  assert((await page.locator('#board .seed-stone[data-owner="0"]').count()) >= 2,'light stones');
  assert((await page.locator('#board .seed-stone[data-owner="1"]').count()) >= 2,'dark stones');
  const brand = await page.locator('#hud-brand').evaluate(async el => { const src=el.querySelector('image')?.getAttribute('href') ?? ''; const asset=new Image(); asset.src=src; await asset.decode(); return {rect:el.getBoundingClientRect().toJSON(),visibility:getComputedStyle(el).visibility,display:getComputedStyle(el).display,opacity:getComputedStyle(el).opacity,loaded:asset.naturalWidth>0,color:getComputedStyle(el.querySelector('feFlood')!).floodColor}; });
  assert(brand.loaded && brand.rect.width > 50 && brand.visibility === 'visible' && brand.display !== 'none' && Number(brand.opacity) > 0,`V3 wordmark visible: ${JSON.stringify(brand)}`);
  assert.deepEqual(errors,[],'no browser errors');
  await page.waitForTimeout(1500);
  await page.screenshot({path:'/tmp/futasaku-territory-pulse.png'});
  console.log('Both territory pulses travel; V3 stones, effects and wordmark passed');
  await page.close();
} finally {
  await browser.close();
  await server.httpServer.close();
}
