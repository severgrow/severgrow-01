import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const world={version:WORLD_VERSION,revision:1,cost:100,challengeStake:0,cells:seenWorld(['0,0']),claims:[{cellId:'0,0',ownerId:'local',ownerName:'Cedar',ownerLevel:3,ownerTag:'',colour:'hsl(150 32% 52%)',claimedAt:1}],disputes:[]};
try{
 const early=await browser.newPage({viewport:{width:390,height:844}});
 await early.route('**/assets/smart-cockpit-*.js', async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
 await early.goto(fixture.origin+'/test/'); await early.locator('#menu-play:not([hidden])').click();
 await early.waitForFunction(()=>!!(window as any).__severgrow?.ready?.());
 assert(await early.locator('#play-menu').isVisible(),'optional mounts cannot undo an early PLAY tap');
 console.log('PASS early PLAY survives optional UI mounting'); await early.close();
 for(const reduce of [false,true]){
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(`window.__name=(f)=>f;localStorage.setItem('futa05-test:futasaku.world.last.v1',${JSON.stringify(JSON.stringify(world))});localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:${reduce}}));`);
  await p.goto(fixture.origin+'/test/');await p.waitForFunction(()=>!!(window as any).__severgrow?.ready?.()&&!!(window as any).__severgrow.planet()?.ready);
  await p.evaluate(()=>{(window as any).__oldPlanet=document.querySelector('.planet-canvas');});
  if(!reduce){
   // Same-frame navigation is faster than the automation round trip and exposes stale finishes.
   await p.evaluate(()=>{document.getElementById('menu-play')!.click();document.getElementById('play-back')!.click();});
   await p.waitForTimeout(200);
   assert(await p.evaluate(()=>document.querySelector('.planet-canvas')===(window as any).__oldPlanet),'interrupted return reuses the same planet');
  }
  await p.locator('#menu-play').click();
  assert(await p.locator('#play-menu').isVisible(),'PLAY controls are immediate');
  if(!reduce){
   const fade=await p.evaluate(()=>document.getElementById('online-world-screen')!.getAnimations().some(a=>a.id==='play-world-fade'));
   assert(fade,'PLAY starts the actual planet fade');
   const frames=await p.evaluate(()=>(window as any).__severgrow.planet()?.frames);
   await p.waitForTimeout(100);
   assert.equal(await p.evaluate(()=>(window as any).__severgrow.planet()?.frames),frames,'the fading planet retains its frame without rendering in the background');
   await p.waitForTimeout(1800);
  }
  await p.waitForFunction(()=>!document.querySelector('.planet-canvas'));
  assert(await p.locator('#play-menu').isVisible(),'fade completion cannot hide PLAY controls');
  if(!reduce){
   await p.locator('#play-back').click();
   await p.waitForFunction(()=>!!(window as any).__severgrow.planet()?.ready);
   await p.locator('#menu-play').click();
   await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   assert(await p.locator('#play-menu').isVisible(),'PWA resume during fade keeps PLAY');
   assert(await p.locator('#menu').evaluate(e=>(e as HTMLElement).hidden),'PWA resume cannot uncover the main menu');
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(`PASS PLAY: ${reduce?'reduced motion is immediate':'1500ms fade, interruption, same canvas and cleanup'}`);
  await p.close();
 }
}finally{await browser.close();await fixture.close();}
