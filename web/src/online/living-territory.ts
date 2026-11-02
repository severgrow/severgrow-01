import { INTERFACE_MOTION, enterSurface, exitSurface, interfaceMotionAllowed, resetSurface } from '../ui/interface-motion.js';
import { anchoredView } from './world-view.js';
import { LIVING_TERRITORY_CSS, MENU_MAP_OPACITY } from './living-territory-css.js';

type Hooks = { menu: HTMLElement; screen: HTMLElement; preview: () => void; stop: () => void;
 /** Hands the menu's last painted map (viewBox + measured box) to the shared WorldView before the
  * panel owns the CSS, so opening keeps the menu's exact pixels (see `anchoredView`). */
 anchor?: (box: readonly number[], rect: { left: number; top: number; width: number; height: number }) => void };

export const mountLivingTerritory=(hooks:Hooks)=>{
 const {menu,screen}=hooks;
 if(!document.getElementById('living-territory-css')){
  const style=document.createElement('style');style.id='living-territory-css';style.textContent=LIVING_TERRITORY_CSS;document.head.append(style);
 }
 menu.dataset.livingWorld='';
 /** The floor of the arrival's dip: low enough that the crop and the slide cannot be read, high
  * enough that the map never blinks out. An internal value, not a token. */
 const DIP=0.1;
 /**
  * WHERE THE COLOUR'S CLIMB BEGINS, as a fraction of `colourIn`. The map dips to `DIP` over the
  * first third of the 150ms geometry handoff (so the sliding crop is never lit), and from that
  * point the tiles' colour RISES for the rest of the owner's one second. Derived from the two
  * tokens, never measured or hand-picked.
  */
 const COLOUR_DIP_AT=0.3*(INTERFACE_MOTION.open/INTERFACE_MOTION.colourIn);

 let mode:'menu'|'world'|'off'='off',generation=0;
 /** A Back tap during the panel's own exit must not restart it (a second dim from full light). */
 let leaving=false;
 /** The menu's rendered view, captured at the moment the Territory is requested. `enter()` uses it
  * to continue the SAME map from the pixel the player was looking at (see below). */
 let menuView:{box:number[];rect:DOMRect}|null=null;
 /** The two beats that must be able to cancel each other: the handoff and the map's light. */
 let settleBeat:Animation|null=null,lightBeat:Animation|null=null;
 /** The in-flight exit's completion. A SECOND Back must finish the journey, never be swallowed —
  * measured on CI: two rapid back presses left `leaving` set, `done()` was never called, and the
  * menu stayed hidden (a stuck screen). */
 let leavingFinish:(()=>void)|null=null;
 const stop=(beat:Animation|null):null=>{if(beat)try{beat.cancel();}catch{/* already gone */}return null;};
 const clearBeats=()=>{settleBeat=stop(settleBeat);lightBeat=stop(lightBeat);leaving=false;leavingFinish=null;};
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
 /**
  * The menu's map rests at its own backdrop light. On the way back, any beat still on it — a CSS
  * transition the attribute flip just synthesised, or an interrupted colour ramp — is cancelled,
  * so a return can never leave a half-lit map behind. One call per return, never per frame.
  */
 const settleMap=()=>{
  const map=mapOf();if(!map)return;
  for(const a of map.getAnimations()){try{a.cancel();}catch{/* already finished */}}
 };

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
  * must not hard-cut back to the menu's full-bleed view. The tiles' colour is taken DOWN over the
  * owner's retreat (`colourOut`, 300ms) and only then does the geometry return to the menu's own
  * framing, so the reversed crop is never seen at full brightness. `done` runs at that moment and
  * the menu's own arrival continues the beat. Reduce motion (no `beat`), or a panel that is not up:
  * straight to `done`, no animation.
  *
  * The retreat begins at the tiles' PRESENT colour, never at a hard 1: a Back pressed during the
  * one-second arrival must continue downwards from there instead of flashing back to full first.
  */
 const leave=(done:()=>void,beat:{duration:number;easing:string}|null)=>{
  // A Back while a Back is already running COMPLETES that journey rather than being dropped: the
  // player asked to leave twice, and the second press must not leave them on a hidden screen.
  if(leaving&&leavingFinish){const finish=leavingFinish;leavingFinish=null;finish();return;}
  if(mode!=='world'){done();return;}
  const map=mapOf();
  // Read BEFORE the beats are cancelled: cancelling the arrival would snap the map back to its CSS
  // rest (full light) and the fade would start from a brightness the player never saw.
  const from=map?Number(getComputedStyle(map).opacity):MENU_MAP_OPACITY;
  leaving=true;
  const turn=generation;
  clearBeats();
  screen.classList.add('living-leaving');
  const finish=()=>{
   leavingFinish=null;
   if(turn!==generation){leaving=false;return;}
   leaving=false;
   screen.classList.remove('living-leaving');
   done();
  };
  // Already at (or below) the menu's own backdrop light: there is nothing to fade down, so the
  // retreat is one frame. This is the rapid open -> back case, and it must never delay the menu.
  if(!map||!beat||from<=MENU_MAP_OPACITY+0.02){finish();return;}
  leavingFinish=finish;
  // THE RETREAT IS ONE 300ms BEAT WITH A DIM LANDING (owner, 2026-11-02: "and 0.3s when going back
  // to main menu"). The colour goes down inside the panel's window, touches the dip just before the
  // framing returns, and settles on the menu's own backdrop light as it swaps — the reverse of the
  // arrival's dip, never a lit re-frame. The last keyframe is the menu's rest, so the backdrop is
  // exactly where the menu expects it when the attribute flips.
  const out=map.animate([
   {opacity:String(from),offset:0,easing:beat.easing},
   {opacity:String(DIP),offset:.9,easing:'linear'},
   {opacity:String(MENU_MAP_OPACITY),offset:1},
  ],{duration:beat.duration,fill:'both',easing:'linear'});
  out.id='living-colour-out';
  lightBeat=out;
  // A CANCELLED fade still completes the journey. `clearBeats()` cancels this beat (an arrival, a
  // reopen, a hide), and the old `.catch()` swallowed the rejection, so `finish()` never ran and the
  // menu could stay hidden. Cancellation is a reason to finish, not to stop.
  out.finished.then(finish,()=>{if(leaving&&turn===generation)finish();});
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
   // `leave()` owns the exit beat: it dims the map, then `finish()` re-frames the panel at the dim
   // value and hands the light back. Reaching here normally means that beat has completed (the menu
   // arrives after `done`), so this just settles the presentation. NOTE: an earlier attempt added a
   // special case here that jumped the map to DIP and re-framed on the next frame, to stop a "hard
   // cut" seen in CI; that cut was a SAMPLER artefact (rAF starved to ~1 sample/second in CI, so the
   // smooth dim was never observed), proven once the suite sampled on a timer instead. The jump made
   // the dim abrupt, so it is gone.
   clearBeats();screen.classList.remove('living-leaving');
   set('menu');
   // The map has finished its retreat; anything still on it (a CSS transition synthesised by the
   // attribute flip, a beat from an interrupted journey) would leave the backdrop half-lit.
   if(returning)settleMap();
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
   // THE MENU'S PIXELS ARE THE PANEL'S PIXELS (owner, 2026-11-02: "tiles don't move at all").
   // Hand the frame over BEFORE `set('world')` re-lays the grid, while the rect still describes the
   // full-bleed menu; `WorldView.open` (called immediately after this) turns it into the panel view.
   if(menuView)hooks.anchor?.(menuView.box,menuView.rect);
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
   * opacity — so the window appears to snap. So the map's LIGHT is now tied to its geometry: it dips
   * inside the first third of the handoff (easeOpen has already spent ~87% of the travel by then),
   * and from there the tiles' colour RISES for the owner's full second.
   *
   * ONE LAYER, NOT N TILES (owner, 2026-11-02, same evening: "make it the color of tiles fade in in
   * like 1 second or so"). The colour of the tiles is their fill multiplied by the map's own
   * `opacity`; that single track is what the menu already dims to `MENU_MAP_OPACITY`. So the fade
   * is one composited animation on the map SVG — never a per-tile loop, never a filter. Transform
   * (when the two views really differ) + opacity only, one layout read at the handoff, and the
   * screen is already live underneath, so it never delays a tap.
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
   // ZERO MOVEMENT IS THE POINT (owner, 2026-11-02: "tiles don't move at all ... not a smooth
   // settle"). The panel's viewBox is the menu's own mapping seen through the panel's box (see
   // `anchoredView`), so the handoff transform is the identity and must not be animated at all.
   // Compare the DRAWn box to that mapping instead of trusting a hand-rolled error term: the menu's
   // own `meet` letterbox (sub-pixel when its viewBox is reconciled to a rounded layout size) is
   // part of the real mapping, and `anchoredView` already carries it.
   const mapped=anchoredView({box:from.box,rect:{left:from.rect.left,top:from.rect.top,width:from.rect.width,height:from.rect.height}},
     {left:frame.left,top:frame.top,width:frame.width,height:frame.height});
   const still=!!mapped&&mapped.every((value,index)=>Math.abs(value-to[index]!)<=1e-6);
   if(!still){
    const hand=map.animate([{transform:`translate(${dx}px,${dy}px) scale(${s})`},{transform:'none'}],
      {duration:INTERFACE_MOTION.open,easing:INTERFACE_MOTION.easeOpen,fill:'both'});
    hand.id='living-handoff';
    settleBeat=hand;
    hand.finished.then(()=>{if(settleBeat===hand)settleBeat=stop(settleBeat);}).catch(()=>undefined);
   }
   // THE COLOUR COMES UP OVER THE OWNER'S SECOND, not the surface's 150ms beat. The dip stays
   // inside the 150ms geometry handoff (`COLOUR_DIP_AT`), so the moving crop is never lit; the rest
   // of the arrival is the tiles' fills climbing from DIP back to their saturated rest.
   const light=map.animate([
     {opacity:String(MENU_MAP_OPACITY),offset:0,easing:INTERFACE_MOTION.easeClose},
     {opacity:String(DIP),offset:COLOUR_DIP_AT,easing:'linear'},
     {opacity:'1',offset:1},
   ],{duration:INTERFACE_MOTION.colourIn,fill:'both',easing:'linear'});
   light.id='living-colour-in';
   lightBeat=light;
   light.finished.then(()=>{if(lightBeat===light)lightBeat=stop(lightBeat);}).catch(()=>undefined);
  },
  /** The Back control: the panel leaves over the owner's retreat, then `done` puts the menu back. */
  leave(done:()=>void){
   leave(done,interfaceMotionAllowed()?{duration:INTERFACE_MOTION.colourOut,easing:INTERFACE_MOTION.easeClose}:null);
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
