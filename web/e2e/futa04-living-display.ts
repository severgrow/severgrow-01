/** Behavioural browser check for the 0.3 menu, resting score and short event response. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import type { Page } from 'playwright-core';

const server = await preview({configFile:'web/vite.config.ts',preview:{port:4224,strictPort:true},logLevel:'silent'});
const browser = await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
let checks=0;
const check=(value:unknown,label:string)=>{assert(value,label);checks++;};
/** The LED's resting face is the human's live score ("0:0", or "0:1" when the futa04 new-game
 *  seed gave the opening to the bot). Read the expected value from the engine so the assertion
 *  is deterministic no matter which side the random new-game seed starts. */
const restingScore=async(page:Page)=>{
  const state=await page.evaluate(()=>(window as any).__severgrow.state() as State);
  const view=viewFor(state,0);
  return `${view.score}:${view.opponentScore}`;
};
try {
  for(const [width,height] of [[390,844],[1920,1080]] as const){
    const page=await browser.newPage({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(() => window.addEventListener('severor-ready', () => { (window as any).__ready = true; }));
    await page.goto('http://localhost:4224/');
    await page.waitForFunction(() => !!(window as any).__ready);
    check((await page.locator('#menu .menu-buttons button:visible').allTextContents()).join('|').includes('New game|Tutorial|Settings'),`${width}: minimal main menu`);
    check(await page.locator('#menu-howto,#menu-stats,#menu-v3').count()===0,`${width}: obsolete front-menu elements absent`);
    await page.locator('#menu-new').click();
    check((await page.locator('.difficulty-tile').allTextContents()).length===5,`${width}: five named difficulty choices`);
    await page.locator('[data-difficulty="medium"]').click();
    await page.waitForSelector('#deck.ready');
    const level=await page.evaluate(()=>(window as any).__severgrow.settings().level);
    check([5,6,7].includes(level),`${width}: Medium selects one saved engine level`);
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__ready);
    await page.locator('#menu-continue').click();
    check(await page.evaluate(()=>(window as any).__severgrow.settings().level)===level,`${width}: exact chosen level survives reload`);
    const resting=await restingScore(page);
    check(await page.locator('#smart-led-text').innerText()===resting,`${width}: score is resting display during Draw (${resting})`);
    check(await page.locator('#smart-led').getAttribute('data-mode')==='score',`${width}: player/opponent score uses coloured LED mode`);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#deck .pile-card')!).boxShadow.includes('239, 234, 220'));
    const white=await page.locator('#deck .pile-card').evaluate(el=>getComputedStyle(el).boxShadow);
    check(white.includes('239, 234, 220'),`${width}: legal deck draw has restrained white card-edge light`);
    if(!await page.locator('#discard.futa04-bloom-draw').count() && await page.locator('#discard.ready').count())
      check((await page.locator('#discard .pile-card').evaluate(el=>getComputedStyle(el).boxShadow)).includes('239, 234, 220'),`${width}: ordinary legal discard draw shares white edge light`);
    await page.locator('#deck').evaluate(el=>(el as HTMLElement).click());
    await page.waitForFunction(()=>(window as any).__severgrow.state().phase==='ACT' && !(window as any).__severgrow.busy());
    const grown=await restingScore(page);
    check(await page.locator('#smart-led-text').innerText()===grown,`${width}: score remains during Grow (${grown})`);
    await page.screenshot({path:`/tmp/futasaku-living-display-${width}.png`});
    check(errors.length===0,`${width}: no browser errors (${errors.join(' | ')})`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto('http://localhost:4224/?seed=3');await page.waitForSelector('#deck.ready');
  await page.waitForTimeout(6100);
  check(await page.locator('#smart-led-text').innerText()==='DRAW','idle phase hint appears after six seconds');
  await page.locator('#deck').evaluate(el=>(el as HTMLElement).click());
  await page.waitForFunction(()=>(window as any).__severgrow.state().phase==='ACT'&&!(window as any).__severgrow.busy());
  const state=await page.evaluate(()=>(window as any).__severgrow.state());
  const bloom=legalActions(viewFor(state,0)).find(action=>action.t==='Bloom');
  assert(bloom);
  await page.evaluate(action=>(window as any).__severgrow.playFor(action,0),bloom);
  await page.waitForFunction(()=>/^\+\d+$/.test(document.querySelector('#smart-led-text')?.textContent??''));
  check(await page.locator('#smart-led').getAttribute('data-mode')==='green','Bloom gain reads green and uses actual result');
  await page.waitForFunction(()=>document.querySelector('#smart-led')?.getAttribute('data-mode')==='score');
  check(/^\d+:\d+$/.test(await page.locator('#smart-led-text').innerText()),'event settles back to live score');
  await page.close();
  console.log(`${checks} Living Display browser checks passed`);
} finally { await browser.close(); server.httpServer.close(); }
