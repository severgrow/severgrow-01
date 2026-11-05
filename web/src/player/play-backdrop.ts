/** Immediate menu controls, with one finite world fade. A cold return waits for a real paint. */
export function mountPlayBackdrop(target:HTMLElement,release:()=>void){
 let beat:Animation|null=null,epoch=0,departed=false,direction:'out'|'in'|null=null;
 let waiting:(()=>void)|null=null,timer:ReturnType<typeof setTimeout>|null=null;
 const opacity=()=>beat||waiting?Math.max(0,Math.min(1,Number(typeof getComputedStyle==='function'?getComputedStyle(target).opacity:target.style.opacity||1))):0;
 const cancel=()=>{
  epoch++;beat?.cancel();beat=null;direction=null;
  if(waiting)target.removeEventListener('futasaku:planet-ready',waiting);waiting=null;
  if(timer!==null)clearTimeout(timer);timer=null;target.style.opacity='';
 };
 const animate=(from:number,to:number,generation:number,out:boolean)=>{
  beat=target.animate([{opacity:from},{opacity:to}],{duration:650,easing:'cubic-bezier(.2,0,.2,1)',fill:'both'});
  beat.id=out?'play-world-fade':'play-world-reveal';
  beat.finished.then(()=>{if(generation!==epoch)return;if(out)release();cancel();}).catch(()=>undefined);
 };
 return {
  active:()=>beat!==null||waiting!==null,leaving:()=>direction==='out',returning:()=>direction==='in',departed:()=>departed,opacity,cancel,
  start(motion:boolean){
   if(direction==='out')return;
   const from=direction?opacity():1;cancel();departed=true;direction='out';
   if(!motion){release();direction=null;return;}
   target.style.opacity=String(from);animate(from,0,epoch,true);
  },
  resume(motion:boolean,from=0,expectPlanet=true){
   cancel();departed=false;if(!motion)return;
   direction='in';const generation=epoch;
   const ready=!expectPlanet||target.querySelector<HTMLElement>('.planet-canvas')?.dataset.planetReady==='true';
   const initial=ready?from:0;target.style.opacity=String(initial);
   const reveal=()=>{
    if(generation!==epoch)return;
    if(waiting)target.removeEventListener('futasaku:planet-ready',waiting);waiting=null;
    if(timer!==null)clearTimeout(timer);timer=null;
    animate(initial,1,generation,false);
   };
   if(ready)reveal();else{
    waiting=reveal;target.addEventListener('futasaku:planet-ready',reveal);
    // Missing graphics must never leave an indefinitely hidden menu backdrop.
    timer=setTimeout(reveal,3500);
   }
  },
 };
}
