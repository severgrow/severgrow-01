import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION,seenWorld } from '../../server/src/world.js';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const world={version:WORLD_VERSION,revision:1,cost:100,challengeStake:0,cells:seenWorld(['0,0']),claims:[{cellId:'0,0',ownerId:'local',ownerName:'Cedar',ownerLevel:3,ownerTag:'',colour:'hsl(150 32% 52%)',claimedAt:1}],disputes:[]};
try{
 const early=await browser.newPage({viewport:{width:390,height:844}});
 await early.route('**/assets/smart-cockpit-*.js',async r=>{await new Promise(r=>setTimeout(r,800));await r.continue();});
 await early.goto(fixture.origin+'/test/');await early.locator('#menu-play:not([hidden])').click();
 await early.waitForFunction(()=>!!(window as any).__severgrow?.ready?.());
 assert(await early.locator('#play-menu').isVisible(),'optional mounts cannot undo an early PLAY tap');
 await early.close();console.log('PASS early PLAY survives optional UI mounting');
 for(const reduce of [false,true]){
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(`window.__name=f=>f;localStorage.setItem('futa05-test:futasaku.world.last.v1',${JSON.stringify(JSON.stringify(world))});localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:${reduce}}));window.__worldBeats=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.id==='online-world-screen')window.__worldBeats.push({frames,duration:options?.duration});return animate.call(this,frames,options);};`);
  await p.goto(fixture.origin+'/test/');await p.waitForFunction(()=>!!(window as any).__severgrow?.ready?.()&&document.querySelector<HTMLElement>('.planet-canvas')?.dataset.planetReady==='true');
  await p.evaluate(()=>(window as any).__oldPlanet=document.querySelector('.planet-canvas'));
  if(!reduce){
   await p.evaluate(()=>{document.getElementById('menu-play')!.click();document.getElementById('play-back')!.click();});
   assert(await p.evaluate(()=>document.querySelector('.planet-canvas')===(window as any).__oldPlanet),'interrupted return reuses its planet');
  }
  const out=await p.evaluate(()=>{
   document.getElementById('menu-play')!.click();const s=(window as any).__severgrow.planet();
   return {visible:!document.getElementById('play-menu')!.hidden,frames:s?.frames,beat:(window as any).__worldBeats.at(-1)};
  });assert(out.visible,'PLAY controls appear in the same task');
  if(!reduce){
   assert.equal(out.beat.duration,650,'actual PLAY exit is 650ms');assert.equal(Number(out.beat.frames.at(-1).opacity),0);
   await p.waitForTimeout(100);const remaining=await p.evaluate(()=>(window as any).__severgrow.planet());
   if(remaining)assert.equal(remaining.frames,out.frames,'the outgoing world retains its last frame without background rendering');
  }
  await p.waitForFunction(()=>!document.querySelector('.planet-canvas'));
  assert(await p.locator('#play-menu').isVisible(),'completion never hides PLAY controls');
  const back=await p.evaluate(()=>{
   const w=window as any;w.__worldBeats=[];document.getElementById('play-back')!.click();
   return {menu:!document.getElementById('menu')!.hidden,opacity:document.getElementById('online-world-screen')!.style.opacity};
  });assert(back.menu,'Back immediately restores menu controls');
  if(!reduce)assert.equal(back.opacity,'0','cold return conceals the unpainted world');
  await p.waitForFunction(()=>document.querySelector<HTMLElement>('.planet-canvas')?.dataset.planetReady==='true');
  if(!reduce){
   await p.waitForFunction(()=>(window as any).__worldBeats.some((b:any)=>b.duration===650&&Number(b.frames[0]?.opacity)===0&&Number(b.frames.at(-1)?.opacity)===1));
   await p.screenshot({path:'/tmp/planet-matte/play-return.png'});
   await p.evaluate(()=>{document.getElementById('menu-play')!.click();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
   assert(await p.locator('#play-menu').isVisible(),'PWA resume during fade keeps PLAY');
   assert(await p.locator('#menu').evaluate(e=>(e as HTMLElement).hidden),'PWA resume cannot uncover the main menu');
  }else assert.equal((await p.evaluate(()=>(window as any).__worldBeats)).length,0,'reduced-motion return allocates no animation');
  assert.equal(errors.length,0,errors.join('\n'));await p.close();
  console.log(`PASS PLAY: ${reduce?'immediate reduced motion':'650ms out/in, first-paint reveal, interrupted return and cleanup'}`);
 }
}finally{await browser.close();await fixture.close();}
