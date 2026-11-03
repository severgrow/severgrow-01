import {SPHERE_TEST as W} from '../../../src/strings.js';
import {enterSurface,interfaceMotionAllowed,INTERFACE_MOTION} from '../ui/interface-motion.js';
import {buildSphere,pickCell,unit,type Sphere,type V3} from './geometry.js';
import {arcQuat,inverse,multiply,rotate,slerp,trackball,type Quat} from './rotation.js';
import {mockOwnership,MOCK_PLAYERS} from './ownership.js';
import {SphereRenderer,EYE,focal} from './renderer.js';
let mesh:Sphere|undefined;
const clampZoom=(z:number)=>Math.max(1,Math.min(3.2,z));
const CSS=`
.sphere-test {position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;background:radial-gradient(ellipse at 42% 36%,#161c16,#090d0b 68%);color:#eee5cf;
 padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));font-family:var(--font-ui,'Fragment Mono',monospace)}
.sphere-test-head {height:50px;flex:none;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:12px;padding:0 4px}
.sphere-test-head h1 {margin:0;font:inherit;font-size:.78rem;letter-spacing:.2em;text-align:center;font-weight:400}
.sphere-test-key {width:44px;height:44px;border:0;border-radius:10px;background:none;color:inherit;padding:10px;cursor:pointer}
.sphere-test-key svg {width:24px;height:24px;display:block}
.sphere-test-key:focus-visible {outline:2px solid #e8ddc5;outline-offset:-3px}
.sphere-test-stage {position:relative;flex:1;min-height:0}
.sphere-test-canvas {width:100%;height:100%;display:block;touch-action:none;cursor:grab;outline:0}
.sphere-test-canvas:active {cursor:grabbing}
.sphere-test-canvas:focus-visible {outline:1px solid #e8ddc54d;outline-offset:-8px;border-radius:14px}
.sphere-test-readout {min-height:34px;margin:0;flex:none;display:flex;align-items:center;justify-content:center;gap:9px;color:#e8ddc59e;font-size:.64rem;letter-spacing:.16em;font-variant-numeric:tabular-nums}
.sphere-test-readout i {width:6px;height:6px;border-radius:50%;background:var(--sphere-ink)}
.sphere-test-fallback {position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:.8rem;line-height:1.7;color:#e8ddc5a6}
.sphere-test-fallback[hidden],.sphere-test-canvas[hidden] {display:none}
`;
export const openSphere=(trigger:HTMLButtonElement,onClose:()=>void)=>{
  const sphere=mesh??=buildSphere(),mock=mockOwnership(sphere),menu=document.getElementById('menu')!;
  const oldInert=menu.inert,oldAria=menu.getAttribute('aria-hidden');
  // Keep the living menu's actual layout, camera and canvas untouched underneath.
  menu.inert=true;menu.setAttribute('aria-hidden','true');
  const root=document.createElement('section');root.className='sphere-test';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',W.title);
  root.innerHTML=`<style>${CSS}</style><header class="sphere-test-head"><button class="sphere-test-key sphere-test-back" type="button" aria-label="${W.back}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14.5 5-7 7 7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h1>${W.title}</h1><button class="sphere-test-key sphere-test-home" type="button" aria-label="${W.home}" title="${W.home}" style="color:${MOCK_PLAYERS[0].colour.css}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9Z" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg></button></header><div class="sphere-test-stage"><canvas class="sphere-test-canvas" tabindex="0" role="application" aria-label="${W.controls}"></canvas><p class="sphere-test-fallback" hidden></p></div><p class="sphere-test-readout" aria-live="polite"></p>`;
  document.body.append(root);
  document.dispatchEvent(new Event('futasaku:test-surface'));
  const canvas=root.querySelector<HTMLCanvasElement>('canvas')!,stage=root.querySelector<HTMLElement>('.sphere-test-stage')!;
  const readout=root.querySelector<HTMLElement>('.sphere-test-readout')!,fallback=root.querySelector<HTMLElement>('.sphere-test-fallback')!;
  const back=root.querySelector<HTMLButtonElement>('.sphere-test-back')!,home=root.querySelector<HTMLButtonElement>('.sphere-test-home')!;
  const abort=new AbortController(),signal=abort.signal;
  let renderer:SphereRenderer|undefined,disposed=false,lost=false,raf=0,lastFrame=0;
  let resolution=1,slowFrames=0,resolutionDrops=0;
  let q:Quat=arcQuat(mock.home,[0,0,1]),zoom=1,targetZoom=1,selected:number|null=null,pulseUntil=0;
  let rect=stage.getBoundingClientRect(),speed=0,axis:V3=[0,1,0],lastMove=0,lastBall:V3=[0,0,1];
  let start:{x:number;y:number}|null=null,dragged=false,multi=false,pinchDistance=0;
  const pointers=new Map<number,{x:number;y:number}>();
  let flight:{start:Quat;end:Quat;at:number}|null=null;
  const motion=()=>interfaceMotionAllowed();
  const ask=()=>{if(!raf&&!disposed&&!lost&&!document.hidden)raf=requestAnimationFrame(frame);};
  const stop=()=>{speed=0;flight=null;targetZoom=zoom;};
  const ball=(p:{x:number;y:number})=>trackball(p.x-rect.left-rect.width/2,p.y-rect.top-rect.height/2,Math.min(rect.width,rect.height)*.41*zoom);
  const distance=()=>{const [a,b]=[...pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
  const choose=(x:number,y:number)=>{
    if(!renderer||lost)return;
    rect=stage.getBoundingClientRect();
    const aspect=canvas.width/canvas.height,f=focal(aspect,zoom),inv=inverse(q),origin=rotate(inv,[0,0,EYE]);
    const direction=rotate(inv,unit([((x-rect.left)/rect.width*2-1)*aspect/f,(1-(y-rect.top)/rect.height*2)/f,-1]));
    const id=pickCell(sphere,origin,direction);if(id===null)return;
    selected=id;pulseUntil=motion()?performance.now()+360:0;
    const owner=mock.owners[id]!,name=owner>=0?MOCK_PLAYERS[owner]!.name:owner===-2?W.unknown:W.unoccupied;
    readout.replaceChildren();
    if(owner>=0){const dot=document.createElement('i');dot.style.setProperty('--sphere-ink',MOCK_PLAYERS[owner]!.colour.css);dot.setAttribute('aria-hidden','true');readout.append(dot);}
    readout.append(document.createTextNode(`${name} · ${String(id+1).padStart(4,'0')}`));ask();
  };
  function frame(now:number){
    raf=0;if(disposed||lost||document.hidden)return;
    const gap=Math.max(1,now-(lastFrame||now-16)),dt=Math.min(32,gap);lastFrame=now;
    if(!motion()){speed=0;if(flight){q=flight.end;flight=null;}zoom=targetZoom;pulseUntil=0;}
    if(flight){const t=Math.min(1,(now-flight.at)/240);q=slerp(flight.start,flight.end,1-(1-t)**3);if(t===1)flight=null;}
    if(speed>0&&!pointers.size){const angle=speed*dt,s=Math.sin(angle/2);q=multiply([axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(angle/2)],q);speed*=Math.exp(-dt/175);if(speed<.00004)speed=0;}
    if(Math.abs(targetZoom-zoom)>.0005)zoom+=(targetZoom-zoom)*(1-Math.exp(-dt/55));
    if(Math.abs(targetZoom-zoom)<=.0005)zoom=targetZoom;
    const pulse=pulseUntil>now?Math.sin(Math.PI*(1-(pulseUntil-now)/360)):0;
    const continuing=!!flight||(speed>0&&!pointers.size)||Math.abs(targetZoom-zoom)>.0005||pulseUntil>now;
    // Only measured slow motion lowers raster resolution. Geometry, picking, controls and grain
    // remain unchanged; a single final frame restores full detail as soon as motion rests.
    slowFrames=continuing&&gap>42?slowFrames+1:0;
    if(slowFrames>=3&&resolution>.65){resolution=resolution>.8?.8:.65;resolutionDrops++;slowFrames=0;renderer?.resize(rect.width,rect.height,resolution);}
    renderer?.render(q,zoom,selected,pulse);
    if(continuing)ask();
    else if(resolution<1){resolution=1;renderer?.resize(rect.width,rect.height);ask();}
  }
  const resize=()=>{
    rect=stage.getBoundingClientRect();
    if(pointers.size===1){lastBall=ball([...pointers.values()][0]!);lastMove=performance.now();dragged=true;}
    if(pointers.size>1)pinchDistance=distance();
    if(rect.width&&rect.height){renderer?.resize(rect.width,rect.height,resolution);ask();}
  };
  const fail=()=>{fallback.textContent=W.unavailable;fallback.hidden=false;canvas.hidden=true;home.disabled=true;};
  const initialise=()=>{try{renderer=new SphereRenderer(canvas,sphere,mock.owners);lost=false;fallback.hidden=true;canvas.hidden=false;home.disabled=false;resize();}catch{fail();}};
  const close=()=>{
    if(disposed)return;disposed=true;abort.abort();observer.disconnect();cancelAnimationFrame(raf);raf=0;
    if(renderer)renderer.dispose(true);
    else canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
    root.remove();menu.inert=oldInert;
    document.dispatchEvent(new Event('futasaku:test-surface'));
    if(oldAria===null)menu.removeAttribute('aria-hidden');else menu.setAttribute('aria-hidden',oldAria);
    trigger.focus({preventScroll:true});onClose();
  };
  back.addEventListener('click',close,{signal});
  home.addEventListener('click',()=>{
    if(pointers.size||!renderer)return;stop();const end=multiply(arcQuat(rotate(q,mock.home),[0,0,1]),q);
    if(motion())flight={start:q,end,at:performance.now()};else q=end;ask();
  },{signal});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||lost||!renderer)return;e.preventDefault();canvas.focus({preventScroll:true});stop();lastFrame=0;
    rect=stage.getBoundingClientRect();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});try{canvas.setPointerCapture(e.pointerId);}catch{/* cancelled touch */}
    if(pointers.size===1){start={x:e.clientX,y:e.clientY};dragged=false;multi=false;lastBall=ball(start);lastMove=performance.now();}
    else{multi=true;dragged=true;pinchDistance=distance();}
  },{signal});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;e.preventDefault();const p={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,p);
    if(pointers.size>1){const d=distance();if(pinchDistance>0){zoom=targetZoom=clampZoom(zoom*d/pinchDistance);ask();}pinchDistance=d;return;}
    if(!dragged&&start&&Math.hypot(p.x-start.x,p.y-start.y)<6)return;
    dragged=true;const at=performance.now(),next=ball(p),step=arcQuat(lastBall,next),angle=2*Math.acos(Math.min(1,Math.abs(step[3])));
    q=multiply(step,q);axis=unit([step[0],step[1],step[2]]);speed=Math.min(.0035,angle/Math.max(8,at-lastMove));lastMove=at;lastBall=next;ask();
  },{signal});
  const release=(e:PointerEvent)=>{
    if(!pointers.has(e.pointerId))return;
    const tap=pointers.size===1&&!dragged&&!multi&&e.type==='pointerup';pointers.delete(e.pointerId);
    if(tap){speed=0;choose(e.clientX,e.clientY);}
    if(pointers.size===1){lastBall=ball([...pointers.values()][0]!);lastMove=performance.now();speed=0;}
    if(!pointers.size){if(e.type!=='pointerup'||!motion()||performance.now()-lastMove>70||speed<.001)speed=0;start=null;if(speed)ask();}
  };
  canvas.addEventListener('pointerup',release,{signal});canvas.addEventListener('pointercancel',release,{signal});
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId)){pointers.delete(e.pointerId);speed=0;start=null;}},{signal});
  canvas.addEventListener('wheel',e=>{e.preventDefault();speed=0;flight=null;const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rect.height:1);targetZoom=clampZoom(targetZoom*Math.exp(-pixels*.0015));if(!motion())zoom=targetZoom;ask();},{signal,passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();cancelAnimationFrame(raf);raf=0;fallback.textContent=W.restoring;fallback.hidden=false;},{signal});
  canvas.addEventListener('webglcontextrestored',()=>{renderer?.dispose();initialise();},{signal});
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==='Tab'){
      const keys=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),canvas:not([hidden])')];
      if((e.shiftKey&&document.activeElement===keys[0])||(!e.shiftKey&&document.activeElement===keys.at(-1))){e.preventDefault();(e.shiftKey?keys.at(-1):keys[0])?.focus();}return;
    }
    if(e.target!==canvas)return;
    const axes:Record<string,V3>={ArrowLeft:[0,-1,0],ArrowRight:[0,1,0],ArrowUp:[-1,0,0],ArrowDown:[1,0,0]};
    if(axes[e.key]){e.preventDefault();stop();const a=axes[e.key]!,s=Math.sin(.06);q=multiply([a[0]*s,a[1]*s,a[2]*s,Math.cos(.06)],q);ask();}
    else if(['+','=','-','0'].includes(e.key)){e.preventDefault();stop();targetZoom=e.key==='0'?1:clampZoom(zoom*(e.key==='-'?1/1.2:1.2));ask();}
    else if(e.key==='Home'){e.preventDefault();home.click();}else if(e.key==='Enter'){e.preventDefault();choose(rect.left+rect.width/2,rect.top+rect.height/2);}
  },{signal});
  document.addEventListener('visibilitychange',()=>{stop();cancelAnimationFrame(raf);raf=0;pulseUntil=0;if(!document.hidden){lastFrame=0;resize();}},{signal});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');reduced.addEventListener('change',()=>{stop();pulseUntil=0;ask();},{signal});
  const observer=new ResizeObserver(resize);observer.observe(stage);window.addEventListener('resize',resize,{signal,passive:true});
  initialise();enterSurface(root);back.focus({preventScroll:true});
  if(motion())canvas.animate([{opacity:0,translate:'0 3px'},{opacity:1,translate:'0 0'}],{duration:INTERFACE_MOTION.open,easing:INTERFACE_MOTION.easeOpen});
  return {close,snapshot:()=>({open:!disposed,ready:!!renderer&&!lost,q:[...q],zoom,selected,frames:renderer?.frames??0,pendingFrame:!!raf,
    bytes:renderer&&!renderer.disposed?renderer.bytes:0,resolution,resolutionDrops,cells:sphere.cells.length,home:[...mock.home],connected:mock.connected,
    pentagons:sphere.cells.filter(c=>c.corners.length===5).map(c=>({id:c.index,point:rotate(q,c.centre)})),fallback:!fallback.hidden})};
};
