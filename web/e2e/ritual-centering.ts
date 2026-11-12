import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const shots=process.env.SHOTS??'/tmp/ritual-centering';mkdirSync(shots,{recursive:true});
const fixture=await productFixture();
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
try {
 for(const [width,height] of [[390,844],[1024,768],[1280,720],[1280,800],[1440,900],[1920,1080]]) {
  if(process.env.RITUAL_WIDTH&&String(width)!==process.env.RITUAL_WIDTH)continue;
  const page=await browser.newPage({viewport:{width:width!,height:height!},deviceScaleFactor:Number(process.env.RITUAL_DPR??1)});
  if(width===1440&&process.env.RITUAL_RESIZE==='1')await page.exposeFunction('__resizeRitual',()=>page.setViewportSize({width:1280,height:800}));
  await page.addInitScript(()=>{
   (window as any).__name=(f:unknown)=>f;
   localStorage.setItem('futa05:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,speed:'normal',reduceMotion:false,eyeCandy:true}));
   localStorage.setItem('futa05:severgrow.seen','1');
   (window as any).__centering=[];
   let resized=false;
   const sample=()=>{
    if(!resized&&(window as any).__resizeRitual&&document.getElementById('starter-lottery')?.dataset.phase==='exit') {
     resized=true;void (window as any).__resizeRitual();
    }
    const kanji=document.querySelector('.ritual-kanji');
    // The pile deliberately files away during the kanji's final fade. Measure its landing
    // while the mark emerges and holds, before that separate departure begins.
    const leaving=kanji?.getAnimations().some(a=>Number((a.effect as KeyframeEffect).getKeyframes().at(-1)?.opacity)===0);
    if(kanji&&!leaving&&Number(getComputedStyle(kanji).opacity)>.1) {
     const tile=document.querySelector('#board .hex-cell[data-key="0,0"] .hex')?.getBoundingClientRect();
     const layer=[...document.querySelectorAll<HTMLElement>('#lottery-deck .ritual-deck-layer')].reverse().find(el=>getComputedStyle(el).opacity!=='0');
     const deck=layer?.querySelector('.card')?.getBoundingClientRect();
     if(tile&&deck&&!(window as any).__geometry) {
      const card=layer!.querySelector('.card')!;const style=getComputedStyle(card);
      (window as any).__geometry={tile:tile.toJSON(),card:deck.toJSON(),anchor:document.getElementById('lottery-deck-anchor')?.getBoundingClientRect().toJSON(),style:{width:style.width,height:style.height,position:style.position,display:style.display,transform:style.transform,translate:style.translate},layer:layer!.getBoundingClientRect().toJSON()};
     }
     if(tile&&deck)(window as any).__centering.push({dx:deck.x+deck.width/2-tile.x-tile.width/2,dy:deck.y+deck.height/2-tile.y-tile.height/2});
    }
    requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
  });
  await page.goto(fixture.origin+(process.env.RITUAL_PATH==='seed'?'/?seed=4242':'/'));
  if(process.env.RITUAL_PATH!=='seed') {
   await openMenuEntry(page,'menu-new');
   await page.locator('#level-grid [data-difficulty]').first().click();
  }
  await page.waitForFunction(()=>(window as any).__centering.length>0,undefined,{timeout:30000});
  await page.screenshot({path:`${shots}/ritual-${width}x${height}.png`});
  await page.waitForFunction(()=>!document.querySelector('.ritual-kanji'));
  const samples=await page.evaluate(()=>(window as any).__centering as {dx:number;dy:number}[]);
  const error=Math.max(...samples.map(p=>Math.hypot(p.dx,p.dy)));
  console.log(`${width}x${height}: max centre error ${error.toFixed(3)}px (${samples.length} frames)`);
  if(error>1)console.log(JSON.stringify(await page.evaluate(()=>(window as any).__geometry)));
  assert(error<=1,`ritual emblem must remain centred on the actual middle tile: ${error}px`);
  await page.close();
 }
} finally {await browser.close();await fixture.close();}
