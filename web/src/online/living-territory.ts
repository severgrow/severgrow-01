import { enterSurface,exitSurface,resetSurface } from '../ui/interface-motion.js';
import { LIVING_TERRITORY_CSS } from './living-territory-css.js';

type Hooks={menu:HTMLElement;screen:HTMLElement;preview:()=>void;stop:()=>void};
/** Presentation only. The existing WorldView owns every tile, camera, gesture and network refresh. */
export const mountLivingTerritory=(hooks:Hooks)=>{
 const {menu,screen}=hooks;
 if(!document.getElementById('living-territory-css')){
  const style=document.createElement('style');style.id='living-territory-css';style.textContent=LIVING_TERRITORY_CSS;document.head.append(style);
 }
 menu.dataset.livingWorld='';
 let mode:'menu'|'world'|'off'='off',generation=0;
 const set=(next:typeof mode)=>{
  mode=next;generation++;
  screen.dataset.livingTerritory=next;
  screen.inert=next!=='world';
  if(next==='world')screen.removeAttribute('aria-hidden');else screen.setAttribute('aria-hidden','true');
 };
 // PLAY and future menu doorways may hide the main menu without changing the board screen.
 // Observe only that one attribute; never paint a backdrop over an unrelated destination.
 new MutationObserver(()=>{
  if(menu.hidden&&mode==='menu'){set('off');screen.hidden=true;hooks.stop();}
 }).observe(menu,{attributes:true,attributeFilter:['hidden']});
 return {
  menu(visible:boolean){
   if(!visible){
    if(mode!=='off'){
     const leaving=mode==='world'&&screen.dataset.ixState==='closing';
     set('off');if(!leaving)screen.hidden=true;hooks.stop();
    }
    return;
   }
   const returning=mode==='world';
   set('menu');
   // Cancel an interrupted menu exit before it can hide a newly returned menu.
   if(menu.dataset.ixState==='closing')resetSurface(menu);
   menu.hidden=false;menu.inert=false;
   resetSurface(screen);screen.inert=true;screen.hidden=true;
   hooks.preview();
   if(returning)document.getElementById('menu-world')?.focus({preventScroll:true});
  },
  open(){
   const fromMenu=mode==='menu'&&!menu.hidden;
   set('world');const turn=generation;
   resetSurface(screen);screen.hidden=false;screen.inert=false;
   if(fromMenu){
    exitSurface(menu,{onDone:()=>{if(mode==='world'&&turn===generation){menu.hidden=true;resetSurface(menu);}}});
   }else{resetSurface(menu);menu.hidden=true;enterSurface(screen,{travel:6});}
   document.getElementById('online-world-back')?.focus({preventScroll:true});
  },
  hide(){set('off');screen.hidden=true;resetSurface(menu);hooks.stop();},
  update(){if(mode==='menu')hooks.preview();},
  /** Restore the settled presentation on tab/PWA resume; no animation may hide the current screen. */
  settle(){
   if(mode==='world'){generation++;menu.hidden=true;resetSurface(menu);resetSurface(screen);screen.hidden=false;screen.inert=false;}
   else if(mode==='menu'){menu.hidden=false;resetSurface(menu);enterSurface(menu,{duration:0});screen.hidden=true;screen.inert=true;}
  },
 };
};
