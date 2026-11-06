import {expect,it} from 'vitest';
import {isDoubleTap} from '../src/logic/double-tap.js';
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
