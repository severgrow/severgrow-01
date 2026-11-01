import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { newGame } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { servePreview } from './helpers/preview-port.js';

const {server,url}=await servePreview(0,{logLevel:'silent'});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
const out=process.env.SHOTS??'/tmp/pile-spacing-shots';mkdirSync(out,{recursive:true});
let checks=0;
try{
  for(const [width,height] of [[390,844],[320,568],[1280,800]] as const)for(const side of ['right','left'])for(const count of [3,2,7]){
    const c=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    const p=await c.newPage();const base=newGame(14);
    const saved=positionSave({state:{...base,actor:0,turnPlayer:0,phase:'DRAW',hands:[base.hands[0].slice(0,count),base.hands[1]]}});
    await p.addInitScript(({saved,side})=>{
      (window as any).__name=(f:unknown)=>f;
      localStorage.setItem('severgrow-thumb',JSON.stringify({thumb:true,side,idleTip:false}));
      for(const prefix of ['main2:','futa04:','futa05:']){
        localStorage.setItem(`${prefix}severgrow.save.v7`,saved);
        localStorage.setItem(`${prefix}severgrow.settings.v1`,JSON.stringify({sound:false,music:false,coach:false,speed:'normal'}));
      }
    },{saved,side});
    await p.goto(url);await p.waitForFunction(()=>(window as any).__severgrow?.ready?.()===true);
    await p.evaluate(()=>(document.getElementById('menu-continue') as HTMLButtonElement).click());
    await p.waitForSelector('#deck.ready');await p.waitForTimeout(1150);
    const geometry=await p.evaluate(()=>{
      const panel=document.getElementById('smart-panel')!.getBoundingClientRect();
      const piles=[...document.querySelectorAll('#futa04-box > .piles > .pile')].map(e=>e.getBoundingClientRect());
      const left=Math.min(...piles.map(r=>r.left)),right=Math.max(...piles.map(r=>r.right));
      const group=document.querySelector<HTMLElement>('#futa04-box > .piles')!;
      return {gap:panel.left>left?panel.left-right:left-panel.right,left,right,
        group:{width:group.offsetWidth,left:group.offsetLeft,shift:group.style.getPropertyValue('--futa04-draw-shift')},
        panel:{left:panel.left,right:panel.right},chain:[group,document.getElementById('smart-panel')!].map(e=>{const a=[];for(let n:HTMLElement|null=e;n;n=n.offsetParent as HTMLElement|null)a.push([n.id,n.offsetLeft,n.offsetWidth,getComputedStyle(n).transform,getComputedStyle(n).translate]);return a;})};
    });
    assert(geometry.gap>=7,`${width} ${side} ${count} cards: Draw piles keep clear of cockpit ${JSON.stringify(geometry)}`);
    assert(geometry.left>=-1&&geometry.right<=width+1,'piles stay inside the viewport');checks+=2;
    if(count===3)await p.screenshot({path:`${out}/${width}-${side}-three-cards.png`});
    console.log(`PASS ${width} ${side} ${count} cards: ${geometry.gap.toFixed(1)}px cockpit gap`);
    await c.close();
  }
  console.log(`${checks} Draw-pile spacing checks passed`);
}finally{await browser.close();await server.httpServer.close();}
