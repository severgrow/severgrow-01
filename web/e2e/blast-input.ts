/** Actual mouse/touch input for paired Bombs and cockpit recipe drags. No production calls. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit, type Page } from 'playwright-core';
import { apply, coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import { tutorialChapterById } from '../src/logic/tutorial-script.js';
import { kindOf } from '../src/logic/interaction.js';
import { positionSave } from './position.js';
import { seedSettings, SETTINGS_PREFIXES } from './helpers/settings-seed.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { servePreview } from './helpers/preview-port.js';
import { captureWebKitTouch } from './helpers/webkit-touch.js';
const shots=process.env.SHOTS??'/tmp/blast-input';mkdirSync(shots,{recursive:true});
const fixture=await servePreview(4267,{logLevel:'error'});
const ios=process.env.BLAST_WEBKIT==='1';
const wk=ios?captureWebKitTouch():null;
const browser=await (ios?webkit:chromium).launch(ios?{}:{executablePath:process.env.PW_CHROMIUM??chromium.executablePath(),args:['--no-sandbox','--disable-webgl']});
const base=tutorialChapterById('blast');
const state={...base,hands:[[...base.hands[0].filter(c=>c.suit===null),{id:4101,suit:0 as const,rank:3},{id:4102,suit:1 as const,rank:3},{id:4103,suit:2 as const,rank:3}],base.hands[1]] as typeof base.hands};
const legal=legalActions(viewFor(state,0));const blast=legal.find(a=>a.t==='MegaBomb')!;
if(blast.t!=='MegaBomb')throw Error('Blast missing');
const [first,second]=blast.cards;const kind=kindOf(blast)!;
const boardKey=coordKey(blast.target);
const empty=Object.entries(state.board).find(([k,t])=>!t&&state.terrain[k]==='normal')![0];
const point=async(p:Page,selector:string)=>p.evaluate(sel=>{
 const e=document.querySelector<HTMLElement>(sel);if(!e)throw Error('Missing '+sel);
 // Tile illustrations spill outside the rule hex. The SVG group bounds are visual, not
 // clickable geometry, so sample the fixed hex path while keeping the original target.
 const core=e.matches('.hex-cell')?e.querySelector(':scope > path.hex')??e:e;
 const r=core.getBoundingClientRect();
 for(const fy of [.3,.15,.5,.7,.9])for(const fx of [.5,.25,.75,.1,.9]){
  const x=r.left+r.width*fx,y=r.top+r.height*fy;
  if(document.elementFromPoint(x,y)?.closest(sel)===e)return {x,y};
 }
 throw Error('No exposed point '+sel);
},selector);
const tap=async(p:Page,selector:string,touch:boolean)=>{const q=await point(p,selector);if(touch)await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);};
const startDrag=async(p:Page,sel:string,to:{x:number;y:number},touch:boolean)=>{
 await p.evaluate(()=>{(window as any).__inputTrace=[];for(const t of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchend','touchcancel'])document.addEventListener(t,e=>{const v=e as PointerEvent;(window as any).__inputTrace.push({t,target:(e.target as HTMLElement)?.id,pointer:v.pointerId,x:v.clientX,y:v.clientY});},{capture:true});});
 const a=await point(p,sel),session=touch?(ios?wk!.session:await p.context().newCDPSession(p)):null;
 if(touch)assert(session,'the real WebKit tap captured its touch transport');
 const send=(type:string,points:{x:number;y:number;id:number}[])=>session!.send('Input.dispatchTouchEvent',{type,touchPoints:ios?points.map(q=>({...q,x:Math.round(q.x),y:Math.round(q.y)})):points});
 if(touch)await send('touchStart',[{...a,id:1}]);else{await p.mouse.move(a.x,a.y);await p.mouse.down();}
 for(let n=1;n<=18;n++){
  const q={x:a.x+(to.x-a.x)*n/18,y:a.y+(to.y-a.y)*n/18};
  if(touch)await send('touchMove',[{...q,id:1}]);else await p.mouse.move(q.x,q.y);
  await p.waitForTimeout(18);
 }
 return async()=>{if(touch)await send('touchEnd',ios?[{...to,id:1}]:[]);else await p.mouse.up();if(session&&!ios)await session.detach();};
};
try{
 for(const width of [390,1440]){
  const touch=width<500;
  const open=async()=>{
   const p=await browser.newPage({viewport:{width,height:touch?844:900},hasTouch:touch,isMobile:touch});
   await seedSettings(p,{sound:false,music:false,coach:false,autoSkip:false,reduceMotion:false,speed:'normal',eyeCandy:false});
   await p.addInitScript(({save,prefixes})=>{(window as any).__name=(f:unknown)=>f;for(const prefix of prefixes)localStorage.setItem(prefix+'severgrow.save.v7',save);},{save:positionSave({state,coach:{step:99,taught:[],known:[],choice:0,summaryDone:true}}),prefixes:[...SETTINGS_PREFIXES]});
   await p.goto(fixture.url);await resumeSavedGame(p);await p.waitForFunction(()=>!(window as any).__severgrow.busy()&&!document.getElementById('game')?.hidden);await p.waitForTimeout(250);return p;
  };
  const pair=async(p:Page)=>{
   await tap(p,`#hand [data-card="${first}"]`,touch);
   assert.equal(await p.evaluate(()=>(window as any).__severgrow.sel().card),first);
   await tap(p,`#hand [data-card="${second}"]`,touch);
   await p.waitForFunction(k=>(window as any).__severgrow.sel().kind===k,kind);
   assert.equal(await p.locator('#smart-bloom-button').getAttribute('data-kind'),kind,'the cockpit shows the selected Blast rather than the longest Bloom');
   assert.equal(await p.locator('#smart-bloom-button .futa04-mini-card').count(),2);
  };
  {
   const p=await open();await pair(p);await p.screenshot({path:`${shots}/paired-${width}.png`});
   const picked=await p.locator(`#hand [data-card="${first}"],#hand [data-card="${second}"]`).evaluateAll(es=>es.map(e=>getComputedStyle(e).getPropertyValue('--lift')));
   assert.equal(picked[0],picked[1],'both Bombs lift together');
   const selectedSurfaces=await p.locator(`#hand [data-card="${first}"],#hand [data-card="${second}"]`).evaluateAll(es=>es.map(e=>{
     const style=getComputedStyle(e);return {border:style.borderTopColor,outline:style.outlineStyle,glow:style.boxShadow};
   }));
   assert(selectedSurfaces.every(s=>s.border==='rgba(0, 0, 0, 0)'&&s.outline==='none'&&s.glow.includes('143, 211, 201')),
     'selected Bombs have one aqua glow around the card with no second contour');
   await tap(p,`#board .hex-cell[data-key="${boardKey}"]`,touch);
   await p.waitForFunction(ids=>{const h=(window as any).__severgrow;return !h.busy()&&ids.every(id=>!h.state().hands[0].some((c:any)=>c.id===id));},blast.cards).catch(async error=>{const trace=await p.evaluate(()=>({events:(window as any).__inputTrace,ghost:document.querySelector('.drag-ghost')?.outerHTML.slice(0,300),selection:(window as any).__severgrow.sel(),busy:(window as any).__severgrow.busy(),touch:getComputedStyle(document.getElementById('smart-bloom-button')!).touchAction,dim:document.getElementById('smart-bloom-button')?.hasAttribute('data-drag-dim')}));throw new Error('Native Blast trace '+JSON.stringify(trace),{cause:error});});
   assert.deepEqual(await p.evaluate(()=>(window as any).__severgrow.state().board),apply(state,blast).board);
   console.log('PASS',width,'Bomb + Bomb selects Blast; one target tap plays it');await p.close();
  }
  {
   const p=await open();await pair(p);const to=await point(p,`#board .hex-cell[data-key="${boardKey}"]`);
   const release=await startDrag(p,'#smart-bloom-button',to,touch);
   await p.screenshot({path:`${shots}/aiming-${width}.png`});await release();
   await p.waitForFunction(ids=>{const h=(window as any).__severgrow;return !h.busy()&&ids.every(id=>!h.state().hands[0].some((c:any)=>c.id===id));},blast.cards).catch(async error=>{const trace=await p.evaluate(()=>({events:(window as any).__inputTrace,ghost:document.querySelector('.drag-ghost')?.outerHTML.slice(0,300),selection:(window as any).__severgrow.sel(),busy:(window as any).__severgrow.busy(),touch:getComputedStyle(document.getElementById('smart-bloom-button')!).touchAction,dim:document.getElementById('smart-bloom-button')?.hasAttribute('data-drag-dim')}));throw new Error('Native Blast trace '+JSON.stringify(trace),{cause:error});});
   assert.deepEqual(await p.evaluate(()=>(window as any).__severgrow.state().board),apply(state,blast).board);
   await p.screenshot({path:`${shots}/played-${width}.png`});
   console.log('PASS',width,'cockpit drag lands on the exact pointer tile and spends two Bombs');await p.close();
  }
  for(const cancel of ['outside','escape'] as const){
   const p=await open();await pair(p);const to=cancel==='outside'?{x:width/2,y:75}:await point(p,`#board .hex-cell[data-key="${boardKey}"]`);
   const release=await startDrag(p,'#smart-bloom-button',to,touch);if(cancel==='escape')await p.keyboard.press('Escape');await release();await p.waitForTimeout(350);
   assert.deepEqual(await p.evaluate(()=>(window as any).__severgrow.state().board),state.board);
   assert.equal(await p.locator('.drag-ghost').count(),0);if(cancel==='escape')assert(!(await p.locator('#sheet-menu').isVisible()),'Escape cancels the drag without opening the pause menu');assert.equal(await p.locator('#hand [data-drag-dim]').count(),0);
   console.log('PASS',width,cancel,'cancels without spending cards or leaving a drag');await p.close();
  }
  {
   const p=await open();await pair(p);await tap(p,`#hand [data-card="${first}"]`,touch);
   assert.equal(await p.evaluate(()=>(window as any).__severgrow.sel().kind),null,'tapping a selected Bomb puts down the pair');await p.close();
  }
  {
   const p=await open();const hasRim=await p.locator('#board .hex-cell.normal .default-cell-rim').count();assert.equal(hasRim,0);
   const stroke=await p.locator(`#board .hex-cell[data-key="${empty}"] > .hex`).evaluate(e=>getComputedStyle(e).stroke);assert.equal(stroke,'none');
   console.log('PASS',width,'empty ground has no contour; target hitboxes remain');await p.close();
  }
 }
}finally{await browser.close();await fixture.server.close();}
