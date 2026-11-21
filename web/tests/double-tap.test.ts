import {expect,it} from 'vitest';
import {DOUBLE_TAP_MS,isDoubleTap} from '../src/logic/double-tap.js';
it('pins the window the gesture suites dispatch against, boundary included',()=>{
 expect(DOUBLE_TAP_MS).toBe(280);
 const first={x:10,y:10,at:100};
 expect(isDoubleTap(first,{x:10,y:10,at:first.at+DOUBLE_TAP_MS},DOUBLE_TAP_MS,30)).toBe(true);
 // CI 9e777d4 measured 285 ms between the releases of a second double tap — one ms is enough.
 expect(isDoubleTap(first,{x:10,y:10,at:first.at+DOUBLE_TAP_MS+1},DOUBLE_TAP_MS,30)).toBe(false);
});
it('requires a real previous tap, including near the beginning of the page clock',()=>{
 expect(isDoubleTap(null,{x:10,y:10,at:40},320,30)).toBe(false);
});
it('uses monotonic input timestamps, not the later handler delivery or wall clock',()=>{
 const first={x:10,y:10,at:100};
 expect(isDoubleTap(first,{x:12,y:11,at:180},280,30)).toBe(true);
 expect(isDoubleTap(first,{x:10,y:10,at:381},280,30)).toBe(false);
 expect(isDoubleTap(first,{x:10,y:10,at:90},280,30)).toBe(false);
});
it('does not turn two separate nearby-in-time tile inspections into zoom',()=>{
 expect(isDoubleTap({x:10,y:10,at:100},{x:70,y:10,at:180},320,30)).toBe(false);
 expect(isDoubleTap({x:10,y:10,at:100},{x:40,y:10,at:380},280,30)).toBe(true);
});
