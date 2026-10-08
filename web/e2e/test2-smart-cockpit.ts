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
const near=(a:number,b:number)=>Math.abs(a-b)<.7;
const rects = (page:Page) => page.evaluate(() => {
  const r = (id:string) => document.getElementById(id)!.getBoundingClientRect();
  const panel=r('smart-panel'), led=r('smart-led'), context=r('smart-context');
  const undo=r('tool-undo'), tips=r('test2-help-button'), sort=r('hand-sort');
  const piles=['deck','discard'].map(id=>({ pile:r(id), count:r(`${id}-count`), frontOffset:parseFloat(getComputedStyle(document.getElementById(id)!).getPropertyValue('--pile-front-offset'))||0 }));
  return { panel,led,context,undo,tips,sort,piles,box:r('test2-box') };
});
const aligned = (r:Awaited<ReturnType<typeof rects>>,label:string) => {
  check(near(r.led.y,r.context.y)&&near(r.undo.y,r.tips.y)&&near(r.tips.y,r.sort.y),`${label}: exactly two aligned rows`);
  check(near(r.led.width,r.undo.width+r.tips.width+(r.tips.x-r.undo.right))&&near(r.context.width,r.undo.width),`${label}: LED spans two buttons`);
  check(near(r.led.width,92)&&near(r.led.height,44)&&near(r.context.width,44)&&near(r.context.height,44),`${label}: generated shells keep the original outer footprints`);
  check([r.context,r.undo,r.tips,r.sort].every(b=>b.width>=44&&b.height>=44),`${label}: four 44px targets`);
  check(near(r.context.x,r.sort.x)&&near(r.led.x,r.undo.x)&&near(r.led.right,r.tips.right),`${label}: fixed three-column grid`);
  check(r.piles.every(({pile,count,frontOffset})=>near(pile.x+pile.width/2+frontOffset*pile.width/50,count.x+count.width/2)),`${label}: meters centred under visible top cards`);
  check(r.panel.left>=r.box.left-1&&r.panel.right<=r.box.right+1,`${label}: panel remains inside cockpit`);
};

try {
  for (const [width,height,side] of [[360,640,'right'],[390,664,'right'],[390,664,'left'],[390,844,'right'],[430,932,'right'],[768,1024,'right'],[1280,800,'right'],[1440,900,'right'],[1600,980,'right'],[1920,1080,'right'],[390,844,'left']] as const) {
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
    check(await page.locator('#smart-led-text').innerText()==='DRAW',`${name}: immediate Draw LED`);
    check(await page.locator('#smart-led-cells').evaluate(el => (el as HTMLCanvasElement).width > 0),`${name}: phase text uses real LED cells`);
    const materials=await page.evaluate(()=>['hand-sort','deck-count','smart-led'].map(id=>getComputedStyle(document.getElementById(id)!,'::before').backgroundImage));
    check(materials[0]!.includes('button-frame-supplied.webp')&&materials[1]!.includes('counter-frame-supplied.webp')&&materials[2]!.includes('display-frame-supplied.webp'),`${name}: each coded control uses the supplied frame art`);
    check(await page.locator('#smart-led-cells').evaluate(el=>el.getBoundingClientRect().height)===26,`${name}: LED uses the enlarged full-height glyph canvas`);
    check(await page.locator('#smart-led').evaluate(el=>getComputedStyle(el,'::before').backgroundSize)==='contain',`${name}: supplied display art keeps its proportions`);
    check(await page.locator('#deck-count').evaluate(el=>getComputedStyle(el,'::before').backgroundSize)==='contain',`${name}: supplied counter art keeps its proportions`);
    check(!await page.locator('#step-cue').isVisible(),`${name}: routine board prompt removed`);
    check(await page.locator('#smart-context').isDisabled(),`${name}: neutral context during Draw`);
    check(await page.locator('#tool-undo').isDisabled(),`${name}: Undo visible but unavailable at start`);
    check(await page.locator('#discard.test2-bloom-draw').count()===0,`${name}: ordinary discard has no combo cue`);
    check(await page.locator('#discard .gd-fx').evaluate(el=>getComputedStyle(el).display)==='none',`${name}: no extra discard draw rectangle`);
    check(await page.locator('#deck .gd-fx').evaluate(el=>getComputedStyle(el).display)==='none',`${name}: no draw halo behind the deck`);
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
    if(mobile && width/height>=.53) {
      const map=await page.evaluate(()=>{
        const cells=[...document.querySelectorAll<SVGPathElement>('#board-wrap .l-base path.hex')].map(el=>el.getBoundingClientRect());
        return {left:Math.min(...cells.map(r=>r.left)),right:Math.max(...cells.map(r=>r.right)),top:Math.min(...cells.map(r=>r.top)),bottom:Math.max(...cells.map(r=>r.bottom))};
      });
      const controlLeft=Math.min(grow.piles[0]!.pile.left,grow.piles[1]!.pile.left,grow.panel.left);
      const controlRight=Math.max(grow.piles[0]!.pile.right,grow.piles[1]!.pile.right,grow.panel.right);
      check(Math.abs(map.left-controlLeft)<7&&Math.abs(map.right-controlRight)<7,`${name}: map and cockpit controls share outer margins`);
      check(map.top>=-1&&map.bottom<=grow.panel.top+15,`${name}: enlarged map stays between header and controls`);
    }
    check(await page.locator('#deck-count,#discard-count').evaluateAll(nodes=>nodes.every(node=>{
      const style=getComputedStyle(node);return style.width==='34px'&&style.height==='18px';
    })),`${name}: counter shells keep the 34×18px coded footprint through Draw transitions`);
    check(await page.locator('#smart-led-text').innerText()==='GROW OR SKIP',`${name}: immediate Grow LED`);
    check((await page.locator('#hand .card.playable').first().evaluate(el=>getComputedStyle(el).boxShadow)).includes('88, 171, 86'),`${name}: green card-edge light`);
    check(!await page.locator('#smart-context').isDisabled(),`${name}: Skip in context slot`);
    await page.screenshot({path:`${dir}/${width}x${height}-${side}-grow.png`});
    await page.locator('#smart-context').click(); await waitPhase(page,'DISCARD');
    aligned(await rects(page),`${name} Throw`);
    check(await page.locator('#smart-led-text').innerText()==='THROW',`${name}: immediate Throw LED`);
    check(!await page.locator('#smart-led-cells').evaluate(el=>el.classList.contains('scrolling')),`${name}: short Throw message remains stationary`);
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
  check(await page.locator('#smart-bloom-selector button').count()===1,'Bloom: one distinct recipe, independent of placement routes');
  check(await page.locator('#smart-bloom-button .test2-combination .test2-mini-card').count()===3,'Bloom: cockpit shows symbolic recipe cards');
  await page.locator('#smart-bloom-button').click();
  check(!await page.locator('#smart-bloom-selector').isVisible(),'Bloom: single recipe selects on one tap');
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
    check(await page.locator('#smart-bloom').isVisible(),'Bloom: Undo restores the available recipe');
    await page.evaluate(action=>(window as any).__severgrow.playFor(action,0),bloomAction);
    await page.waitForFunction(()=>document.querySelector('#smart-led-text')?.textContent?.startsWith('BLOOM +'));
    check(await page.locator('#smart-led').getAttribute('data-mode')==='red','LED: completed Bloom triggers a brief red result');
    await page.waitForFunction(()=>document.querySelector('#smart-led-text')?.textContent?.startsWith('YOU '));
    await page.waitForFunction(()=>document.querySelector('#smart-led')?.getAttribute('data-mode')==='amber');
    check(await page.locator('#smart-led-text').innerText()===await page.evaluate(()=>{
      const root=document.documentElement;
      return root.dataset.step==='throw'?'THROW':root.dataset.step==='draw'?'DRAW':root.dataset.step==='opp'?'OPPONENT TURN':root.dataset.test2Bloom==='true'?'BLOOM READY':'GROW OR SKIP';
    }),'LED: result and score return to current phase');
  }
  // A real Bloom result owns the sign until its event → score sequence finishes.
  await page.waitForTimeout(2600);
  await page.evaluate(()=>{const banner=document.getElementById('banner')!;banner.textContent='THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW';});
  await page.waitForFunction(()=>document.querySelector('#smart-led-text')?.textContent?.startsWith('THIS IS A LONG'));
  check(await page.locator('#smart-led-cells').evaluate(el=>(el as HTMLCanvasElement).width/(window.devicePixelRatio||1)<76),'LED: reduced motion uses readable full-size static shorthand');
  check((await page.locator('#smart-led-cells').evaluate(el=>getComputedStyle(el).animationName))==='none','LED: reduced motion keeps long text still');
  await page.evaluate(()=>{document.documentElement.classList.remove('reduce-motion');window.dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>document.querySelector('#smart-led-cells')?.classList.contains('scrolling'));
  check(await page.locator('#smart-led-cells').evaluate(el=>(el as HTMLCanvasElement).width/(window.devicePixelRatio||1)>400),'LED: long copy uses full-width cells and repeated marquee');
  check((await page.locator('#smart-led-cells').evaluate(el=>getComputedStyle(el).animationName))==='smart-led-scroll','LED: long text scrolls with motion enabled');
  await page.close();
  const discard=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await discard.addInitScript(()=>{ (window as any).__name=(fn:unknown)=>fn; localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true})); });
  await discard.goto(`${BASE}?seed=14`); await discard.waitForSelector('#discard.ready');
  check(await discard.locator('#discard.test2-bloom-draw').count()===1,'Draw: discard card creates a new Bloom combination');
  check(await discard.locator('#discard .gd-fx').evaluate(el=>getComputedStyle(el).display)==='none','Draw: old discard rectangle is removed');
  check((await discard.locator('#discard .pile-top').evaluate(el=>getComputedStyle(el).transform))!=='none','Draw: combo-relevant top card lifts within its own pile');
  await discard.screenshot({path:`${dir}/390x844-combo-discard.png`});
  await discard.close();
  const wells=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await wells.addInitScript(()=>{ (window as any).__name=(fn:unknown)=>fn; localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true})); });
  await wells.goto(`${BASE}?seed=1`); await wells.waitForSelector('#deck.ready');
  await wells.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click()); await waitPhase(wells,'ACT');
  await wells.locator('#hand .card.playable').first().click();
  const target=wells.locator('#board .target.kind-grow').first(); await target.waitFor();
  await wells.waitForTimeout(450); // placement entrance may replace overlay paths once
  check(await wells.locator('#board .receptive-well').count()===await wells.locator('#board .target.kind-grow').count(),'Grow: only legal empty targets receive wells');
  check(await wells.locator('#board .target.kind-grow').evaluateAll(nodes=>nodes.every(node=>!node.getAttribute('d')?.includes('Q'))),'Grow: every legal well uses the same straight hex geometry');
  const resting=Number(await target.evaluate(el=>getComputedStyle(el).fillOpacity));
  const key=await target.getAttribute('data-key');
  const point=await hexCenter(wells,key!);
  await target.evaluate((el,position)=>el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:position.x,clientY:position.y,pointerType:'touch'})),point);
  await wells.waitForTimeout(220);
  const awake=Number(await target.evaluate(el=>getComputedStyle(el).fillOpacity));
  const proximity=await target.evaluate(el=>el.style.getPropertyValue('--near'));
  check(awake>resting,`Grow: proximity strengthens the same receptive-well treatment (${resting} → ${awake}; near ${proximity})`);
  await wells.screenshot({path:`${dir}/390x844-legal-wells.png`});
  await wells.close();
  const branch=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await branch.addInitScript(()=>{ (window as any).__name=(fn:unknown)=>fn; localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true})); });
  await branch.goto(`${BASE}?seed=4`); await branch.waitForSelector('#deck.ready');
  await branch.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click()); await waitPhase(branch,'ACT');
  check(await branch.locator('#smart-bloom-selector button').count()>1,'Bloom: multiple recipes are listed separately');
  check(await branch.locator('#smart-bloom-button').evaluate(el=>getComputedStyle(el).backgroundImage)==='none','Bloom: centre recipe has no hardware frame');
  check(await branch.locator('#smart-bloom-button').evaluate(el=>{
    const rank=(node:Element)=>Math.max(...[...node.querySelectorAll('.c-num')].map(n=>Number(n.textContent)||0));
    return rank(el)===Math.max(...[...document.querySelectorAll('#smart-bloom-selector button')].map(rank));
  }),'Bloom: centre shows a recipe containing the highest card rank');
  await branch.locator('#smart-bloom-button').click();
  check(await branch.locator('#smart-bloom-selector').isVisible(),'Bloom: compact recipe drawer opens');
  await branch.screenshot({path:`${dir}/390x844-bloom-selector.png`});
  await branch.keyboard.press('Escape');
  check(!await branch.locator('#smart-bloom-selector').isVisible(),'Bloom: Escape closes the recipe drawer');
  await branch.locator('#smart-bloom-button').click();
  await branch.locator('#smart-bloom-selector button[aria-label*="Dew 7"]').click();
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
  const cameraPage=await browser.newPage({viewport:{width:1280,height:800}});
  await cameraPage.addInitScript(()=>{ (window as any).__name=(fn:unknown)=>fn; localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true})); });
  await cameraPage.goto(`${BASE}?seed=1`); await cameraPage.waitForSelector('#deck.ready');
  const board=await cameraPage.locator('#board-wrap').boundingBox();
  check(!!board,'Camera: board has a visible viewport');
  if(board) { await cameraPage.mouse.move(board.x+board.width/2,board.y+board.height/2); await cameraPage.mouse.wheel(0,-600); }
  await cameraPage.waitForFunction(()=>!(document.querySelector('.cam-whole') as HTMLButtonElement).hidden);
  check(!await cameraPage.locator('.cam-whole').isVisible(),'Camera: no extra top-screen button');
  check(await cameraPage.locator('#smart-context').getAttribute('aria-label')==='Whole map','Camera: Whole map enters the context slot after manual zoom');
  await cameraPage.locator('#smart-context').click();
  check(await cameraPage.locator('#smart-context').getAttribute('aria-label')==='Back to play','Camera: Back to play replaces Whole map in the same slot');
  await cameraPage.locator('#smart-context').click();
  check(await cameraPage.locator('#smart-context').getAttribute('aria-label')!=='Back to play','Camera: context action restores play framing');
  await cameraPage.close();
  console.log(`${checks} smart cockpit checks passed; screenshots: ${dir}`);
} finally { await browser.close(); if(server) await new Promise<void>(resolve=>server.httpServer.close(()=>resolve())); }
