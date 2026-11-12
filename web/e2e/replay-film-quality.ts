// Actual production MP4 and MediaRecorder output, decoded before judging the film.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync,writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { buildReplay } from '../src/replay/timeline.js';
import { CURRENT_RULES_VERSION,rulesConfig } from '../../src/engine/versions.js';
const out=process.env.SHOTS??'/tmp/replay-film-final';mkdirSync(out,{recursive:true});
const model=buildReplay({seed:2,rulesVersion:CURRENT_RULES_VERSION,config:rulesConfig(CURRENT_RULES_VERSION)!,startingPlayer:0,actions:[],names:['YOU','OPPONENT']});
const server=await createServer({configFile:'web/vite.config.ts',server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
const port=(server.httpServer!.address() as AddressInfo).port;
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920}});
 await page.addInitScript(()=>{(window as any).__name=(f:unknown)=>f;});
 await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>(window as any).__severgrow?.ready?.());
 const result=await page.evaluate(async(model)=>{
  const {warmReplayFilm,paintReplayFilm}=await import('/src/replay/poster.ts' as string);
  const {warmBoardArt}=await import('/src/replay/board-canvas.ts' as string);
  const {paintVideoFrame,videoPlan}=await import('/src/replay/frames.ts' as string);
  const {encodeReplayMp4}=await import('/src/replay/encode.ts' as string);
  const {recordReplayVideo}=await import('/src/replay/video.ts' as string);
  await Promise.all([warmReplayFilm(),warmBoardArt()]);
  const source=document.createElement('canvas');
  const labels:{text:string;font:string}[]=[];
  const fillText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,maxWidth){
   if(text==='YOU'||text==='OPPONENT')labels.push({text,font:this.font});
   if(maxWidth===undefined)fillText.call(this,text,x,y);else fillText.call(this,text,x,y,maxWidth);
  };
  const stats=(c:HTMLCanvasElement)=>{const w=40,h=80,a=c.getContext('2d')!.getImageData(8,8,w,h).data;let sum=0,sq=0,total=0,n=0;
   const at=(x:number,y:number)=>{const i=(y*w+x)*4;return(a[i]!+a[i+1]!+a[i+2]!)/3;};
   for(let y=0;y<h;y++)for(let x=1;x<w-1;x++){const v=at(x,y),d=v-(at(x-1,y)+at(x+1,y))/2;sum+=d;sq+=d*d;total+=v;n++;}
   return {spread:Math.sqrt(sq/n-(sum/n)**2),mean:total/n};};
  const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
  const decode=async(blob:Blob)=>({file:await dataUrl(blob),bytes:blob.size,mime:blob.type});
  try{
   paintVideoFrame(source,model,videoPlan(model).steps[0]);
   const reference={...stats(source),png:source.toDataURL()};
   const fast=await encodeReplayMp4({model});if(!fast)throw Error('MP4 cancelled');
   const mp4=await decode(fast.blob);
   const capture=HTMLCanvasElement.prototype.captureStream,streams:MediaStream[]=[];
   HTMLCanvasElement.prototype.captureStream=function(fps){const stream=capture.call(this,fps);streams.push(stream);return stream;};
   let cancelled=false,released=false;
   try{
    const controller=new AbortController();const pending=recordReplayVideo({model,signal:controller.signal});
    for(let i=0;!streams.length&&i<100;i++)await new Promise(r=>setTimeout(r,5));
    controller.abort();cancelled=(await pending)===null;
    released=streams.length>0&&streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'));
   }finally{HTMLCanvasElement.prototype.captureStream=capture;}
   const native=await recordReplayVideo({model});if(!native)throw Error('recorder cancelled');
   const recorder=await decode(native.blob);
   // A flat, fully opaque interface surface still receives film: it is above all content.
   const plate=document.createElement('canvas');plate.width=1080;plate.height=1920;
   const p=plate.getContext('2d')!;p.fillStyle='#f0e9dc';p.fillRect(0,0,1080,1920);paintReplayFilm(p,1080,1920);
   return {reference,mp4,recorder,cancelled,released,labels,plate:stats(plate),family:getComputedStyle(document.body).getPropertyValue('--font-ui'),loaded:document.fonts.check('400 30px "Fragment Mono"')};
  }finally{CanvasRenderingContext2D.prototype.fillText=fillText;}
 },model);
 writeFileSync(`${out}/reference.png`,Buffer.from(result.reference.png.split(',')[1]!,'base64'));
 const decoded=[];
 for(const [name,item] of [['mp4',result.mp4],['recorder',result.recorder]] as const){
  const path=`${out}/${name}.${item.mime.includes('mp4')?'mp4':'webm'}`;
  writeFileSync(path,Buffer.from(item.file.split(',')[1]!,'base64'));
  const png=spawnSync('ffmpeg',['-v','error','-y','-i',path,'-frames:v','1',`${out}/${name}.png`]);
  assert.equal(png.status,0,'ffmpeg independently decodes the actual exported file');
  const probe=spawnSync('ffmpeg',['-v','error','-i',path,'-frames:v','1','-vf','crop=40:80:8:8','-pix_fmt','rgb24','-f','rawvideo','-']);
  assert.equal(probe.status,0);const a=probe.stdout;assert.equal(a.length,40*80*3);
  let sum=0,sq=0,total=0,n=0;const at=(x:number,y:number)=>{const i=(y*40+x)*3;return(a[i]!+a[i+1]!+a[i+2]!)/3;};
  for(let y=0;y<80;y++)for(let x=1;x<39;x++){const v=at(x,y),d=v-(at(x-1,y)+at(x+1,y))/2;sum+=d;sq+=d*d;total+=v;n++;}
  const measure={spread:Math.sqrt(sq/n-(sum/n)**2),mean:total/n};decoded.push(measure);console.log(name,JSON.stringify({...measure,bytes:item.bytes,mime:item.mime}));
 }
 console.log('reference',JSON.stringify({spread:result.reference.spread,mean:result.reference.mean}));
 console.log('labels',JSON.stringify([...new Set(result.labels.map(x=>x.font))]));
 assert(result.cancelled&&result.released,'cold recorder cancellation releases every probe track');
 assert(result.reference.spread>.5,'reference carries the actual game film');
 assert(result.plate.spread>.05,'film is painted above opaque UI surfaces');
 assert(result.loaded&&result.labels.length>0,'the real game UI face is loaded before canvas text');
 assert(result.labels.every(x=>/^(?:(?:normal|400) )?\d+(?:\.\d+)?px /.test(x.font)&&x.font.includes('Fragment Mono')),'names use the game regular UI typeface without synthetic bold');
 for(const video of decoded){
  assert(video.spread>=result.reference.spread*.65&&video.spread<=result.reference.spread*1.35,'decoded film remains near the game texture strength');
  assert(Math.abs(video.mean-result.reference.mean)<4,'compression compensation preserves the dark material');
 }
 console.log('PASS: decoded MP4 and recorder film, top-layer coverage, real loaded UI typography');
}finally{await browser.close();await server.close();}
