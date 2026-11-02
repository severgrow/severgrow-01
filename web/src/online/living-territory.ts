import { INTERFACE_MOTION, enterSurface, exitSurface, interfaceMotionAllowed, resetSurface } from '../ui/interface-motion.js';
import { LIVING_TERRITORY_CSS, MENU_MAP_OPACITY } from './living-territory-css.js';

type Hooks = { menu: HTMLElement; screen: HTMLElement; preview: () => void; stop: () => void };

export const mountLivingTerritory=(hooks:Hooks)=>{
 const {menu,screen}=hooks;
 if(!document.getElementById('living-territory-css')){
  const style=document.createElement('style');style.id='living-territory-css';style.textContent=LIVING_TERRITORY_CSS;document.head.append(style);
 }
 menu.dataset.livingWorld='';
 /** The floor of the arrival's dip: low enough that the crop and the slide cannot be read, high
  * enough that the map never blinks out. An internal value, not a token. */
 const DIP=0.1;
 let mode:'menu'|'world'|'off'='off',generation=0;
 /** A Back tap during the panel's own exit must not restart it (a second dim from full light). */
 let leaving=false;
 /** The menu's rendered view, captured at the moment the Territory is requested. `enter()` uses it
  * to continue the SAME map from the pixel the player was looking at (see below). */
 let menuView:{box:number[];rect:DOMRect}|null=null;
 /** The two beats that must be able to cancel each other: the handoff and the map's light. */
 let settleBeat:Animation|null=null,lightBeat:Animation|null=null;
 const stop=(beat:Animation|null):null=>{if(beat)try{beat.cancel();}catch{/* already gone */}return null;};
 const clearBeats=()=>{settleBeat=stop(settleBeat);lightBeat=stop(lightBeat);leaving=false;};
 /**
  * UNDER REDUCE MOTION NOTHING MAY ANIMATE — including CSS transitions. The map carries an opacity
  * `transition` in `living-territory-css.ts`; flipping `data-living-territory` re-applies that rule
  * to the same SVG, so the browser synthesises a CSSTransition even though every JS beat was
  * skipped. `getAnimations()` sees those too, so the suite caught a return that still animated while
  * the JS believed it was instant (owner's rule: Reduce motion = instant). Cancelling here — before
  * the attribute swap — makes the reduce path provably instant instead of relying on the CSS opt-out
  * winning a cascade race in every engine.
  */
 const cutTransitions=()=>{
  if(interfaceMotionAllowed())return;
  for(const el of [mapOf(),gridOf(),screen,...screen.querySelectorAll('*')]){
   if(!el||typeof (el as Element).getAnimations!=='function')continue;
   for(const a of (el as Element).getAnimations()){try{a.cancel();}catch{/* already finished */}}
  }
 };
 const mapOf=()=>screen.querySelector<SVGSVGElement>('#online-world-grid .world-map-svg');
 const gridOf=()=>screen.querySelector<HTMLElement>('#online-world-grid');
 const set=(next:'menu'|'world'|'off')=>{
  cutTransitions();
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
 /**
  * THE RETURN JOURNEY (owner, 2026-11-02: "going back to main menu from territory too"). The panel
  * must not hard-cut back to the menu's full-bleed view. The map's light is taken down over one
  * close beat while the frame's skin leaves with it; the geometry then returns to the menu's own
  * framing while the map is at its dimmest, so the reversed crop is never seen at full brightness.
  * `done` runs at that moment and the menu's own arrival continues the beat. Reduce motion (no
  * `beat`) or a panel that is not up: straight to `done`, no animation.
  */
 const leave=(done:()=>void,beat:{duration:number;easing:string}|null)=>{
  if(mode!=='world'||leaving){if(mode!=='world')done();return;}
  leaving=true;
  const turn=generation;
  clearBeats();
  screen.classList.add('living-leaving');
  const map=mapOf();
  const finish=()=>{
   if(turn!==generation){leaving=false;return;}
   leaving=false;
   screen.classList.remove('living-leaving');
   done();
   // The map is in the menu's framing now; hand its light back with the last short fade. Reduce
   // motion gets none of this: the menu is simply there, at its own rest value.
   if(!map||!beat)return;
   const played=map.animate([{opacity:String(DIP)},{opacity:String(MENU_MAP_OPACITY)}],
     {duration:INTERFACE_MOTION.close,easing:INTERFACE_MOTION.easeOpen,fill:'both'});
   lightBeat=played;
   played.finished.then(()=>{if(lightBeat===played)lightBeat=stop(lightBeat);}).catch(()=>undefined);
  };
  if(!map||!beat){finish();return;}
  const dim=map.animate([{opacity:'1'},{opacity:String(DIP)}],
   {duration:beat.duration,easing:beat.easing,fill:'both'});
  lightBeat=dim;
  dim.finished.then(finish).catch(()=>undefined);
 };
 return {
  menu(visible:boolean){
   menuView=null;
   if(!visible){
    if(mode!=='off'){
     const closing=mode==='world'&&screen.dataset.ixState==='closing';
     clearBeats();screen.classList.remove('living-leaving');
     set('off');if(!closing)screen.hidden=true;hooks.stop();
    }
    return;
   }
   const returning=mode==='world';
   clearBeats();screen.classList.remove('living-leaving');
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
   const svg=mapOf();
   menuView=fromMenu&&svg?{box:(svg.getAttribute('viewBox')??'').split(/\s+/).map(Number),rect:svg.getBoundingClientRect()}:null;
   clearBeats();screen.classList.remove('living-leaving');
   set('world');const turn=generation;
   resetSurface(screen);screen.hidden=false;screen.inert=false;
   if(fromMenu){
    exitSurface(menu,{onDone:()=>{if(mode==='world'&&turn===generation){menu.hidden=true;resetSurface(menu);}}});
   }else{resetSurface(menu);menu.hidden=true;enterSurface(screen,{travel:INTERFACE_MOTION.screen});}
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
   * makes the first animated frame identical to the last menu frame.
   *
   * THE JUMP (measured 2026-11-02): that first frame was geometrically right — the player's own
   * tile did not move by so much as 0.01px — and it still read as a jump. The map's PAINT BOX leads
   * the panel's WINDOW by (dx,dy) while it slides home: 102px on a 390x844 phone, 41px at 320x568,
   * 66px on a 1440x1000 desktop, 72x41px in landscape. For those frames the panel's own glass shows
   * through at one edge and the map's opposite edge is clipped away, and the map is already at 26%
   * opacity and climbing — so the window appears to snap. So the map's LIGHT is now tied to its
   * geometry: it holds the menu's dim value for the first third of the beat (easeOpen has already
   * spent ~87% of the travel by then), dips, and only then comes up to full inside a settled frame.
   * Transform + opacity only: no filter, no per-frame layout read, and the screen is already live
   * underneath, so it never delays a tap.
   */
  enter(){
   const from=menuView;menuView=null;
   if(!from)return;
   const grid=gridOf();
   const map=mapOf();
   if(!grid||!map)return;
   const to=(map.getAttribute('viewBox')??'').split(/\s+/).map(Number);
   const frame=grid.getBoundingClientRect();
   if(from.box.length!==4||to.length!==4||!(frame.width>0)||!(frame.height>0))return;
   const mm=from.box[2]!/from.rect.width;   // the menu's world-units-per-px
   const mt=to[2]!/frame.width;             // the panel's (they differ only when the world fit caps one)
   if(!(mm>0)||!(mt>0))return;
   const reduce=!interfaceMotionAllowed();
   // The panel's head is the second thing that lands: one short beat after the map, never before.
   const head=screen.querySelector<HTMLElement>('.online-head');
   if(head){resetSurface(head);if(!reduce)enterSurface(head,{travel:-INTERFACE_MOTION.travel,delay:INTERFACE_MOTION.stagger});}
   if(reduce)return;
   // A pure translate when the two views share a material scale; when the world fit caps the
   // panel (a very tall screen), the same formula plus the matching scale keeps the pixels exact.
   const s=mt/mm;
   const dx=(to[0]!-from.box[0]!)/mm+(from.rect.left-frame.left)+(frame.width/2)*(s-1);
   const dy=(to[1]!-from.box[1]!)/mm+(from.rect.top-frame.top)+(frame.height/2)*(s-1);
   const hand=map.animate([{transform:`translate(${dx}px,${dy}px) scale(${s})`},{transform:'none'}],
     {duration:INTERFACE_MOTION.open,easing:INTERFACE_MOTION.easeOpen,fill:'both'});
   settleBeat=hand;
   hand.finished.then(()=>{if(settleBeat===hand)settleBeat=stop(settleBeat);}).catch(()=>undefined);
   const light=map.animate([
     {opacity:String(MENU_MAP_OPACITY),offset:0},
     {opacity:String(DIP),offset:.3,easing:INTERFACE_MOTION.easeClose},
     {opacity:'1',offset:1,easing:INTERFACE_MOTION.easeOpen},
   ],{duration:INTERFACE_MOTION.open,fill:'both',easing:'linear'});
   lightBeat=light;
   light.finished.then(()=>{if(lightBeat===light)lightBeat=stop(lightBeat);}).catch(()=>undefined);
  },
  /** The Back control: the panel leaves over its own beat, then `done` puts the menu back. */
  leave(done:()=>void){
   leave(done,interfaceMotionAllowed()?{duration:INTERFACE_MOTION.close,easing:INTERFACE_MOTION.easeClose}:null);
  },
  hide(){clearBeats();screen.classList.remove('living-leaving');menuView=null;set('off');screen.hidden=true;resetSurface(menu);hooks.stop();},
  update(){if(mode==='menu')hooks.preview();},
  /** Restore the settled presentation on tab/PWA resume; no animation may hide the current screen. */
  settle(){
   clearBeats();screen.classList.remove('living-leaving');menuView=null;
   if(mode==='world'){generation++;menu.hidden=true;resetSurface(menu);resetSurface(screen);screen.hidden=false;screen.inert=false;}
   else if(mode==='menu'){menu.hidden=false;resetSurface(menu);enterSurface(menu,{duration:0});screen.hidden=true;screen.inert=true;}
  },
 };
};
