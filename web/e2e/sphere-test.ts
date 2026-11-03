import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit,type Page} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
import {captureWebKitTouch} from './helpers/webkit-touch.js';
import {EYE,focal} from '../src/sphere/renderer.js';
import {rotate,type Quat} from '../src/sphere/rotation.js';
import {WORLD_VERSION,seenWorld} from '../../server/src/world.js';
const fixture=await productFixture({offlineApiPort:65530}),out=process.env.SHOTS??'/tmp/sphere-test';mkdirSync(out,{recursive:true});
const ios=process.env.SPHERE_WEBKIT==='1';
const webkitTouch=ios?captureWebKitTouch():null;
const browser=await (ios?webkit:chromium).launch(ios?{}:{...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const state=(p:Page):Promise<any>=>p.evaluate('window.__severgrow.sphere()');
const ready=(p:Page)=>p.waitForFunction(()=>(window as any).__severgrow?.ready?.());
const settle=(p:Page)=>p.waitForFunction(()=>{const s=(window as any).__severgrow.sphere();return s&&!s.pendingFrame;});
const seed=async(p:Page,reduce=false)=>{
 await p.addInitScript(`window.__name=(f)=>f;

localStorage.setItem('futa05-test:severgrow.settings.v1',${JSON.stringify(JSON.stringify({sound:false,music:false,coach:false,reduceMotion:reduce}))});
// A pre-existing guest excludes the normal app's first-boot guest creation from this component test.
localStorage.setItem('futa05-test:severgrow.duel.identity.v1',${JSON.stringify(JSON.stringify({token:'local-sphere-existing-guest-token',playerId:'11111111-1111-4111-8111-111111111111',displayName:'Cedar',kind:'guest'}))});
localStorage.setItem('futa05-test:futasaku.world.last.v1',${JSON.stringify(JSON.stringify({version:WORLD_VERSION,revision:1,cost:100,cells:seenWorld(['0,0']),claims:[]}))});`);
};
const failures:string[]=[];
try{
 for(const path of ['/','/2/','/3/']){
  const p=await browser.newPage();await p.goto(fixture.origin+path);await ready(p);
  assert.equal(await p.locator('#menu-sphere').count(),0);assert.equal(await state(p),null);
  assert.equal(await p.locator('.sphere-test').count(),0);console.log(`PASS ${path}: no experimental entry or renderer`);await p.close();
 }
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1440,1000]]){
  const context=await browser.newContext({viewport:{width:width!,height:height!},hasTouch:true,isMobile:width!<900});
  const p=await context.newPage();await p.bringToFront();await seed(p);
  let checking=false;
  const errors:string[]=[],writes:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(checking&&r.method()!=='GET'&&r.method()!=='HEAD')writes.push(r.url());});
  await p.goto(fixture.origin+'/test/');await ready(p);
  await p.waitForSelector('.world-map-svg');
  assert.equal((await state(p)).loaded,false,'renderer is lazy');
  const menuFits=await p.evaluate(()=>[...document.querySelectorAll('#menu button')].every(el=>{
    const r=el.getBoundingClientRect();return !r.width||!r.height||(r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1);
  }));
  assert.ok(menuFits,'the extra test entry leaves every menu control inside the viewport');
  await p.screenshot({path:`${out}/menu-test-${width}.png`});
  const menuBox=await p.evaluate(()=>document.querySelector('.world-map-svg')?.getAttribute('viewBox')??null);
  await p.locator('#menu-sphere').click();await p.waitForFunction(()=>{const s=(window as any).__severgrow.sphere();return s?.open&&(s.ready||s.fallback);});
  if(ios&&!(await state(p)).ready){
    assert.ok(await p.locator('.sphere-test-fallback').isVisible());await p.screenshot({path:`${out}/webkit-fallback-${width}.png`});await p.locator('.sphere-test-back').click();
    assert.equal(await p.locator('.sphere-test').count(),0);assert.deepEqual(errors,[],`sphere ${width}x${height} page errors: ${JSON.stringify(errors)}`);
    console.log(`LIMIT WebKit ${width}: this runner has no WebGL; fallback and return passed, interactive rendering unverified`);await context.close();continue;
  }
  checking=true;
  await p.locator('.sphere-test').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>undefined))));
  await settle(p);let s=await state(p);assert.equal(s.cells,1002);assert.ok(s.bytes<1_000_000);
  const canvas=p.locator('.sphere-test-canvas'),box=(await canvas.boundingBox())!;
  assert.ok(box.width>0&&box.height>0);assert.equal(await p.locator('#menu').evaluate(el=>(el as HTMLElement).inert),true);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await p.screenshot({path:`${out}/sphere-front-${width}.png`});
  const q0=s.q;await p.mouse.click(x,y);await settle(p);s=await state(p);assert.notEqual(s.selected,null);assert.deepEqual(s.q,q0,'selection never moves camera');
  const selected=s.selected;await p.mouse.click(box.x+4,box.y+4);assert.equal((await state(p)).selected,selected,'empty space does nothing');
  const pent=s.pentagons.sort((a:any,b:any)=>b.point[2]-a.point[2])[0];assert.ok(pent.point[2]>.55,'visible pentagon');
  const aspect=await canvas.evaluate(el=>(el as HTMLCanvasElement).width/(el as HTMLCanvasElement).height);
  const f=focal(aspect,s.zoom),v=pent.point;
  await p.mouse.click(x+v[0]*f/aspect/(EYE-v[2])*box.width/2,y-v[1]*f/(EYE-v[2])*box.height/2);
  await settle(p);assert.equal((await state(p)).selected,pent.id,'visible pentagon is precisely selectable');
  await p.screenshot({path:`${out}/sphere-pentagon-${width}.png`});
  // Drag never selects. Desktop wheel is native; mobile WebKit has no wheel automation API.
  await p.mouse.move(x-50,y);await p.mouse.down();await p.mouse.move(x+80,y+35,{steps:12});await p.mouse.up();await settle(p);
  s=await state(p);assert.notDeepEqual(s.q,q0);assert.equal(s.selected,pent.id);
  const pointerPinch=(ios||process.env.SPHERE_POINTER_PINCH==='1')&&width!<900;
  if(ios&&width!<900){await p.touchscreen.tap(box.x+4,box.y+4);assert.ok(webkitTouch?.session,'trusted WebKit multi-touch adapter must be available');}
  const controlledPinch=async(from:number,to:number)=>{
    if(ios){
      const touch=(type:string,points:{x:number;y:number;id:number}[])=>webkitTouch!.session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,x:Math.round(p.x),y:Math.round(p.y)}))});
      await touch('touchStart',[{x:x-from/2,y,id:1}]);await p.waitForTimeout(16);
      await touch('touchStart',[{x:x-from/2,y,id:1},{x:x+from/2,y,id:2}]);
      for(let i=1;i<=8;i++){const d=from+(to-from)*i/8;await touch('touchMove',[{x:x-d/2,y,id:1},{x:x+d/2,y,id:2}]);await p.waitForTimeout(16);}
      await touch('touchEnd',[{x:x-to/2,y,id:1}]);await p.waitForTimeout(16);await touch('touchEnd',[{x:x+to/2,y,id:2}]);await settle(p);return;
    }
    // Portable controlled-pointer integration, also exercised locally alongside native CDP touch.
    await canvas.evaluate((el,{x,y,from,to})=>{
      const send=(type:string,id:number,px:number)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:id===11,button:0,buttons:type==='pointerup'?0:1,clientX:px,clientY:y}));
      send('pointerdown',11,x-from/2);send('pointerdown',12,x+from/2);
      for(let i=1;i<=8;i++){const d=from+(to-from)*i/8;send('pointermove',11,x-d/2);send('pointermove',12,x+d/2);}
      send('pointerup',11,x-to/2);send('pointerup',12,x+to/2);
    },{x,y,from,to});await settle(p);
  };
  if(pointerPinch)await controlledPinch(40,150);
  else {await p.mouse.move(x,y);await p.mouse.wheel(0,-700);await settle(p);}
  assert.ok((await state(p)).zoom>2);
  await p.screenshot({path:`${out}/sphere-close-${width}.png`});
  if(pointerPinch)await controlledPinch(160,20);
  else {await p.mouse.wheel(0,6000);await settle(p);}
  assert.equal((await state(p)).zoom,1);
  await canvas.focus();for(let i=0;i<54;i++){
    await p.keyboard.press('ArrowRight');
    if(i===26){await settle(p);await p.screenshot({path:`${out}/sphere-back-${width}.png`});}
  }await settle(p);
  s=await state(p);assert.ok(Math.abs(Math.hypot(...s.q)-1)<1e-8,'full rotation stays unit length');
  await p.screenshot({path:`${out}/sphere-side-${width}.png`});
  const behind=s.pentagons.find((c:any)=>c.point[2]<-.55);assert.ok(behind);
  const b=behind.point,bf=focal(aspect,s.zoom),beforePick=s.q;
  await p.mouse.click(x+b[0]*bf/aspect/(EYE-b[2])*box.width/2,y-b[1]*bf/(EYE-b[2])*box.height/2);await settle(p);
  assert.notEqual((await state(p)).selected,behind.id,'a projected back cell is occluded by the front surface');
  assert.deepEqual((await state(p)).q,beforePick,'picking through a projected back point never rotates');
  await p.locator('.sphere-test-home').click();await settle(p);s=await state(p);
  assert.ok(rotate(s.q as Quat,s.home)[2]>.999,'shortest-path focus returns to largest own cluster');
  const frames=s.frames;await p.waitForTimeout(400);assert.equal((await state(p)).frames,frames,'no idle render loop');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&scrollY===0),'no page overflow or scrolling');
  if(width===390&&!ios){
   const cdp=await context.newCDPSession(p);
   const touch=(type:string,points:{x:number;y:number}[])=>cdp.send('Input.dispatchTouchEvent',{type:type as 'touchStart',touchPoints:points.map((a,id)=>({...a,id}))});
   const pinch=async(from:number,to:number)=>{
    await touch('touchStart',[{x:x-from/2,y},{x:x+from/2,y}]);
    for(let i=1;i<=8;i++){const d=from+(to-from)*i/8;await touch('touchMove',[{x:x-d/2,y},{x:x+d/2,y}]);await p.waitForTimeout(16);}
    await touch('touchEnd',[]);await settle(p);
   };
   await pinch(40,150);assert.ok((await state(p)).zoom>2.8);await pinch(160,20);assert.equal((await state(p)).zoom,1);
   await touch('touchStart',[{x,y}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:x+i*7,y:y+i}]);await p.waitForTimeout(16);}await touch('touchEnd',[]);
   await p.waitForTimeout(50);await touch('touchStart',[{x,y}]);const held=(await state(p)).q;
   await p.waitForTimeout(120);assert.deepEqual((await state(p)).q,held,'new touch interrupts inertia');await touch('touchCancel',[]);
   await touch('touchStart',[{x,y}]);for(let i=1;i<=6;i++){await touch('touchMove',[{x:x+i*3,y}]);await p.waitForTimeout(90);}await touch('touchEnd',[]);
   const slow=(await state(p)).q;await p.waitForTimeout(180);assert.deepEqual((await state(p)).q,slow,'slow precise drag stops accurately');
   const beforeRotate=(await state(p)).q;await p.setViewportSize({width:844,height:390});await p.waitForTimeout(100);await settle(p);assert.deepEqual((await state(p)).q,beforeRotate);
   await p.screenshot({path:`${out}/sphere-rotated-landscape.png`});await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);await settle(p);
   // Restore a lost graphics context without resetting the player's orientation or selection.
   const beforeLoss=await state(p);
   await p.evaluate(`window.__sphereLost=document.querySelector('.sphere-test-canvas').getContext('webgl').getExtension('WEBGL_lose_context');window.__sphereLost.loseContext();`);
   await p.waitForFunction(()=>!(window as any).__severgrow.sphere().ready);await p.waitForTimeout(250);
   await p.evaluate('window.__sphereLost.restoreContext()');await p.waitForFunction(()=>(window as any).__severgrow.sphere().ready);await settle(p);
   assert.deepEqual((await state(p)).q,beforeLoss.q);assert.equal((await state(p)).selected,beforeLoss.selected);
   if(process.env.SPHERE_PERF==='1'){
    const cpu=Number(process.env.SPHERE_CPU??4);
    await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
    await p.evaluate(`(()=>{window.__sphereFrames=[];window.__sphereTiming=true;let last=performance.now();function tick(t){window.__sphereFrames.push(t-last);last=t;if(window.__sphereTiming)requestAnimationFrame(tick);}requestAnimationFrame(tick);})()`);
    await touch('touchStart',[{x:x-50,y}]);for(let i=1;i<=40;i++){await touch('touchMove',[{x:x-50+i*3,y:y+i*.4}]);await p.waitForTimeout(16);}await touch('touchEnd',[]);await settle(p);
    const timings=await p.evaluate<number[]>('window.__sphereTiming=false;window.__sphereFrames.slice(1).sort((a,b)=>a-b)');
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.send('HeapProfiler.collectGarbage');
    const stats=await state(p);assert.equal(stats.resolution,1,'full raster detail returns when motion rests');
    const metrics=await cdp.send('Performance.getMetrics');console.log('PERFORMANCE '+JSON.stringify({viewport:[width,height],cpu,softwareGPU:true,p50:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)],max:timings.at(-1),resolutionDrops:stats.resolutionDrops,gpuBufferBytes:stats.bytes,heap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value}));
   }
   await cdp.send('HeapProfiler.collectGarbage');const counters=await cdp.send('Memory.getDOMCounters');
   checking=false;await p.locator('.sphere-test-back').click();
   for(let i=0;i<5;i++){await p.locator('#menu-sphere').click();await p.waitForFunction(()=>(window as any).__severgrow.sphere().ready);checking=true;await settle(p);checking=false;await p.locator('.sphere-test-back').click();}
   await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Memory.getDOMCounters');
   assert.ok(after.jsEventListeners<=counters.jsEventListeners+4,JSON.stringify({before:counters,after}));
   assert.equal((await state(p)).bytes,0);assert.equal(await p.locator('.sphere-test').count(),0);
   console.log('CLEANUP '+JSON.stringify({before:counters,after}));
  }else {checking=false;await p.locator('.sphere-test-back').click();}
  assert.equal(await p.locator('#menu').evaluate(el=>(el as HTMLElement).inert),false);
  assert.equal(await p.evaluate(()=>document.querySelector('.world-map-svg')?.getAttribute('viewBox')??null),menuBox,'normal Territory camera stays untouched');
  assert.deepEqual(errors,[],`sphere ${width}x${height} page errors: ${JSON.stringify(errors)}`);assert.deepEqual(writes,[],'mock sphere never writes backend');
  console.log(`PASS ${width}x${height}: sphere, pentagon, rotation, zoom, focus, occlusion and idle`);await context.close();
 }
 const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await seed(reduced,true);
 await reduced.goto(fixture.origin+'/test/');await ready(reduced);await reduced.locator('#menu-sphere').click();await reduced.waitForFunction(()=>{const s=(window as any).__severgrow.sphere();return s?.ready||s?.fallback;});
 if((await state(reduced)).ready){
  await settle(reduced);await reduced.locator('canvas.sphere-test-canvas').focus();await reduced.keyboard.press('Enter');await settle(reduced);
  assert.equal(await reduced.locator('.sphere-test-canvas').evaluate(el=>el.getAnimations().length),0);console.log('PASS reduced motion: static reveal and selection');
 }else {assert.ok(ios);console.log('LIMIT WebKit: reduced-motion fallback works; interactive WebGL unavailable');}
 await reduced.close();
 const fallback=await browser.newPage();await seed(fallback);
 await fallback.addInitScript(`(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return this.classList.contains('sphere-test-canvas')&&kind==='webgl'?null:original.call(this,kind,...args);};})()`);
 await fallback.goto(fixture.origin+'/test/');await ready(fallback);await fallback.locator('#menu-sphere').click();await fallback.locator('.sphere-test-fallback:not([hidden])').waitFor();
 await fallback.locator('.sphere-test-back').click();assert.equal(await fallback.locator('.sphere-test').count(),0);console.log('PASS unavailable WebGL: readable fallback and return');await fallback.close();
}catch(e){failures.push(e instanceof Error ? e.stack??String(e) : String(e));throw e;}finally{if(failures.length)console.error('::error title=Sphere verification::'+failures.join('\n').replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));await browser.close();await fixture.close();}
