/** The web-controlled part of installed-app launch. Native iOS snapshots still need a device. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
const f=await productFixture({offlineApiPort:65530});
const b=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
mkdirSync('/tmp/pwa-launch',{recursive:true});
try{
 for(const standalone of [true,false]){
  const p=await b.newPage({viewport:{width:393,height:852}});
  await p.addInitScript(standalone=>{Object.defineProperty(navigator,'standalone',{value:standalone});(window as any).__name=(x:unknown)=>x;},standalone);
  await p.goto(f.origin+'/');
  await p.waitForFunction(()=>!!(window as any).__severgrow?.ready?.()&&document.getElementById('boot-cover')?.hidden,undefined,{timeout:30000});
  await p.evaluate(()=>{localStorage.setItem('launch-sentinel','keep');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const shield=await p.locator('#boot-cover').evaluate(e=>({hidden:(e as HTMLElement).hidden,opacity:getComputedStyle(e).opacity,background:getComputedStyle(e).backgroundColor}));
  // OWNER CHANGED THE RULE (2026-11-06: "unnecessary codex's stuff to be deleted"): no curtain on an app
  // switch, installed or not; the dark cover is the first launch's only.
  assert.equal(shield.hidden,true);
  await p.evaluate(()=>{delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await p.waitForFunction(()=>document.getElementById('boot-cover')?.hidden);
  assert.equal(await p.evaluate(()=>localStorage.getItem('launch-sentinel')),'keep');
  if(standalone){
   await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
   await p.waitForFunction(()=>document.getElementById('boot-cover')?.hidden);
  }
  await p.screenshot({path:`/tmp/pwa-launch/ready-${standalone}.png`});
  await p.close();console.log('PASS cold/resume, no app-switch curtain, unchanged storage:',standalone?'installed':'browser');
 }
 const p=await b.newPage({viewport:{width:393,height:852},javaScriptEnabled:false});
 await p.goto(f.origin+'/');
 assert.equal(await p.locator('#boot-cover').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(14, 15, 16)');
 await p.screenshot({path:'/tmp/pwa-launch/no-script-first-paint.png'});await p.close();console.log('PASS dark HTML before JavaScript');
}finally{await b.close();await f.close();}
