import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('decodes are shared, and one missing face never suppresses the other suits',async()=>{
 const classes=new Set<string>();
 vi.stubGlobal('document',{documentElement:{classList:{add:(...names:string[])=>names.forEach(n=>classes.add(n))}}});
 let count=0;
 vi.stubGlobal('Image',class {index=count++;src='';decoding='';decode(){return this.index===1?Promise.reject(new Error('offline asset')):Promise.resolve();}});
 const m=await import('../src/player/cards.js');
 const first=m.preloadCardArt();expect(m.preloadCardArt()).toBe(first);await first;
 expect(count).toBe(6);expect(classes.has('futa04-card-art-s0-ready')).toBe(true);
 expect(classes.has('futa04-card-art-s1-ready')).toBe(false);expect(classes.has('futa04-card-art-s2-ready')).toBe(true);
 expect(classes.has('futa04-card-art-ready')).toBe(false);
});
