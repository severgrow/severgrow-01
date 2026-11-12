import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../src/logic/worldpaint.js',()=>({paintRect:()=>new Uint8ClampedArray(4),rectFor:()=>({x0:0,y0:0,w:1,h:1})}));
import {WorldLayer} from '../src/ui/worldlayer.js';

function fixture(){
 vi.useFakeTimers();
 const callbacks:BlobCallback[]=[];
 const element=()=>({setAttribute:vi.fn(),appendChild:vi.fn()});
 const canvas={width:1,height:1,getContext:()=>({putImageData:vi.fn()}),toBlob:(f:BlobCallback)=>callbacks.push(f)};
 vi.stubGlobal('document',{createElement:()=>canvas,createElementNS:element});
 vi.stubGlobal('ImageData',class {constructor(..._args:unknown[]){}});
 let id=0;vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:${++id}`);
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const layer=new WorldLayer(element() as unknown as SVGDefsElement,'a','b',{x0:0,y0:0,w:1,h:1},1);
 const swap=vi.fn();layer.onFirst=swap;layer.onSwap=swap;
 const sync=()=>layer.sync(new Map([['0,0',{owner:0,t:.5}]]),'soil','normal');
 return {layer,canvas,callbacks,swap,sync};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('disposing a superseded board cancels scheduled paint and releases its canvas',()=>{
 const f=fixture();f.sync();f.layer.dispose();vi.runAllTimers();
 expect(f.callbacks).toHaveLength(0);expect(f.swap).not.toHaveBeenCalled();expect(f.canvas.width*f.canvas.height).toBe(0);
});
it('an encoding callback from an old board cannot publish into a new board',()=>{
 const f=fixture();f.sync();vi.runAllTimers();expect(f.callbacks).toHaveLength(1);
 f.layer.dispose();f.callbacks[0]!(new Blob());
 expect(f.swap).not.toHaveBeenCalled();expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('disposing releases the last published texture and is safe to repeat',()=>{
 const f=fixture();f.sync();vi.runAllTimers();f.callbacks[0]!(new Blob());expect(f.layer.ready).toBe(true);
 f.layer.dispose();f.layer.dispose();expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);expect(f.layer.ready).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('newer texture publication wins when asynchronous encodes finish out of order',()=>{
 const f=fixture();f.sync();vi.runAllTimers();f.layer.sync(new Map([['0,0',{owner:1,t:.7}]]),'soil','normal');vi.runAllTimers();
 expect(f.callbacks).toHaveLength(2);f.callbacks[1]!(new Blob());f.callbacks[0]!(new Blob());
 expect(f.swap).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
 f.layer.dispose();
});
