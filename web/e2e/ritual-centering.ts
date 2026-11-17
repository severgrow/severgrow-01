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
    // The ring's landing is read the first frame its turn has finished (which is also when the kanji
    // starts to leave, so this sits outside the hold-only window below).
    {
     const tile=document.querySelector('#board .hex-cell[data-key="0,0"] .hex')?.getBoundingClientRect();
     // The emblem lets go of its kanji and its hex turns onto the tile (owner, 2026-11-16).
     const ring=document.querySelector<HTMLElement>('.ritual-emblem-ring:not(.ritual-emblem-ripple)');
     // ONE frame turns (owner, 2026-11-17): the unlock ghost is invisible until the ring locks.
     const ghost=document.querySelector<HTMLElement>('.ritual-emblem-ripple');
     const turning=ring?.getAnimations().find(a=>a.playState==='running'&&String((a.effect as KeyframeEffect).getKeyframes().at(-1)?.transform??'').includes('rotate(390deg)'));
     if(ghost&&turning&&Number(turning.effect?.getComputedTiming().progress??1)<.8){
      (window as any).__ghostMax=Math.max((window as any).__ghostMax??0,Number(getComputedStyle(ghost).opacity));
     }
     // The way home starts the moment the turn ends, so the landing is read from the turn's own
     // final frame; the ring's centre is measured on screen (the turn and scale are about its centre).
     const anims=ring?.getAnimations()??[];
     const ends=(a:Animation)=>String((a.effect as KeyframeEffect).getKeyframes().at(-1)?.transform??'');
     const turn=anims.find(a=>ends(a).includes('rotate(390deg)'));
     const home=anims.find(a=>ends(a).includes('rotate(720deg)'));
     // The way home is read from its own final frame the moment it exists: on a slow machine the ritual
     // can be put away before a frame lands on its very end (CI, 2026-11-17).
     if(ring&&home&&!(window as any).__home){
      const probe=document.createElement('div');probe.style.transform=ends(home);document.body.append(probe);
      const m=new DOMMatrix(getComputedStyle(probe).transform);probe.remove();
      (window as any).__home={angle:Math.atan2(m.b,m.a)*180/Math.PI,scale:Math.hypot(m.a,m.b),ms:Number(home.effect?.getTiming().duration??0)};
     }
     if(tile&&ring&&turn&&!(window as any).__emblem&&turn.playState==='finished'){
      const probe=document.createElement('div');probe.style.transform=ends(turn);document.body.append(probe);
      const m=new DOMMatrix(getComputedStyle(probe).transform);probe.remove();
      const box=ring.getBoundingClientRect();
      const card=ring.closest<HTMLElement>('.ritual-deck-layer')!;
      const shown=card.getBoundingClientRect().width/card.offsetWidth;
      const turnedWidth=ring.offsetWidth*shown*997/877*Math.hypot(m.a,m.b);
      (window as any).__emblem={angle:Math.atan2(m.b,m.a)*180/Math.PI,fitError:turnedWidth-tile.width,
       dx:box.x+box.width/2-tile.x-tile.width/2,dy:box.y+box.height/2-tile.y-tile.height/2,
       kanji:Number(getComputedStyle(document.querySelector('.ritual-emblem-kanji')!).opacity),
       cover:Number(getComputedStyle(document.querySelector('.ritual-emblem')!).opacity)};
     }
    }
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
  const emblem=await page.evaluate(()=>(window as any).__emblem as {angle:number;fitError:number;dx:number;dy:number;kanji:number;cover:number}|undefined);
  console.log(`${width}x${height}: emblem at the kanji's peak ${JSON.stringify(emblem)}`);
  assert(emblem,'the emblem cover is drawn while the kanji is up');
  const ghostMax=await page.evaluate(()=>(window as any).__ghostMax as number|undefined);
  assert(ghostMax!==undefined&&ghostMax<.01,`only one hex is seen while it turns (the unlock ghost stays hidden): ${ghostMax}`);
  assert(emblem.cover>.9&&emblem.kanji<.01,'the emblem\'s own kanji is gone while the big one is up');
  assert(Math.abs(emblem.angle-30)<.5,`the hex turns 30°, flat-top like the board: ${emblem.angle}`);
  assert(Math.abs(emblem.fitError)<=1.5&&Math.hypot(emblem.dx,emblem.dy)<=1.5,`the turned hex sits on the middle tile's outline: ${JSON.stringify(emblem)}`);
  // ...and on the way into the pile it turns on round, home: pointy side up at the emblem's size.
  await page.waitForFunction(()=>!!(window as any).__home,undefined,{timeout:5000}).catch(()=>undefined);
  const home=await page.evaluate(()=>(window as any).__home as {angle:number;scale:number;ms:number}|undefined);
  console.log(`${width}x${height}: hex home ${JSON.stringify(home)}`);
  assert(home&&Math.abs(home.angle)<.5&&Math.abs(home.scale-1)<.01&&home.ms>0&&home.ms<=600,`the hex lands back pointy side up at the emblem's size, as the deck lands: ${JSON.stringify(home)}`);
  await page.close();
 }
} finally {await browser.close();await fixture.close();}
