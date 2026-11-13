// Real Canvas/WebGL pixels. Readbacks are OUTSIDE timing windows and never enter the product.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import type {AddressInfo} from 'node:net';
import {chromium} from 'playwright-core';
import {ACTIVITY_PROBE} from './helpers/activity-probe.js';

const server=await createServer({configFile:'web/vite.config.ts',server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const origin=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
await p.addInitScript({content:ACTIVITY_PROBE});
await p.route('**/instrument-check',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#0e0f10"></body>'}));
try{
 await p.goto(origin+'/instrument-check');const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.CPU??4)});
 const results=await p.evaluate(async origin=>{
  const led=await import(/* @vite-ignore */origin+'/src/player/led-cells.ts');
  const targets=['cells','hot','bloom'].map(id=>{const c=document.createElement('canvas');c.id=id;document.body.append(c);return c;});
  const draw=(text:string)=>{led.drawLedCells(targets[0],text);led.drawLedHot(targets[1],text);led.drawLedBloom(targets[2],text);};
  const hash=async(data:Uint8Array|Uint8ClampedArray)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data as Uint8Array<ArrayBuffer>))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const pictures:Record<string,string[]>={},pixels=new Map<string,Uint8ClampedArray[]>(),repeatDifferences:unknown[]=[];
  for(const word of ['DRAW','GROW','THROW','12:8','DRAW']){
   draw(word);const current=targets.map(c=>c.getContext('2d')!.getImageData(0,0,c.width,c.height).data);const hashes=await Promise.all(current.map(hash));
   const old=pixels.get(word);
   if(old)repeatDifferences.push(current.map((data,i)=>{
    let max=0,changed=0,compositedMax=0;
    for(let j=0;j<data.length;j++){
     const d=Math.abs(data[j]!-old[i]![j]!);max=Math.max(max,d);if(d)changed++;
     const channel=j%4,pixel=j-channel,alpha=data[pixel+3]!/255,previousAlpha=old[i]![pixel+3]!/255;
     const background=[14,15,16][channel]??0;
     const a=channel===3?data[j]!:data[j]!*alpha+background*(1-alpha);
     const b=channel===3?old[i]![j]!:old[i]![j]!*previousAlpha+background*(1-previousAlpha);
     compositedMax=Math.max(compositedMax,Math.abs(a-b));
    }
    return {target:targets[i]!.id,max,changed,compositedMax};
   }));
   else pixels.set(word,current);
   pictures[word]??=hashes;
  }
  const samples=[];for(let run=0;run<3;run++){
   (window as any).__activity.begin();const start=performance.now();
   for(let i=0;i<60;i++)draw(['DRAW','GROW','THROW','12:8'][i%4]!);
   const elapsed=performance.now()-start;const probe=(window as any).__activity.end();samples.push({elapsed,counts:probe.counts});
  }
  const {PlanetRenderer}=await import(/* @vite-ignore */origin+'/src/sphere/renderer.ts');
  const {buildSphere,latticeMap,homeQuat}=await import(/* @vite-ignore */origin+'/src/sphere/geometry.ts');
  const {groundOf}=await import(/* @vite-ignore */origin+'/src/sphere/ground.ts');
  const sphere=buildSphere(),map=latticeMap(sphere),canvas=document.createElement('canvas');document.body.append(canvas);
  const renderer=new PlanetRenderer(canvas,sphere);renderer.resize(390,844);
  renderer.setGround(groundOf(sphere,map,{cells:[],claims:[{cellId:'0,0',ownerId:'me',colour:'hsl(150 32% 52%)'}],me:'me',growAnywhere:true}),null,[]);
  const q=homeQuat(sphere,map,'0,0'),frame={x:16,y:102,width:358,height:726};
  const gl=renderer.gl,read=()=>{const bytes=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
  renderer.render(q,1,0,[0,0],frame);const before=read();
  renderer.render(q,1,0,[0,0],frame,frame);const clipped=read();
  let differences=0;for(let y=32;y<1484;y++)for(let x=32;x<748;x++)for(let c=0;c<4;c++){const i=(y*canvas.width+x)*4+c;if(before[i]!==clipped[i])differences++;}
  if(differences)throw new Error(`Visible crop changed ${differences} channels`);
  renderer.render(q,1,0,[0,0],frame);const expanded=read();
  if(await hash(before)!==await hash(expanded))throw new Error('Expanding the crop leaves stale pixels');
  const groundHash=await hash(before);renderer.dispose(true);canvas.remove();
  return {conditions:{cpu:4,dpr:3,resolution:'product caps Planet at DPR2; LED at DPR3',renderer:'software WebGL',measurement:'LED module microbenchmark, no application background workload'},pictures,repeatDifferences,samples,groundHash,visibleCropDifferences:differences,cache:led.ledSpriteCacheStats?.()??null};
 },origin);
 assert.equal(results.visibleCropDifferences,0);console.log(JSON.stringify(results));
 writeFileSync(process.env.OUT??'/tmp/render-material-verification.json',JSON.stringify(results,null,2));
 await p.screenshot({path:`/tmp/led-material-${process.env.LABEL??'baseline'}.png`});
}finally{await browser.close();await server.close();}
