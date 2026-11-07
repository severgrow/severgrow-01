/** Production first reveal, including a fresh install with no saved map or reachable API. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from 'playwright-core';
import {WORLD_VERSION,seenWorld} from '../../server/src/world.js';
import {productFixture} from './helpers/product-fixture.js';

const f=await productFixture({offlineApiPort:65530});
const ios=process.env.SPHERE_WEBKIT==='1';
const b=await (ios?webkit:chromium).launch(ios?{}:{...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out=process.env.STARTUP_SHOTS??(ios?'/tmp/sphere-test/startup':'/tmp/startup-ground');mkdirSync(out,{recursive:true});
const init=`window.__name=f=>f;window.__launch=[];window.addEventListener('futasaku:startup-visible',()=>window.__launch.push({at:performance.now(),ready:!!window.__severgrow?.ready?.(),painted:document.documentElement.dataset.planetPainted,fonts:document.fonts.status,durations:document.body.getAnimations().filter(a=>a.id==='startup-reveal').map(a=>a.effect.getTiming().duration)}));`;
try{
 for(const path of ['/','/test/']){
  const p=await b.newPage({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(init);
  let release!:()=>void;const blocked=new Promise<void>(r=>{release=r;});
  await p.route(/\/v1\/world(?:\?|$)/,async route=>{await blocked;await route.abort().catch(()=>{});});
  await p.goto(f.origin+path);
  await p.waitForFunction(()=>(window as any).__launch.length>0,undefined,{timeout:15000});
  const first=await p.evaluate(()=>(window as any).__launch[0]);
  assert(first.ready&&first.painted==='true'&&first.fonts==='loaded',JSON.stringify(first));
  // OWNER CHANGED THE RULE (2026-11-07): one ~1 s fade into the composed menu.
  assert.deepEqual(first.durations,[1000],'one short first fade (~1 s)');
  await p.waitForFunction(()=>!document.body.getAnimations().some(a=>a.id==='startup-reveal'&&a.playState==='running'));
  assert(await p.locator('#menu-play').isVisible());
  const planet=await p.evaluate(()=>(window as any).__severgrow.planet());
  assert(planet.frames>0||(ios&&planet.fallback),'a real planet paints without the API, or WebKit supplies its existing graphics-unavailable fallback');
  await p.screenshot({path:`${out}/${path==='/'?'root':'test'}-fresh.png`});
  assert.deepEqual(errors,[]);release();
  if(path==='/'){
   await p.evaluate(()=>localStorage.setItem('startup-sentinel','keep'));
   await p.evaluate(async()=>{
    await navigator.serviceWorker.register('./futa04-sw.js');await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
   });
   const resume=f.pauseDocuments();
   try{
    // The network response is still held. Only a functioning cached navigation can finish.
    await p.reload({waitUntil:'domcontentloaded',timeout:15000});
    assert(await p.evaluate(()=>document.documentElement.classList.contains('space-first')));
    assert.equal(await p.evaluate(()=>localStorage.getItem('startup-sentinel')),'keep');
    console.log('PASS real service worker opens cached app while fresh navigation is held');
   }finally{resume();}
  }
  await p.close();console.log('PASS fresh map/API-independent first reveal',path,planet.fallback?'graphics fallback':'rendered planet',JSON.stringify(first));
 }
 // Cached ownership can draw the retired map before a delayed planet import. Even after the
 // bounded fail-open, it must stay unpainted rather than flashing through the menu.
 const p=await b.newPage({viewport:{width:393,height:852},hasTouch:true});
 const world={version:WORLD_VERSION,revision:1,cost:100,challengeStake:0,cells:seenWorld(['0,0']),claims:[],disputes:[]};
 await p.addInitScript(init+`localStorage.setItem('futa05:futasaku.world.last.v1',${JSON.stringify(JSON.stringify(world))});`);
 let release!:()=>void;const held=new Promise<void>(r=>{release=r;});
 const request=p.waitForRequest(/\/assets\/planet-(?!lockup)[^/]+\.js$/,{timeout:15000});
 await p.route(/\/assets\/planet-(?!lockup)[^/]+\.js$/,async route=>{await held;await route.continue().catch(()=>{});});
 await p.goto(f.origin+'/');await request;
 await p.waitForTimeout(4000);
 assert(await p.locator('#menu-play').isVisible(),'bounded fallback leaves controls usable');
 const flat=await p.locator('.world-map-svg').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).visibility));
 assert(flat.length>0,'the regression really contains the old renderer underlay');
 assert(flat.every(v=>v==='hidden'),'no retired flat-map frame while the planet is late');
 await p.screenshot({path:`${out}/delayed.png`});
 release();await p.waitForFunction(()=>document.querySelector<HTMLElement>('.planet-canvas')?.dataset.planetReady==='true');
 await p.close();console.log('PASS late planet never exposes the flat renderer');
}finally{await b.close();await f.close();}
