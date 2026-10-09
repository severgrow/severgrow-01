/** Small visual-system smoke check: real moves drive the light; the recipe and
 * stone remain independent of board skin, and reduced motion stays still. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';

const server = await preview({ configFile:'web/vite.config.ts', preview:{ port:4194, strictPort:true }, logLevel:'silent' });
const browser = await chromium.launch({ executablePath:process.env.PW_CHROMIUM ?? '/usr/bin/chromium', args:['--no-sandbox'] });
try {
  for (const [v3,reduced] of [[false,false],[true,false],[false,true]] as const) {
    const page = await browser.newPage({ viewport:{ width:390,height:844 }, isMobile:true, hasTouch:true });
    const errors:string[] = []; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(reduceMotion=>localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({ sound:false,music:false,coach:false,reduceMotion })),reduced);
    await page.goto(`http://localhost:4194/?seed=3${v3?'&design=v3':''}`);
    await page.waitForSelector('#deck.ready');
    await page.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click());
    await page.waitForFunction(()=>(window as any).__severgrow.state().phase==='ACT' && !(window as any).__severgrow.busy());
    if (v3) await page.waitForFunction(()=>document.querySelector('#board')?.getAttribute('data-skin')==='forest-volcano-v3');
    const recipe = await page.locator('#smart-bloom-button .test2-combination').evaluate(el=>({
      animation:getComputedStyle(el).animationName,
      background:getComputedStyle(el.parentElement!).backgroundColor,
      glow:getComputedStyle(el).filter,
    }));
    assert.equal(recipe.background,'rgba(0, 0, 0, 0)');
    assert(recipe.glow.includes('drop-shadow'));
    assert.equal(recipe.animation.includes('test2-recipe-projector'),!reduced);
    const before = await page.evaluate(()=>(window as any).__severgrow.state());
    const move = legalActions(viewFor(before,0)).find(a=>a.t===(v3?'Sprout':'Bloom'));
    assert(move?.t==='Sprout'||move?.t==='Bloom');
    await page.evaluate(action=>(window as any).__severgrow.playFor(action,0),move);
    if (!reduced) await page.waitForFunction(()=>document.querySelector('#test2-outcome-light')?.getAnimations().some(a=>a.playState==='running'));
    const key = coordKey(move.t==='Bloom'?move.hexes[0]!:move.coord);
    const stone = await page.locator(`#board .tile[data-key="${key}"] .seed-stone-shadow`).evaluate(el=>({
      fill:getComputedStyle(el).fill, x:el.getAttribute('cx'), y:el.getAttribute('cy'),
    }));
    assert(stone.fill.includes('seed-stone-shadow'));
    assert(Number(stone.x)>0 && Number(stone.y)>0);
    if (reduced) assert.equal(await page.locator('#test2-outcome-light').evaluate(el=>el.getAnimations().length),0);
    else assert.equal(await page.locator('#test2-outcome-light').getAttribute('data-tone'),'good');
    if (!v3 && !reduced) {
      await page.waitForFunction(()=>document.querySelector('#smart-panel')?.classList.contains('hardware-reflect'));
      assert.equal(await page.locator('#smart-led').evaluate(el=>getComputedStyle(el,'::before').animationName),'test2-hardware-reflect');
    } else assert.equal(await page.locator('#smart-panel').evaluate(el=>el.classList.contains('hardware-reflect')),false);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Default/V3 projector, stone shadow and outcome light checks passed.');
} finally { await browser.close(); await server.httpServer.close(); }
