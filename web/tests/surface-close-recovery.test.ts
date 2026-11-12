import {afterEach,expect,it,vi} from 'vitest';
import {enterSurface,exitSurface,resetSurface,surfaceState} from '../src/ui/interface-motion.js';
const fixture=()=>({nodeType:1,dataset:{},classList:{add:vi.fn(),remove:vi.fn()},style:{removeProperty:vi.fn()},setAttribute:vi.fn(),removeAttribute:vi.fn(),animate:vi.fn(()=>({finished:new Promise<void>(()=>{}),cancel:vi.fn(),finish:vi.fn()}))}) as unknown as HTMLElement;
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const setup=()=>{vi.useFakeTimers();vi.stubGlobal('document',{documentElement:{classList:{contains:()=>false}}});return fixture();};
it('finishes a stranded close exactly once and releases its timer',()=>{
 const el=setup(),done=vi.fn();exitSurface(el,{onDone:done});vi.advanceTimersByTime(349);expect(done).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(done).toHaveBeenCalledOnce();expect(surfaceState(el)).toBe('closed');expect(vi.getTimerCount()).toBe(0);
});
it('a reopened panel cannot be hidden by an old fallback',()=>{
 const el=setup(),done=vi.fn();exitSurface(el,{onDone:done});enterSurface(el);vi.advanceTimersByTime(1000);expect(done).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);resetSurface(el);
});
it('navigation cancels the bounded close cleanup',()=>{
 const el=setup(),done=vi.fn();exitSurface(el,{onDone:done});resetSurface(el);vi.runAllTimers();expect(done).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
