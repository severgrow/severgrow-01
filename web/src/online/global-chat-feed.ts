/** One identity-scoped, bounded page. Warming has no timer/subscription and opening shares its GET. */
export function createChatFeed<T>(
  fetchPage:(scope:string,signal:AbortSignal)=>Promise<{messages:T[]}>,
  onUpdate:(messages:readonly T[])=>void,
  now:()=>number=Date.now,
) {
  let scope:string|null=null,rows:readonly T[]=[],loaded=false,updated=-Infinity,version=0;
  let pending:{controller:AbortController;promise:Promise<void>}|null=null;
  const abort=()=>{version++;pending?.controller.abort();pending=null;};
  const snapshot=(next:string|null)=>{
    if(next!==scope){abort();scope=next;rows=[];loaded=false;updated=-Infinity;}
    return {messages:rows,loaded};
  };
  return {
    snapshot,abort,
    read(next:string|null,maxAge=30_000):Promise<void>{
      snapshot(next);
      if(!next||(loaded&&now()-updated<maxAge))return Promise.resolve();
      if(pending)return pending.promise;
      const at=version,controller=new AbortController();
      const promise=fetchPage(next,controller.signal).then(page=>{
        if(at!==version||scope!==next)return;
        rows=page.messages.slice(-30);loaded=true;updated=now();onUpdate(rows);
      }).finally(()=>{if(pending?.promise===promise)pending=null;});
      pending={controller,promise};return promise;
    },
    replace(next:string,messages:readonly T[]){
      if(next!==scope)return;
      abort();rows=messages.slice(-30);loaded=true;updated=now();onUpdate(rows);
    },
  };
}
