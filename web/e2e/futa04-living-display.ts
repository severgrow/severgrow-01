/** Behavioural browser check for the 0.3 menu, resting score and short event response. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import type { Page } from 'playwright-core';
import { openMenuEntry, resumeSavedGame } from './helpers/menu-nav.js';

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4224, { logLevel: 'silent' });
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
    await page.goto(BASE);
    await page.waitForFunction(() => !!(window as any).__ready);
    // The product menu (owner restructure, 2026-10-15, commit 8f3f54f2) is PLAY / Territory /
    // LOG IN / Settings. It has no Continue (owner, 2026-10-19) and no Tutorial (levels 1-10 are
    // the tutorial), and the old flat "New game / Tutorial / Settings" column is retired.
    // Territory needs a live duel endpoint, which this local preview build does not have.
    const menuKeys = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#menu .menu-buttons .btn')]
      .filter(button => button.getClientRects().length > 0).map(button => button.id));
    check(menuKeys[0] === 'menu-play' && !menuKeys.includes('menu-continue') && !menuKeys.includes('menu-tutorial'),
      `${width}: product main menu leads with PLAY and holds no Continue/Tutorial (${menuKeys.join(' | ')})`);
    check(await page.locator('#menu-continue').isHidden() && await page.locator('#menu-tutorial').isHidden(), `${width}: no Continue and no second Tutorial on the product menu`);
    check(await page.locator('#menu-howto,#menu-stats,#menu-v3').count()===0,`${width}: obsolete front-menu elements absent`);
    await openMenuEntry(page, 'menu-new');
    // The five named difficulties were retired on 2026-10-15 (commit b9533fb4): Practice match now
    // offers three carry-over tiers, Easy 3-4 / Medium 5-7 / Hard 8-9.
    check(JSON.stringify(await page.locator('.difficulty-tile').allTextContents()) === JSON.stringify(['EASY', 'MEDIUM', 'HARD']),`${width}: three carry-over tiers`);
    await page.locator('[data-difficulty="medium"]').click();
    await page.waitForSelector('#deck.ready');
    const level=await page.evaluate(()=>(window as any).__severgrow.settings().level);
    check([5,6,7].includes(level),`${width}: Medium selects one saved engine level`);
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__ready);
    await resumeSavedGame(page);
    check(await page.evaluate(()=>(window as any).__severgrow.settings().level)===level,`${width}: exact chosen level survives reload`);
    const resting=await restingScore(page);
    // The sign announces the step word first (DRAW!, ~1.2 s under Reduce Motion; display-machine.ts)
    // and then rests on the live score. Waiting for the settled face is the same requirement the
    // current cockpit suite (futa04-smart-cockpit) states, not a looser one.
    await page.waitForFunction(want => document.getElementById('smart-led-text')?.textContent?.trim() === want, resting, { timeout: 6000 });
    check(await page.locator('#smart-led-text').innerText()===resting,`${width}: score is resting display during Draw (${resting})`);
    check(await page.locator('#smart-led').getAttribute('data-mode')==='score',`${width}: the resting face is the score mode (one neutral ink, no team colour)`);
    // The owner moved the draw light OFF the card's contour onto its own layer (2026-10-22: "remove
    // the contour thing ... the light is its own layer whose opacity breathes"): the pile card now
    // has box-shadow:none and the light is its ::after. Assert the real thing, not the removed one.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#deck .pile-card')!, '::after').boxShadow.includes('242, 237, 224'));
    const white=await page.evaluate(() => ({
      contour: getComputedStyle(document.querySelector('#deck .pile-card')!).boxShadow,
      light: getComputedStyle(document.querySelector('#deck .pile-card')!, '::after').boxShadow,
    }));
    check(white.light.includes('242, 237, 224') && white.contour === 'none',`${width}: legal deck draw has restrained white card-edge light and no contour (${JSON.stringify(white)})`);
    if(!await page.locator('#discard.futa04-bloom-draw').count() && await page.locator('#discard.ready').count())
      check((await page.locator('#discard .pile-card').evaluate(el=>getComputedStyle(el,'::after').boxShadow)).includes('242, 237, 224'),`${width}: ordinary legal discard draw shares white edge light`);
    await page.locator('#deck').evaluate(el=>(el as HTMLElement).click());
    await page.waitForFunction(()=>(window as any).__severgrow.state().phase==='ACT' && !(window as any).__severgrow.busy());
    const grown=await restingScore(page);
    await page.waitForFunction(want => document.getElementById('smart-led-text')?.textContent?.trim() === want, grown, { timeout: 6000 });
    check(await page.locator('#smart-led-text').innerText()===grown,`${width}: score remains during Grow (${grown})`);
    await page.screenshot({path:`/tmp/futasaku-living-display-${width}.png`});
    check(errors.length===0,`${width}: no browser errors (${errors.join(' | ')})`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(`${BASE}?seed=3`);await page.waitForSelector('#deck.ready');
  // The idle re-prompt re-shows the step word, usually with a bang (display-machine.ts scheduleIdle:
  // the alarm blink and a deterministic ! are part of it), so both spellings are the real prompt.
  await page.waitForFunction(() => ['DRAW', 'DRAW!'].includes(document.getElementById('smart-led-text')?.textContent?.trim() ?? ''), undefined, { timeout: 12000 });
  check(['DRAW','DRAW!'].includes((await page.locator('#smart-led-text').innerText()).trim()),'idle phase hint appears after a quiet beat');
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
