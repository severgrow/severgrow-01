// Comparative probe, not a hardware/battery benchmark. Run serially, with identical CPU/DPR.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
import {newGame} from '../../src/engine/index.js';
import {positionSave} from './position.js';
import {resumeSavedGame} from './helpers/menu-nav.js';
import {ACTIVITY_PROBE} from './helpers/activity-probe.js';
import {buildSphere,latticeMap} from '../../src/planet/geometry.js';
import {WORLD_VERSION,seenWorld} from '../../server/src/world.js';

const out=process.env.OUT??'/tmp/futasaku-performance-baseline.json';
const samples=Math.max(1,Number(process.env.RUNS??3));
const ms=Number(process.env.SAMPLE_MS??4000);
const cpu=Number(process.env.CPU??4);
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows:unknown[]=[];
const ids=[...latticeMap(buildSphere()).cellOf.keys()].slice(0,3000);
const playerId='11111111-1111-4111-8111-111111111111';
let heavy=false;
const makeWorld=(occupied:string[],revision:number)=>{
 return {version:WORLD_VERSION,revision,cost:100,challengeStake:0,
  cells:seenWorld(occupied),claims:occupied.map((cellId,i)=>({cellId,ownerId:playerId,ownerName:'Cedar',ownerLevel:3,ownerTag:'',colour:'hsl(150 32% 52%)',claimedAt:i})),disputes:[]};
};
const small=makeWorld(['0,0','1,0','0,1'],1),large=makeWorld(ids,2);
const world=()=>heavy?large:small;
const stats=(values:number[])=>{const v=[...values].sort((a,b)=>a-b);return {n:v.length,median:v[Math.floor(v.length*.5)]??0,p95:v[Math.floor(v.length*.95)]??0,max:v.at(-1)??0};};
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  heavy=false;
  const context=await browser.newContext({viewport,deviceScaleFactor:3,hasTouch:true,isMobile:viewport.width<900});
  await context.addInitScript({content:ACTIVITY_PROBE});
  await context.addInitScript(({playerId,cached})=>{
   localStorage.setItem('futa05:severgrow.settings.v1',JSON.stringify({soundOn:false,music:false,reduceMotion:false}));
   localStorage.setItem('futa05:severgrow.duel.identity.v1',JSON.stringify({token:'local-performance-only',playerId,displayName:'Cedar',kind:'guest'}));
   if(!localStorage.getItem('futa05:futasaku.world.last.v1'))localStorage.setItem('futa05:futasaku.world.last.v1',JSON.stringify(cached));
  },{playerId,cached:world()});
  const p=await context.newPage();p.setDefaultTimeout(90000);let requests=0;p.on('request',r=>{if(r.url().includes('/v1/'))requests++;});const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route(/\/v1\/world(\?|$)/,r=>r.fulfill({json:{ok:true,world:world()},headers:{'access-control-allow-origin':'*'}}));
  await p.route('**/v1/world/challenges*',r=>r.fulfill({json:{ok:true,serverNow:Date.now(),incoming:[],outgoing:[]},headers:{'access-control-allow-origin':'*'}}));
  await p.route('**/v1/players/me/challenges*',r=>r.fulfill({json:{incoming:[],outgoing:[],liveMatchId:null,challengesEnabled:true,serverNow:Date.now()},headers:{'access-control-allow-origin':'*'}}));
  await p.route('**/v1/players/me/presence*',r=>r.fulfill({json:{status:'idle'},headers:{'access-control-allow-origin':'*'}}));
  const cdp=await context.newCDPSession(p);await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const measure=async(name:string,action?:()=>Promise<void>)=>{
   const a=await metrics();await p.evaluate('window.__activity.begin()');const t=Date.now(), networkBefore=requests;
   if(action)await action();else await p.waitForTimeout(ms);
   const elapsed=Date.now()-t;const probe=await p.evaluate('window.__activity.end()') as {counts:Record<string,number>;rafGaps:number[];longTasks:number[]};const b=await metrics();
   const row={name,viewport,cpu,elapsed,requests:requests-networkBefore,...probe,rafGaps:stats(probe.rafGaps),longTasks:stats(probe.longTasks),
    costs:Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,((b[k]??0)-(a[k]??0))*(k.endsWith('Count')?1000:1000000)/elapsed])),
    dom:await cdp.send('Memory.getDOMCounters'),heap:b.JSHeapUsedSize,
    planet:await p.evaluate('(()=>{const s=window.__severgrow.planet();return s?{frames:s.frames,bytes:s.bytes,mode:s.mode,pendingFrame:s.pendingFrame,frame:s.frame,crop:s.crop}:null})()')};
   rows.push(row);console.log(JSON.stringify(row));writeFileSync(out,JSON.stringify({baseline:'79ca4f32',label:process.env.LABEL??'baseline',units:'Durations: ms/s. Counts: per second. Submitted pixel bounds are not measured GPU fragment counts.',conditions:'Chromium, software GPU; CPU slowdown; DPR3 capped by product at2. rAF gaps are application callbacks, not display frame times.',rows},null,2));
  };
  await p.goto(fixture.origin);await p.waitForFunction('window.__severgrow?.ready() && window.__severgrow.planet()?.frames>0',{},{timeout:60000});await p.waitForTimeout(2000);
  assert.equal(await p.evaluate('window.__severgrow.settings().sound'),false,'silent lifecycle fixture');
  for(let i=0;i<samples;i++)await measure('menu-drift');
  await p.locator('#menu-world').click();await p.waitForTimeout(1800);
  for(let i=0;i<samples;i++)await measure('planet-rest');
  await measure('planet-drag-zoom',async()=>{const box=(await p.locator('#online-world-grid').boundingBox())!;for(let i=0;i<3;i++){await p.mouse.move(box.x+box.width*.35,box.y+box.height*.5);await p.mouse.down();await p.mouse.move(box.x+box.width*.65,box.y+box.height*.4,{steps:25});await p.mouse.up();await p.mouse.wheel(0,i%2?-200:200);await p.waitForTimeout(300);}});
  await measure('navigation-10-cycles',async()=>{for(let i=0;i<10;i++){await p.locator('#online-world-back').click();await p.locator('#menu-world').click();await p.waitForTimeout(750);}});
  heavy=true;await p.evaluate(cached=>localStorage.setItem('futasaku.world.last.v1',JSON.stringify(cached)),large);await p.reload();await p.waitForFunction('window.__severgrow?.ready() && window.__severgrow.planet()?.frames>0',{},{timeout:60000});await p.locator('#menu-world').click();await p.waitForTimeout(2000);
  for(let i=0;i<samples;i++)await measure('planet-3000-owned');
  await measure('planet-3000-drag',async()=>{const box=(await p.locator('#online-world-grid').boundingBox())!;await p.mouse.move(box.x+box.width*.35,box.y+box.height*.5);await p.mouse.down();await p.mouse.move(box.x+box.width*.65,box.y+box.height*.4,{steps:25});await p.mouse.up();await p.waitForTimeout(1000);});
  await p.screenshot({path:`/tmp/perf-planet-${viewport.width}-${process.env.LABEL??'baseline'}.png`});
  await p.locator('#online-world-back').click();await p.waitForTimeout(47000);
  await measure('menu-asleep');
  await measure('pagehide-synthetic',async()=>{await p.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))");await p.waitForTimeout(ms);});
  await p.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
  await measure('hidden-synthetic',async()=>{await p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))");await p.waitForTimeout(ms);});
  await p.evaluate("delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))");await p.waitForTimeout(300);await measure('resumed-menu');
  await p.evaluate(save=>localStorage.setItem('severgrow.save.v7',save),positionSave({state:newGame(219682080),level:7}));await resumeSavedGame(p);await p.waitForFunction('window.__severgrow?.state() && !window.__severgrow.busy()',{},{timeout:60000});await p.waitForTimeout(6000);
  for(let i=0;i<samples;i++)await measure('board-idle');
  assert.deepEqual(errors,[],'no browser errors');await context.close();
 }
}finally{await browser.close();await fixture.close();}
