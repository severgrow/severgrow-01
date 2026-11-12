/** The LED cockpit owns product guidance. Its retired hidden plate must never force layout. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
try{
 const p=await browser.newPage({viewport:{width:390,height:844}});
 await p.addInitScript(`window.__name=(f)=>f;localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:true}));`);
 await p.goto(fixture.origin+'/test/?seed=219682080');await p.waitForFunction(()=>{const h=(window as any).__severgrow;return h?.ready?.()&&h.state()?.phase==='DRAW'&&!h.busy();});
 const before=await p.evaluate(()=>{
  const cue=document.getElementById('step-cue')!;let reads=0;
  const get=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth')!.get!;
  Object.defineProperty(cue,'offsetWidth',{get(){reads++;return get.call(this);}});
  (window as any).__guideReads=()=>reads;
  const h=(window as any).__severgrow;const action=h.legal().find((a:any)=>a.t==='Draw'&&a.from==='deck');
  return {hidden:getComputedStyle(cue).display==='none',played:h.playFor(action,0)};
 });
 assert(before.hidden&&before.played,'the retired plate is hidden while a real Draw executes');
 await p.waitForFunction(()=>!(window as any).__severgrow.busy());
 assert.equal(await p.evaluate(()=>(window as any).__guideReads()),0,'a hidden guide never reads geometry to restart its invisible animation');
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.step),'grow','the real gameplay guidance still advances');
 console.log('PASS hidden guide performs no layout read while real step guidance advances');
}finally{await browser.close();await fixture.close();}
