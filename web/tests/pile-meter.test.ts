import { afterEach, expect, it, vi } from 'vitest';
import { renderPileMeter } from '../src/player/pile-meter.js';
class Node {
  dataset:Record<string,string>={};className='';textContent='';children:Node[]=[];
  classList={contains:(name:string)=>this.className.split(' ').includes(name),add:(name:string)=>{this.className+=' '+name;}};
  beats:{frames:Keyframe[];options:KeyframeAnimationOptions;cancel:ReturnType<typeof vi.fn>;finish:()=>void}[]=[];
  append(...nodes:Node[]){this.children.push(...nodes);}
  replaceChildren(...nodes:Node[]){this.children=nodes;}
  querySelectorAll(){return this.children;}
  getBoundingClientRect(){throw Error('counter animation must not force layout');}
  getAnimations(){throw Error('counter must track its own animation instead of scanning styles');}
  animate(frames:Keyframe[],options:KeyframeAnimationOptions){let finish!:()=>void;const finished=new Promise<void>(r=>{finish=r;});const cancel=vi.fn();const b={frames,options,cancel,finish};this.beats.push(b);return{finished,cancel,finish};}
}
function fixture(){
  const host=new Node();
  const doc=Object.assign(new EventTarget(),{hidden:false,createElement:()=>new Node(),documentElement:{classList:{contains:()=>false}},querySelectorAll:()=>host.children});
  vi.stubGlobal('document',doc);vi.stubGlobal('matchMedia',()=>({matches:false}));
  return{host,doc,paint:(n:number)=>renderPileMeter(host as unknown as HTMLElement,n)};
}
afterEach(()=>vi.unstubAllGlobals());
it('moves exactly one drum face without measuring the DOM, with the existing carry timing',()=>{
  const f=fixture();f.paint(9);f.paint(10);
  const tens=f.host.children[0]!.children[0]!.beats[0]!,ones=f.host.children[1]!.children[0]!.beats[0]!;
  expect(tens.options).toMatchObject({duration:720,delay:95});expect(ones.options).toMatchObject({duration:620,delay:0});
  expect(tens.frames.at(-1)?.transform).toBe('translateY(-50%)');
});
it('lets an unchanged tens carry finish when the ones digit changes again, then releases the effect',async()=>{
  const f=fixture();f.paint(9);f.paint(10);
  const tens=f.host.children[0]!,ones=f.host.children[1]!;
  const carry=tens.children[0]!.beats[0]!,oldOnes=ones.children[0]!.beats[0]!;
  f.paint(11);expect(oldOnes.cancel).toHaveBeenCalledOnce();expect(carry.cancel).not.toHaveBeenCalled();
  carry.finish();await Promise.resolve();expect(tens.children).toHaveLength(1);expect(tens.children[0]!.textContent).toBe('1');expect(carry.cancel).toHaveBeenCalledOnce();
});
it('decreasing values start on the old face and land on the new one',()=>{
  const f=fixture();f.paint(18);f.paint(17);const beat=f.host.children[1]!.children[0]!.beats[0]!;
  expect(beat.frames[0]?.transform).toBe('translateY(-50%)');expect(beat.frames.at(-1)?.transform).toBe('translateY(0%)');
});

it('settles an in-flight counter when the page is hidden, leaving no background animation',async()=>{
  const f=fixture();f.paint(18);f.paint(17);const beat=f.host.children[1]!.children[0]!.beats[0]!;
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();
  expect(f.host.children[1]!.children[0]!.textContent).toBe('7');expect(beat.cancel).toHaveBeenCalledOnce();
});
