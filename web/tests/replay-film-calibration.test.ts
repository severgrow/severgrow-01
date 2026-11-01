import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(()=>vi.resetModules());
afterEach(()=>vi.unstubAllGlobals());
const fixture=()=>{
 let gain=1,decoded=0,hang=false;
 const encoders:{state:string}[]=[],decoders:{state:string}[]=[];
 const pixels=(amplitude:number)=>{const data=new Uint8ClampedArray(40*80*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=20+(i/4%40%2?amplitude:-amplitude);data[i+3]=255;}return {data};};
 const source={width:1080,height:1920,getContext:()=>({getImageData:()=>pixels(gain*2)})} as unknown as HTMLCanvasElement;
 vi.stubGlobal('document',{createElement:()=>({width:1080,height:1920,getContext:()=>({getImageData:()=>pixels(decoded),drawImage:(frame:{gain:number})=>{decoded=frame.gain>1?2:0;}})})});
 vi.stubGlobal('VideoFrame',class{gain=gain;close=vi.fn();});
 vi.stubGlobal('VideoEncoder',class{
  state='unconfigured';reject:((error:Error)=>void)|null=null;
  constructor(private callbacks:any){encoders.push(this);}
  configure(){this.state='configured';}
  encode(frame:{gain:number}){this.callbacks.output({gain:frame.gain},{decoderConfig:{codec:'test'}});}
  flush(){return hang?new Promise<void>((_,reject)=>{this.reject=reject;}):Promise.resolve();}
  close(){this.state='closed';this.reject?.(new Error('closed'));}
 });
 vi.stubGlobal('VideoDecoder',class{
  state='unconfigured';constructor(private callbacks:any){decoders.push(this);}
  configure(){this.state='configured';}
  decode(chunk:{gain:number}){this.callbacks.output({gain:chunk.gain,close:vi.fn()});}
  flush(){return Promise.resolve();}close(){this.state='closed';}
 });
 return {source,paint:vi.fn((value:number)=>{gain=value;}),encoders,decoders,setHang:(value:boolean)=>{hang=value;}};
};
const config={codec:'test',width:1080,height:1920};
it('does no calibration work when the decoder is unavailable',async()=>{
 vi.stubGlobal('VideoEncoder',undefined);vi.stubGlobal('VideoDecoder',undefined);
 const {matchReplayFilm}=await import('../src/replay/film-calibration.js');const paint=vi.fn();
 expect(await matchReplayFilm({} as HTMLCanvasElement,config,paint)).toBe(1);expect(paint).not.toHaveBeenCalled();
});
it('matches decoded texture, closes both codecs and reuses the measured configuration',async()=>{
 const f=fixture();const {matchReplayFilm}=await import('../src/replay/film-calibration.js');
 expect(await matchReplayFilm(f.source,config,f.paint)).toBe(2.4);
 expect(f.encoders.length).toBeLessThanOrEqual(3);
 expect([...f.encoders,...f.decoders].every(c=>c.state==='closed')).toBe(true);
 f.paint.mockClear();expect(await matchReplayFilm(f.source,config,f.paint)).toBe(2.4);expect(f.paint).not.toHaveBeenCalled();
});
it('cancellation immediately releases a stalled codec and never caches that fallback',async()=>{
 const f=fixture();f.setHang(true);const {matchReplayFilm}=await import('../src/replay/film-calibration.js');
 const controller=new AbortController();const pending=matchReplayFilm(f.source,config,f.paint,controller.signal);
 controller.abort();expect(await pending).toBe(1);expect(f.encoders.every(c=>c.state==='closed')).toBe(true);
 f.setHang(false);expect(await matchReplayFilm(f.source,config,f.paint)).toBe(2.4);
});
