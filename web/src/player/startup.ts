import { interfaceMotionAllowed } from '../ui/interface-motion.js';

export function createStartupGate(reveal:()=>void) {
  let app=false,fonts=false,planet=false,needsPlanet=true,done=false;
  const finish=()=>{if(!done){done=true;reveal();}};
  const check=()=>{if(app&&fonts&&(!needsPlanet||planet))finish();};
  return {
    ready(needs:boolean){app=true;needsPlanet=needs;check();},
    fonts(){fonts=true;check();},painted(){planet=true;check();},fallback:finish,
  };
}

/** First document reveal only. Navigation and PWA returns never replay this entrance. */
export function mountStartupReveal():void {
  const root=document.documentElement;
  if(root.dataset.startup!=='waiting')return;
  const menu=document.getElementById('menu');
  const gate=createStartupGate(()=>{
    const waiting=root.dataset.startup==='waiting';delete root.dataset.startup;
    window.removeEventListener('severor-ready',ready);
    window.removeEventListener('futasaku:planet-painted',painted);
    window.removeEventListener('futasaku:startup-visible',fallback);
    observer?.disconnect();
    if(waiting&&interfaceMotionAllowed()){
      const beat=document.body.animate([{opacity:0},{opacity:1}],{duration:1000,easing:'cubic-bezier(.2,0,.2,1)'});
      beat.id='startup-reveal';
    }
    if(waiting)window.dispatchEvent(new Event('futasaku:startup-visible'));
  });
  let app=false;
  const ready=()=>{app=true;gate.ready(!!menu&&!menu.hidden);};
  const painted=()=>gate.painted(),fallback=()=>gate.fallback();
  const observer=menu?new MutationObserver(()=>{if(app&&menu.hidden)gate.ready(false);}):null;
  observer?.observe(menu!,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('severor-ready',ready);
  window.addEventListener('futasaku:planet-painted',painted);
  window.addEventListener('futasaku:startup-visible',fallback);
  if(root.dataset.planetPainted==='true')gate.painted();
  void (document.fonts?.ready??Promise.resolve()).then(()=>gate.fonts());
}

/** Announced once, after the real first canvas paint (or its usable graphics fallback). */
export function markPlanetPainted():void {
  if(document.documentElement.dataset.planetPainted==='true')return;
  document.documentElement.dataset.planetPainted='true';
  window.dispatchEvent(new Event('futasaku:planet-painted'));
}
