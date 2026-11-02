import {afterEach,expect,it,vi} from 'vitest';
import {WorldView} from '../src/online/world-view.js';
afterEach(()=>vi.unstubAllGlobals());
it('decorative SVG bounds never feed back into the logical camera',()=>{
 const grid={getBoundingClientRect:vi.fn(()=>({width:358,height:740}))};
 vi.stubGlobal('document',{getElementById:()=>grid});
 vi.stubGlobal('getComputedStyle',()=>({width:'358px',height:'740px'}));
 const svg={getBoundingClientRect:vi.fn(()=>({width:356.5625,height:737.046875})),setAttribute:vi.fn()};
 const box=[-70,-140,140,140*740/358];
 const state={svg,box,aspect:358/740,pixels:358};Object.setPrototypeOf(state,WorldView.prototype);
 (state as unknown as {applyView():void}).applyView();
 expect(state.aspect).toBe(358/740);expect(state.pixels).toBe(358);
 expect(svg.getBoundingClientRect).not.toHaveBeenCalled();
 expect(svg.setAttribute).toHaveBeenCalledWith('viewBox',box.join(' '));
});
