import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { allNeighbors, apply, coordKey, homeCoord, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { servePreview } from './helpers/preview-port.js';

const out=process.env.SHOTS??'/tmp/pile-strike-shots';mkdirSync(out,{recursive:true});
const {server,url}=await servePreview(0,{logLevel:'silent'});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
let passed=0;
const check=(name:string,value:unknown)=>{assert.ok(value,name);passed++;console.log(`PASS ${name}`);};
const seed=async(page:Page,state:State,reduced:boolean)=>{
  await page.addInitScript(({saved,reduced})=>{
    (window as any).__name=(f:unknown)=>f;
    for(const prefix of ['main2:','futa04:','futa05:']){
      localStorage.setItem(`${prefix}severgrow.save.v7`,saved);
      localStorage.setItem(`${prefix}severgrow.settings.v1`,JSON.stringify({sound:false,music:false,coach:false,speed:'normal',reduceMotion:reduced}));
    }
  },{saved:positionSave({state}),reduced});
  await page.goto(url);await page.waitForFunction(()=>(window as any).__severgrow?.ready?.()===true);
};
const resume=()=>{(document.getElementById('menu-continue') as HTMLButtonElement).click();};
const attackPosition=(blast:boolean):{state:State;action:Action}=>{
  const base=newGame(3107);const board={...base.board};
  const target=allNeighbors(homeCoord(1,base.config)).find(c=>board[coordKey(c)]===null&&allNeighbors(c).every(n=>coordKey(n) in board))!;
  assert(target,'fixture is inside the coast so all seven Blast hexes are visible');
  board[coordKey(target)]={owner:0,strength:7};
  for(const c of allNeighbors(target))if(board[coordKey(c)]===null)board[coordKey(c)]={owner:0,strength:4};
  const bombs:Card[]=Array.from({length:blast?2:1},(_,i)=>({id:2000+i,suit:null,rank:0}));
  const state:State={...base,board,actor:1,turnPlayer:1,phase:'ACT',hands:[base.hands[0],bombs]};
  const action=legalActions(viewFor(state,1)).find(a=>a.t===(blast?'MegaBomb':'PlayFruit')&&'target' in a&&coordKey(a.target)===coordKey(target));
  assert(action,'fixture has the real legal attack');return {state,action};
};
try{
  for(const [width,height] of [[390,844],[1280,800]] as const){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    const page=await context.newPage();const base=newGame(14);
    const bloom:State={...base,actor:0,turnPlayer:0,phase:'DRAW',hands:[[{id:3000,suit:0,rank:5},{id:3001,suit:1,rank:5},{id:3002,suit:3,rank:2}],base.hands[1]],discard:[{id:3003,suit:2,rank:5}]};
    await seed(page,bloom,true);await page.evaluate(resume);
    await page.waitForSelector('#discard.futa04-bloom-draw');await page.waitForFunction(()=>document.documentElement.classList.contains('futa04-card-art-ready'));
    await page.waitForTimeout(300);
    const glow=await page.locator('#discard-top').evaluate(e=>{const s=getComputedStyle(e);return {border:s.borderTopColor,shadow:s.boxShadow};});
    check(`${width}: Bloom has no CSS border`,glow.border==='rgba(0, 0, 0, 0)');
    check(`${width}: Bloom keeps its existing warm soft glow`,glow.shadow.includes('232, 180, 88')&&glow.shadow.includes('9px'));
    check(`${width}: Bloom has no spread-only frame`,!glow.shadow.split(/,(?![^()]*\))/).some(s=>/0px 0px 0px 1px/.test(s)));
    await page.screenshot({path:`${out}/bloom-no-frame-${width}.png`});await context.close();
    const emptyContext=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    const empty=await emptyContext.newPage();await seed(empty,{...base,actor:0,turnPlayer:0,phase:'DRAW',discard:[]},true);await empty.evaluate(resume);
    await empty.waitForSelector('#discard-top.empty');
    check(`${width}: empty Throw socket matches the card corner ratio`,await empty.locator('#discard-top').evaluate(e=>{const s=getComputedStyle(e);return s.borderTopStyle==='solid'&&Math.abs(parseFloat(s.borderTopLeftRadius)/parseFloat(s.width)-.075)<.003;}));
    await empty.screenshot({path:`${out}/empty-card-shape-${width}.png`});await emptyContext.close();
    for(const reduced of [false,true])for(const blast of [true,false]){
      const {state,action}=attackPosition(blast);const expected=apply(state,action);
      const c=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});const p=await c.newPage();
      const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await seed(p,state,reduced);
      const accepted=await p.evaluate(action=>{(document.getElementById('menu-continue') as HTMLButtonElement).click();return (window as any).__severgrow.playFor(action,1);},action);
      check(`${width} ${blast?'Blast':'Bomb'} reduced=${reduced}: real opponent move accepted`,accepted);
      // Capture in the browser's polling frame, not a second protocol round trip after a
      // short reduced-motion cue may already have expired. Normal artwork is paused for photos.
      const captured=await p.waitForFunction(reduced=>{
        const e=document.querySelector('.live-strike');if(!e)return null;
        (window as any).__severgrow.injectStall();
        const animations=e.getAnimations({subtree:true});
        if(!reduced)for(const a of animations){a.pause();a.currentTime=Number(a.effect?.getTiming().duration)*.28;}
        return {cards:e.querySelectorAll('.live-strike-card').length,area:e.querySelectorAll('.live-strike-area path').length,
          hidden:e.getAttribute('aria-hidden'),pointer:getComputedStyle(e).pointerEvents,animations:animations.length,
          state:(window as any).__severgrow.state() as State};
      },reduced);
      const seen=await captured.jsonValue();assert(seen);
      check('the artwork clearly distinguishes one and two Bomb cards',seen.cards===(blast?2:1));
      check('the impact footprint matches the replay',seen.area===(blast?7:1));
      assert.deepEqual(seen.state.board,expected.board,'the real engine board matches apply');
      const spent=action.t==='MegaBomb'?action.cards:action.t==='PlayFruit'?[action.card]:[];
      check('visuals preserve authoritative board and spent card IDs',seen.state.hands[1].every((card:Card)=>!spent.includes(card.id)));
      check('the cue is pointer-transparent and decorative',seen.hidden==='true'&&seen.pointer==='none');
      check('reduced motion is static; normal cues are finite',reduced?seen.animations===0:seen.animations===2);
      await p.screenshot({path:`${out}/${blast?'blast':'bomb'}-${width}${reduced?'-reduced':''}.png`});
      if(!reduced){
        await p.locator('.live-strike').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>{a.currentTime=Number(a.effect?.getTiming().duration)*.42;}));
        await p.screenshot({path:`${out}/${blast?'blast':'bomb'}-${width}-burst.png`});
      }
      if(width===390&&!reduced&&blast){
        await p.locator('.live-strike').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.play()));
        await p.evaluate(()=>(window as any).__severgrow.releaseStall());
        await p.waitForFunction(()=>!document.querySelector('.live-strike'));
        check('the cue cleans itself up after the finite beat',true);
      }else{
        await p.keyboard.press('Escape');await p.evaluate(()=>(window as any).__severgrow.releaseStall());await p.waitForTimeout(80);
        check('skipping removes the cue immediately',await p.locator('.live-strike').count()===0);
      }
      check('no browser exceptions',errors.length===0);await c.close();
    }
  }
  // Interrupt BEFORE a Bomb lands: an obsolete async continuation must never create a
  // fresh cue after fast-forward has already cleared the effects layer.
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await c.newPage();const {state,action}=attackPosition(false);
  await seed(p,state,false);
  await p.evaluate(action=>{(document.getElementById('menu-continue') as HTMLButtonElement).click();(window as any).__severgrow.playFor(action,1);},action);
  await p.waitForSelector('.flyer.card.opp');await p.keyboard.press('Escape');
  await p.waitForTimeout(350);
  check('interrupting before Bomb impact never resurrects a stale cue',await p.locator('.live-strike').count()===0);
  await c.close();
  console.log(`${passed} pile / opponent strike checks passed`);
}finally{await browser.close();await server.httpServer.close();}
