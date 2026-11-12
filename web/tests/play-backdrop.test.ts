import { afterEach,describe,expect,it,vi } from 'vitest';
import { mountPlayBackdrop } from '../src/player/play-backdrop.js';
function fixture(ready=true){
 const beats:{finished:Promise<void>;cancel:ReturnType<typeof vi.fn>;resolve:()=>void;id?:string}[]=[];
 const target=Object.assign(new EventTarget(),{style:{opacity:''},querySelector:vi.fn(()=>ready?{dataset:{planetReady:'true'}}:null),
  animate:vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>{
   let resolve!:()=>void;const finished=new Promise<void>(r=>resolve=r),beat={finished,cancel:vi.fn(),resolve};beats.push(beat);return beat;
  })});
 const release=vi.fn(),fade=mountPlayBackdrop(target as unknown as HTMLElement,release);
 return {target,release,fade,beats};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('PLAY world transitions',()=>{
 it('leaves in 650ms without delaying controls, then releases the world',async()=>{
  const f=fixture();f.fade.start(true);expect(f.release).not.toHaveBeenCalled();
  expect(f.target.animate.mock.calls[0]?.[1]).toMatchObject({duration:650});
  f.beats[0]!.resolve();await Promise.resolve();expect(f.release).toHaveBeenCalledOnce();expect(f.fade.active()).toBe(false);
 });
 it('ignores duplicate PLAY and stale completion after a return',async()=>{
  const f=fixture();f.fade.start(true);f.fade.start(true);expect(f.target.animate).toHaveBeenCalledOnce();
  f.fade.cancel();f.fade.resume(true,.35);f.beats[0]!.resolve();await Promise.resolve();
  expect(f.release).not.toHaveBeenCalled();expect(f.target.animate.mock.calls[1]?.[0]).toEqual([{opacity:.35},{opacity:1}]);f.fade.cancel();
 });
 it('waits for the first new planet paint while keeping it hidden, then reveals in 650ms',()=>{
  vi.useFakeTimers();const f=fixture(false);f.fade.resume(true,0);
  expect(f.target.style.opacity).toBe('0');expect(f.target.animate).not.toHaveBeenCalled();
  f.target.dispatchEvent(new Event('futasaku:planet-ready'));
  expect(f.target.animate.mock.calls[0]).toEqual([[{opacity:0},{opacity:1}],expect.objectContaining({duration:650})]);
  expect(vi.getTimerCount()).toBe(0);f.fade.cancel();
 });
 it('new PLAY interrupts the incoming reveal without flashing or releasing twice',async()=>{
  vi.useFakeTimers();const f=fixture();f.fade.resume(true,.4);f.fade.start(true);
  expect(f.beats[0]!.cancel).toHaveBeenCalledOnce();expect(f.target.animate.mock.calls[1]?.[0]).toEqual([{opacity:.4},{opacity:0}]);
  f.beats[0]!.resolve();await Promise.resolve();expect(f.release).not.toHaveBeenCalled();
  f.beats[1]!.resolve();await Promise.resolve();expect(f.release).toHaveBeenCalledOnce();
 });
 it('another PLAY while waiting starts from darkness instead of flashing an unpainted world',()=>{
  vi.useFakeTimers();const f=fixture(false);f.fade.resume(true,0);f.fade.start(true);
  expect(f.target.animate.mock.calls[0]?.[0]).toEqual([{opacity:0},{opacity:0}]);expect(f.fade.leaving()).toBe(true);f.fade.cancel();
 });
 it('cancellation removes readiness listeners and the bounded fail-open',()=>{
  vi.useFakeTimers();const f=fixture(false);f.fade.resume(true,0);f.fade.cancel();
  f.target.dispatchEvent(new Event('futasaku:planet-ready'));vi.runAllTimers();
  expect(f.target.animate).not.toHaveBeenCalled();expect(f.target.style.opacity).toBe('');expect(vi.getTimerCount()).toBe(0);
 });
 it('fails open if graphics never arrive, with no permanent timer',()=>{
  vi.useFakeTimers();const f=fixture(false);f.fade.resume(true,0);vi.advanceTimersByTime(3500);
  expect(f.target.animate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);f.fade.cancel();
 });
 it('reduced motion is immediate in both directions',()=>{
  const f=fixture(false);f.fade.start(false);f.fade.resume(false,0);
  expect(f.target.animate).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledOnce();expect(f.target.style.opacity).toBe('');
 });
 it('the flat-map fallback can reveal immediately without a planet event',()=>{
  const f=fixture(false);f.fade.resume(true,0,false);expect(f.target.animate).toHaveBeenCalledOnce();f.fade.cancel();
 });
});
