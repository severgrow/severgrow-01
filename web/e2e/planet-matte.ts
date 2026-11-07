/** Actual UI, delayed chat API, classic saved world: no production or account mutations. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
import {WORLD_VERSION,seenWorld} from '../../server/src/world.js';
import {type Quat} from '../src/sphere/rotation.js';

const shots=process.env.SHOTS??'/tmp/planet-matte';mkdirSync(shots,{recursive:true});
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const playerId='11111111-1111-4111-8111-111111111111';
const claims=['0,0','1,0','0,1','-1,1','1,-1'].map(cellId=>({cellId,ownerId:playerId,ownerName:'Cedar',ownerLevel:3,ownerTag:'',colour:'hsl(150 32% 52%)',claimedAt:1}));
const world={version:WORLD_VERSION,revision:1,cost:100,challengeStake:0,cells:seenWorld(claims.map(c=>c.cellId)),claims,disputes:[{cellId:'0,0',challengerId:'rival',defenderId:playerId,accepted:false}]};
const material=(el:Element)=>{const s=getComputedStyle(el);return [s.background,s.borderTopColor,s.borderTopWidth,s.borderRadius,s.color,s.fontWeight,s.backdropFilter,s.fontSize,s.letterSpacing,s.fontFamily];};
const settled=async(p:import('playwright-core').Page)=>p.waitForFunction(()=>{
 const s=(window as any).__severgrow.planet();return !!s&&!s.flying&&!s.spinning;
},undefined,{timeout:15000}).catch(async error=>{
 console.error('Matte settle diagnostic',await p.evaluate(()=>{const s=(window as any).__severgrow?.planet?.();return {planet:s?{...s,screenOf:undefined}:null,menuHidden:document.getElementById('menu')?.hidden,worldHidden:document.getElementById('online-world-screen')?.hidden,documentHidden:document.hidden};}));
 await p.screenshot({path:`${shots}/settle-failure-${p.viewportSize()?.width}.png`}).catch(()=>{});throw error;
});
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
  const p=await browser.newPage({viewport:{width:width!,height:height!},hasTouch:width!<900});
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));let reads=0,longHistory=false;const colourRequests:string[]=[];p.on('request',r=>{if(r.url().includes('/colour'))colourRequests.push(r.url());});
  await p.route('**/v1/world/colour*',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({colour:{colourId:0,colour:'hsl(150 32% 52%)',name:'Forest',chosen:true,canChange:true,changeAvailableAt:null,remainingMs:0}})}));
  await p.route('**/v1/world/challenges*',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({ok:true,serverNow:Date.now(),outgoing:[],incoming:[{id:'matte-challenge',cellId:'0,0',challengerId:'rival',defenderId:playerId,challengerName:'Maple',defenderName:'Cedar',fromMe:false,status:'pending',stake:0,stakeCellId:'1,0',createdAt:Date.now(),expiresAt:Date.now()+86400000,respondedAt:null,matchId:null,matchFinished:false,matchWinnerId:null,matchWaitingForMe:false,winnerId:null,resolvedAt:null,remainingMs:86400000,serverNow:Date.now()}]})}));
  await p.route('**/v1/world',route=>route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({ok:true,world})}));
  await p.route('**/v1/territory/chat',async route=>{
   reads++;await new Promise(r=>setTimeout(r,600));
   await route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({messages:longHistory?Array.from({length:30},(_,i)=>({id:'message-'+i,sequence:i,text:'A quiet message '+i+' / '+reads,name:'Maple',tag:'MAPLE',mine:false,createdAt:1,requestId:String(i)})):[{id:'message-1',sequence:1,text:'A quiet world, already here.',name:'Maple',tag:'MAPLE',mine:false,createdAt:1,requestId:'1'}]})});
  });
  await p.addInitScript(`window.__name=f=>f;window.__startup=[];window.addEventListener('futasaku:startup-visible',()=>{window.__startup.push({ready:!!window.__severgrow?.ready?.(),frames:window.__severgrow?.planet?.()?.frames??0,fonts:document.fonts.status,animations:document.body.getAnimations().filter(a=>a.id==='startup-reveal').map(a=>a.effect.getTiming().duration)});});localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:false}));localStorage.setItem('futa05-test:severgrow.duel.identity.v1',${JSON.stringify(JSON.stringify({token:'local-planet-token',playerId,displayName:'Cedar',kind:'guest'}))});localStorage.setItem('futa05-test:futasaku.world.last.v1',${JSON.stringify(JSON.stringify(world))});localStorage.setItem('futa05-test:severgrow.world-style.v1',JSON.stringify('forest'));`);
  await p.goto(fixture.origin+'/test/');
  await p.waitForFunction(()=>(window as any).__startup.length>0);
  const boot=await p.evaluate(()=>(window as any).__startup[0]);
  if(!boot.ready||!boot.frames){
   console.error('Boot diagnostic',JSON.stringify({boot,errors}));
   await p.waitForTimeout(3000);
   console.error('Boot after fail-open',await p.evaluate(()=>{const h=(window as any).__severgrow,s=h?.planet?.();return {ready:h?.ready?.(),frames:s?.frames,mode:s?.mode,hidden:document.hidden};}),errors);
  }
  assert(boot.ready&&boot.frames>0&&boot.fonts==='loaded',JSON.stringify(boot));
  // OWNER CHANGED THE RULE (2026-11-07): one ~1 s fade into the composed menu.
  assert.deepEqual(boot.animations,[1000],'one coherent ~1s first reveal');
  await p.waitForTimeout(1200);
  const keys=await p.evaluate(fn=>['menu-play','menu-world','menu-settings'].map(id=>(0,eval)(`(${fn})`)(document.getElementById(id))),material.toString());
  assert.deepEqual(keys[0],keys[1],'PLAY has the same material as THE PLANET');assert.deepEqual(keys[1],keys[2],'Settings shares the same key');
  assert(String(keys[0]![6]).includes('blur('),'matte menu keys restore the shared backdrop blur');
  const halos=await p.evaluate(()=>['menu-play','menu-world'].map(id=>getComputedStyle(document.getElementById(id)!).boxShadow));
  assert.notEqual(halos[0],halos[1],'PLAY uses the existing quiet recommendation glow');
  const labels=await p.evaluate(()=>['menu-play-label','menu-world-label','menu-settings'].map(id=>{const s=getComputedStyle(document.getElementById(id)!);return [s.fontFamily,s.fontSize,s.fontWeight,s.letterSpacing];}));
  assert.deepEqual(labels[0],labels[1],'PLAY and THE PLANET share the same label typography');assert.deepEqual(labels[1],labels[2],'Settings uses that same label typography');
  const pressedShadows=[];
  for(const id of ['menu-play','menu-settings']){
   const key=p.locator('#'+id),box=(await key.boundingBox())!;
   await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForTimeout(180);
   const press=await key.evaluate(el=>({pressed:el.getAttribute('data-pressed'),shadow:getComputedStyle(el).boxShadow}));
   assert.equal(press.pressed,'true','the real pointer press reaches the key');pressedShadows.push(press.shadow);
   await p.mouse.move(1,1);await p.mouse.up();
  }
  assert.equal(pressedShadows[0],pressedShadows[1],'suggested and ordinary keys share the same recessed press');
  const primaryInk=await p.locator('.btn.primary').evaluateAll(els=>els.map(e=>({id:e.id,ink:getComputedStyle(e).color})));
  for(const key of primaryInk)assert.equal(key.ink,keys[0]![4],`matte primary ${key.id} keeps readable ivory ink`);
  await p.screenshot({path:`${shots}/menu-${width}.png`});
  await p.locator('#menu-play').click();
  const playKeys=await p.evaluate(fn=>['menu-campaign','menu-new'].map(id=>(0,eval)(`(${fn})`)(document.getElementById(id))),material.toString());
  assert.deepEqual(playKeys[0],playKeys[1],'LEVEL and PRACTICE MATCH share the same material');
  await p.screenshot({path:`${shots}/play-${width}.png`});
  await p.waitForFunction(()=>getComputedStyle(document.getElementById('play-menu')!).opacity==='1'&&!document.querySelector('.planet-canvas'));
  await p.screenshot({path:`${shots}/play-rest-${width}.png`});
  await p.locator('#menu-new').click();
  const difficulties=await p.locator('.difficulty-tile').evaluateAll((els,fn)=>els.map(el=>(0,eval)(`(${fn})`)(el)),material.toString());
  for(const key of difficulties)assert.deepEqual(key,keys[0],'difficulty uses the same material');
  await p.screenshot({path:`${shots}/difficulty-${width}.png`});
  await p.waitForFunction(()=>getComputedStyle(document.getElementById('levels')!).opacity==='1');
  await p.screenshot({path:`${shots}/difficulty-rest-${width}.png`});
  await p.locator('#levels-back').click();
  if(await p.locator('#play-back').isVisible())await p.locator('#play-back').click();
  await p.locator('#menu-world').click();await settled(p);
  const logos=await p.evaluate(()=>{
   document.documentElement.classList.add('brand-mark');
   return ['hud-brand','online-brand'].filter(id=>{const e=document.getElementById(id);return e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none';});
  });assert.deepEqual(logos,['online-brand'],'online header wins even with a stale app brand flag');
  await p.locator('#online-world-menu').click();await p.locator('#world-key-colour').click();
  assert.equal(await p.locator('#world-style-picker').count(),0,'the rejected materials are absent');
  const pressed=await p.locator('#world-key-colour').evaluate(el=>({after:getComputedStyle(el,'::after').content,shadow:getComputedStyle(el).boxShadow}));
  assert(['none','normal'].includes(pressed.after));assert(pressed.shadow.includes('inset'),'open pane pushes the key inward');
  const selected=p.locator('.world-colour-swatch.current');await selected.waitFor({state:'visible'}).catch(async e=>{console.error('Colour fixture',colourRequests,await p.locator('#world-colour-grid').evaluate(el=>({count:el.children.length,current:el.querySelector('.current')?.getAttribute('data-colour-id')})));throw e;});
  const selectedFinish=await selected.evaluate(el=>({shadow:getComputedStyle(el).boxShadow,pressed:el.getAttribute('aria-pressed')}));
  assert.equal(selectedFinish.pressed,'true');assert(selectedFinish.shadow.includes('inset'));
  assert(!selectedFinish.shadow.includes('242, 200, 121'),'selected colour uses pressed depth rather than the legacy amber frame');
  await p.screenshot({path:`${shots}/colours-${width}.png`});
  await p.locator('#world-panel-close').click();
  await p.waitForSelector('#world-chat-list .world-chat-line',{state:'attached'});
  const warm=reads;assert(warm>0,'chat fetched before its first opening');
  const chat=await p.evaluate(()=>{
   document.getElementById('online-world-chat')!.click();
   return {text:document.getElementById('world-chat-list')!.textContent,heading:document.getElementById('world-chat-heading')!.textContent};
  });
  assert(chat.text?.includes('A quiet world, already here.'));assert.equal(chat.heading,'Global chat');
  const compactSurface=async(selector:string)=>p.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return [s.background,s.borderTopColor,s.borderTopWidth,s.borderRadius,s.color,s.backdropFilter];});
  const expected=[keys[0]![0],keys[0]![1],keys[0]![2],keys[0]![3],keys[0]![4],keys[0]![6]];
  assert.deepEqual(await compactSurface('#world-chat-send'),expected,'chat SEND uses the menu matte/glass family');
  await p.locator('#world-chat-list .world-chat-line').first().click();
  assert.deepEqual(await compactSurface('.world-chat-line.picked .world-chat-mod button'),expected,'moderation actions use the same material');
  await p.locator('#world-chat-list .world-chat-line').first().click();
  await p.screenshot({path:`${shots}/chat-${width}.png`});
  await p.waitForTimeout(750);await p.locator('#world-chat-back').click();
  const closedReads=reads;await p.waitForTimeout(4200);assert.equal(reads,closedReads,'closed chat has no polling timer');
  if(width===390){
   longHistory=true;await p.locator('#online-world-chat').click();
   await p.waitForFunction(()=>document.querySelectorAll('#world-chat-list .world-chat-line').length===30);
   await p.locator('#world-chat-list').evaluate(el=>{el.scrollTop=32;});
   const reading=await p.locator('#world-chat-list').evaluate(el=>el.scrollTop),n=reads;
   for(let i=0;reads===n&&i<110;i++)await p.waitForTimeout(50);
   assert(reads>n,'an ordinary visible refresh has begun');
   await p.locator('#world-chat-back').click();await p.waitForTimeout(800);
   await p.locator('#online-world-chat').click();
   assert(Math.abs(await p.locator('#world-chat-list').evaluate(el=>el.scrollTop)-reading)<1,'a response arriving while closed preserves older reading position');
   await p.locator('#world-chat-back').click();
  }
  if(!(await p.locator('#world-key-challenges').isVisible()))await p.locator('#online-world-menu').click();
  await p.locator('#world-key-challenges').click();
  await p.locator('.world-challenge-chip[data-challenge-id="matte-challenge"]').click();
  await p.waitForFunction(()=>document.querySelector('.world-challenge-sheet:not([hidden]) .world-challenge-card')?.getAttribute('data-ix-state')==='open');
  const lead='.world-challenge-sheet:not([hidden]) .world-challenge-primary',secondary='.world-challenge-sheet:not([hidden]) .world-challenge-secondary';
  assert.deepEqual(await compactSurface(lead),expected,'real challenge action uses the menu matte/glass family');
  assert.deepEqual(await compactSurface(secondary),expected,'secondary challenge action shares the same key material');
  assert((await p.locator(lead).boundingBox())!.height>=44,'challenge keeps its mobile target');
  await p.screenshot({path:`${shots}/challenge-${width}.png`});
  // Force the actual compositor failure: a close animation whose finished promise never resolves.
  await p.evaluate(()=>{
   const original=Element.prototype.animate;(window as any).__animateBeforeClose=original;
   Element.prototype.animate=function(frames,options){
    const a=original.call(this,frames,options);
    if(this.classList.contains('world-challenge-sheet'))a.pause();return a;
   };
  });
  await p.keyboard.press('Escape');await p.locator('.world-challenge-sheet:not([hidden])').waitFor({state:'hidden'});
  await p.evaluate(()=>{Element.prototype.animate=(window as any).__animateBeforeClose;});
  await p.locator('#world-panel-close').click();
  await p.locator('#online-world-menu').click(); // fold the keys before touching the ground
  const grid=(await p.locator('#online-world-grid').boundingBox())!,cx=grid.x+grid.width/2,cy=grid.y+grid.height/2;
  await p.mouse.move(cx-35,cy+20);await p.mouse.down();await p.mouse.move(cx+50,cy-50,{steps:8});
  const before=await p.evaluate(()=>(window as any).__severgrow.planet().q) as Quat;
  await p.mouse.up();
  // Coast may run while the top of the planet is visible; wait for it to settle.
  await p.waitForTimeout(650);await settled(p);
  const after=await p.evaluate(()=>(window as any).__severgrow.planet());
  if(Math.hypot(after.north[0],after.north[1])>.15){assert(Math.abs(after.north[0])<.0001&&after.north[1]>0,'north rests upright');}
  void before;
  await p.waitForTimeout(400);
  const held=await p.evaluate(()=>(window as any).__severgrow.planet());
  assert(after.q.every((v:number,i:number)=>Math.abs(v-held.q[i])<.0005),'coast settles; no late correction');
  // Zoomed in: release must stop almost immediately.
  await p.mouse.move(cx,cy);
  for(let i=0;i<10;i++){await p.mouse.wheel(0,-200);await p.waitForTimeout(16);}
  await p.mouse.move(cx-30,cy+10);await p.mouse.down();await p.mouse.move(cx+40,cy-20,{steps:6});
  const zoomed=await p.evaluate(()=>(window as any).__severgrow.planet().q) as Quat;
  await p.mouse.up();await p.waitForTimeout(140);
  const zoomedEnd=await p.evaluate(()=>(window as any).__severgrow.planet().q) as Quat;
  assert(zoomed.every((v,i)=>Math.abs(v-zoomedEnd[i]!)<.002),'zoomed-in release stops almost immediately');
  await p.screenshot({path:`${shots}/planet-${width}.png`});
  const preTap=await p.evaluate(()=>(window as any).__severgrow.planet().q) as Quat;
  await p.mouse.click(cx,cy);await p.waitForTimeout(250);
  const tapped=await p.evaluate(()=>(window as any).__severgrow.planet().q) as number[];
  assert(tapped.every((v,i)=>Math.abs(v-preTap[i]!)<.00001),'a central tile tap does not roll the camera');
  const zoomBeforeWheel=await p.evaluate(()=>(window as any).__severgrow.planet().zoom);
  await p.mouse.move(cx,cy);await p.mouse.wheel(0,120);
  await p.waitForFunction(z=>Math.abs((window as any).__severgrow.planet().zoom-z)>1e-5,zoomBeforeWheel);
  const wheeled=await p.evaluate(()=>(window as any).__severgrow.planet());
  await p.waitForTimeout(650);
  const wheelEnd=await p.evaluate(()=>(window as any).__severgrow.planet());
  assert(wheeled.q.every((v:number,i:number)=>Math.abs(v-wheelEnd.q[i])<.000001)&&wheeled.zoom===wheelEnd.zoom,'scroll ends at its input position without a corrective tail');
  if(width===390){
   await p.waitForTimeout(600);
   await p.evaluate(({cx,cy})=>{
    const canvas=document.querySelector('.planet-canvas')!;
    for(const [id,x] of [[101,cx-12],[102,cx+12]] as const)canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,clientX:x,clientY:cy,button:0,pointerType:'touch',bubbles:true}));
    canvas.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:101,bubbles:true}));
   },{cx,cy});
   await p.waitForTimeout(350);
   assert.equal(await p.evaluate(()=>(window as any).__severgrow.planet().flying),false,'a lost touch cannot start a settle while another finger remains');
   await p.evaluate(()=>document.querySelector('.planet-canvas')!.dispatchEvent(new PointerEvent('pointercancel',{pointerId:102,bubbles:true})));
   await settled(p);
  }
  if(width===390||width===1440){
   await p.goto(fixture.origin+'/test/?seed=219682080');
   await p.waitForFunction(()=>{const h=(window as any).__severgrow;return h?.ready?.()&&h.state()?.actor===0&&!h.busy();},undefined,{timeout:90000});
   await p.waitForFunction(()=>{const ritual=document.getElementById('starter-lottery');return !ritual||ritual.hidden||!ritual.getClientRects().length;},undefined,{timeout:30000});
   await p.waitForTimeout(500);
   await p.waitForFunction(()=>(window as any).__severgrow.space()?.sliding===true);
   const sky=p.locator('#space-backdrop > canvas').first();
   const before=await sky.evaluate(e=>getComputedStyle(e).translate);
   await p.waitForFunction(before=>{
    const sky=document.querySelector('#space-backdrop > canvas');
    return sky && (window as any).__severgrow.space()?.sliding && getComputedStyle(sky).translate!==before;
   },before,{timeout:10000});
   assert.equal(await p.locator('#space-backdrop > canvas:visible').count(),1,'gameplay composites one cached star layer');
   const rim=await p.locator('#board .planet-turn-line').getAttribute('d');
   await p.screenshot({path:`${shots}/duel-${width}.png`});
   console.log('Board contour',JSON.stringify({starts:(rim?.match(/M/g)||[]).length,closed:(rim?.match(/Z/g)||[]).length}));
   assert(rim&&(rim.match(/M/g)||[]).length===1&&(rim.match(/Z/g)||[]).length===1,'actual board has one closed silhouette');
   for(const path of await p.locator('#board .l-planet-shadow path').all())assert.equal(await path.getAttribute('d'),rim,'shadow and glow share the whole silhouette');
   if(width===390){
    // The same visibility signal a background tab sends; keep Chromium's page active so queued
    // readout callbacks still execute and prove the application's own guard, not browser throttling.
    await p.evaluate(()=>{
     const h=(window as any).__severgrow,draw=h.legal().find((a:{t:string})=>a.t==='Draw');
     if(!draw)throw Error('Expected the seeded initial Draw');h.playFor(draw,0);
     Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
     Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
     document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(2200);
    const running=await p.evaluate(()=>document.getAnimations().filter(a=>{
     const target=(a.effect as KeyframeEffect|null)?.target;
     return a.playState==='running'&&target instanceof Element&&!!target.closest('#smart-led-window');
    }).length);
    assert.equal(running,0,'queued LED updates leave no reel animation in a hidden page');
    await p.evaluate(()=>{
     delete (document as any).hidden;delete (document as any).visibilityState;
     document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(250);
    assert((await p.locator('#smart-led-text').textContent())?.trim(),'the readout remains available after returning');
   }


  }
  assert.equal(errors.length,0,errors.join('\n'));console.log(`PASS ${width}×${height}: coherent boot, matte keys, warm chat, one logo, pressed panes, north-up camera with exact release`);
  await p.close();
 }
 const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await reduced.addInitScript(`window.__name=f=>f;localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:true}));`);
 await reduced.goto(fixture.origin+'/test/');
 await reduced.waitForFunction(()=>!!(window as any).__severgrow?.ready?.()&&!document.documentElement.dataset.startup);
 assert.equal(await reduced.evaluate(()=>document.body.getAnimations().filter(a=>a.id==='startup-reveal').length),0,'reduced motion skips the first fade');
 assert(await reduced.locator('#menu-play').isVisible());await reduced.close();
 console.log('PASS reduced-motion first reveal');
 const slowFonts=await browser.newPage({viewport:{width:390,height:844}});
 await slowFonts.addInitScript(`window.__name=f=>f;window.__reveals=0;window.addEventListener('futasaku:startup-visible',()=>window.__reveals++);Object.defineProperty(document.fonts,'ready',{get:()=>new Promise(()=>{})});`);
 await slowFonts.goto(fixture.origin+'/test/');
 await slowFonts.waitForFunction(()=>!!(window as any).__severgrow?.ready?.()&&!document.documentElement.dataset.startup,undefined,{timeout:6000});
 assert.equal(await slowFonts.evaluate(()=>(window as any).__reveals),1,'slow-font fallback announces once');
 await slowFonts.close();console.log('PASS slow-font fail-open without duplicate reveal');
 const unavailable=await browser.newPage({viewport:{width:390,height:844}});
 await unavailable.route('**/*.js',route=>route.abort());
 await unavailable.goto(fixture.origin+'/test/');
 await unavailable.waitForFunction(()=>!document.documentElement.dataset.startup,undefined,{timeout:6000});
 assert.equal(await unavailable.evaluate(()=>getComputedStyle(document.body).visibility),'visible','failed modules cannot leave an indefinite black screen');
 await unavailable.close();console.log('PASS bounded startup fail-open');
}finally{await browser.close();await fixture.close();}

await import("./challenge-handoff.js");

await import('./play-world-fade.js');
// Replay uses its own SVG id, so live-only board CSS must never hide its artwork.
await import('./pwa-launch.js');
await import('./startup-ground.js');
await import('./replay-offline.js');
