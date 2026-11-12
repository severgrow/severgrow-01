import type { WorldMapPayload } from '../../../server/src/protocol.js';

type World=WorldMapPayload['world'];
/** One public map read for the menu, profile and Territory; never a second poll or identity store. */
export const mountWorldSource=(fetchMap:(poll?:boolean)=>Promise<WorldMapPayload>,cached:World|null,remember:(world:World)=>void)=>{
  let current=cached,fresh=false,flight:Promise<WorldMapPayload>|null=null;
  const listeners=new Set<(world:World)=>void>();
  return {
    peek:()=>current,
    isFresh:()=>fresh,
    subscribe(listener:(world:World)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    /** `poll`: a timed refresh, which the server may answer from its short cache. */
    read(poll=false):Promise<WorldMapPayload>{
      if(flight)return flight;
      flight=fetchMap(poll).then(payload=>{
        const next=payload.world;
        // Device memory is provisional. Once fresh, a late older response cannot rewind the map.
        if(fresh&&current&&(next.version<current.version||next.version===current.version&&next.revision<current.revision))return {world:current};
        current=next;fresh=true;remember(next);
        for(const listener of listeners)listener(next);
        return payload;
      }).finally(()=>{flight=null;});
      return flight;
    },
  };
};
