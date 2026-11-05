/** Real browser/controller test. No match or account writes: only the doorway's two surfaces. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
const server=await createServer({configFile:false,root:resolve('web'),logLevel:'error',optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0}});
await server.listen();const origin=server.resolvedUrls!.local[0]!;
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
const boot=async()=>{
 const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 await p.route('**/handoff-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="background:#050708;color:#e8ddc5"><div id="texture" style="position:fixed;z-index:0"></div><div id="futa04-film-grain" style="position:fixed;z-index:2147483646;pointer-events:none"></div><section id="source"><button id="origin">CHALLENGES</button></section><section id="game" hidden>DUEL</section></body></html>'}));
 await p.addInitScript('window.__name=f=>f;');await p.goto(origin+'handoff-fixture');
 await p.evaluate(async()=>{
  const path='/src/online/challenge-handoff.ts',module=await import(path),w=window as any;
  const source=document.getElementById('source')!,game=document.getElementById('game')!;
  document.getElementById('origin')!.focus();
  w.api=module.mountChallengeHandoff(source);w.opens=0;w.phases=[];w.done=false;
  w.open=()=>{w.opens++;w.openAt=performance.now()-w.start;source.hidden=true;game.hidden=false;};
  new MutationObserver(()=>{
   const veil=document.getElementById('challenge-duel-handoff');if(!veil||w.phases.at(-1)?.phase===veil.dataset.phase)return;
   w.phases.push({phase:veil.dataset.phase,inert:source.inert,grain:getComputedStyle(document.getElementById('futa04-film-grain')!).zIndex,pointer:getComputedStyle(veil).pointerEvents,durations:veil.getAnimations().map(a=>a.effect?.getTiming().duration)});
  }).observe(document.body,{subtree:true,attributes:true,childList:true});
 });return p;
};
try{
 const p=await boot();
 await p.evaluate(()=>{const w=window as any;w.start=performance.now();w.promise=w.api.run(w.open).then(()=>w.done=true);w.api.run(w.open);});
 await p.waitForFunction(()=>(window as any).done);
 const result=await p.evaluate(()=>({opens:(window as any).opens,at:(window as any).openAt,phases:(window as any).phases,oldHidden:document.getElementById('source')!.hidden,newHidden:document.getElementById('game')!.hidden,veil:!!document.getElementById('challenge-duel-handoff')}));
 assert.equal(result.opens,1);assert(result.at>=300);assert(result.oldHidden&&!result.newHidden&&!result.veil);
 assert.deepEqual(result.phases.map((x:{phase:string})=>x.phase),['out','in']);
 assert(result.phases[0].inert);assert.equal(result.phases[0].grain,'2147483646');
 assert.equal(await p.locator('#texture').evaluate(el=>el.style.zIndex),'0');assert.equal(result.phases[1].pointer,'none');
 assert.deepEqual(result.phases.map((x:{durations:number[]})=>x.durations),[[350],[350]]);
 await p.close();console.log('PASS challenge doorway: 700ms, one launch, no overlapping surfaces, input available during reveal');
 for(const kind of ['escape','navigation','preview','background','reduced','error']){
  const p=await boot();
  await p.evaluate(async kind=>{
   const w=window as any;w.start=performance.now();
   if(kind==='reduced')document.documentElement.classList.add('reduce-motion');
   const task=w.api.run(kind==='error'?()=>{throw Error('fixture opening failed');}:w.open);
   if(kind==='escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   if(kind==='navigation')document.getElementById('source')!.hidden=true;
   if(kind==='preview')document.getElementById('source')!.setAttribute('aria-hidden','true');
   if(kind==='background'){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}
   try{await task;}catch{w.rejected=true;}
   w.done=true;
  },kind);
  const r=await p.evaluate(()=>({opens:(window as any).opens,rejected:!!(window as any).rejected,inert:document.getElementById('source')!.inert,veil:!!document.getElementById('challenge-duel-handoff'),focus:document.activeElement?.id,grain:document.getElementById('texture')!.style.zIndex}));
  if(kind==='escape')assert.equal(r.focus,'origin');
  assert.equal(r.grain,'0');
  assert.equal(r.opens,kind==='reduced'?1:0);assert.equal(r.veil,false);
  if(kind==='preview')assert.equal(r.inert,true,'preview ownership keeps the source inert');
  else if(kind!=='navigation')assert.equal(r.inert,false);
  assert.equal(r.rejected,kind==='error');await p.close();console.log(`PASS challenge doorway: ${kind}, cleanup and recovery`);
 }
}finally{await browser.close();await server.close();}
