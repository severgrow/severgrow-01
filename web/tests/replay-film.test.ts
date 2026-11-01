import { afterEach, expect, it, vi } from 'vitest';

afterEach(()=>vi.unstubAllGlobals());
it('an early fallback paint cannot prevent warming the actual game film tile',async()=>{
 vi.resetModules();let loads=0;
 const ctx={save:vi.fn(),restore:vi.fn(),createPattern:()=>({}),fillRect:vi.fn(),drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray(4)}),
  createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:vi.fn(),globalAlpha:1,fillStyle:''};
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>ctx})});
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;set src(_url:string){loads++;queueMicrotask(()=>this.onload?.());}});
 const {paintReplayFilm,warmReplayFilm}=await import('../src/replay/poster.js');
 paintReplayFilm(ctx as unknown as CanvasRenderingContext2D,30,30);
 await Promise.all([warmReplayFilm(),warmReplayFilm()]);
 expect(loads).toBe(1);
 expect(ctx.globalAlpha).toBe(.085);
 expect(ctx.fillRect).toHaveBeenCalledWith(0,0,30,30);
});
