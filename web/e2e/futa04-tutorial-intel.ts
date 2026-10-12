// Authored tutorial and the two controls built on public match information.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { TUTORIAL_CHAPTER_COUNT, tutorialAccepts, tutorialLesson, tutorialLessons } from '../src/logic/tutorial-script.js';

const server=await preview({configFile:'web/vite.config.ts',preview:{port:4197,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const reducedMotion=process.env.FUTASAKU_REDUCED_MOTION!=='0';
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>(window as any).__severgrow.state() as State);
const play=(action:Action,who:0|1=0)=>page.evaluate(([a,p])=>(window as any).__severgrow.playFor(a,p),[action,who] as const);
const base='http://localhost:4197/';
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
  await page.waitForFunction(()=>!!document.getElementById('smart-panel'));
  await page.locator('#menu-tutorial').click();
  assert.equal((await state()).seed,51000);
  assert.equal(await page.locator('#futasaku-glass .glass-copy').textContent(),'HOME');
  await page.waitForSelector('#futasaku-glass [data-tut="next"]',{timeout:5000});
  await page.locator('#futasaku-glass [data-tut="next"]').click();
  await page.waitForFunction(()=>document.querySelector('#futasaku-glass .glass-copy')?.textContent==='THEIR HOME');
  await page.waitForSelector('#futasaku-glass [data-tut="next"]',{timeout:5000});
  await page.locator('#futasaku-glass [data-tut="next"]').click();
  await page.waitForFunction(()=>(window as any).__severgrow.state()?.seed===51001,{timeout:20000});
  assert.equal(await page.locator('#futasaku-glass .glass-copy').textContent(),'DRAW PILE');
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
    await page.waitForFunction(()=>!!(window as any).__severgrow.tutorialGate?.()?.active,undefined,{timeout:20000});
    await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
    const steps=tutorialLessons(chapter);
    for(let index=0;index<steps.length;index++) {
      const lesson=tutorialLesson(chapter,index)!;
      if(lesson.action==='Opponent') break;
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
  // The free chapter opens with a recap explainer; step through it to the unguided turn.
  await page.waitForFunction(()=>!!(window as any).__severgrow.tutorialGate?.()?.active,undefined,{timeout:20000});
  await page.waitForFunction(()=>!(window as any).__severgrow.busy(),undefined,{timeout:15000});
  await page.waitForFunction(()=>(window as any).__severgrow.state()?.seed===51010,undefined,{timeout:10000});
  for(let guard=0;guard<5;guard++) {
    // The recap explainer arms its NEXT after a short delay; wait for it, then step on.
    const next = page.locator('#futasaku-glass [data-tut="next"]');
    const shown = await next.waitFor({ state: 'visible', timeout: 3000 }).then(()=>true).catch(()=>false);
    if(!shown) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  assert.equal(await page.locator('#futasaku-glass .glass-copy').textContent(),'PLAY','the free chapter reaches its unguided turn');
  // The unguided turn: real actions; the turn passing to the opponent completes the tutorial.
  let s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Draw'&&a.from==='deck')!),true);
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='EndAct')!),true);
  s=await state();
  assert.equal(await play(legalActions(viewFor(s,0)).find(a=>a.t==='Discard')!),true);
  await page.waitForFunction(()=>!document.getElementById('menu')!.hidden,undefined,{timeout:15000});
  assert.equal(await page.locator('#menu-continue').isVisible(),false,'finished tutorial is not retained as a live match');

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
