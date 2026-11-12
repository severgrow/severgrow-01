import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const source=readFileSync(new URL('../public/futa04-sw.js',import.meta.url),'utf8');
function worker(fetcher:typeof fetch,cached?:Response){
 const listeners=new Map<string,(e:any)=>void>();const put=vi.fn(async (_key:string,_response:Response)=>{});
 const timers=new Map<number,{fn:()=>void;ms:number}>();let next=0;
 const cache={match:vi.fn(async()=>cached?.clone()),put};
 runInNewContext(source,{URL,Response,Promise,setTimeout:(fn:()=>void,ms:number)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:(id:number)=>timers.delete(id),fetch:fetcher,
  caches:{open:async()=>cache,keys:async()=>[]},
  self:{registration:{scope:'https://game.example/'},addEventListener:(type:string,fn:any)=>listeners.set(type,fn)}});
 const navigate=(preloadResponse?:Promise<Response>,url='https://game.example/')=>{let answer:Promise<Response>|undefined;const tasks:Promise<unknown>[]=[];
  listeners.get('fetch')!({request:{url,method:'GET',mode:'navigate'},
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

// LIVE (owner, 2026-11-08: "on futasaku.com territory keeps loading forever"): a phone opened its SAVED
// page from an earlier deploy; that page's lazily loaded code no longer exists on the site, and the
// stale-page recovery reloads with ?_fresh=... — which this worker answered from the SAME saved page
// again, so the recovery could never recover. A recovery reload now always gets the network page.
it('a stale-page recovery reload (?_fresh=) gets the network page, never the saved one',async()=>{
 const w=worker(vi.fn(async()=>new Response('new app')) as unknown as typeof fetch,new Response('old app'));
 const n=w.navigate(undefined,'https://game.example/?_fresh=123');
 expect(await (await n.answer).text()).toBe('new app');
 await Promise.all(n.tasks);expect(w.cache.put).toHaveBeenCalled();
});
it('…and offline, the recovery still falls back to the saved page rather than nothing',async()=>{
 const w=worker(vi.fn(async()=>{throw new TypeError('offline');}) as unknown as typeof fetch,new Response('saved app'));
 expect(await (await w.navigate(undefined,'https://game.example/?_fresh=9').answer).text()).toBe('saved app');
});

// THE ART LAB (futasaku.com/art) is a separate tool on the same origin, with the same scope as the
// game. A designer opening /art/ on a device that still holds an older worker must get the lab: the
// worker must step aside and let the browser ask the network. If a navigation ever reaches `navigate`
// it is answered from the saved game page, which is exactly the reported failure ("/art/ shows the
// game"), so this is checked through the real fetch listener, not just the handler.
it('never answers an Art Lab navigation, even with the game saved in the cache',()=>{
 const w=worker(vi.fn() as unknown as typeof fetch,new Response('saved game'));
 const respondWith=vi.fn();
 w.dispatch({request:{url:'https://game.example/art/',method:'GET',mode:'navigate'},respondWith,waitUntil:vi.fn()});
 expect(respondWith).not.toHaveBeenCalled();
 expect(w.cache.match).not.toHaveBeenCalled();
});
it('steps aside for every address the lab is reached by (query or not, /test/art/ too)',()=>{
 for(const url of ['https://game.example/art/','https://game.example/art','https://game.example/art/?v=2','https://game.example/art/?cb=3#seed=4821','https://game.example/test/art/']){
  const respondWith=vi.fn();
  worker(vi.fn() as unknown as typeof fetch,new Response('saved game'))
   .dispatch({request:{url,method:'GET',mode:'navigate'},respondWith,waitUntil:vi.fn()});
  expect(respondWith,url).not.toHaveBeenCalled();
 }
});
it('checks the Art Lab exclusion before the navigation branch that answers with the saved page',()=>{
 const artAt=source.indexOf('\\/art(');
 const navigateAt=source.indexOf("if (req.mode");
 expect(artAt).toBeGreaterThan(-1);
 expect(navigateAt).toBeGreaterThan(-1);
 expect(artAt).toBeLessThan(navigateAt);
});
it('never saves a sub-page as the game’s own offline page',async()=>{
 const sub=new Response('a sub-page');
 Object.defineProperty(sub,'url',{value:'https://game.example/notes/'});
 const w=worker(vi.fn(async()=>sub) as unknown as typeof fetch);
 const n=w.navigate(undefined,'https://game.example/notes/');
 expect(await (await n.answer).text()).toBe('a sub-page');
 await Promise.all(n.tasks);
 expect(w.cache.put).not.toHaveBeenCalled();
});
it('still saves the game’s own page for the next launch',async()=>{
 const own=new Response('the game');
 Object.defineProperty(own,'url',{value:'https://game.example/'});
 const w=worker(vi.fn(async()=>own) as unknown as typeof fetch,new Response('saved game'));
 const n=w.navigate();
 // the saved page is answered at once; the network page is what gets saved for next time
 expect(await (await n.answer).text()).toBe('saved game');
 await Promise.all(n.tasks);
 expect(w.cache.put).toHaveBeenCalled();
 expect(await w.cache.put.mock.calls[0]![1].text()).toBe('the game');
});
