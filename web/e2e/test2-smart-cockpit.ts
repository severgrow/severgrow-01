/** Current Futasaku 0.3 cockpit: real game actions, geometry and visual states. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import { hexCenter } from './drawing.js';

const BASE = process.env.TEST2_URL ?? 'http://localhost:4198/';
const server = process.env.TEST2_URL ? null : await preview({ configFile:'web/vite.config.ts', preview:{ port:4198, strictPort:true }, logLevel:'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath:process.env.PW_CHROMIUM } : {}), args:['--no-sandbox'] });
const dir = '/tmp/futasaku-smart-cockpit'; mkdirSync(dir,{recursive:true});
let checks = 0;
const check = (value:unknown,label:string) => { assert(value,label); checks++; };
const waitPhase = (page:Page,value:string) => page.waitForFunction(want => (window as any).__severgrow?.state().phase===want && !(window as any).__severgrow.busy(),value);
const rects = (page:Page) => page.evaluate(() => {
  const r = (id:string) => document.getElementById(id)!.getBoundingClientRect();
  const panel=r('smart-panel'), led=r('smart-led'), context=r('smart-context');
  const undo=r('tool-undo'), tips=r('test2-help-button'), sort=r('hand-sort');
  const piles=['deck','discard'].map(id=>({ pile:r(id), count:r(`${id}-count`) }));
  return { panel,led,context,undo,tips,sort,piles,box:r('test2-box') };
});
const aligned = (r:Awaited<ReturnType<typeof rects>>,label:string) => {
  const near=(a:number,b:number)=>Math.abs(a-b)<.7;
  check(near(r.led.y,r.context.y)&&near(r.undo.y,r.tips.y)&&near(r.tips.y,r.sort.y),`${label}: exactly two aligned rows`);
  check(near(r.led.width,r.undo.width+r.tips.width+(r.tips.x-r.undo.right))&&near(r.context.width,r.undo.width),`${label}: LED spans two buttons`);
  check([r.context,r.undo,r.tips,r.sort].every(b=>b.width>=44&&b.height>=44),`${label}: four 44px targets`);
  check(near(r.context.x,r.sort.x)&&near(r.led.x,r.undo.x)&&near(r.led.right,r.tips.right),`${label}: fixed three-column grid`);
  check(r.piles.every(({pile,count})=>near(pile.x+pile.width/2,count.x+count.width/2)),`${label}: mechanical counters centred under piles`);
  check(r.panel.left>=r.box.left-1&&r.panel.right<=r.box.right+1,`${label}: panel remains inside cockpit`);
};

try {
  for (const [width,height,side] of [[360,640,'right'],[390,664,'right'],[390,844,'right'],[430,932,'right'],[768,1024,'right'],[1280,800,'right'],[1440,900,'right'],[1600,980,'right'],[1920,1080,'right'],[390,844,'left']] as const) {
    const name=`${width}x${height} ${side}`, mobile=width<600;
    const page=await browser.newPage({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(which => {
      (window as any).__name=(fn:unknown)=>fn;
      localStorage.setItem('main2:severgrow-thumb',JSON.stringify({side:which}));
      localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true}));
    },side);
    await page.goto(`${BASE}?seed=1`); await page.waitForSelector('#deck.ready');
    await page.waitForFunction(()=>document.getElementById('smart-panel') && document.querySelector('#hand .card'));
    await page.waitForTimeout(1100); // intentional Draw entrance finishes before anchoring assertions
    let start=await rects(page); aligned(start,`${name} Draw`);
    check(await page.locator('#smart-led-text').innerText()==='DRAW A CARD',`${name}: immediate Draw LED`);
    check(!await page.locator('#step-cue').isVisible(),`${name}: routine board prompt removed`);
    check(await page.locator('#smart-context').isDisabled(),`${name}: neutral context during Draw`);
    check(await page.locator('#tool-undo').isDisabled(),`${name}: Undo visible but unavailable at start`);
    await page.screenshot({path:`${dir}/${width}x${height}-${side}-draw.png`});
    const x=start.piles[0]!.pile.x;
    for(let i=0;i<4;i++) {
      await page.locator('#hand-sort').click();
      await page.waitForTimeout(240); // let the card-only sort animation finish
      const now=await rects(page);aligned(now,`${name} sort ${i+1}`);
      check(Math.abs(now.piles[0]!.pile.x-x)<1&&Math.abs(now.piles[1]!.pile.x-start.piles[1]!.pile.x)<1,`${name}: sorting keeps both piles anchored`);
    }
    await page.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click()); await waitPhase(page,'ACT');
    const grow=await rects(page);aligned(grow,`${name} Grow`);
    check(await page.locator('#smart-led-text').innerText()==='GROW OR SKIP',`${name}: immediate Grow LED`);
    check((await page.locator('#hand .card.playable').first().evaluate(el=>getComputedStyle(el).boxShadow)).includes('88, 171, 86'),`${name}: green card-edge light`);
    check(!await page.locator('#smart-context').isDisabled(),`${name}: Skip in context slot`);
    await page.screenshot({path:`${dir}/${width}x${height}-${side}-grow.png`});
    await page.locator('#smart-context').click(); await waitPhase(page,'DISCARD');
    aligned(await rects(page),`${name} Throw`);
    check(await page.locator('#smart-led-text').innerText()==='THROW A CARD',`${name}: immediate Throw LED`);
    check((await page.locator('#hand .card').first().evaluate(el=>getComputedStyle(el).boxShadow)).includes('190, 68, 47'),`${name}: red card-edge light`);
    check(await page.locator('#smart-context').isDisabled(),`${name}: context neutral when throwing`);
    await page.screenshot({path:`${dir}/${width}x${height}-${side}-throw.png`});
    check(errors.length===0,`${name}: no browser errors: ${errors.join(' | ')}`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.addInitScript(()=>{ (window as any).__name=(fn:unknown)=>fn; localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true})); });
  await page.goto(`${BASE}?seed=3`);await page.waitForSelector('#deck.ready');
  await page.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click());await waitPhase(page,'ACT');
  check(await page.locator('#smart-selector button').count()>1,'Bloom: multiple valid contextual actions');
  await page.locator('#smart-context').click();
  check(await page.locator('#smart-selector').isVisible(),'Bloom: context opens the selector');
  const fit=await page.evaluate(()=>{const p=document.getElementById('smart-panel')!.getBoundingClientRect(),s=document.getElementById('smart-selector')!.getBoundingClientRect();return s.left>=p.left-.5&&s.right<=p.right+.5&&s.top>=p.top-.5&&s.bottom<=p.bottom+.5;});
  check(fit,'Bloom: temporary selector stays within cockpit, clear of board and cards');
  await page.screenshot({path:`${dir}/390x844-bloom-selector.png`});
  await page.keyboard.press('Escape');check(!await page.locator('#smart-selector').isVisible(),'Bloom: Escape closes selector');
  await page.locator('#smart-context').click();await page.locator('#smart-selector button[data-action^="bloom:"]').first().click();
  check(!await page.locator('#smart-selector').isVisible(),'Bloom: selecting an action closes the selector');
  await page.waitForTimeout(1400); // the context-change cue briefly explains Cancel first
  check(await page.locator('#smart-led-text').innerText()==='BLOOM READY','Bloom: LED names selected phase');
  await page.screenshot({path:`${dir}/390x844-bloom.png`});
  const beforeBloom = await page.evaluate(() => (window as any).__severgrow.state());
  const cards = [6,43,61];
  const bloomAction = legalActions(viewFor(beforeBloom,0)).find(action => action.t === 'Bloom' && action.cards.join(',') === cards.join(','));
  check(!!bloomAction && bloomAction.t === 'Bloom','Bloom: selected set has a legal board route');
  if (bloomAction?.t === 'Bloom') {
    for (const coord of [bloomAction.hexes[0]!,bloomAction.hexes.at(-1)!]) {
      const point = await hexCenter(page,`${coord.q},${coord.r}`);
      await page.touchscreen.tap(point.x,point.y);
    }
    await page.waitForFunction(previous => (window as any).__severgrow.state().history.length > previous && !(window as any).__severgrow.busy(),beforeBloom.history.length);
    check(await page.locator('#tool-undo').isEnabled(),'Bloom: endpoint shortcut commits and Undo is available');
    await page.locator('#tool-undo').click();
    await page.waitForFunction(previous => (window as any).__severgrow.state().history.length === previous && !(window as any).__severgrow.busy(),beforeBloom.history.length);
    check(await page.locator('#smart-led-text').innerText()==='BLOOM READY','Bloom: Undo restores the prior action');
  }
  await page.evaluate(()=>{const banner=document.getElementById('banner')!;banner.textContent='THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW';});
  await page.waitForFunction(()=>document.querySelector('#smart-led-text')?.textContent?.startsWith('THIS IS A LONG'));
  await page.waitForFunction(()=>document.querySelector('#smart-led-text')?.classList.contains('scrolling'));
  check((await page.locator('#smart-led-text').evaluate(el=>getComputedStyle(el).animationName))==='none','LED: reduced motion keeps long text still');
  await page.evaluate(()=>document.documentElement.classList.remove('reduce-motion'));
  check((await page.locator('#smart-led-text').evaluate(el=>getComputedStyle(el).animationName))==='smart-led-scroll','LED: long text scrolls with motion enabled');
  await page.close();
  const branch=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await branch.addInitScript(()=>{ (window as any).__name=(fn:unknown)=>fn; localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true})); });
  await branch.goto(`${BASE}?seed=4`); await branch.waitForSelector('#deck.ready');
  await branch.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click()); await waitPhase(branch,'ACT');
  await branch.locator('#smart-context').click();
  await branch.locator('#smart-selector button[data-action*="bloom-3-49.51.53"]').click();
  const first=await hexCenter(branch,'-3,0'); await branch.touchscreen.tap(first.x,first.y);
  await branch.locator('#smart-context').click();
  check(await branch.locator('#smart-selector button[data-action^="clear:"]').count()===1,'Bloom: Clear remains reachable');
  check(await branch.locator('#smart-selector button[data-action^="reverse:"]').count()===1,'Bloom: Reverse remains reachable alongside Clear');
  await branch.locator('#smart-selector button[data-action^="reverse:"]').click();
  check(await branch.locator('#moves .draw-reverse[aria-pressed="true"]').count()===1,'Bloom: Reverse executes existing action');
  await branch.locator('#smart-context').click();
  await branch.locator('#smart-selector button[data-action^="clear:"]').click();
  check(await branch.locator('#moves .draw-clear').count()===0,'Bloom: Clear executes existing action');
  await branch.close();
  console.log(`${checks} smart cockpit checks passed; screenshots: ${dir}`);
} finally { await browser.close(); if(server) await new Promise<void>(resolve=>server.httpServer.close(()=>resolve())); }
