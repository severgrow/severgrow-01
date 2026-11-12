import { expect, it, vi } from 'vitest';
import { deferEntryButton } from '../src/ui/deferred-entry.js';
function fixture() {
  let listener: ((event: Event) => void) | null=null;
  let hidden=false;
  const button={addEventListener:vi.fn((_name:string,fn:EventListener)=>{listener=fn;}),removeEventListener:vi.fn(),
    setAttribute:vi.fn(),removeAttribute:vi.fn(),click:vi.fn(),closest:()=>hidden?{}:null};
  const screens=new EventTarget();
  const gate=deferEntryButton(button as unknown as HTMLButtonElement,screens);
  const tap=()=>{const e=new Event('click',{cancelable:true});listener?.(e);return e;};
  return {button,gate,tap,screens,hide:()=>{hidden=true;}};
}
it('queues one early entry tap and delivers only after its real handler is installed',()=>{
  const f=fixture();expect(f.tap().defaultPrevented).toBe(true);f.tap();expect(f.button.click).not.toHaveBeenCalled();
  f.gate.ready();expect(f.button.click).toHaveBeenCalledOnce();expect(f.button.removeEventListener).toHaveBeenCalledOnce();
  f.gate.ready();expect(f.button.click).toHaveBeenCalledOnce();
});
it('never opens a doorway later after the player has navigated away',()=>{
  const f=fixture();f.tap();f.hide();f.gate.ready();expect(f.button.click).not.toHaveBeenCalled();
});
it('does not manufacture an entry click when nobody asked',()=>{
  const f=fixture();f.gate.ready();expect(f.button.click).not.toHaveBeenCalled();
});

it('cancels an old intent even if the player comes back before loading finishes',()=>{
  const f=fixture();f.tap();f.screens.dispatchEvent(new Event('futasaku:screen'));
  f.gate.ready();expect(f.button.click).not.toHaveBeenCalled();
});
