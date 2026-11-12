import { expect,it,vi } from 'vitest';
import { createChatFeed } from '../src/online/global-chat-feed.js';
it('warms one bounded page, shares an in-flight open and does not poll in the background',async()=>{
 let resolve!:(v:{messages:number[]})=>void;
 const fetch=vi.fn(()=>new Promise<{messages:number[]}>(r=>{resolve=r}));
 const feed=createChatFeed(fetch,()=>{},()=>100);
 const warm=feed.read('a'),open=feed.read('a',4000);
 expect(fetch).toHaveBeenCalledOnce();resolve({messages:Array.from({length:45},(_,i)=>i)});
 await Promise.all([warm,open]);expect(feed.snapshot('a').messages).toEqual(Array.from({length:30},(_,i)=>i+15));
 await feed.read('a',4000);expect(fetch).toHaveBeenCalledOnce();
});
it('clears another account and refuses a late response from the previous identity',async()=>{
 const pending:{resolve:(v:{messages:string[]})=>void;signal:AbortSignal}[]=[];
 const feed=createChatFeed<string>((_,signal)=>new Promise(r=>pending.push({resolve:r,signal})),()=>{});
 const a=feed.read('a');const b=feed.read('b');
 expect(pending[0]!.signal.aborted).toBe(true);pending[0]!.resolve({messages:['private A']});await a;
 expect(feed.snapshot('b').messages).toEqual([]);
 pending[1]!.resolve({messages:['B']});await b;expect(feed.snapshot('b').messages).toEqual(['B']);
});
it('a send/block result supersedes an older page and failed refresh keeps readable history',async()=>{
 let resolve!:(v:{messages:string[]})=>void;
 const feed=createChatFeed<string>(()=>new Promise(r=>{resolve=r}),()=>{});
 const old=feed.read('a');feed.replace('a',['new']);resolve({messages:['old']});await old;
 expect(feed.snapshot('a').messages).toEqual(['new']);
 const fail=createChatFeed<string>(async()=>{throw Error('offline')},()=>{},()=>5000);
 fail.snapshot('a');fail.replace('a',['kept']);await expect(fail.read('a',0)).rejects.toThrow('offline');
 expect(fail.snapshot('a').messages).toEqual(['kept']);
});
