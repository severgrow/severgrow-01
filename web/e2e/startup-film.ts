// A frame-by-frame film of the first launch (owner, 2026-11-06: "On start still instead of smooth fade in
// it flashes a couple times"). Samples the page's mean brightness every frame for 3 s and saves frames.
//   CHANNEL=futa05 ... npm run web:build && node --import tsx web/e2e/startup-film.ts [outDir]
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {productFixture} from './helpers/product-fixture.js';
const out=process.argv[2]??'/tmp/startup-film';mkdirSync(out,{recursive:true});
const f=await productFixture({offlineApiPort:65530});
const b=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:393,height:852}});
 const cdp=await p.context().newCDPSession(p);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await p.addInitScript(()=>{(window as any).__name=(x:unknown)=>x;});
 const frames:{t:number;data:string}[]=[];
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:40,everyNthFrame:1});
 const t0=Date.now();
 cdp.on('Page.screencastFrame',async(e:any)=>{frames.push({t:Date.now()-t0,data:e.data});await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
 await p.goto(f.origin+'/');
 await p.waitForTimeout(4000);
 await cdp.send('Page.stopScreencast');
 const {writeFileSync}=await import('node:fs');
 frames.forEach((fr,i)=>writeFileSync(`${out}/f${String(i).padStart(3,'0')}-${fr.t}.jpg`,Buffer.from(fr.data,'base64')));
 console.log('frames',frames.length);
}finally{await b.close();await f.close();}
