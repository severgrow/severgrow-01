import {afterEach,describe,expect,it,vi} from 'vitest';
import {createLiveTicker} from '../src/online/live/ticker.js';
afterEach(()=>vi.useRealTimers());
describe('Blitz-only display ticker',()=>{
 const setup=()=>{vi.useFakeTimers();const tick=vi.fn();const ticker=createLiveTicker(tick,{setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:id=>clearTimeout(id as ReturnType<typeof setTimeout>)});return {tick,ticker};};
 it('has no wakeups on the menu or an ordinary offline/async game',async()=>{
  const t=setup();t.ticker.setActive(false);await vi.advanceTimersByTimeAsync(60000);
  expect(t.tick).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('keeps the original 250 ms clock precision while needed without stacking timers',async()=>{
  const t=setup();for(let i=0;i<100;i++)t.ticker.setActive(true);
  expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(1000);expect(t.tick).toHaveBeenCalledTimes(4);
  t.ticker.setActive(false);expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60000);expect(t.tick).toHaveBeenCalledTimes(4);
  t.ticker.setActive(true);await vi.advanceTimersByTimeAsync(250);expect(t.tick).toHaveBeenCalledTimes(5);t.ticker.setActive(false);
 });
 it('can stop from its callback without scheduling another tick',async()=>{
  const t=setup();t.tick.mockImplementation(()=>t.ticker.setActive(false));t.ticker.setActive(true);
  await vi.advanceTimersByTimeAsync(1000);expect(t.tick).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
});
