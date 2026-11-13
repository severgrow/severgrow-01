import {describe,expect,it} from 'vitest';
import {mountPointerBusy} from '../src/online/live/pointer-busy.js';
describe('Blitz invitation pointer deferral',()=>{
 const setup=()=>{
  const doc=Object.assign(new EventTarget(),{hidden:false}),win=new EventTarget();
  const busy=mountPointerBusy(doc as unknown as Document,win as unknown as Window);
  const pointer=(type:string,id:number)=>doc.dispatchEvent(Object.assign(new Event(type),{pointerId:id}));
  return {doc,win,busy,pointer};
 };
 it('does not stay blocked when the release is lost outside the window',()=>{
  const t=setup();t.pointer('pointerdown',1);expect(t.busy.active()).toBe(true);
  t.win.dispatchEvent(new Event('blur'));expect(t.busy.active()).toBe(false);t.busy.dispose();
 });
 it('waits until every touch ends and also handles cancellation',()=>{
  const t=setup();t.pointer('pointerdown',1);t.pointer('pointerdown',2);t.pointer('pointerup',1);
  expect(t.busy.active()).toBe(true);t.pointer('pointercancel',2);expect(t.busy.active()).toBe(false);t.busy.dispose();
 });
 it('clears on suspension and removes all its listeners on disposal',()=>{
  const t=setup();t.pointer('pointerdown',1);t.doc.hidden=true;t.doc.dispatchEvent(new Event('visibilitychange'));
  expect(t.busy.active()).toBe(false);t.doc.hidden=false;t.pointer('pointerdown',2);t.win.dispatchEvent(new Event('pagehide'));
  expect(t.busy.active()).toBe(false);t.busy.dispose();t.pointer('pointerdown',3);expect(t.busy.active()).toBe(false);
 });
});
