/** One identity-scoped, bounded page. Warming has no timer/subscription and opening shares its GET. */
export function createChatFeed<T>(
  fetchPage:(scope:string,signal:AbortSignal)=>Promise<{messages:T[]}>,
  onUpdate:(messages:readonly T[])=>void,
  now:()=>number=Date.now,
  deadlineMs=10_000,
  /** The last page per scope, kept across visits (warm start); never shown for another scope. */
  memory?:{load(scope:string):readonly T[]|null;save(scope:string,rows:readonly T[]):void},
) {
  let scope:string|null=null,rows:readonly T[]=[],loaded=false,updated=-Infinity,version=0;
  let pending:{controller:AbortController;promise:Promise<void>}|null=null;
  const abort=()=>{version++;pending?.controller.abort();pending=null;};
  const snapshot=(next:string|null)=>{
    if(next!==scope){abort();scope=next;rows=(next&&memory?.load(next))||[];loaded=false;updated=-Infinity;}
    return {messages:rows,loaded};
  };
  return {
    snapshot,abort,
    read(next:string|null,maxAge=30_000):Promise<void>{
      snapshot(next);
      if(!next||(loaded&&now()-updated<maxAge))return Promise.resolve();
      if(pending)return pending.promise;
      const at=version,controller=new AbortController();
      let timeout:ReturnType<typeof setTimeout>|null=null;
      const bounded=new Promise<{messages:T[]}>((resolve,reject)=>{
        timeout=setTimeout(()=>{controller.abort();reject(new Error('Chat read timed out'));},deadlineMs);
        fetchPage(next,controller.signal).then(resolve,reject);
      });
      const promise=bounded.then(page=>{
        if(at!==version||scope!==next)return;
        rows=page.messages.slice(-30);loaded=true;updated=now();memory?.save(next,rows);onUpdate(rows);
      }).finally(()=>{if(timeout)clearTimeout(timeout);if(pending?.promise===promise)pending=null;});
      pending={controller,promise};return promise;
    },
    replace(next:string,messages:readonly T[]){
      if(next!==scope)return;
      abort();rows=messages.slice(-30);loaded=true;updated=now();memory?.save(next,rows);onUpdate(rows);
    },
  };
}
