import {afterEach,expect,it,vi} from 'vitest';
import {liftBootCover} from '../src/player/boot-cover.js';
function setup(standalone=true,painted=true){
 vi.useFakeTimers();
 const cover={hidden:false,dataset:{} as Record<string,string>,style:{transition:'',opacity:'1'},remove:vi.fn()};
 const doc=Object.assign(new EventTarget(),{hidden:false,fonts:{status:'loaded'},documentElement:{dataset:{} as Record<string,string>,classList:{contains:(c:string)=>['space-first','planet-lockup'].includes(c)}},getElementById:(id:string)=>id==='boot-cover'?cover:id==='menu'?{hidden:false}:null,querySelector:()=>painted?{dataset:{planetReady:'true'}}:null});
 const win=new EventTarget();vi.stubGlobal('document',doc);vi.stubGlobal('window',Object.assign(win,{setTimeout,clearTimeout}));vi.stubGlobal('navigator',{standalone});vi.stubGlobal('matchMedia',()=>({matches:false}));
 vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>setTimeout(()=>f(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 return {cover,doc,win};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('waits for a real paint, not the planet-on mount class',()=>{
 const f=setup(true,false);liftBootCover({reduceMotion:false});vi.advanceTimersByTime(300);expect(f.cover.style.opacity).toBe('1');
 vi.advanceTimersByTime(2300);expect(f.cover.hidden).toBe(true);
});
// OWNER CHANGED THE RULE (2026-11-06: "unnecessary codex's stuff to be deleted"): the installed app no
// longer re-darkens and re-fades on every app switch; the cover is a FIRST-launch cover only.
it('the installed app gets no curtain when it is switched away from and back',()=>{
 const f=setup();liftBootCover({reduceMotion:false});vi.advanceTimersByTime(1500);expect(f.cover.hidden).toBe(true);
 f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));expect(f.cover.hidden).toBe(true);
 f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));expect(f.cover.hidden).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('ordinary browser tabs do not get a resume curtain',()=>{
 const f=setup(false);liftBootCover({reduceMotion:false});vi.advanceTimersByTime(1500);f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));expect(f.cover.hidden).toBe(true);
});
it('reduced motion skips the fade',()=>{
 const f=setup();liftBootCover({reduceMotion:true});vi.advanceTimersByTime(100);expect(f.cover.hidden).toBe(true);expect(f.cover.style.transition).not.toContain('220');
});
it('pageshow plus visibilitychange cannot restart a resumed fade',()=>{
 const f=setup();liftBootCover({reduceMotion:false});vi.advanceTimersByTime(1500);
 f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));
 f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));vi.advanceTimersByTime(40);
 const transition=f.cover.style.transition;
 const event=Object.assign(new Event('pageshow'),{persisted:true});f.win.dispatchEvent(event);
 expect(f.cover.style.transition).toBe(transition);expect(f.cover.style.opacity).toBe('0');
 vi.advanceTimersByTime(500);expect(f.cover.hidden).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
