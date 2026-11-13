// Several COMPLETE offline games in one document. Real bot worker and normal animation timings.
// The human seat is automated outside the page. No backend, no reloading between games.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import type {State} from '../../src/engine/index.js';
import {newGame,viewFor} from '../../src/engine/index.js';
import {chooseBotAction} from '../../src/bots/versions.js';
import {productFixture} from './helpers/product-fixture.js';
import {resumeSavedGame} from './helpers/menu-nav.js';
import {positionSave} from './position.js';
import {ACTIVITY_PROBE} from './helpers/activity-probe.js';

const output=process.env.OUT??'/tmp/offline-soak-baseline.json';
const games=Number(process.env.GAMES??6), cpu=Number(process.env.CPU??1);
const soundOn=process.env.SOUND_ON==='1';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
await context.addInitScript({content:ACTIVITY_PROBE});
await context.addInitScript(soundOn=>{
 localStorage.setItem('futa05:severgrow.settings.v1',JSON.stringify({soundOn,music:true,coach:false,autoSkip:false,reduceMotion:false,speed:'normal',vibration:false}));
 localStorage.setItem('futa05:severgrow.install-prompt.v1',JSON.stringify({games:0,shown:true,never:true}));
},soundOn);
const p=await context.newPage();p.setDefaultTimeout(90000);
const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
const cdp=await context.newCDPSession(p);await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const rows:unknown[]=[];
const save=()=>writeFileSync(output,JSON.stringify({conditions:{cpu,viewport:'390x844',dpr:3,games,animations:'normal',sound:soundOn,musicRequested:true,renderer:'software WebGL',start:'deterministic fresh positions through real resume handler; no reloads',human:'production bot chooser runs in test driver, opponent runs in product worker'},rows,errors},null,2));
const capture=async(name:string)=>{
 const before=await metrics();await p.evaluate('window.__activity.begin()');await p.waitForTimeout(4000);
 const activity=await p.evaluate('window.__activity.end()');const after=await metrics();
 const cost=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,(after[k]??0)-(before[k]??0)]));
 await cdp.send('HeapProfiler.collectGarbage');
 const row={name,activity,cost,dom:await cdp.send('Memory.getDOMCounters'),heap:(await metrics()).JSHeapUsedSize,
  visuals:await p.evaluate(`(()=>({animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName??'script',iterations:a.effect?.getTiming().iterations,target:a.effect?.target?.id})),canvases:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,w:c.width,h:c.height})),space:window.__severgrow.space(),state:{phase:window.__severgrow.state()?.phase,turn:window.__severgrow.state()?.turnNumber}}))()`) };
 rows.push(row);save();console.log(JSON.stringify(row));
};
try{
 await p.goto(fixture.origin+'/');await p.waitForFunction('window.__severgrow?.ready()');
 assert.equal(await p.evaluate('window.__severgrow.settings().sound'),soundOn,'the measured audio setting matches the report');
 // A real gesture unlocks audio before the FIRST game, rather than only at its exit.
 await p.mouse.click(2,2);
 for(let game=0;game<games;game++){
  if(game)await p.locator('#go-menu').click();
  await p.evaluate(save=>localStorage.setItem('severgrow.save.v7',save),positionSave({state:newGame(219682080+game),level:7}));
  await resumeSavedGame(p);await p.waitForFunction('window.__severgrow.state() && !window.__severgrow.busy() && (window.__severgrow.state().actor===0 || window.__severgrow.state().phase==="GAME_OVER")',undefined,{timeout:90000});
  await p.waitForTimeout(3000);await capture(`game-${game+1}-idle-start`);
  let actions=0;const started=Date.now();await p.evaluate('window.__activity.begin()');
  while(Date.now()-started<360000){
   await p.waitForFunction('!window.__severgrow.busy() && (window.__severgrow.state().actor===0 || window.__severgrow.state().phase==="GAME_OVER")',undefined,{timeout:90000,polling:50});
   const state=await p.evaluate('window.__severgrow.state()') as State;
   if(state.phase==='GAME_OVER')break;
   const action=chooseBotAction(viewFor(state,0),7,state.seed+state.turnNumber*101+actions);
   assert(await p.evaluate(action=>(window as any).__severgrow.playFor(action,0),action),'the human fixture action is accepted');actions++;
   if(actions===10){rows.push({name:`game-${game+1}-ten-human-moves`,activity:await p.evaluate('window.__activity.end()')});save();}
   if(actions%10===0)console.log(`progress game=${game+1} humanActions=${actions} turn=${state.turnNumber}`);
  }
  assert.equal(await p.evaluate('window.__severgrow.state().phase'),'GAME_OVER','a full game completed, not a forced result');
  await p.locator('#gameover').waitFor({state:'visible'});await p.waitForTimeout(6500);
  await capture(`game-${game+1}-finished`);
  if(game===0||game===3)await p.screenshot({path:`/tmp/offline-soak-${process.env.LABEL??'baseline'}-game-${game+1}.png`});
  rows.push({name:`game-${game+1}-summary`,humanActions:actions,elapsed:Date.now()-started});save();
 }
 assert.deepEqual(errors,[],'no browser errors across the session');
}finally{save();await browser.close();await fixture.close();}
