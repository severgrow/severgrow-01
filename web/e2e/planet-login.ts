/** Sign-in calls to action stay native, tappable and on top of the existing Planet. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';
import { ONLINE } from '../../src/strings.js';
const out='/tmp/planet-login';mkdirSync(out,{recursive:true});
const fixture=await productFixture({offlineApiPort:65530});
const ios=process.env.BLAST_WEBKIT==='1';
const browser=await (ios?webkit:chromium).launch(ios?{}:{executablePath:process.env.PW_CHROMIUM??chromium.executablePath(),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const claims=[{cellId:'0,0',ownerId:'other',ownerName:'Cedar',ownerTag:'ABCD',ownerLevel:4,colour:'hsl(150 32% 52%)',claimedAt:1}];
const world={version:WORLD_VERSION,revision:1,cost:100,growAnywhere:true,cells:seenWorld(['0,0']),claims};
try{
 for(const width of [390,1440]){
  const p=await browser.newPage({viewport:{width,height:width<500?844:900},hasTouch:width<500});
  await p.route('**/v1/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   const body=path.endsWith('/auth/methods')?{ok:true,email:true}:/\/world$/.test(path)?{ok:true,world}:path.includes('challenges')?{ok:true,outgoing:[],incoming:[],serverNow:Date.now()}:null;
   await route.fulfill({status:body?200:503,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(body??{error:'test service unavailable'})});
  });
  await p.route('**/auth/v1/settings',r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({external:{email:true,google:false}})}));
  await p.addInitScript(({world})=>{
   (window as any).__name=(f:unknown)=>f;
   localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:false}));
   localStorage.setItem('futa05-test:severgrow.duel.identity.v1',JSON.stringify({token:'guest-local',playerId:'11111111-1111-4111-8111-111111111111',displayName:'Guest',kind:'guest'}));
   localStorage.setItem('futa05-test:futasaku.world.last.v1',JSON.stringify(world));
  },{world});
  await p.goto(fixture.origin+'/test/');
  await p.waitForFunction(()=>(window as any).__severgrow?.ready?.());
  await p.waitForFunction(()=>document.body.classList.contains('acct-on'));
  await p.locator('#menu-world').click();
  await p.waitForFunction(()=>{const s=(window as any).__severgrow?.planet?.();return s?.mode==='world'&&!s.flying&&!s.spinning;});
  const at=await p.evaluate(ids=>{
   const s=(window as any).__severgrow.planet();const r=document.getElementById('online-world-screen')!.getBoundingClientRect();
   return ids.map(id=>({id,...s.screenOf(id)})).filter(q=>q.x>r.left+30&&q.x<r.right-30&&q.y>r.top+100&&q.y<r.bottom-110).sort((a,b)=>Math.hypot(a.x-(r.left+r.width/2),a.y-(r.top+r.height/2))-Math.hypot(b.x-(r.left+r.width/2),b.y-(r.top+r.height/2)))[0];
  },world.cells.map(c=>c.id).filter(id=>id!=='0,0'));
  assert(at,'an unoccupied tile is visible');await p.mouse.click(at.x,at.y);
  const key=p.locator('#online-world-selection .world-signin-prompt');
  await key.waitFor({state:'visible'});assert.equal(await key.textContent(),ONLINE.worldSignInToGrow);
  assert.equal(await key.evaluate(e=>e.tagName),'BUTTON');assert((await key.boundingBox())!.height>=44);
  await p.waitForTimeout(220);
  await p.screenshot({path:`${out}/prompt-${width}.png`});
  await key.click();await p.locator('#acct-email:not([hidden])').waitFor({state:'visible'});
  assert(await p.locator('#online-world-screen').isVisible(),'opening login preserves the Planet');
  assert.equal(await p.evaluate(()=>(window as any).__severgrow.planet().selected),at.id);
  await p.screenshot({path:`${out}/login-${width}.png`});
  console.log('PASS',width,'the complete sign-in prompt opens the existing login and retains the selected tile');
  // The bolt is the visible presence indicator in Blitz, while ordinary matches retain their line.
  const visible=await p.evaluate(()=>{
   const probe=document.createElement('div');probe.className='duel-hud';probe.innerHTML='<span data-duel-presence data-presence="online">Online</span>';document.body.append(probe);
   const e=probe.firstElementChild!;document.documentElement.dataset.blitzDuel='1';const blitz=getComputedStyle(e).display;
   delete document.documentElement.dataset.blitzDuel;const ordinary=getComputedStyle(e).display;probe.remove();return {blitz,ordinary};
  });
  assert.equal(visible.blitz,'none');assert.notEqual(visible.ordinary,'none');
  await p.close();
 }
}finally{await browser.close();await fixture.close();}
