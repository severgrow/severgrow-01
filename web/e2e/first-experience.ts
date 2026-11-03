import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,type Page} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
const fixture=await productFixture(),out=process.env.SHOTS??'/tmp/first-experience';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});
const lesson=(p:Page)=>p.evaluate(()=>(window as any).__severgrow.lesson());
const tap=async(p:Page,selector:string)=>{const r=await p.locator(selector).boundingBox();assert.ok(r);await p.mouse.click(r.x+r.width/2,r.y+r.height/2);};
const floor=async(p:Page)=>{const ms=await p.evaluate(()=>Math.max(0,3000-(performance.now()-(window as any).__severgrow.lesson().explainAt)));if(ms)await p.waitForTimeout(ms+30);};
const open=async(p:Page)=>{
  await p.waitForFunction(()=>(window as any).__severgrow?.ready?.());
  await p.locator('#menu-play').click();await p.locator('#menu-campaign').click();
  if(await p.locator('#sheet-campaign-start:not([hidden])').count())await p.locator('#csa-resume').click();
  await p.waitForFunction(()=>{const l=(window as any).__severgrow.lesson();return l&&!l.stage&&l.handSettled;});
};
try{
 for(const [width,height,large] of [[320,568,false],[390,844,false],[1280,800,false],[320,568,true]] as const){
  const p=await browser.newPage({viewport:{width:width!,height:height!},hasTouch:true});await p.bringToFront();
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript((largeText)=>{
   localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,speed:'skip',autoSkip:false,largeText}));
   localStorage.setItem('futa05:production-sentinel','untouched');localStorage.setItem('futa05-3:production-sentinel','untouched');
  },large);
  await p.goto(fixture.origin+'/test/');await open(p);
  const first=await lesson(p);assert.equal(first.beat.id,'1:intro:tree');
  const words=await p.locator('.lesson-copy').textContent();assert.match(words!,/win.*points/);
  const key=await p.locator('.lesson-dismiss').boundingBox();assert.ok(key&&key.width>=44&&key.height>=44,JSON.stringify(key));
  await p.mouse.click(key.x+22,key.y+22);assert.equal((await lesson(p)).beat.id,first.beat.id,'early deliberate dismissal waits');
  await floor(p);
  await p.mouse.click(8,height!*.5);assert.equal((await lesson(p)).beat.id,first.beat.id,'stray tap after floor keeps the explanation');
  const fits=await p.locator('.lesson-copy').evaluate(el=>el.scrollHeight<=el.clientHeight+1);assert.ok(fits,'objective text is not clipped');
  await p.screenshot({path:`${out}/objective-${width}${large?'-large':''}.png`});
  await p.locator('.lesson-dismiss').click();assert.equal((await lesson(p)).beat.id,'1:intro:their-home');
  assert.ok(await p.locator('.lesson-copy').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'opponent/goal copy is not clipped');
  await floor(p);await p.locator('.lesson-dismiss').click();
  const draw=await lesson(p);assert.equal(draw.beat.id,'1:intro:first-draw');
  assert.ok(await p.locator('.lesson-copy').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Draw copy is not clipped');
  const before=await p.evaluate(()=>(window as any).__severgrow.state().history.length);
  const age=await p.evaluate(()=>performance.now()-(window as any).__severgrow.lesson().explainAt);assert.ok(age<3000);
  await tap(p,'#deck');
  await p.waitForFunction(n=>(window as any).__severgrow.state().history.length>n,before);
  assert.ok((await lesson(p)).seen.includes(draw.beat.id),'same tap plays and remembers explanation');
  await p.waitForFunction(()=>!(window as any).__severgrow.busy());
  const state=await p.evaluate(()=>(window as any).__severgrow.state());
  await p.reload();await open(p);
  assert.equal((await p.evaluate(()=>(window as any).__severgrow.state())).history.length,state.history.length,'resume keeps game');
  assert.ok((await lesson(p)).seen.includes(draw.beat.id),'resume keeps seen explanations');
  const stores=await p.evaluate(()=>({root:localStorage.getItem('production-sentinel'),keys:Object.keys(localStorage),live:localStorage['futa05:production-sentinel'],third:localStorage['futa05-3:production-sentinel']}));
  assert.ok(stores.keys.includes('futa05:production-sentinel'));assert.ok(stores.keys.includes('futa05-3:production-sentinel'));
  assert.equal(stores.root,null,'test cannot read production namespace');assert.equal(stores.live,'untouched');assert.equal(stores.third,'untouched');assert.deepEqual(errors,[]);
  console.log(`PASS ${width}: floor, deliberate dismissal, stray touch, one-tap Draw, legibility and resume`);
  await p.close();
 }
 // A non-reader can switch guidance off without a hidden caption holding legal input.
 const p=await browser.newPage({viewport:{width:390,height:844}});
 await p.addInitScript(()=>{
  localStorage.setItem('futa05-test:severgrow-guide','off');
  localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,speed:'skip'}));
 });
 await p.goto(fixture.origin+'/test/');await open(p);
 assert.equal(await p.locator('#lesson-plate:not([hidden])').count(),0);
  await tap(p,'#deck');await p.waitForFunction(()=>(window as any).__severgrow.state().phase==='ACT');
 console.log('PASS hints off: no explanation or dismissal gate');await p.close();
}finally{await browser.close();await fixture.close();}
