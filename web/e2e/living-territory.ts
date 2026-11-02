// Real HTTP economy + the real menu/WorldView. No fabricated map renderer or camera test hook.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { chromium,webkit } from 'playwright-core';
import type { Page } from 'playwright-core';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';
import { cellXY } from '../src/online/world-growth.js';
const shots=process.env.SHOTS??'/tmp/living-territory';mkdirSync(shots,{recursive:true});
const storage=new MemoryStorage(),store=new MemoryWorldEconomyStore();
const config={...DEFAULT_SERVER_CONFIG,corsOrigins:['*']};
const economy=new WorldEconomyService(store,storage),service=new MatchService({storage,config,economy});
const api=createHttpServer({service,config,live:createWorldEconomyRouter({economy,authenticate:t=>service.authenticate(t)})});
await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
const guest=async()=>await (await fetch(`${base}/v1/guests`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json() as {token:string;player:{id:string;kind:string;displayName:string|null}};
const me=await guest(),other=await guest();
for(const g of [me,other]){
 await store.adminAdjustSeeds({playerId:g.player.id,delta:2000,reason:'e2e',actorId:'e2e',requestId:`fund-${g.player.id}`,now:Date.now()});
 await store.acknowledgeInvitation(g.player.id);
}
for(const [i,cell] of ['-2,-4','-1,-4','-2,-3'].entries())await store.claim(me.player.id,cell,`mine-${i}`,Date.now()-3600000);
for(const [i,cell] of ['0,0','1,0','2,0','3,-6'].entries())await store.claim(other.player.id,cell,`other-${i}`,Date.now()-3600000);
process.env.CHANNEL='futa04';process.env.VITE_DUEL_API_URL=base;
process.env.VITE_SUPABASE_URL='http://127.0.0.1:9';process.env.VITE_SUPABASE_ANON_KEY='local-e2e';
const web=await createServer({cacheDir:`/tmp/living-e2e-vite-${(api.address() as AddressInfo).port}`,configFile:resolve(process.env.BASELINE_ROOT??'.','web/vite.config.ts'),server:{host:'127.0.0.1',port:0},logLevel:'error'});await web.listen();
const origin=`http://127.0.0.1:${(web.httpServer!.address() as AddressInfo).port}`;
const ios=process.env.LIVING_WEBKIT==='1';
const browser=await (ios?webkit:chromium).launch(ios?{}:{...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']}).catch(error=>{
 if(process.env.GITHUB_ACTIONS)console.error(`::error title=Living Territory browser launch::${String(error).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);throw error;
});
let activePage:Page|null=null;
let checks=0;const check=(label:string,pass:boolean)=>{assert.ok(pass,label);checks++;console.log('PASS',label);};
const browserErrors:string[]=[];
const identity=JSON.stringify({token:me.token,playerId:me.player.id,kind:me.player.kind,displayName:me.player.displayName});
const boot=async(page:Page,options:{cached?:boolean;fail?:boolean;delay?:number;anonymous?:boolean;failAuth?:boolean;empty?:boolean;rawIdentity?:string;pwa?:boolean;largeText?:boolean;delayCode?:number;wideCache?:boolean}={})=>{
 activePage=page;
 page.on('pageerror',error=>{browserErrors.push(error.message);if(process.env.LIVING_DEBUG)console.log('BROWSER ERROR',error.message);});
 await page.addInitScript(({identity,anonymous})=>{
  (window as any).__name=(f:unknown)=>f;
  if(!anonymous)for(const prefix of ['','main2:','futa04:'])localStorage.setItem(`${prefix}severgrow.duel.identity.v1`,identity);
 },{identity:options.rawIdentity??identity,anonymous:options.anonymous??false});
 await seedSettings(page,{sound:false,music:false,coach:false,speed:'skip',eyeCandy:false,largeText:options.largeText??false});
 if(options.pwa)await page.addInitScript(()=>{
  Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
  const media=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?Object.defineProperty(media(query),'matches',{value:true}):media(query);
 });
 if(options.cached){
  const payload=await(await fetch(`${base}/v1/world`)).json();
  const at=cellXY(100,0);
  if(options.wideCache){payload.world.cells.push({id:'100,0',q:100,r:0});payload.world.revision+=10;}
  await page.addInitScript(({world,camera})=>{
   localStorage.setItem('main2:futasaku.world.last.v1',JSON.stringify(world));
   if(camera)localStorage.setItem('main2:futasaku.world.camera.v1',JSON.stringify({version:world.version,box:camera}));
  },{world:payload.world,camera:options.wideCache?[at.x-70,at.y-150,140,300]:null});
 }
 if(options.failAuth)await page.route('**/v1/guests',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
 if(options.empty){const payload=await(await fetch(`${base}/v1/world`)).json();payload.world.cells=[];payload.world.claims=[];await page.route('**/v1/world',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(payload)}));}
 if(options.fail||options.delay)await page.route('**/v1/world',async route=>{
  if(options.delay)await new Promise(r=>setTimeout(r,options.delay));
  if(options.fail)await route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});else await route.continue();
 });
 if(options.delayCode)await page.route('**/src/online/lobby-ui.ts*',async route=>{await new Promise(r=>setTimeout(r,options.delayCode));await route.continue();});
 await page.goto(origin);await page.waitForFunction(()=>(window as any).__severgrow?.ready?.());
 if(options.delayCode)check('early Territory key cannot swallow a tap before its handler is attached',await page.locator('#menu-world').isDisabled());
 // Wait for code bootstrap only, never for a map/network answer.
 await page.waitForFunction(()=>!(document.getElementById('menu-world') as HTMLButtonElement).disabled);
};
const state=(p:Page)=>p.evaluate(()=>{
 const svg=document.querySelector<SVGSVGElement>('.world-map-svg');const r=svg?.getBoundingClientRect();
 return {box:svg?.getAttribute('viewBox'),rect:r?[r.x,r.y,r.width,r.height]:null,count:document.querySelectorAll('.world-map-svg').length,
  mode:document.getElementById('online-world-screen')?.dataset.livingTerritory,
  same:!!svg&&svg===(window as any).__livingSvg};
});
try{
 for(const [name,width,height] of [['phone',390,844],['small',320,568],['large-text',320,568],['pwa',390,844],['tall',430,932],['tablet',768,1024],['desktop',1440,1000],['landscape',844,390]] as const){
  if(process.env.LIVING_CASE)continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop'});const page=await context.newPage();
  let worldReads=0,walletReads=0;page.on('request',r=>{const path=new URL(r.url()).pathname;if(path==='/v1/world')worldReads++;if(path==='/v1/seeds/wallet')walletReads++;});
  await boot(page,{largeText:name==='large-text',pwa:name==='pwa'});await page.waitForTimeout(500);
  if(name==='large-text')check('Large Text setting is really active',await page.evaluate(()=>document.documentElement.classList.contains('large-text')));
  if(process.env.BASELINE_ROOT){await page.screenshot({path:`${shots}/before-${name}.png`});await context.close();continue;}
  await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
  await page.waitForFunction(()=>!!document.querySelector('.world-hex.mine'));
  await page.screenshot({path:`${shots}/menu-${name}.png`});
  check(`${name}: one real map behind menu`,(await state(page)).count===1);
  check(`${name}: menu backdrop is inert and inaccessible`,await page.evaluate(()=>{
   const s=document.getElementById('online-world-screen')!;return s.inert&&s.getAttribute('aria-hidden')==='true'&&s.hidden===true;
  }));
  check(`${name}: own tile is in the visible map window`,await page.evaluate(()=>{
   const r=document.querySelector('.world-map-svg')!.getBoundingClientRect();return [...document.querySelectorAll('.world-hex.mine')].some(e=>{
    const b=e.getBoundingClientRect();return b.right>r.left&&b.left<r.right&&b.bottom>r.top&&b.top<r.bottom;
   });
  }));
  if(name==='phone'&&!ios){
   const reads=worldReads;await page.waitForTimeout(12500);
   check('menu adds no map polling',worldReads===reads);
  }
  if(name==='phone'){
   await page.waitForSelector('#menu-world-seeds:not([hidden])');
   await store.adminAdjustSeeds({playerId:me.player.id,delta:50,reason:'fresh entry read',actorId:'e2e',requestId:'fresh-wallet-entry',now:Date.now()});
  }
  const walletBefore=walletReads;
  await page.evaluate(()=>{(window as any).__livingSvg=document.querySelector('.world-map-svg');(window as any).__livingTile=document.querySelector('.world-hex');});const before=await state(page);
  if(name==='phone')await page.evaluate(()=>{
   document.getElementById('menu-world')!.addEventListener('click',()=>{
   const frames:any[]=[];(window as any).__livingFrames=frames;const end=performance.now()+400;
   const sample=()=>{
    const svg=document.querySelector('.world-map-svg')!,screen=document.getElementById('online-world-screen')!;
    frames.push({at:performance.now(),box:svg.getAttribute('viewBox'),opacity:Number(getComputedStyle(svg).opacity),visible:getComputedStyle(screen).display!=='none',same:svg===(window as any).__livingSvg});
    if(performance.now()<end)requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
   },{once:true,capture:true});
  });
  await page.click('#menu-world');await page.waitForSelector('#online-world-screen:not([hidden])');await page.waitForTimeout(name==='phone'?450:250);
  if(name==='phone'){
   const frames=await page.evaluate(()=>(window as any).__livingFrames as {at:number;box:string;opacity:number;visible:boolean;same:boolean}[]);
   const continuous=frames.length>2&&frames.every(f=>f.same&&f.visible&&f.box===before.box);
   check(`every transition frame retains the visible map and exact camera${continuous?'':' '+JSON.stringify({before:before.box,frames})}`,continuous);
   check('clarity transition reaches full contrast',frames.at(-1)!.opacity>.99);
   const gaps=frames.slice(1).map((f,i)=>f.at-frames[i]!.at).sort((a,b)=>a-b);console.log('INFO transition frame p95 ms',gaps[Math.floor(gaps.length*.95)]);
  }
  const after=await state(page);check(`${name}: opening retains surface and exact camera${after.same&&before.box===after.box?'':' '+JSON.stringify({before,after})}`,after.same&&before.box===after.box);
  if(name==='phone'){
   check('known menu wallet avoids a first-open tile rebuild',await page.evaluate(()=>document.querySelector('.world-hex')===(window as any).__livingTile));
   check(`known identity private metadata is fetched once on entry (${walletReads-walletBefore})`,walletReads-walletBefore===1);
   check('entry still replaces the known wallet with its fresh server balance',await page.evaluate(()=>document.querySelector('.world-seeds')?.textContent?.replace(/\D/g,'')==='1750'));
  }
  check(`${name}: only uniform material-scale movement`,!!before.rect&&!!after.rect&&Math.abs(after.rect[2]!/before.rect[2]!-after.rect[3]!/before.rect[3]!)<.002);
  await page.screenshot({path:`${shots}/territory-${name}.png`});
  await page.click('#online-world-back');await page.waitForSelector('#menu:not([hidden])');await page.waitForTimeout(200);
  const back=await state(page);check(`${name}: return retains camera and map`,back.same&&back.box===after.box&&back.mode==='menu');
  check(`${name}: returning restores keyboard focus`,await page.evaluate(()=>document.activeElement?.id==='menu-world'));
  check(`${name}: no horizontal page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`${name}: every visible menu key fits`,await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('#menu button')].filter(e=>e.offsetWidth&&e.offsetHeight).every(e=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;})));
  if(name==='phone'){
   // Interrupt the actual shared exit (before its onDone), then rapidly reopen/return repeatedly.
   for(let i=0;i<5;i++){
    await page.evaluate(()=>{document.getElementById('menu-world')!.click();document.getElementById('online-world-back')!.click();});
   }
   await page.waitForTimeout(250);check('rapid navigation never hides the returned menu',await page.evaluate(()=>!document.getElementById('menu')!.hidden&&!document.getElementById('menu')!.inert));
   check('rapid navigation keeps one renderer', (await state(page)).count===1);
   await page.click('#menu-world');await page.waitForTimeout(200);
   const rect=await page.locator('.world-map-svg').boundingBox();assert.ok(rect);
   await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-180);await page.waitForTimeout(200);
   const panned=await state(page);check('existing zoom still works',panned.box!==after.box);
   await page.click('#online-world-back');await page.waitForTimeout(200);await page.click('#menu-world');await page.waitForTimeout(200);
   check('deliberate camera survives re-entry',(await state(page)).box===panned.box);
   // A real newly claimed tile, followed by return and the menu's existing fresh read.
   await store.claim(me.player.id,'-3,-3','new-claim-menu',Date.now());await page.click('#online-world-back');
   await page.waitForFunction(()=>document.querySelector('.world-hex[data-cell-id="-3,-3"]')?.classList.contains('mine'));
   check('menu reflects a new authoritative claim',true);
   await page.emulateMedia({reducedMotion:'reduce'});await page.click('#menu-world');await page.click('#online-world-back');
   check('reduced motion returns immediately',await page.evaluate(()=>!document.getElementById('menu')!.hidden));
   await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);
   check('rotation keeps finite camera',(await state(page)).box!.split(/\s+/).every(v=>Number.isFinite(Number(v))));
   await page.click('#menu-play');await page.waitForSelector('#play-menu:not([hidden])');
   check('the map never paints over the Play submenu',await page.evaluate(()=>getComputedStyle(document.getElementById('online-world-screen')!).display==='none'));
   await page.click('#play-back');await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
  }
  await context.close();
 }
 if(!process.env.BASELINE_ROOT){
  for(const scenario of [{name:'cached-offline',cached:true,fail:true},{name:'uncached-offline',fail:true},{name:'slow',delay:1600},{name:'anonymous',anonymous:true},{name:'auth-unavailable',anonymous:true,failAuth:true},{name:'empty',empty:true},{name:'cached-empty',empty:true,cached:true},{name:'stale-camera',cached:true,wideCache:true,delay:1600},{name:'bootstrap',delayCode:1600},{name:'inflight-claim'}]){
   if(process.env.LIVING_CASE&&process.env.LIVING_CASE!==scenario.name)continue;
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await boot(page,scenario);
   check(`${scenario.name}: menu stays immediately usable`,await page.locator('#menu-world').isEnabled());
   if((!('empty' in scenario)||!scenario.empty)&&(!scenario.fail||scenario.cached))await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
   if(scenario.fail&&!scenario.cached)check('failure never fabricates territory',await page.locator('.world-map-svg').count()===0);
   if('wideCache' in scenario&&scenario.wideCache){
    await page.waitForFunction(()=>!document.querySelector('.world-hex[data-cell-id="100,0"]'));
    check('fresh coast clamps an obsolete remembered camera without a blank map',await page.evaluate(()=>{
     const r=document.querySelector('.world-map-svg')!.getBoundingClientRect();
     return [...document.querySelectorAll('.world-hex')].some(e=>{const b=e.getBoundingClientRect();return b.right>r.left&&b.left<r.right&&b.bottom>r.top&&b.top<r.bottom;});
    }));
   }
   await page.screenshot({path:`${shots}/${scenario.name}.png`});
   await page.click('#menu-world');await page.waitForTimeout(300);
   if(process.env.LIVING_DEBUG){console.log('DEBUG after opening',scenario.name,await state(page),await page.evaluate(()=>{
    const s=document.getElementById('online-world-screen')!,b=document.getElementById('online-world-back')!;return {hidden:s.hidden,inert:s.inert,visibility:getComputedStyle(b).visibility,menu:document.getElementById('menu')!.hidden};
   }));await page.screenshot({path:`${shots}/debug-open.png`});}
   await page.click('#online-world-back');await page.waitForTimeout(150);
   check(`${scenario.name}: navigation remains recoverable`,await page.locator('#menu-world').isEnabled());
   if('empty' in scenario&&scenario.empty){
    await page.unroute('**/v1/world');await page.evaluate(()=>window.dispatchEvent(new Event('futasaku:menu')));
    await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');
    check(`${scenario.name}: a later valid map recovers one surface`,await page.locator('.world-map-svg').count()===1);
   }
   if(scenario.name==='inflight-claim'){
    await page.waitForSelector('#menu-world-tiles:not([hidden])');
    const countBefore=Number((await page.locator('#menu-world-tiles-value').textContent())!.replace(/\D/g,''));
    await page.click('#menu-world');await page.waitForTimeout(250);
    let release!:()=>void,reached!:()=>void;
    const pending=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});
    await page.route('**/v1/world/claims',async route=>{reached();await gate;await route.continue();});
    await page.focus('.world-hex[data-cell-id="2,-4"]');await page.keyboard.press('Enter');
    await page.click('#online-world-selection .world-claim-button');await page.click('#online-world-selection .world-claim-button');
    await pending;
    const oldRead=page.waitForResponse(r=>new URL(r.url()).pathname==='/v1/world');
    await page.click('#online-world-back');await oldRead;await page.waitForTimeout(150);
    release();
    await page.waitForFunction(()=>document.querySelector('.world-hex[data-cell-id="2,-4"]')?.classList.contains('mine'),undefined,{timeout:5000});
    check('a claim completing after Back updates the living menu',true);
    await page.waitForFunction(n=>Number(document.getElementById('menu-world-tiles-value')!.textContent!.replace(/\D/g,''))===n+1,countBefore,{timeout:5000});
    check('late mutation also refreshes the menu read-outs',true);
   }
   await context.close();
  }
 }
 if(!process.env.BASELINE_ROOT){
  for(const kind of ['one','scattered','fresh'] as const){
   if(process.env.LIVING_CASE)continue;
   const player=await guest();await store.adminAdjustSeeds({playerId:player.player.id,delta:1000,reason:'e2e',actorId:'e2e',requestId:`fund-${kind}`,now:Date.now()});await store.acknowledgeInvitation(player.player.id);
   const payload=await(await fetch(`${base}/v1/world`)).json();
   const free=payload.world.cells.filter((c:any)=>!payload.world.claims.some((v:any)=>v.cellId===c.id));
   const claims=kind==='fresh'?[]:kind==='one'?[free[0]]:[free[0],free[free.length-1]];
   for(const [i,c] of claims.entries())await store.claim(player.player.id,c.id,`${kind}-${i}`,Date.now());
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
   await boot(page,{rawIdentity:JSON.stringify({token:player.token,playerId:player.player.id,kind:player.player.kind})});
   await page.waitForSelector('[data-living-territory="menu"] .world-map-svg');await page.waitForTimeout(200);
   check(`${kind}: current ownership drawn honestly`,await page.locator('.world-hex.mine').count()===claims.length);
   if(claims.length)check(`${kind}: at least one actual holding is visible`,await page.evaluate(()=>{
    const r=document.querySelector('.world-map-svg')!.getBoundingClientRect();return [...document.querySelectorAll('.world-hex.mine')].some(e=>{const b=e.getBoundingClientRect();return b.right>r.left&&b.left<r.right&&b.bottom>r.top&&b.top<r.bottom;});
   }));
   await page.screenshot({path:`${shots}/${kind}-holdings.png`});await context.close();
  }
  check(`no uncaught browser errors${browserErrors.length?': '+browserErrors.join(' | '):''}`,browserErrors.length===0);
 }
 console.log(`PASS ${checks} living Territory checks`);
 }catch(error){
 const detail=error instanceof Error?error.message:String(error);
 if(process.env.GITHUB_ACTIONS)console.error(`::error title=Living Territory browser failure::${detail.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);
 if(activePage)await (activePage as Page).screenshot({path:`${shots}/failure.png`}).catch(()=>undefined);
 throw error;
}finally{await browser.close();await web.close();api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));}
