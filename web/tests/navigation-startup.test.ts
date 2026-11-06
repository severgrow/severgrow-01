import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const source=readFileSync(new URL('../public/futa04-sw.js',import.meta.url),'utf8');
function worker(fetcher:typeof fetch,cached?:Response){
 const listeners=new Map<string,(e:any)=>void>();const put=vi.fn(async()=>{});
 const timers=new Map<number,{fn:()=>void;ms:number}>();let next=0;
 const cache={match:vi.fn(async()=>cached?.clone()),put};
 runInNewContext(source,{URL,Response,Promise,setTimeout:(fn:()=>void,ms:number)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:(id:number)=>timers.delete(id),fetch:fetcher,
  caches:{open:async()=>cache,keys:async()=>[]},
  self:{registration:{scope:'https://game.example/'},addEventListener:(type:string,fn:any)=>listeners.set(type,fn)}});
 const navigate=(preloadResponse?:Promise<Response>)=>{let answer:Promise<Response>|undefined;const tasks:Promise<unknown>[]=[];
  listeners.get('fetch')!({request:{url:'https://game.example/',method:'GET',mode:'navigate'},
   preloadResponse,
   respondWith:(p:Promise<Response>)=>{answer=p;},waitUntil:(p:Promise<unknown>)=>tasks.push(p)});
  return {answer:answer!,tasks};};
 return {navigate,cache,timers,dispatch:listeners.get('fetch')!,expire:()=>{for(const [id,t] of timers){timers.delete(id);t.fn();}}};
}
// OWNER CHANGED THE RULE (2026-11-06: "after adding the app to home screen it loads long and flashes
// white ... I just want it to have black screen until fully loaded"): iOS paints WHITE while a navigation
// waits, so a saved page is answered AT ONCE and refreshed in the background (was: wait up to 800 ms).
it('opens the saved app at once, never waiting on the network, and still refreshes it',async()=>{
 let release!:(r:Response)=>void;
 const fetcher=vi.fn(()=>new Promise<Response>(r=>{release=r;})) as unknown as typeof fetch;
 const w=worker(fetcher,new Response('cached app'));const n=w.navigate();let shown=false;
 void n.answer.then(()=>{shown=true;});await new Promise<void>(r=>setImmediate(r));
 expect(shown).toBe(true);expect(w.timers.size).toBe(0);expect(await (await n.answer).text()).toBe('cached app');
 release(new Response('fresh app'));await Promise.all(n.tasks);expect(w.cache.put).toHaveBeenCalled();
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('the refreshed page is saved for the next launch without delaying this one',async()=>{
 const w=worker(vi.fn(async()=>new Response('fresh app')) as unknown as typeof fetch,new Response('old app'));
 w.cache.put.mockImplementation(()=>new Promise<void>(()=>{}));
 const n=w.navigate();let answer:Response|undefined;void n.answer.then(r=>{answer=r;});
 await new Promise<void>(r=>setImmediate(r));expect(answer).toBeDefined();expect(await answer!.text()).toBe('old app');
 expect(w.cache.put).toHaveBeenCalled();
});
it('uses the cached app immediately when offline',async()=>{
 const w=worker(vi.fn(async()=>{throw new TypeError('offline');}) as unknown as typeof fetch,new Response('offline app'));
 expect(await (await w.navigate().answer).text()).toBe('offline app');
});
it('does not manufacture a page when no cached shell exists',async()=>{
 let release!:(r:Response)=>void;
 const w=worker(vi.fn(()=>new Promise<Response>(r=>{release=r;})) as unknown as typeof fetch);
 const n=w.navigate();let shown=false;void n.answer.then(()=>{shown=true;});
 w.expire();await new Promise<void>(r=>setImmediate(r));expect(shown).toBe(false);
 release(new Response('first real page'));expect(await (await n.answer).text()).toBe('first real page');
});
it('refreshes through browser navigation preload without fetching the page twice',async()=>{
 const fetcher=vi.fn(async()=>new Response('duplicate')) as unknown as typeof fetch;
 const w=worker(fetcher,new Response('old page'));const n=w.navigate(Promise.resolve(new Response('preloaded page')));
 expect(await (await n.answer).text()).toBe('old page');await Promise.all(n.tasks);
 expect(fetcher).not.toHaveBeenCalled();expect(w.cache.put).toHaveBeenCalled();
});
it('never intercepts or caches the authoritative API',()=>{
 const fetcher=vi.fn() as unknown as typeof fetch,w=worker(fetcher,new Response('cached page'));
 const respondWith=vi.fn();
 w.dispatch({request:{url:'https://game.example/functions/v1/duel/v1/world',method:'GET',mode:'cors'},respondWith,waitUntil:vi.fn()});
 expect(respondWith).not.toHaveBeenCalled();expect(w.cache.match).not.toHaveBeenCalled();
});
