// Territory full-map fit, exact taps and a 3,000-cell rendering measurement.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';

const OUT = process.env.SHOTS ?? '/tmp/territory-final-polish';
mkdirSync(OUT, { recursive: true });
const storage = new MemoryStorage();
const store = new MemoryWorldEconomyStore(storage);
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({ service, config, live: createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }) });
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
const guest = async () => (await (await fetch(`${base}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as {
  token: string; player: { id: string; kind: string; displayName: string | null };
};
const me = await guest();
await store.adminAdjustSeeds({ playerId: me.player.id, delta: 5000, reason: 'e2e', actorId: 'e2e', requestId: 'fund-globe', now: Date.now() });
await store.acknowledgeInvitation(me.player.id);
// A holding near the middle of the world (the fat point of the default camera) and a few others,
// so there is land in every direction on the three camera centres.
for (const [i, cell] of ['-2,-4', '-1,-4', '-2,-3', '1,0', '2,0', '0,1', '-8,9', '-7,9', '-8,8'].entries())
  await store.claim(me.player.id, cell, `globe-${i}`, Date.now() - (9 - i) * 60_000);

process.env.CHANNEL = 'futa04';
process.env.VITE_ACCOUNTS = 'on';
process.env.VITE_DUEL_API_URL = base;
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY = 'local-e2e';
const web = await createServer({
  cacheDir: `/tmp/dyn-globe-vite-${(api.address() as AddressInfo).port}`,
  configFile: resolve('web/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await web.listen();
const origin = `http://127.0.0.1:${(web.httpServer!.address() as AddressInfo).port}`;

// Synthetic load, real renderer/gestures and local HTTP service. No production writes.
const browser=await chromium.launch(process.env.PW_CHROMIUM ? {executablePath:process.env.PW_CHROMIUM} : {});
const report:any[]=[];
let failurePage:Page|null=null;
try {
 for(const [width,height] of [[390,844],[844,390],[768,1024],[1440,1000]]) {
  if(process.env.STRESS_ONLY_PHONE && width!==390)continue;
  console.log(`CHECK ${width}x${height}`);
  const context=await browser.newContext({viewport:{width:width!,height:height!},hasTouch:true});
  const page=await context.newPage();failurePage=page;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const cells:{id:string;q:number;r:number}[]=[];
  for(let q=-32;q<=32;q++)for(let r=-32;r<=32;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=32)cells.push({id:`${q},${r}`,q,r});
  cells.sort((a,b)=>Math.max(Math.abs(a.q),Math.abs(a.r),Math.abs(a.q+a.r))-Math.max(Math.abs(b.q),Math.abs(b.r),Math.abs(b.q+b.r))||a.q-b.q||a.r-b.r);cells.length=Number(process.env.STRESS_CELLS ?? 3000);
  await page.route('**/auth/v1/settings',r=>r.fulfill({json:{external:{google:true}}}));
  await page.route(/\/v1\/world(\?|$)/,async route=>{
   const response=await route.fetch();const body=await response.json();
   body.world.cells=cells;
   const fragmented=process.env.STRESS_FRAGMENTED==='1';
   body.world.claims=cells.filter((_,i)=>fragmented ? i%4!==0 : i<Math.floor(cells.length*.75)).map((c,i)=>{
    const mine=fragmented ? i%3===0 : c.q<0;
    return {cellId:c.id,ownerId:mine?me.player.id:'stress-neighbour',ownerName:'Test holding',ownerLevel:3,ownerTag:'TEST',colour:mine?'hsl(38 42% 60%)':'hsl(140 25% 42%)',claimedAt:1};
   });
   delete body.world.rankings;
   await route.fulfill({json:body});
  });
  await page.addInitScript(raw=>{for(const p of ['','futa04:','main2:'])localStorage.setItem(p+'severgrow.duel.identity.v1',raw);},JSON.stringify({token:me.token,playerId:me.player.id,kind:me.player.kind,displayName:me.player.displayName}));
  await seedSettings(page,{sound:false,music:false,coach:false,reduceMotion:false});
  await page.goto(origin+'/');await page.waitForFunction(()=>!!(window as any).__severgrow?.ready?.());
  await page.waitForSelector('.world-hex');await page.click('#menu-world');await page.waitForTimeout(800);
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:width===390&&!process.env.STRESS_SKIP_TIMING?4:1});
  await page.evaluate(()=>{const p=document.getElementById('online-world-grid')!.getBoundingClientRect();const svg=document.querySelector('.world-map-svg')!;for(let i=0;i<35;i++)svg.dispatchEvent(new WheelEvent('wheel',{deltaY:100,clientX:p.left+p.width/2,clientY:p.top+p.height/2,bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>!document.getElementById('online-world-grid')!.classList.contains('moving'),undefined,{timeout:30000});
  await page.waitForTimeout(200);
  const fit=await page.evaluate(()=>{
   const grid=document.getElementById('online-world-grid')!.getBoundingClientRect();const land=[...document.querySelectorAll('.world-hex')].map(e=>e.getBoundingClientRect());
   const bounds={left:Math.min(...land.map(r=>r.left)),top:Math.min(...land.map(r=>r.top)),right:Math.max(...land.map(r=>r.right)),bottom:Math.max(...land.map(r=>r.bottom))};
   return {box:document.querySelector('.world-map-svg')!.getAttribute('viewBox'),count:land.length,bounds,panel:{left:grid.left,top:grid.top,right:grid.right,bottom:grid.bottom},fits:bounds.left>=grid.left-1&&bounds.right<=grid.right+1&&bounds.top>=grid.top-1&&bounds.bottom<=grid.bottom+1};
  });
  if(!fit.fits||fit.count!==cells.length)throw Error('Full-map fit failed '+JSON.stringify({width,height,...fit}));
  console.log('PASS full-map fit '+JSON.stringify(fit));
  await page.screenshot({path:`${OUT}/territory-3000-${width}x${height}.png`});
  // Blank sea and an edge hex: exact camera must survive either single tap.
  const before=await page.locator('.world-map-svg').getAttribute('viewBox');
  await page.mouse.click(fit.panel.left+(fit.panel.right-fit.panel.left)*.06,fit.panel.top+(fit.panel.bottom-fit.panel.top)*.06);await page.waitForTimeout(350);
  if(await page.locator('.world-hex.selected').count())throw Error('Sea selected land');
  const tile=page.locator('.world-hex').last();const r=await tile.boundingBox();if(!r)throw Error('No edge tile');
  await page.mouse.click(r.x+r.width/2,r.y+r.height/2);await page.waitForTimeout(350);
  if(await page.locator('.world-map-svg').getAttribute('viewBox')!==before)throw Error('Tile tap moved camera');
  if(width===390){
   const cx=(fit.panel.left+fit.panel.right)/2,cy=(fit.panel.top+fit.panel.bottom)/2;
   const pinch=async(from:number,to:number)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-from/2,y:cy,id:1},{x:cx+from/2,y:cy,id:2}]});
    for(let i=1;i<=6;i++){const d=from+(to-from)*i/6;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-d/2,y:cy,id:1},{x:cx+d/2,y:cy,id:2}]});await page.waitForTimeout(16);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>!document.getElementById('online-world-grid')!.classList.contains('moving'),undefined,{timeout:30000});
   };
   await pinch(40,140);
   const closeWidth=await page.locator('.world-map-svg').getAttribute('viewBox');
   if(!(Number(closeWidth!.split(' ')[2])<Number(before!.split(' ')[2])*.8))throw Error('Pinch did not zoom in');
   await pinch(160,18);
   const reopened=await page.locator('.world-map-svg').getAttribute('viewBox');
   if(Math.abs(Number(reopened!.split(' ')[2])-Number(before!.split(' ')[2]))>1)throw Error(`Pinch could not reach whole-map limit: ${before} → ${closeWidth} → ${reopened}`);
   console.log('PASS real two-finger pinch reaches full-map zoom');
   if(!process.env.STRESS_SKIP_TIMING){
   await cdp.send('HeapProfiler.collectGarbage');
   const memoryBefore=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize')?.value;
   if(process.env.STRESS_PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
   await page.evaluate(`(()=>{window.__frames=[];window.__frameOn=true;let last=performance.now();function tick(t){window.__frames.push(t-last);last=t;if(window.__frameOn)requestAnimationFrame(tick);}requestAnimationFrame(tick);})()`);
   const x=(fit.panel.left+fit.panel.right)/2,y=(fit.panel.top+fit.panel.bottom)/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let i=1;i<=24;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*2,y:y+i,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
   const frames=await page.evaluate<number[]>('window.__frameOn=false;window.__frames');frames.sort((a,b)=>a-b);
   if(process.env.STRESS_PROFILE){const {profile}=await cdp.send('Profiler.stop');console.log('PROFILE '+JSON.stringify(profile.nodes.filter(n=>(n.hitCount??0)>0).sort((a,b)=>(b.hitCount??0)-(a.hitCount??0)).slice(0,16).map(n=>({fn:n.callFrame.functionName,file:n.callFrame.url.split('/').at(-1),hits:n.hitCount}))));}
   await cdp.send('HeapProfiler.collectGarbage');
   const metrics=await cdp.send('Performance.getMetrics');
   report.push({width,height,cells:cells.length,fragmented:process.env.STRESS_FRAGMENTED==='1',memoryBefore,p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1),heap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,warp:await page.locator('.world-map-svg').getAttribute('data-warp-ms'),fit});
   }else report.push({width,height,fit});
  }else report.push({width,height,fit});
  console.log('MEASUREMENT '+JSON.stringify(report.at(-1)));
  if(width===390){
   await page.evaluate(id=>window.dispatchEvent(new CustomEvent('futasaku:player-profile',{detail:{playerId:id,trigger:null}})),me.player.id);
   await page.waitForFunction(()=>document.getElementById('profile-connected')?.textContent==='3');
   if(await page.locator('#profile-tiles').textContent()!=='9')throw Error('Profile total is not ownership total');
   if(await page.locator('#profile-connected-label').textContent()!=='CONNECTED TILES'||await page.locator('#profile-tiles-label').textContent()!=='TOTAL TILES')throw Error('Incorrect profile labels');
   await page.screenshot({path:`${OUT}/profile-connected-${width}.png`});
   await page.click('[data-profile-close]');
   console.log('PASS real API profile: 3 connected / 9 total, exact labels');
   await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);
   await page.evaluate(()=>{const p=document.getElementById('online-world-grid')!.getBoundingClientRect();for(let i=0;i<32;i++)document.querySelector('.world-map-svg')!.dispatchEvent(new WheelEvent('wheel',{deltaY:100,clientX:p.x+p.width/2,clientY:p.y+p.height/2,bubbles:true,cancelable:true}));});
   await page.waitForFunction(()=>!document.getElementById('online-world-grid')!.classList.contains('moving'),undefined,{timeout:30000});
   const rotated=await page.evaluate(()=>{const p=document.getElementById('online-world-grid')!.getBoundingClientRect();const rows=[...document.querySelectorAll('.world-hex')].map(e=>e.getBoundingClientRect());return {fits:rows.every(r=>r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1),box:document.querySelector('.world-map-svg')!.getAttribute('viewBox')};});
   if(!rotated.fits)throw Error('Active rotation lost full-map fit '+JSON.stringify(rotated));
   console.log('PASS active portrait-to-landscape rotation retains a usable full-map zoom');
  }
  if(errors.length)throw Error(errors.join('\n'));await context.close();failurePage=null;
 }
 console.log(`PASS ${process.env.STRESS_CELLS ?? 3000}-cell fit, sea taps and edge-camera invariance; `+JSON.stringify(report));
}catch(error){
 if(failurePage&&!failurePage.isClosed())await failurePage.screenshot({path:`${OUT}/failure.png`}).catch(()=>undefined);
 const message=String(error).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
 console.error(`::error::${message}`);throw error;
}finally{await browser.close();await web.close();await new Promise<void>(r=>api.close(()=>r()));}
