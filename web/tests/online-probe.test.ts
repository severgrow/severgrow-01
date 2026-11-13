import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
import {PROBE_SCRIPT} from '../e2e/helpers/online-probe.js';

const setup=()=>{
 const refs:{value:unknown}[]=[];
 class Ref {constructor(public value:unknown){refs.push(this);}deref(){return this.value;}}
 class Target {addEventListener(){}removeEventListener(){}}
 class Storage {length=0;getItem(){return null;}setItem(){}}
 const win={setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},performance:{},__probe:null as any};
 runInNewContext(PROBE_SCRIPT,{window:win,document:{getElementsByTagName:()=>[]},Storage,localStorage:new Storage(),sessionStorage:new Storage(),EventTarget:Target,WeakRef:Ref});
 return {probe:()=>win.__probe.snap(),target:()=>new Target() as unknown as EventTarget,collect:(value:unknown)=>{for(const ref of refs)if(ref.value===value)ref.value=undefined;}};
};
describe('the resource probe must not create retained-heap drift',()=>{
 it('forgets a collected callback even when its event target is still alive',()=>{
  const t=setup(),target=t.target(),handler=()=>{};target.addEventListener('click',handler);
  expect(t.probe().listenersLive).toBe(1);t.collect(handler);
  expect(t.probe().listenersLive).toBe(0);expect(t.probe().listenerRecords).toBe(0);
 });
 it('keeps reachable detached targets visible, but drops collected bookkeeping',()=>{
  const t=setup(),target=Object.assign(t.target(),{nodeType:1,isConnected:false}),handler=()=>{};
  target.addEventListener('click',handler);expect(t.probe().listenersDetached).toBe(1);
  t.collect(target);expect(t.probe().listenersDetached).toBe(0);expect(t.probe().listenerRecords).toBe(0);
 });
});
