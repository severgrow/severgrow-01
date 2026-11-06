import { interfaceMotionAllowed,INTERFACE_MOTION } from '../ui/interface-motion.js';

export const CHALLENGE_HANDOFF_MS=700;
/** One small, finite veil: no WebGL readback, copied DOM, extra renderer or persistent loop.
 * Prepare the duel under the dark midpoint, then reveal it. Only this doorway uses 700ms. */
export function mountChallengeHandoff(source:HTMLElement) {
  let pending:Promise<void>|null=null;
  const here=()=>!source.hidden&&source.getAttribute('aria-hidden')!=='true';
  return {
    run(open:()=>void):Promise<void>{
      if(pending)return pending;
      if(!here())return Promise.resolve();
      if(!interfaceMotionAllowed()||document.hidden){open();return Promise.resolve();}
      const perform=async()=>{
        const veil=document.createElement('div');veil.id='challenge-duel-handoff';
        veil.setAttribute('aria-hidden','true');veil.dataset.phase='out';
        veil.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#0e0f10;opacity:0;pointer-events:auto';
        document.body.append(veil);
        // Existing #futa04-film-grain stays above the veil (2147483646). Never lift #texture:
        // it is the opaque page background, not the grain, and would hide the duel.
        const focus=document.activeElement instanceof HTMLElement&&source.contains(document.activeElement)?document.activeElement:null;
        const wasInert=source.inert;source.inert=true;
        let animation:Animation|null=null,opened=false,cancelled=false;
        const cancel=()=>{cancelled=true;animation?.cancel();};
        const keys=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!opened){e.preventDefault();e.stopImmediatePropagation();cancel();}};
        const visibility=()=>{if(document.hidden)cancel();};
        document.addEventListener('keydown',keys,true);
        document.addEventListener('visibilitychange',visibility);
        const observer=new MutationObserver(()=>{if(!opened&&!here())cancel();});
        observer.observe(source,{attributes:true,attributeFilter:['hidden','aria-hidden']});
        try{
          animation=veil.animate([{opacity:0},{opacity:1}],{duration:CHALLENGE_HANDOFF_MS/2,easing:INTERFACE_MOTION.easeClose,fill:'forwards'});
          await animation.finished;
          if(cancelled||!here())return;
          veil.style.opacity='1';animation.cancel();animation=null;
          open();opened=true;
          // The old lobby has its own 100ms exit. Hide it under the opaque midpoint,
          // once the actual duel is ready, so two surfaces never show through the reveal.
          const game=document.getElementById('game');if(game&&!game.hidden)source.hidden=true;
          veil.style.pointerEvents='none';veil.dataset.phase='in';
          animation=veil.animate([{opacity:1},{opacity:0}],{duration:CHALLENGE_HANDOFF_MS/2,easing:INTERFACE_MOTION.easeOpen,fill:'forwards'});
          await animation.finished;
        }catch(error){if(!cancelled)throw error;}
        finally{
          animation?.cancel();observer.disconnect();
          document.removeEventListener('keydown',keys,true);document.removeEventListener('visibilitychange',visibility);
          if(here())source.inert=wasInert;
          if(!opened&&here()&&focus?.isConnected)focus.focus({preventScroll:true});
          veil.remove();
        }
      };
      pending=perform().finally(()=>{pending=null;});return pending;
    },
  };
}
