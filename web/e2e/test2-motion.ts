/** Focused checks for Futasaku 0.3's card flights and network wave. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';

const server = await preview({configFile:'web/vite.config.ts',preview:{port:4199,strictPort:true},logLevel:'silent'});
const browser = await chromium.launch({...(process.env.PW_CHROMIUM ? {executablePath:process.env.PW_CHROMIUM} : {}),args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
try {
  await page.addInitScript(() => localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:false,speed:'normal'})));
  await page.goto('http://localhost:4199/?seed=2');
  await page.waitForSelector('#deck.ready');
  const draw = await page.evaluate(async () => {
    const before = new Set((window as any).__severgrow.state().hands[0].map((card:{id:number})=>card.id));
    const pile = document.querySelector('#deck .pile-card')!.getBoundingClientRect();
    document.getElementById('deck')!.click();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const id = (window as any).__severgrow.state().hands[0].find((card:{id:number})=>!before.has(card.id)).id;
    const card = document.querySelector<HTMLElement>(`#hand [data-card="${id}"]`)!;
    const anim = card.getAnimations().find(a=>(a.effect as KeyframeEffect).getKeyframes().some(k=>'translate' in k));
    return {pile:pile.toJSON(),card:card.getBoundingClientRect().toJSON(),
      frames:(anim?.effect as KeyframeEffect | undefined)?.getKeyframes(),duration:(anim?.effect as KeyframeEffect | undefined)?.getTiming().duration};
  });
  assert.equal(draw.duration,330,'draw card travels for the intended short beat');
  const first = String(draw.frames?.[0]?.translate ?? '');
  assert(first.includes('px') && first !== '0 0','draw starts at the actual pile, not already in hand');
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());
  await page.locator('#smart-context').click();
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'DISCARD' && !(window as any).__severgrow.busy());
  const before = await page.evaluate(() => (window as any).__severgrow.state());
  const throwAction = legalActions(viewFor(before,0)).find(action=>action.t==='Discard');
  assert(throwAction,'a legal card can be thrown');
  const thrown = await page.evaluate(async action => {
    (window as any).__severgrow.playFor(action,0);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const flyer = document.querySelector<HTMLElement>('.flyer.card');
    const anim = flyer?.getAnimations()[0];
    const source = document.querySelector<HTMLElement>(`#hand [data-card="${(action as any).card}"]`);
    return {sourceGoneOrHidden:!source || source.style.visibility==='hidden',
      frames:(anim?.effect as KeyframeEffect | undefined)?.getKeyframes(),duration:(anim?.effect as KeyframeEffect | undefined)?.getTiming().duration};
  },throwAction);
  assert(thrown.sourceGoneOrHidden,'the original card does not double while its copy flies');
  assert.equal(thrown.duration,330,'throw reaches the pile before the state advances');
  assert.equal((thrown.frames?.[1] as any)?.offset,.52,'throw follows a short arc');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click()); // existing tap-to-skip path
  await page.waitForFunction(() => !(window as any).__severgrow.busy(),undefined,{timeout:30000});
  assert.equal(await page.locator('.flyer.card').count(),0,'fast-forward removes an interrupted flight');

  await page.goto('http://localhost:4199/?seed=3');
  await page.waitForSelector('#deck.ready');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click());
  await page.waitForFunction(() => (window as any).__severgrow.state().phase==='ACT' && !(window as any).__severgrow.busy());
  const bloomState = await page.evaluate(() => (window as any).__severgrow.state());
  const bloom = legalActions(viewFor(bloomState,0)).find(action=>action.t==='Bloom');
  assert(bloom?.t==='Bloom','the seeded match offers Bloom');
  await page.evaluate(action=>(window as any).__severgrow.playFor(action,0),bloom);
  await page.waitForFunction(() => document.querySelectorAll('#board .territory-contour.grow-in').length>0,undefined,{timeout:5000});
  const wave = await page.locator('#board .territory-contour.grow-in').evaluateAll(paths=>paths.map(path=>getComputedStyle(path).animationDelay));
  assert(wave.length>0,'new contour edges draw on during Bloom');
  await page.waitForFunction(() => !(window as any).__severgrow.busy(),undefined,{timeout:30000});
  assert.equal(await page.locator('#board .territory-contour.grow-in').count(),0,'the wave settles into the stable contour');
  const menu = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await menu.goto('http://localhost:4199/');
  await menu.locator('#menu-new').click();
  await menu.locator('#levels').waitFor({state:'visible'});
  assert.deepEqual(await menu.locator('#level-grid button').allTextContents(),['BEGINNER','EASY','MEDIUM','HARD','PRO']);
  assert.equal(await menu.locator('#level-grid button svg,#level-grid button .lt-note').count(),0,'difficulty choices are names only');
  await menu.screenshot({path:'/tmp/futasaku-03-difficulty.png'});
  await menu.close();
  console.log('Futasaku 0.3 motion checks passed: Draw, Throw, Bloom contour and interrupted-flight cleanup');
} finally {
  await page.close(); await browser.close(); await server.close();
}
