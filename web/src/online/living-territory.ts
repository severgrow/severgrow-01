import { INTERFACE_MOTION, enterSurface, exitSurface, interfaceMotionAllowed, resetSurface } from '../ui/interface-motion.js';
import { LIVING_TERRITORY_CSS } from './living-territory-css.js';

type Hooks = { menu: HTMLElement; screen: HTMLElement; preview: () => void; stop: () => void };
/** Presentation only. The existing WorldView owns every tile, camera, gesture and network refresh. */
export const mountLivingTerritory=(hooks:Hooks)=>{
 const {menu,screen}=hooks;
 if(!document.getElementById('living-territory-css')){
  const style=document.createElement('style');style.id='living-territory-css';style.textContent=LIVING_TERRITORY_CSS;document.head.append(style);
 }
 menu.dataset.livingWorld='';
 let mode:'menu'|'world'|'off'='off',generation=0;
 /** The menu's rendered view, captured at the moment the Territory is requested. `enter()` uses it
  * to continue the SAME map from the pixel the player was looking at (see below). */
 let menuView:{box:number[];rect:DOMRect}|null=null;
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
   menuView=null;
   if(!visible){
    if(mode!=='off'){
     const closing=mode==='world'&&screen.dataset.ixState==='closing';
     set('off');if(!closing)screen.hidden=true;hooks.stop();
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
   const svg=screen.querySelector<SVGSVGElement>('#online-world-grid .world-map-svg');
   menuView=fromMenu&&svg?{box:(svg.getAttribute('viewBox')??'').split(/\s+/).map(Number),rect:svg.getBoundingClientRect()}:null;
   set('world');const turn=generation;
   resetSurface(screen);screen.hidden=false;screen.inert=false;
   if(fromMenu){
    exitSurface(menu,{onDone:()=>{if(mode==='world'&&turn===generation){menu.hidden=true;resetSurface(menu);}}});
   }else{resetSurface(menu);menu.hidden=true;enterSurface(screen,{travel:6});}
   // WHERE FOCUS GOES ON OPEN (owner, 2026-11-02: "on desktop entering territory there is a random
   // circle around 'back' until anything else is tapped — remove"). Focusing the round back key
   // painted its focus ring on a PROGRAMMATIC focus, which reads as a stray circle. So the open
   // focuses the SCREEN (the new region — what a screen reader should announce) and leaves the back
   // key alone; the first Tab press then walks the territory's own keys in order, ring and all.
   const screenEl = screen as HTMLElement;
   if (!screenEl.hasAttribute('tabindex')) screenEl.setAttribute('tabindex', '-1');
   screenEl.focus({ preventScroll: true });
  },
  /**
   * The menu's map does not hard-cut to the Territory's window (owner, 2026-11-02: "a smooth
   * slightly animated transition ... cropping down to the territory view"). Called after the
   * WorldView has framed the panel. The menu and the panel draw the SAME item at the SAME material
   * scale, so translating the panel's map by the difference between the two views' screen mapping
   * makes the first animated frame identical to the last menu frame; it then settles to rest on the
   * interface's own opening beat. The scale is 1 whenever both views share that material scale; it
   * differs only when the world fit caps one of them (a very tall screen), and then it is the exact
   * matching factor, not a decorative one. Transform only (plus the CSS opacity fade above): no
   * filter, no per-frame layout reads, and the screen is already live underneath, so it never
   * delays a tap. Reduce motion skips it whole.
   */
  enter(){
   const from=menuView;menuView=null;
   if(!from||!interfaceMotionAllowed())return;
   const grid=screen.querySelector<HTMLElement>('#online-world-grid');
   const map=grid?.querySelector<SVGSVGElement>('.world-map-svg');
   if(!grid||!map)return;
   const to=(map.getAttribute('viewBox')??'').split(/\s+/).map(Number);
   const frame=grid.getBoundingClientRect();
   if(from.box.length!==4||to.length!==4||!(frame.width>0)||!(frame.height>0))return;
   const mm=from.box[2]!/from.rect.width;   // the menu's world-units-per-px
   const mt=to[2]!/frame.width;             // the panel's (they differ only when the world fit caps one)
   if(!(mm>0)||!(mt>0))return;
   // A pure translate when the two views share a material scale; when the world fit caps the
   // panel (a very tall screen), the same formula plus the matching scale keeps the pixels exact.
   const s=mt/mm;
   const dx=(to[0]!-from.box[0]!)/mm+(from.rect.left-frame.left)+(frame.width/2)*(s-1);
   const dy=(to[1]!-from.box[1]!)/mm+(from.rect.top-frame.top)+(frame.height/2)*(s-1);
   map.animate([{transform:`translate(${dx}px,${dy}px) scale(${s})`},{transform:'none'}],
     {duration:INTERFACE_MOTION.open,easing:INTERFACE_MOTION.easeOpen});
  },
  hide(){menuView=null;set('off');screen.hidden=true;resetSurface(menu);hooks.stop();},
  update(){if(mode==='menu')hooks.preview();},
  /** Restore the settled presentation on tab/PWA resume; no animation may hide the current screen. */
  settle(){
   menuView=null;
   if(mode==='world'){generation++;menu.hidden=true;resetSurface(menu);resetSurface(screen);screen.hidden=false;screen.inert=false;}
   else if(mode==='menu'){menu.hidden=false;resetSurface(menu);enterSurface(menu,{duration:0});screen.hidden=true;screen.inert=true;}
  },
 };
};
