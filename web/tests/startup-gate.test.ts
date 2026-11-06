import { expect,it,vi } from 'vitest';
import { createStartupGate } from '../src/player/startup.js';
it('reveals the first menu only after app, fonts and the first planet frame',()=>{
 const show=vi.fn(),gate=createStartupGate(show);
 gate.ready(true);gate.fonts();expect(show).not.toHaveBeenCalled();
 gate.painted();expect(show).toHaveBeenCalledOnce();gate.painted();gate.fallback();expect(show).toHaveBeenCalledOnce();
});
it('handles an early planet frame and never waits for a planet on a deep-linked game',()=>{
 const show=vi.fn(),gate=createStartupGate(show);gate.painted();gate.fonts();gate.ready(true);expect(show).toHaveBeenCalledOnce();
 const game=vi.fn(),direct=createStartupGate(game);direct.ready(false);direct.fonts();expect(game).toHaveBeenCalledOnce();
});
it('has a single fail-open path for unavailable code or graphics',()=>{
 const show=vi.fn(),gate=createStartupGate(show);gate.fallback();gate.ready(true);gate.fonts();gate.painted();expect(show).toHaveBeenCalledOnce();
});

// The owner's production repro: the first reveal must not be restricted to /test/.
it('starts the same planet readiness gate on the live root and test route',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
 for(const pathname of ['/','/test/']){
  const dataset:Record<string,string>={};
  runInNewContext(script,{document:{documentElement:{dataset,classList:{contains:(c:string)=>c==='v075',add:()=>{}}}},location:{pathname,search:''},setTimeout:()=>1,clearTimeout:()=>{},window:{addEventListener:()=>{}}});
  expect(dataset.startup,pathname).toBe('waiting');
 }
});
