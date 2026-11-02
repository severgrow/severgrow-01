import { expect,it,vi } from 'vitest';
import type { WorldMapPayload } from '../../server/src/protocol.js';
import { mountWorldSource } from '../src/online/living-world-source.js';
const map=(revision:number):WorldMapPayload=>({world:{version:1,revision,cost:100,challengeStake:0,cells:[{id:'0,0',q:0,r:0}],claims:[]}});
it('shares a public read across menu and Territory and remembers the real snapshot',async()=>{
 let finish!:(map:WorldMapPayload)=>void;
 const read=vi.fn(()=>new Promise<WorldMapPayload>(r=>{finish=r;}));const saved=vi.fn();
 const source=mountWorldSource(read,null,saved);const listener=vi.fn();source.subscribe(listener);
 const a=source.read(),b=source.read();expect(a).toBe(b);expect(read).toHaveBeenCalledTimes(1);
 finish(map(3));await a;expect(source.peek()?.revision).toBe(3);expect(saved).toHaveBeenCalledWith(map(3).world);expect(listener).toHaveBeenCalledTimes(1);
});
it('replaces device memory with the first server answer, then refuses older revisions',async()=>{
 const read=vi.fn().mockResolvedValueOnce(map(2)).mockResolvedValueOnce(map(1)).mockResolvedValueOnce(map(4));
 const source=mountWorldSource(read,map(99).world,vi.fn());
 expect(source.peek()?.revision).toBe(99);await source.read();expect(source.peek()?.revision).toBe(2);
 expect((await source.read()).world.revision).toBe(2);await source.read();expect(source.peek()?.revision).toBe(4);
});
it('keeps the last good map on failure and permits a later retry',async()=>{
 const read=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(map(5));
 const source=mountWorldSource(read,map(2).world,vi.fn());
 await expect(source.read()).rejects.toThrow('offline');expect(source.peek()?.revision).toBe(2);
 await source.read();expect(source.peek()?.revision).toBe(5);
});
it('does not discard same-revision public colour/name/dispute updates',async()=>{
 const changed=map(3);changed.world.disputes=[];
 const source=mountWorldSource(vi.fn().mockResolvedValueOnce(map(3)).mockResolvedValueOnce(changed),null,vi.fn());
 await source.read();await source.read();expect(source.peek()).toBe(changed.world);
});
