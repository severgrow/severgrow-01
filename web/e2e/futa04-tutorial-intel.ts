// Authored tutorial and the two controls built on public match information.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { TUTORIAL_CHAPTER_COUNT, tutorialAccepts, tutorialLesson, tutorialLessons } from '../src/logic/tutorial-script.js';
import { assertDistChannel } from './helpers/dist-channel.js';

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const served=await servePreview(4197,{logLevel:'silent'});
const server=served.server;
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const reducedMotion=process.env.FUTASAKU_REDUCED_MOTION!=='0';
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>(window as any).__severgrow.state() as State);
const play=(action:Action,who:0|1=0)=>page.evaluate(([a,p])=>(window as any).__severgrow.playFor(a,p),[action,who] as const);
/** Wait for the app to finish booting (async UI mounts + the first screen), never a fixed sleep.
 *  The `severor-ready` event fires once, so poll the `ready` hook and fall back to the event. */
const waitBoot=(p:import('playwright-core').Page)=>p.waitForFunction(()=>(window as any).__severgrow?.ready?.()===true,undefined,{timeout:20000});
const base=served.url;
try {
  await page.addInitScript(reduced=>{
    localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({speed:'fast',reduceMotion:reduced,sound:false,music:false,coach:false,eyeCandy:!reduced}));
  },reducedMotion);
  await page.goto(base);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.includes('severgrow') && !key.includes('settings')) localStorage.removeItem(key);
    }
  });
  await page.reload();
  await waitBoot(page);
  await assertDistChannel(page);   // loud if the served dist was built for another channel
  await page.waitForFunction(()=>!!document.getElementById('smart-panel'));
  // The main menu has exactly one tutorial entry (src/strings.ts HELP.tutorial); it starts
  // the guided run from its top — there is no lesson list or chapter picker anywhere.
  assert.equal((await page.locator('#menu-tutorial').textContent())?.trim(), 'Tutorial', 'the single menu entry is named Tutorial');
  assert.equal(await page.locator('#menu-lessons-list').count(), 0, 'the old How-to lessons list is gone');
  assert.equal(await page.locator('#hint-btn').count(), 0, 'the floating in-match "?" tool is removed');
  await page.locator('#menu-tutorial').click();
  await page.waitForFunction(()=>(window as any).__severgrow?.state()?.seed===51000,undefined,{timeout:10000});
  assert.equal(await page.locator('#futasaku-glass .glass-copy').textContent(),'YOUR HOME');
  // Dual advance: tapping the highlighted home must work (not only NEXT).
  await page.waitForSelector('#board .hex-cell[data-key="-2,2"]',{timeout:5000});
  await page.locator('#board .hex-cell[data-key="-2,2"]').click({force:true});
  await page.waitForFunction(()=>document.querySelector('#futasaku-glass .glass-copy')?.textContent==='EACH TURN',undefined,{timeout:8000});
  await page.waitForSelector('#futasaku-glass [data-tut="next"]',{timeout:5000});
  // Glass CTAs must not be blocked by the full-width HUD strip above them.
  await page.locator('#futasaku-glass [data-tut="next"]').click({force:false});
  await page.waitForFunction(()=>(window as any).__severgrow.state()?.seed===51001,{timeout:20000});
  assert.equal(await page.locator('#futasaku-glass .glass-copy').textContent(),'DRAW');
  const opening=await state();
  await page.locator('#discard').evaluate(element=>(element as HTMLElement).click());
  assert.deepEqual(await state(),opening,'an irrelevant early tap leaves the lesson unchanged');
  await page.locator('#deck').evaluate(element=>(element as HTMLElement).click());
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
  assert.equal((await state()).phase,'ACT');
  assert.match(await page.locator('#futasaku-glass .glass-copy').textContent()??'',/GROW|Clean|Nice|There it is|Easy/);
  // Wait out praise, then resume mid-chapter after reload.
  await page.waitForFunction(()=>document.querySelector('#futasaku-glass .glass-copy')?.textContent==='GROW',undefined,{timeout:5000}).catch(()=>{});
  const beforeRefresh=await state();
  await page.reload();
  await page.waitForFunction(()=>!!document.getElementById('smart-panel'));
  await page.locator('#menu-continue').click();
  assert.deepEqual(await state(),beforeRefresh,'tutorial resumes the exact authored position');
  await page.waitForSelector('#futasaku-glass:not([hidden])');
  const resumedTut=await page.evaluate(()=>(window as any).__severgrow.tutorial());
  assert.equal(Number(resumedTut?.chapter),1,'resume keeps the Your-turn chapter');

  // Finish the current Your-turn chapter with the test hook, then jump chapter-by-chapter.
  // Full UI lock coverage lives in futa04-tutorial-lock.ts.
  {
    const steps=tutorialLessons(1);
    for(let index=1;index<steps.length;index++) {
      const lesson=tutorialLesson(1,index)!;
      if(lesson.action==='Opponent') break;
      if(lesson.autoDiscard) {
        await page.waitForFunction(expected=>(window as any).__severgrow.tutorial()?.step>expected,index,{timeout:15000});
        continue;
      }
      if(lesson.action==='Next') {
        await page.evaluate(()=>(window as any).__severgrow.tutorialNext());
        continue;
      }
      await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
      const before=await state();
      const action=legalActions(viewFor(before,0)).find(candidate=>tutorialAccepts(lesson,candidate,before));
      assert(action,`chapter 2: ${lesson.id} must have a real legal action`);
      assert.equal(await play(action),true,`chapter 2: ${lesson.id} applies`);
      await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
      await page.waitForTimeout(700);
    }
  }
  for(let chapter=2;chapter<TUTORIAL_CHAPTER_COUNT-1;chapter++) {
    await page.goto(`${base}?tutorial=1&chapter=${chapter+1}`);
    await page.waitForFunction(()=>!!(window as any).__severgrow?.tutorialGate?.()?.active,undefined,{timeout:20000});
    await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
    const steps=tutorialLessons(chapter);
    for(let index=0;index<steps.length;index++) {
      const lesson=tutorialLesson(chapter,index)!;
      if(lesson.action==='Opponent') break;
      if(lesson.autoDiscard) {
        await page.waitForFunction(expected=>(window as any).__severgrow.tutorial()?.step>expected,index,{timeout:15000});
        continue;
      }
      if(lesson.action==='Next') {
        await page.evaluate(()=>(window as any).__severgrow.tutorialNext());
        await page.waitForTimeout(200);
        continue;
      }
      if(lesson.reseat) {
        await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
      }
      const before=await state();
      const action=legalActions(viewFor(before,0)).find(candidate=>tutorialAccepts(lesson,candidate,before));
      assert(action,`chapter ${chapter+1}: ${lesson.id} must have a real legal action`);
      assert.equal(await play(action),true,`chapter ${chapter+1}: ${lesson.id} applies`);
      await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
      await page.waitForTimeout(700);
    }
  }
  await page.goto(`${base}?tutorial=1&chapter=13`);
  // The free chapter is the player's own turn (no step lock); any explainer before it is stepped through.
  await page.waitForFunction(()=>!!(window as any).__severgrow?.tutorial(),undefined,{timeout:20000});
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
  await page.waitForFunction(()=>(window as any).__severgrow.state()?.seed===51010,undefined,{timeout:10000});
  for(let guard=0;guard<5;guard++) {
    // The recap explainer offers NEXT immediately; step into free play.
    const next = page.locator('#futasaku-glass [data-tut="next"]');
    const shown = await next.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false);
    if(!shown) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  assert.equal(await page.locator('#futasaku-glass .glass-copy').textContent(),'DRAW','the free chapter reaches its own turn, with a line for each step');
  // The unguided turn: real actions; the turn passing to the opponent completes the tutorial.
  let s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Draw'&&a.from==='deck')!),true);
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='EndAct')!),true);
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Discard')!),true);
  // after the free turn: the short button tour, then the menu
  await page.waitForFunction(()=>document.querySelector('#futasaku-glass .glass-copy')?.textContent==='UNDO',undefined,{timeout:15000});
  for(let i=0;i<3;i++) {
    await page.waitForFunction(()=>!!(window as any).__severgrow.tutorial(),undefined,{timeout:8000}).catch(()=>{});
    if(i===2) {
      // The last guide line points at the reference that replaced the in-match "?".
      const lastLine=await page.locator('#futasaku-glass .glass-why').textContent();
      assert.match(lastLine??'',/Match Intel/i,`tutorial's final line points at Match Intel: ${lastLine}`);
      assert.match(lastLine??'',/How to/i,`tutorial's final line names the How to reference: ${lastLine}`);
    }
    await page.evaluate(()=>(window as any).__severgrow.tutorialNext());
    await page.waitForTimeout(250);
  }
  // Finishing the guided run no longer returns to the menu: since 2026-10-16 (owner direction,
  // "after tutorial it takes you to level 1") it hands the player straight into a REAL campaign
  // level through the campaign's own entry point. So assert the hand-off, not a menu visit — and
  // assert the tutorial save is not retained as a live match, which was the original intent.
  await page.waitForFunction(()=>(window as any).__severgrow?.state()?.seed===95001,undefined,{timeout:20000});
  assert.equal(await page.locator('#campaign').isVisible(),false,'the tutorial lands in the level, not the chapter list');
  s=await state();
  assert.equal(s.config.boardRadius,2,'the tutorial hands off to campaign level 1, which uses the small map');
  assert.equal(await page.locator('#gameover').isVisible(),false,'no finish card is shown straight after the tutorial');

  await page.goto(base+'?seed=219682080');
  await page.waitForFunction(()=>!!document.getElementById('smart-panel')&&(window as any).__severgrow?.state()?.seed===219682080);
  s=await state();
  assert.equal(s.startingPlayer,0,'even seed starts with player');
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Draw'&&a.from==='deck')!),true);
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='EndAct')!),true);
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Discard')!),true);
  await page.waitForFunction(()=>(window as any).__severgrow.state()?.turnPlayer===0,undefined,{timeout:20000});
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:20000});
  const played=await state();
  assert.match(await page.locator('#tool-undo').getAttribute('aria-label')??'',/Replay/);
  await page.locator('#tool-undo').evaluate(element=>(element as HTMLElement).click());
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:20000});
  assert.deepEqual(await state(),played,'Replay is visual only');
  await page.locator('#futa04-help-button').evaluate(element=>(element as HTMLElement).click());
  assert.equal(await page.locator('#futasaku-glass[data-mode="intel"]').isVisible(),true);
  assert((await page.locator('#futasaku-glass .intel-card-wrap').count())>=1,'public discarded card art is visible');
  // Match Intel has two clearly separate tabs: what happened, and the moves reference.
  assert.equal(await page.locator('#futasaku-glass .intel-tab').count(),2,'Match Intel shows exactly two tab headings');
  assert.equal(await page.locator('#futasaku-glass .intel-tab[data-intel-tab="intel"]').getAttribute('aria-selected'),'true','tab 1 (what happened) opens first');
  await page.locator('#futasaku-glass .intel-tab[data-intel-tab="howto"]').click();
  assert.equal(await page.locator('#futasaku-glass .intel-tab[data-intel-tab="howto"]').getAttribute('aria-selected'),'true','the How to tab is selectable');
  const howto=await page.locator('#futasaku-glass [data-intel-panel="howto"]').innerText();
  for(const move of ['Grow','Bloom','Strengthen','Bomb','Blast','points'])
    assert(howto.includes(move),`the moves reference explains ${move}`);
  assert(!/seed/i.test(howto),'the reference shows no hidden seed');
  assert.equal(await page.locator('#futasaku-glass .intel-card-wrap').count(),0,'the reference does not mix in the match log');
  // The pause menu's How to play opens this same reference, not the old sheet.
  await page.locator('#futasaku-glass .intel-close').click();
  await page.locator('#hud-menu').click();
  await page.locator('#gm-howto').click();
  assert.equal(await page.locator('#futasaku-glass[data-mode="intel"] [data-intel-tab="howto"][aria-selected="true"]').isVisible(),true,'gm-howto opens the Match Intel How to reference');
  assert.equal(await page.locator('#sheet-howto').isVisible(),false,'FUTASAKU no longer opens the legacy How-to sheet');
  await page.locator('#futasaku-glass .intel-tab[data-intel-tab="intel"]').click();
  assert((await page.locator('#futasaku-glass .intel-card-wrap').count())>=1,'back on tab 1 the public card art returns');
  for (const width of [360,390,430]) {
    await page.setViewportSize({width,height:844});
    await page.waitForFunction(w=>{
      const box=document.getElementById('futasaku-glass')?.getBoundingClientRect();
      return !!box && box.left>=0 && box.right<=w+1;
    },width);
    const glass=await page.locator('#futasaku-glass').boundingBox();
    const dock=await page.locator('#dock').boundingBox();
    assert(glass&&dock&&glass.x>=0&&glass.x+glass.width<=width+1,`Match Intel fits ${width}px viewport: ${JSON.stringify({glass,dock})}`);
    assert(glass.x>=dock.x-1&&glass.x+glass.width<=dock.x+dock.width+1,`Match Intel follows ${width}px cockpit margins: ${JSON.stringify({glass,dock})}`);
  }
  await page.locator('#futasaku-glass .intel-close').click();
  await page.goto(base);
  await page.waitForFunction(()=>!!document.getElementById('menu-continue')&&!document.getElementById('menu-continue')!.hidden);
  await page.locator('#menu-continue').click();
  await page.waitForFunction(()=>(window as any).__severgrow?.state()?.turnPlayer===0);
  assert.match(await page.locator('#tool-undo').getAttribute('aria-label')??'',/Replay/,'Replay survives refresh');
  await page.locator('#tool-undo').evaluate(element=>(element as HTMLElement).click());
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:20000});
  assert.deepEqual(await state(),played,'restored Replay remains visual only');
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Draw'&&a.from==='deck')!),true);
  await page.locator('#hand .card').first().evaluate(element=>(element as HTMLElement).click());
  assert.equal(await page.locator('#futa04-help-button').isEnabled(),true,'Match Intel stays reachable while choosing a card');
  await page.locator('#futa04-help-button').evaluate(element=>(element as HTMLElement).click());
  assert.equal(await page.locator('#futasaku-glass[data-mode="intel"]').isVisible(),true);
  await page.locator('#futasaku-glass .intel-close').click();
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Sprout')!),true);
  assert.match(await page.locator('#tool-undo').getAttribute('aria-label')??'',/Undo/,'Undo takes its slot after a player move');

  await page.goto(base+'?seed=219682081');
  await page.waitForFunction(()=>(window as any).__severgrow?.state()?.seed===219682081);
  assert.equal((await state()).startingPlayer,1,'odd seed starts with opponent');
  await page.waitForFunction(()=>(window as any).__severgrow.state()?.turnPlayer===0,undefined,{timeout:20000});
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:20000});
  assert.match(await page.locator('#tool-undo').getAttribute('aria-label')??'',/Replay/);
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});
  await desktop.goto(base);
  await waitBoot(desktop);
  await desktop.locator('#menu-tutorial').click();
  await desktop.locator('#game').waitFor({state:'visible'});
  await desktop.locator('#futasaku-glass').waitFor({state:'visible'});
  const desktopGlass=await desktop.locator('#futasaku-glass').boundingBox();
  const desktopDock=await desktop.locator('#dock').evaluate(element=>element.getBoundingClientRect().toJSON());
  const desktopCockpit=await desktop.locator('#futa04-box').boundingBox();
  const desktopBoard=await desktop.locator('#board-wrap').boundingBox();
  const desktopLogo=await desktop.locator('#hud-brand').boundingBox();
  assert(desktopGlass&&desktopCockpit&&desktopBoard
    && Math.abs(desktopGlass.x-desktopCockpit.x)<=4
    && Math.abs(desktopGlass.width-desktopCockpit.width)<=8
    && desktopGlass.y+2>=desktopBoard.y
    && (!desktopLogo || desktopGlass.y>=desktopLogo.y+desktopLogo.height+4)
    && desktopGlass.x+desktopGlass.width<=1441,
    `tutorial glass sits in the cockpit column under the logo: ${JSON.stringify({desktopGlass,desktopCockpit,desktopBoard,desktopLogo,desktopDock})}`);
  await desktop.close();
  assert.deepEqual(errors,[],'no browser errors');
  console.log(`Tutorial, Match Intel, Replay, save/resume and both seeded openers passed (reduced motion: ${reducedMotion})`);
} finally { await page.close(); await browser.close(); server.httpServer.close(); }
