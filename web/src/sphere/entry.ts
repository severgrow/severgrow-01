import {FEATURES} from '../channel.js';
import {SPHERE_TEST} from '../../../src/strings.js';
import type {openSphere} from './view.js';
/** The heavy geometry and renderer load only after a deliberate tap. */
export const mountSphereTest=()=>{
  if(!FEATURES.sphereTest)return null;
  const anchor=document.getElementById('menu-world');if(!anchor)return null;
  const key=document.createElement('button');key.id='menu-sphere';key.type='button';key.className='btn ghost big';key.textContent=SPHERE_TEST.title;
  anchor.after(key);
  let view:ReturnType<typeof openSphere>|null=null,loaded=false;
  key.addEventListener('click',async()=>{
    if(view||key.disabled)return;key.disabled=true;key.setAttribute('aria-busy','true');
    try{
      const m=await import('./view.js');loaded=true;
      const play=document.getElementById('play-menu');
      if(document.getElementById('menu')?.hidden || (play&&!play.hidden))return;
      view=m.openSphere(key,()=>{view=null;});key.textContent=SPHERE_TEST.title;
    }catch{
      key.textContent=SPHERE_TEST.retry;
    }finally{key.disabled=false;key.removeAttribute('aria-busy');}
  });
  return {snapshot:()=>view?.snapshot()??{open:false,loaded,bytes:0,pendingFrame:false}};
};
