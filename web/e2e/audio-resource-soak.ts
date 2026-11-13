// Resource diagnostic, not a battery benchmark. Actual sound engine and decoded production takes.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox','--disable-webgl']});
const p=await browser.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{(window as any).__name=(f:unknown)=>f;localStorage.setItem('futa05:severgrow.settings.v1',JSON.stringify({soundOn:true,music:true,reduceMotion:false}));});
const cdp=await p.context().newCDPSession(p);
const nodes=new Map<string,{nodeId:string;nodeType:string;contextId:string}>(),contexts=new Map<string,unknown>();
let created=0,destroyed=0;
cdp.on('WebAudio.audioNodeCreated',e=>{created++;nodes.set(e.node.nodeId,e.node);});
cdp.on('WebAudio.audioNodeWillBeDestroyed',e=>{destroyed++;nodes.delete(e.nodeId);});
cdp.on('WebAudio.contextCreated',e=>contexts.set(e.context.contextId,e.context));
cdp.on('WebAudio.contextWillBeDestroyed',e=>contexts.delete(e.contextId));
const samples:unknown[]=[];
const sample=async(cues:number)=>{
 await p.waitForTimeout(3000);await cdp.send('HeapProfiler.collectGarbage');await p.waitForTimeout(250);
 const types:Record<string,number>={};for(const node of nodes.values())types[node.nodeType]=(types[node.nodeType]??0)+1;
 const row={cues,created,destroyed,retained:nodes.size,types,contexts:[...contexts.values()]};samples.push(row);console.log(JSON.stringify(row));
 writeFileSync(process.env.OUT??'/tmp/futasaku-audio-resources.json',JSON.stringify({conditions:'Audio only, product build, real trusted unlock gesture, WebGL fallback; no physical power measurement',samples},null,2));
};
try{
 await cdp.send('WebAudio.enable');await p.goto(fixture.origin+'/');await p.waitForFunction('window.__severgrow?.ready()');
 assert.equal(await p.evaluate('window.__severgrow.settings().sound'),true,'the real saved sound choice is enabled');
 await p.mouse.click(2,2);await p.waitForTimeout(4000);await sample(0);
 for(let batch=1;batch<=6;batch++){
  await p.evaluate(async()=>{for(let i=0;i<40;i++){(window as any).__severgrow.soundCue(['draw','place','turn'][i%3]);await new Promise(r=>setTimeout(r,70));}});
  await sample(batch*40);
 }
 assert(created>40,'actual audio nodes were created, not a silent/no-op test');
}finally{await browser.close();await fixture.close();}
