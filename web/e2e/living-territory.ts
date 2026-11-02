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
import { MENU_MAP_OPACITY } from '../src/online/living-territory-css.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
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
let checks=0;const check=(label:string,pass:boolean,note?:string)=>{assert.ok(pass,note?`${label} :: ${note}`:label);checks++;console.log('PASS',label,note??'');};
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
 // Wait for the DOM, not the `load` event. On WebKit, `load` waits for every subresource (fonts,
 // the map's images, the favicons); across the eight viewports this suite reopens, that occasionally
 // never settles and the whole run dies on a 30 s goto timeout — which is what turned CI red on
 // 3217830e while all 109 checks before it passed. The real readiness signal is the app's own
 // `__severgrow.ready()` awaited on the next line, so waiting for `load` bought nothing.
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).__severgrow?.ready?.());
 if(options.delayCode)check('early Territory key cannot swallow a tap before its handler is attached',await page.locator('#menu-world').isDisabled());
 // Wait for code bootstrap only, never for a map/network answer.
 await page.waitForFunction(()=>!(document.getElementById('menu-world') as HTMLButtonElement).disabled);
};
const state=(p:Page)=>p.evaluate(()=>{
 const svg=document.querySelector<SVGSVGElement>('.world-map-svg');const r=svg?.getBoundingClientRect();
 const grid=document.getElementById('online-world-grid');const g=grid?.getBoundingClientRect();
 const vb=(svg?.getAttribute('viewBox')??'').split(/\s+/).map(Number);
 const cs=svg?getComputedStyle(svg):null,gs=grid?getComputedStyle(grid):null;
 return {box:svg?.getAttribute('viewBox'),rect:r?[r.x,r.y,r.width,r.height]:null,count:document.querySelectorAll('.world-map-svg').length,
  mode:document.getElementById('online-world-screen')?.dataset.livingTerritory,
  same:!!svg&&svg===(window as any).__livingSvg,
  gridRect:g?[g.x,g.y,g.width,g.height]:null,
  centre:vb.length===4?[+(vb[0]!+vb[2]!/2).toFixed(3),+(vb[1]!+vb[3]!/2).toFixed(3)]:null,
  // World units per CSS pixel: the map's material scale. Equal on both axes = no stretch.
  material:r&&r.width>0&&r.height>0&&vb.length===4?[+(vb[2]!/r.width).toFixed(6),+(vb[3]!/r.height).toFixed(6)]:null,
  opacity:cs?Number(cs.opacity):null, transform:cs?cs.transform:null,
  radius:gs?gs.borderRadius:null, background:gs?gs.backgroundImage:null, shadow:gs?gs.boxShadow:null,
  // Diagnostics for a page that changed under us (a reload or a failed boot reads as "no map").
  ready:document.readyState, booted:!!(window as any).__severgrow,
  screen:!!document.getElementById('online-world-screen'),
  viewport:[innerWidth,innerHeight]};
});
/** WCAG contrast from RENDERED pixels: the key's own face (median) vs its brightest ink. */
const keyContrast=async(p:Page,selector:string)=>{
 const shot=await p.locator(selector).screenshot({animations:'disabled'});
 return p.evaluate(async(b64)=>{
  const img=new Image();img.src=`data:image/png;base64,${b64}`;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);
  const d=ctx.getImageData(0,0,c.width,c.height).data;
  const lin=(v:number)=>{const s=v/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;};
  const lum:number[]=[];
  for(let y=Math.floor(c.height*.25);y<Math.ceil(c.height*.75);y++)for(let x=Math.floor(c.width*.25);x<Math.ceil(c.width*.75);x++){
   const i=(y*c.width+x)*4;lum.push(0.2126*lin(d[i]!)+0.7152*lin(d[i+1]!)+0.0722*lin(d[i+2]!));
  }
  lum.sort((a,b)=>a-b);
  const face=lum[Math.floor(lum.length*.5)]!,ink=lum[Math.floor(lum.length*.995)]!;
  return +( (ink+0.05)/(face+0.05) ).toFixed(2);
 },shot.toString('base64'));
};
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
  await page.evaluate(()=>{(window as any).__livingSvg=document.querySelector('.world-map-svg');(window as any).__livingTile=document.querySelector('.world-hex');});
  const before=await state(page);
  // OWNER, 2026-11-02: "shouldnt be cropped as in territory menu, it should take the whole
  // background". The MENU's layer must paint to every viewport edge; the Territory panel keeps its
  // frame (its own screenshot/checks below are unchanged).
  const fill=(r:number[]|null)=>!!r&&r[0]!<=0.5&&r[1]!<=0.5&&r[0]!+r[2]!>=before.viewport[0]!-0.5&&r[1]!+r[3]!>=before.viewport[1]!-0.5;
  check(`${name}: menu map is full-bleed, grid to every edge${' '+JSON.stringify({grid:before.gridRect,svg:before.rect,vp:before.viewport})}`,fill(before.gridRect)&&fill(before.rect));
  check(`${name}: menu map has no crop frame (square, no face, no shadow)`,before.radius==='0px'&&before.background==='none'&&before.shadow==='none');
  check(`${name}: menu map opacity is ${MENU_MAP_OPACITY} (7% below 0.28)`,Math.abs((before.opacity??1)-MENU_MAP_OPACITY)<=0.0006,`${before.opacity}`);
  if(name==='small'){
   const ratio=await keyContrast(page,'#menu-world');
   check(`small: the menu keys stay legible over the dimmed map (${ratio}:1 ≥ 4.5:1)`,ratio>=4.5);
  }
  // THE OWNER'S COMPLAINT, MEASURED (2026-11-02: "it jumps, slightly changing position when going
  // from menu to territory"). The settle is PINNED to its first frame, so the comparison is the
  // frame a player actually sees first — not a frame that has already progressed. Everything is read
  // from paint: the player's own tiles' screen centres, the map's real opacity, and the frame's own
  // skin (the vignette). A position jump means these two reads disagree.
  let menuFrame:{tiles:number[][];opacity:number;skin:number}|null=null;
  let firstFrame:{tiles:number[][];opacity:number|null;skin:number;settle:boolean}|null=null;
  const painted=()=>page.evaluate(()=>{
   const svg=document.querySelector<SVGSVGElement>('.world-map-svg')!;
   const tiles=[...document.querySelectorAll<SVGElement>('.world-hex.mine')].slice(0,3).map(h=>{const r=h.getBoundingClientRect();return [+(r.x+r.width/2).toFixed(2),+(r.y+r.height/2).toFixed(2)];});
   return {tiles,opacity:+Number(getComputedStyle(svg).opacity).toFixed(4),skin:+Number(getComputedStyle(document.getElementById('online-world-grid')!,'::after').opacity).toFixed(4)};
  });
  /** THE OWNER'S COMPLAINT, IN ONE READ: identifiable tiles by cell id, at their painted screen
   * centres. The menu's last frame and the panel's settled frame must agree to a fraction of a
   * pixel — §"tiles don't move at all" (owner, 2026-11-02). */
  const tilePoints=(p:Page)=>p.evaluate(()=>[...document.querySelectorAll<SVGElement>('.world-hex.mine')].slice(0,3).map(h=>{
   const r=h.getBoundingClientRect();
   return {id:h.getAttribute('data-cell-id')??'',at:[+(r.x+r.width/2).toFixed(3),+(r.y+r.height/2).toFixed(3)]};
  }));
  /** Same tiles, same pixels: every id present on both sides, every centre within `tolerance` px. */
  const tilesStill=(a:{id:string;at:number[]}[]|null,b:{id:string;at:number[]}[]|null,tolerance=0.01)=>{
   if(!a||!b||!a.length||a.length!==b.length)return false;
   return a.every((tile,index)=>tile.id===b[index]!.id&&Math.abs(tile.at[0]!-b[index]!.at[0]!)<=tolerance&&Math.abs(tile.at[1]!-b[index]!.at[1]!)<=tolerance);
  };
  let menuTiles:{id:string;at:number[]}[]|null=null;
  if(name==='phone'){
   menuFrame=await painted();
   menuTiles=await tilePoints(page);
   await page.evaluate(()=>{
    (window as any).__firstFrame=null;
    document.getElementById('menu-world')!.addEventListener('click',()=>{
     requestAnimationFrame(()=>{
      const svg=document.querySelector<SVGSVGElement>('.world-map-svg');
      // The first painted frame is READ, not rewound. Pausing freezes every beat for the read, so a
      // frame that has already progressed cannot hide a jump; but moving `currentTime` back to zero
      // would also restart the map's one-second colour climb, and the arrival is measured from the
      // click (see `__colourFrames`). Resume from where the player actually was.
      const held=document.getAnimations();
      for(const a of held){try{a.pause();}catch{/* finished: already at rest */}}
      const tiles=svg?[...document.querySelectorAll<SVGElement>('.world-hex.mine')].slice(0,3).map(h=>{const r=h.getBoundingClientRect();return [+(r.x+r.width/2).toFixed(2),+(r.y+r.height/2).toFixed(2)];}):[];
      (window as any).__firstFrame={tiles,opacity:svg?+Number(getComputedStyle(svg).opacity).toFixed(4):null,
       skin:+Number(getComputedStyle(document.getElementById('online-world-grid')!,'::after').opacity).toFixed(4),
       // The MAP's own beats only: the head/screen transitions on the same page also carry
       // transforms, and counting them would report a handoff the map never ran.
       settle:!!svg&&svg.getAnimations().some(a=>(a.effect as KeyframeEffect)?.getKeyframes?.().some(k=>'transform' in k))};
      for(const a of held){try{a.play();}catch{/* finished */}}
     });
    },{once:true,capture:true});
   });
  }
  if(name==='phone')await page.evaluate(()=>{
   // THE OWNER'S SECOND MEASURED DIRECTLY (2026-11-02: "make it the color of tiles fade in in like
   // 1 second or so, and 0.3s when going back to main menu"). A TIMER samples the map's one opacity
   // track through the arrival: rAF alone was starved to ~1 sample/second on CI's software WebKit,
   // which is exactly how a smooth fade turns into a step. One timer, never two chained loops.
   document.getElementById('menu-world')!.addEventListener('click',()=>{
    const frames:any[]=[];(window as any).__colourFrames=frames;
    let finish!:()=>void;(window as any).__colourFramesDone=new Promise<void>(r=>{finish=r;});
    const start=performance.now();let closed=false;
    const watchdog=setTimeout(()=>{if(!closed){closed=true;finish();}},5000);
    const tick=()=>{
     const svg=document.querySelector<SVGSVGElement>('.world-map-svg');
     const light=svg?.getAnimations().find(a=>a.id==='living-colour-in');
     frames.push({at:+(performance.now()-start).toFixed(1),opacity:svg?+Number(getComputedStyle(svg).opacity).toFixed(4):0,
      duration:(light?.effect?.getTiming().duration as number|undefined)??null,
      // THE ANIMATION'S OWN CLOCK, not the wall clock: a beat starts on the first painted frame, and
      // on a slow open that frame can be 150ms after the tap. Measuring against the click would make
      // a correct one-second fade look short (and, worse, make the dip look like a fall).
      t:light?.currentTime==null?null:Number(light.currentTime)});
     if(performance.now()-start<1600)setTimeout(tick,16);
     else if(!closed){closed=true;clearTimeout(watchdog);finish();}
    };setTimeout(tick,0);
   },{once:true,capture:true});
  });
  if(name==='phone')await page.evaluate(()=>{
   document.getElementById('menu-world')!.addEventListener('click',()=>{
   const frames:any[]=[];(window as any).__livingFrames=frames;
   let finish!:()=>void;(window as any).__livingFramesDone=new Promise<void>(r=>{finish=r;});
   const start=performance.now(),end=start+400,limit=start+3000;
   const watchdog=setTimeout(finish,3000);
   const sample=()=>{
    const svg=document.querySelector<SVGSVGElement>('.world-map-svg'),screen=document.getElementById('online-world-screen');
    const grid=document.getElementById('online-world-grid');
    if(!svg||!screen||!grid){frames.push({at:performance.now(),box:null,opacity:0,visible:false,same:false,material:null,anim:0});clearTimeout(watchdog);finish();return;}
    const vb=(svg.getAttribute('viewBox')??'').split(/\s+/).map(Number);
    const g=grid.getBoundingClientRect();
    // UNFILTERED on purpose: a CSS transition IS an animation to the player's eye, and the reduce
    // path must cancel those too (an earlier pass filtered them out and hid a real failure).
    const anims=[...svg.getAnimations()];
    // TWO beats ride the map now (the handoff and its light): the settle is the one that moves it.
    const settle=anims.find(a=>(a.effect as KeyframeEffect).getKeyframes().some(k=>'transform' in k));
    const m=/matrix\(([^)]+)\)/.exec(getComputedStyle(svg).transform);
    const ty=m?Number(m[1]!.trim().split(/\s*,\s*/).at(-1)):0;
    const frame={at:performance.now(),box:svg.getAttribute('viewBox'),opacity:Number(getComputedStyle(svg).opacity),visible:getComputedStyle(screen).display!=='none',same:svg===(window as any).__livingSvg,
     skin:Number(getComputedStyle(grid,'::after').opacity),ty:Number.isFinite(ty)?ty:0,
     material:vb.length===4&&g.width>0?+(vb[2]!/g.width).toFixed(6):null,
     anim:anims.length,duration:settle?.effect?.getTiming().duration??null,easing:settle?.effect?.getTiming().easing??null,
     // The colour track is the ONE layer that multiplies every tile's fill: its own duration is
     // recorded here so the assertion can name the owner's token, not a frame estimate.
     colour:anims.find(a=>a.id==='living-colour-in')?.effect?.getTiming().duration??null,
     from:(settle as any)?.effect?.getKeyframes?.().map((k:any)=>k.transform)??null};
    frames.push(frame);
    // Software WebKit can spend a frame flushing styles. Keep the same minimum observations
    // and continuity assertions, and include a settled frame within a finite deadline.
    const now=performance.now();
    if(now<limit&&(now<end||frames.length<3||frame.opacity<.999))requestAnimationFrame(sample);
    else {clearTimeout(watchdog);finish();}
   };requestAnimationFrame(sample);
   },{once:true,capture:true});
  });
  await page.click('#menu-world');await page.waitForSelector('#online-world-screen:not([hidden])');
  if(name==='phone'){
   await page.waitForFunction(()=>(window as any).__firstFrame);
   firstFrame=await page.evaluate(()=>(window as any).__firstFrame as {tiles:number[][];opacity:number|null;skin:number;settle:boolean});
   const first=firstFrame;
   const menuFrameHere=menuFrame!;
   const moved=first.tiles.length>0&&first.tiles.length===menuFrameHere.tiles.length&&first.tiles.every((t,i)=>Math.abs(t[0]!-menuFrameHere.tiles[i]![0]!)<=0.5&&Math.abs(t[1]!-menuFrameHere.tiles[i]![1]!)<=0.5);
   check(`NO JUMP: the panel's first frame paints every own tile at the menu's last-frame point (${JSON.stringify(first.tiles)} = ${JSON.stringify(menuFrameHere.tiles)})`,moved);
   // THE OWNER'S RULE, NOT A SMOOTH SETTLE: with the panel anchored to the menu's mapping there is
   // no transform to animate at all. The old handoff beat moved the whole map by the re-fit; its
   // absence is the proof that nothing travels behind the frame.
   check('NO JUMP: opening runs no map transform (the menu mapping is already the panel mapping)',first.settle===false);
   // THE COLOUR MAY ONLY GO DOWN ON THAT FRAME. Before the owner's one-second climb the map held
   // the menu's value through the handoff; now the dip begins on the arrival's first frame, so on a
   // slow engine that frame is legitimately DARKER. What must never happen is a flash brighter than
   // the menu's last frame (the old lit crop).
   check(`NO JUMP: the map does not brighten on that first frame (${first.opacity} <= the menu's ${menuFrameHere.opacity})`,
    first.opacity!==null&&first.opacity<=menuFrameHere.opacity+0.01);
   // THE FIRST PAINTED FRAME IS NOT THE FINISHED FRAME. It used to be read at exactly 0ms; on a slow
   // open the browser paints no frame at all until ~100ms in, so the honest assertion is that the
   // skin is still arriving on the first frame it actually shows (a snap would be exactly 1).
   check(`the window's frame ARRIVES instead of appearing (vignette ${first.skin} on the first frame)`,first.skin<1);
  }
  await page.waitForTimeout(name==='phone'?450:500);
  const after=await state(page);
  if(name==='phone'){
   // THE OWNER'S ASSERTION, SETTLED. First frame and settled frame are the same pixels: nothing
   // slides home after the light comes up either.
   const settledTiles=await tilePoints(page);
   check(`NO JUMP: every own tile is on its menu pixel in the settled panel (${JSON.stringify(settledTiles)})`,tilesStill(menuTiles,settledTiles),JSON.stringify({menu:menuTiles,settled:settledTiles}));
  }
  const after0=await page.evaluate(()=>{const svg=document.querySelector('.world-map-svg')!;const grid=document.getElementById('online-world-grid')!;const vb=(svg.getAttribute('viewBox')??'').split(/\s+/).map(Number);const r=svg.getBoundingClientRect(),g=grid.getBoundingClientRect();return {box:vb,rect:[r.x,r.y,r.width,r.height],gridRect:[g.x,g.y,g.width,g.height]};});
  if(name==='phone'){
   await page.evaluate(()=>(window as any).__livingFramesDone);
   const frames=await page.evaluate(()=>(window as any).__livingFrames as {at:number;box:string;opacity:number;visible:boolean;same:boolean;material:number|null;anim:number;duration:number|null;easing:string|null;colour:number|null;from:string[]|null;skin:number;ty:number}[]);
   const material0=before.material![0]!;
   const stable=frames.length>2&&frames.every(f=>f.same&&f.visible&&f.material!==null&&Math.abs(f.material-material0)<0.0005);
   check(`every transition frame retains the one map at the same tile scale${stable?'':' '+JSON.stringify({before:before.box,frames})}`,stable);
   // THE CROP IS NEVER SEEN AT FULL LIGHT (2026-11-02). Until the handoff has actually landed (the
   // map is still translated by a visible amount), the panel's window and the map's paint box do not
   // coincide; the map must still be dim then, or the difference reads as the window snapping. 2px
   // of a 102px travel is the point where the framing is indistinguishable, so that is the gate.
   // This assertion bites: the old eager 150ms brightening was already at ~0.6 opacity while 57px
   // of travel remained.
   const bright=frames.filter(f=>Math.abs(f.ty)>=2&&f.opacity>0.35);
   check(`while the map is still moving it stays dim (${bright.length} bright frame(s): ${JSON.stringify(bright.slice(0,3))})`,bright.length===0);
   check(`the frame's skin fades in on the same beat (vignette ${firstFrame?.skin} -> ${frames.at(-1)!.skin})`,(firstFrame?.skin??1)<0.99&&frames.at(-1)!.skin>=0.99);
   // THE MAPPING IS UNCHANGED, PROVEN FROM GEOMETRY (not from a sampled animation frame): project
   // real tiles through both surfaces' own `meet` mappings and require the same screen pixel. The
   // old panel re-fitted itself to its width/centre, so the panel point was tens of pixels away —
   // the owner's "drop". This does not call `anchoredView`: it re-derives the browser's mapping.
   const beforeBox=(before.box??'').split(/\s+/).map(Number);
   const project=(box:number[],rect:number[],wx:number,wy:number)=>{
    const k=Math.min(rect[2]!/box[2]!,rect[3]!/box[3]!);
    const ox=(rect[2]!-box[2]!*k)/2,oy=(rect[3]!-box[3]!*k)/2;
    return [rect[0]!+ox+(wx-box[0]!)*k,rect[1]!+oy+(wy-box[1]!)*k];
   };
   const points=['-2,-4','-1,-4','-2,-3'].map(id=>{
    const [q,r]=id.split(',').map(Number);const at=cellXY(q!,r!);
    const a=project(beforeBox,before.rect!,at.x,at.y),b=project(after0.box,after0.rect,at.x,at.y);
    return {id,menu:[+a[0]!.toFixed(3),+a[1]!.toFixed(3)],panel:[+b[0]!.toFixed(3),+b[1]!.toFixed(3)]};
   });
   check(`NO JUMP: every world point keeps its screen pixel in the panel ${JSON.stringify(points)}`,
     points.every(p=>Math.abs(p.menu[0]!-p.panel[0]!)<=0.001&&Math.abs(p.menu[1]!-p.panel[1]!)<=0.001));
   check(`NO JUMP: the panel keeps the menu's tile scale (${before.material![0]} = ${after.material![0]})`,
     Math.abs(before.material![0]!-after.material![0]!)<=1e-6);
   check(`the tiles’ colour comes up on the colour-in token (${INTERFACE_MOTION.colourIn}ms, not the ${INTERFACE_MOTION.open}ms surface beat)`,
     frames.some(f=>f.colour===INTERFACE_MOTION.colourIn),
     JSON.stringify(frames.filter(f=>f.anim>0).slice(0,1)));
   check('clarity transition reaches full contrast',frames.at(-1)!.opacity>.99);
   // THE OWNER'S SECOND, MEASURED (2026-11-02: "make it the color of tiles fade in in like 1 second
   // or so"): the colour must be RISING across the arrival, not switched on in one beat. 0ms is the
   // pinned first frame (the menu's own light); ~300ms and ~1000ms are the first samples at or after
   // those marks, so a slow CI frame can only read LATER than the mark — the climb it measures is
   // still the real one.
   await page.evaluate(()=>(window as any).__colourFramesDone);
   const colour=await page.evaluate(()=>(window as any).__colourFrames as {at:number;opacity:number;duration:number|null;t:number|null}[]);
   // The beat's own clock: `t` is the colour animation's current time. A slow first frame only
   // shifts WHEN the sample happened, never what the sample measures.
   const timed=colour.filter(f=>f.t!==null);
   const near=(ms:number)=>timed.reduce((best,f)=>Math.abs(f.t!-ms)<Math.abs(best.t!-ms)?f:best,timed[0]??colour[0]!);
   const start0=near(0),early=near(300),late=near(1000),last=colour.at(-1)!;
   check(`the tiles’ colour RISES over the arrival (${Math.round(start0.t!)}ms ${start0.opacity} -> ${Math.round(early.t!)}ms ${early.opacity} -> ${Math.round(late.t!)}ms ${late.opacity})`,
     start0.opacity>=.09&&start0.opacity<=MENU_MAP_OPACITY+0.02&&early.opacity>start0.opacity&&late.opacity>early.opacity);
   check(`the colour reaches the panel's own rest light by the end (${last.opacity} at ${Math.round(last.at)}ms)`,
     last.opacity>=.99&&late.opacity>=.98);
   check(`the colour-in beat is the colour-in token (${INTERFACE_MOTION.colourIn}ms), not a literal`,
     colour.some(f=>f.duration===INTERFACE_MOTION.colourIn),JSON.stringify(colour.filter(f=>f.duration!==null).slice(0,1)));
   const gaps=frames.slice(1).map((f,i)=>f.at-frames[i]!.at).sort((a,b)=>a-b);console.log('INFO transition frame p95 ms',gaps[Math.floor(gaps.length*.95)]);
  }
  const afterUnstretched=!!after.material&&Math.abs(after.material[0]!/after.material[1]!-1)<0.002;
  check(`${name}: opening keeps one surface and an unstretched tile${after.same&&afterUnstretched?'':' '+JSON.stringify({after})}`,after.same&&afterUnstretched);
  check(`${name}: opening crops the menu's full-bleed view into the Territory panel`,!!after.rect&&!!before.rect&&after.rect[2]!<before.rect[2]!&&after.rect[3]!<before.rect[3]!);
  if(name==='phone'){
   check('known menu wallet avoids a first-open tile rebuild',await page.evaluate(()=>document.querySelector('.world-hex')===(window as any).__livingTile));
   check(`known identity private metadata is fetched once on entry (${walletReads-walletBefore})`,walletReads-walletBefore===1);
   check('entry still replaces the known wallet with its fresh server balance',await page.evaluate(()=>document.querySelector('.world-seeds')?.textContent?.replace(/\D/g,'')==='1750'));
  }
  check(`${name}: the map keeps true hexagons on both surfaces (no stretch)`,!!before.material&&!!after.material&&Math.abs(before.material[0]!/before.material[1]!-1)<.002&&Math.abs(after.material[0]!/after.material[1]!-1)<.002);
  // THE ARTIFACT IS OF THE RESTING PANEL: the tiles' colour takes the owner's full second, so a
  // screenshot at 500ms would show a half-lit map that no player ever sits on.
  if(name!=='phone')await page.waitForFunction(()=>{const s=document.querySelector<SVGSVGElement>('.world-map-svg');return !s||Number(getComputedStyle(s).opacity)>=.99;},undefined,{timeout:6000});
  await page.screenshot({path:`${shots}/territory-${name}.png`});
  // THE RETURN JOURNEY (owner: "going back to main menu from territory too"). Sample every frame of
  // the way out: the panel's window must not become the full-bleed one while the map is bright, or
  // the way back is the same hard cut in reverse.
  if(name==='phone')await page.evaluate(()=>{
   const frames:any[]=[];(window as any).__backFrames=frames;
   let finish!:()=>void;(window as any).__backFramesDone=new Promise<void>(r=>{finish=r;});
   let start=0;const watchdog=setTimeout(finish,6000);
   document.getElementById('online-world-back')!.addEventListener('click',()=>{
    // The clock starts AT THE CLICK, not at setup, and the window is generous: on CI's software-
    // rendered WebKit the whole return (dim, re-frame, light up) runs well past 420ms, and a window
    // that closes first yields ONE frame and `swap -1` — which is what made this look like a hard
    // cut when nothing had even happened yet.
    start=performance.now();
    // Exposed so the suite can time the retreat from the click itself (the owner's 300ms).
    (window as any).__backStart=start;
    let sinceMenu=0;
    const sample=()=>{
     const svg=document.querySelector<SVGSVGElement>('.world-map-svg');
     const grid=document.getElementById('online-world-grid');
     if(!svg||!grid){frames.push({at:performance.now(),width:0,opacity:0,out:null});}
     else frames.push({at:performance.now(),width:+grid.getBoundingClientRect().width.toFixed(2),
      opacity:+Number(getComputedStyle(svg).opacity).toFixed(4),
      out:(svg.getAnimations().find(a=>a.id==='living-colour-out')?.effect?.getTiming().duration as number|undefined)??null,
      // The retreat's own clock, so a late first frame cannot be read as an early finish.
      t:(svg.getAnimations().find(a=>a.id==='living-colour-out')?.currentTime as number|undefined)??null,
      // The beat's timeline start, on the same clock as `performance.now()`: minus the swap's wall
      // time it is the exact length of the retreat, with no sampling gap to guess.
      start:(svg.getAnimations().find(a=>a.id==='living-colour-out')?.startTime as number|undefined)??null,
      leaving:document.getElementById('online-world-screen')!.classList.contains('living-leaving'),
      mode:document.getElementById('online-world-screen')!.dataset.livingTerritory});
     // A TIMER, not only rAF: CI's software-rendered WebKit starved rAF to ~1 sample/second, so the
     // dim's intermediate frames were never observed and the assertion read a cliff that was not
     // there. A 10ms interval samples the real sequence; rAF still runs so a frame-accurate browser
     // is measured too.
     // Keep sampling for a few frames AFTER the framing swaps, so the light coming back up is
     // measured too, then stop. Two and a half seconds is far beyond any engine's return.
     sinceMenu=document.getElementById('online-world-screen')!.dataset.livingTerritory==='menu'?sinceMenu+1:0;
     if(sinceMenu>=8||performance.now()-start>2500){clearTimeout(watchdog);finish();return;}
     setTimeout(sample,10);requestAnimationFrame(sample);
    };setTimeout(sample,0);requestAnimationFrame(sample);
   },{once:true,capture:true});
  });
  await page.click('#online-world-back');await page.waitForSelector('#menu:not([hidden])');
  if(name==='phone'){
   await page.evaluate(()=>(window as any).__backFramesDone);
   const frames=await page.evaluate(()=>(window as any).__backFrames as {at:number;width:number;opacity:number;out:number|null;t:number|null;start:number|null;leaving:boolean;mode:string}[]);
   const swap=frames.findIndex(f=>f.mode==='menu');
   const backStart=await page.evaluate(()=>(window as any).__backStart as number);
   const swapAt=frames[swap]!.at-backStart;
   const note=(f:{at:number;opacity:number;out:number|null;t:number|null;leaving:boolean;mode:string})=>({at:Math.round(f.at-backStart),t:f.t===null?null:Math.round(f.t),opacity:f.opacity,out:f.out,leaving:f.leaving,mode:f.mode});
   // THE STRICT FORM, kept: the map must actually be DIM before the framing changes, so the way back
   // is a fade in the panel's window, then a re-frame in the dark, then the light coming up. Now that
   // the sampler is timer-based this is observable on CI instead of reading a sampling cliff.
   const brightAtMenuWidth=frames.filter(f=>f.mode==='menu'&&f.opacity>MENU_MAP_OPACITY+0.02);
   check(`the way back is not a hard cut: the framing changes only while the map is dim (frame ${swap}, ${Math.round(swapAt)}ms: ${JSON.stringify(frames.slice(Math.max(0,swap-1),swap+2).map(note))})`,
    swap>0&&frames[swap-1]!.opacity<=0.35&&frames[swap]!.opacity<=0.35);
   check(`the map is never bright in the menu's framing (${brightAtMenuWidth.length} bright frame(s))`,
    brightAtMenuWidth.length===0);
   check('the way back dims the panel first (a leaving frame below the menu\'s own backdrop)',
    frames.some(f=>f.leaving&&f.opacity<=0.35)&&frames.at(-1)!.opacity<=MENU_MAP_OPACITY+0.01);
   // THE RETREAT IS 300ms, NOT THE ARRIVAL'S SECOND (owner, 2026-11-02: "and 0.3s when going back
   // to main menu"). Timed on the colour-out beat's own timeline: the swap's wall time minus the
   // beat's `startTime` is how long the retreat actually took, including any slow frame after it. It
   // can never be shorter than the beat, and it must stay well inside the arrival's second.
   // A beat starts on the first painted frame (on software WebKit, ~200ms after the tap), so the
   // click's clock would read it wrong.
   const started=[...frames].reverse().find(f=>f.start!==null);
   const swapT=started?frames[swap]!.at-started.start!:Number.NaN;
   check(`the retreat clears in one colour-out beat (${Math.round(swapT)}ms ≈ ${INTERFACE_MOTION.colourOut}ms, not the ${INTERFACE_MOTION.colourIn}ms arrival)`,
    swap>0&&!!started&&swapT>=INTERFACE_MOTION.colourOut-40&&swapT<INTERFACE_MOTION.colourIn);
   check(`the retreat runs the colour-out token duration (${INTERFACE_MOTION.colourOut}ms), not a literal`,
    frames.some(f=>f.out===INTERFACE_MOTION.colourOut));
  }
  await page.waitForTimeout(200);
  const back=await state(page);
  if(name==='phone'){
   // THE RETURN IS THE SAME RULE (owner: "going back ... too"): the menu's own tiles must be back on
   // the exact pixels the panel showed them at. Not "dimmed while it settles" — the same pixels.
   const backTiles=await tilePoints(page);
   check(`NO JUMP: the menu returns every own tile to the panel's pixels (${JSON.stringify(backTiles)})`,tilesStill(menuTiles,backTiles),JSON.stringify({menu:menuTiles,back:backTiles}));
  }
  const backSame=back.same&&back.mode==='menu'&&!!back.material&&Math.abs(back.material[0]!/back.material[1]!-1)<0.002;
  check(`${name}: return retains the one map as a true, unstretched hex field`,backSame,JSON.stringify({after,back}));
  check(`${name}: returning restores keyboard focus`,await page.evaluate(()=>document.activeElement?.id==='menu-world'));
  check(`${name}: no horizontal page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`${name}: every visible menu key fits`,await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('#menu button')].filter(e=>e.offsetWidth&&e.offsetHeight).every(e=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;})));
  if(name==='phone'){
   // Interrupt the actual shared exit (before its onDone), then rapidly reopen/return repeatedly.
   for(let i=0;i<5;i++){
    await page.evaluate(()=>{document.getElementById('menu-world')!.click();document.getElementById('online-world-back')!.click();});
   }
   await page.waitForTimeout(250);check('rapid navigation never hides the returned menu',await page.evaluate(()=>!document.getElementById('menu')!.hidden&&!document.getElementById('menu')!.inert));
   // THE COLOUR MUST NOT BE CAUGHT MID-FADE (owner, 2026-11-02, same evening): an open then an
   // immediate Back must land the backdrop at its own rest light — never a stuck half-lit map.
   check('rapid navigation leaves the menu map at its rest colour, never half-faded',await page.evaluate((rest:number)=>{
    const s=document.querySelector<SVGSVGElement>('.world-map-svg');
    return !!s&&Math.abs(Number(getComputedStyle(s).opacity)-rest)<=0.01;
   },MENU_MAP_OPACITY));
   // AN IMPATIENT SECOND BACK, DETERMINISTICALLY. The loop above only catches the swallowed-Back bug
   // when the two presses land inside the same exit beat, which is timing-dependent. This one presses
   // Back, waits 20ms (well inside the 100ms dim), and presses it again: the second journey must
   // COMPLETE the first, not be dropped. Before the fix that left `leaving` set and the menu hidden —
   // a stuck screen for a player who taps twice.
   await page.click('#menu-world');await page.waitForTimeout(120);
   await page.click('#online-world-back');await page.waitForTimeout(20);
   await page.click('#online-world-back').catch(()=>undefined);
   await page.waitForTimeout(350);
   check('a second Back mid-exit completes the journey instead of a stuck screen',
     await page.evaluate(()=>{const m=document.getElementById('menu')!;return !m.hidden&&!m.inert;}));
   check('rapid navigation keeps one renderer', (await state(page)).count===1);
   await page.click('#menu-world');await page.waitForTimeout(200);
   const rect=await page.locator('.world-map-svg').boundingBox();assert.ok(rect);
   await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-180);await page.waitForTimeout(200);
   const panned=await state(page);check('existing zoom still works',panned.box!==after.box);
   await page.click('#online-world-back');await page.waitForTimeout(200);await page.click('#menu-world');await page.waitForTimeout(200);
   const reopened=await state(page);
   const near=(a:string|null|undefined,b:string|null|undefined)=>!!a&&!!b&&a.split(/\s+/).every((v,i)=>Math.abs(Number(v)-Number(b.split(/\s+/)[i]))<1e-3);
   check('deliberate camera survives re-entry',near(reopened.box,panned.box??null),JSON.stringify({panned:panned.box,reopened:reopened.box}));
   // A real newly claimed tile, followed by return and the menu's existing fresh read.
   await store.claim(me.player.id,'-3,-3','new-claim-menu',Date.now());await page.click('#online-world-back');
   await page.waitForFunction(()=>document.querySelector('.world-hex[data-cell-id="-3,-3"]')?.classList.contains('mine'));
   check('menu reflects a new authoritative claim',true);
   await page.emulateMedia({reducedMotion:'reduce'});await page.click('#menu-world');
   check('reduce motion: the map opens with no settle and no transform',await page.evaluate(()=>{
    const s=document.querySelector<SVGSVGElement>('.world-map-svg');
    return !!s&&s.getAnimations().length===0&&getComputedStyle(s).transform==='none';
   }));
   check('reduce motion: no staggered head and no leaving class',await page.evaluate(()=>{
    const head=document.querySelector('.online-head');
    const grid=document.getElementById('online-world-grid')!;
    return (!head||head.getAnimations().length===0)&&!document.getElementById('online-world-screen')!.classList.contains('living-leaving')
     &&getComputedStyle(grid,'::after').opacity==='1';
   }));
   await page.click('#online-world-back');
   check('reduced motion returns immediately',await page.evaluate(()=>!document.getElementById('menu')!.hidden));
   const stillReturn=await page.evaluate(()=>{
    const s=document.querySelector<SVGSVGElement>('.world-map-svg');
    const screen=document.getElementById('online-world-screen')!;
    return {anims:s?s.getAnimations().map(a=>[...((a.effect as KeyframeEffect)?.getKeyframes?.()??[])].map(k=>Object.keys(k).join('+'))):null,
     opacity:s?+Number(getComputedStyle(s).opacity).toFixed(4):null,
     leaving:screen.classList.contains('living-leaving'),mode:screen.dataset.livingTerritory};
   });
   // "Instant" is the behaviour, not the property list: on the very next frame the map is already
   // at the menu's own rest light, in the menu's framing, with nothing script-driven running.
   check(`reduced motion: the return has no animation either ${JSON.stringify(stillReturn)}`,
    !!stillReturn.anims&&stillReturn.anims.length===0&&!stillReturn.leaving&&stillReturn.mode==='menu'
     &&stillReturn.opacity!==null&&Math.abs(stillReturn.opacity-MENU_MAP_OPACITY)<=0.001);
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
