/** Real product renderers, deterministic visual fixtures. No server/account/ownership writes. */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { newGame, coordKey, boardCoords, type Tile } from '../../src/engine/index.js';
import { themeOf } from '../src/logic/themes.js';
import { materialLook } from '../src/logic/materials.js';
import { WORLD_IDS, duelWorlds } from '../src/worlds/worlds.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';

const out=process.env.SHOTS??'/tmp/v075-worlds';mkdirSync(out,{recursive:true});
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const moduleName=readdirSync('web/dist/assets').find(n=>/^defaultArtBoard-.*\.js$/.test(n));
const state=newGame(437,{boardRadius:3});
const tiles: Record<string,Tile|null>={...state.board};
for(const c of boardCoords(state.config)){
 const key=coordKey(c);if(tiles[key]||state.terrain[key]==='rock')continue;
 const owner=c.r>0||c.r===0&&c.q<0?0:1;
 if(Math.abs(c.q+c.r)%5!==1)tiles[key]={owner,strength:1+(Math.abs(c.q*3+c.r*7)%8),root:false};
}
const me='11111111-1111-4111-8111-111111111111';
const claims=['0,0','1,0','0,1','-1,1','1,-1','2,-1','-1,0','2,0','0,2'].map(cellId=>({cellId,ownerId:me,ownerName:'Cedar',ownerLevel:3,ownerTag:'',colour:'hsl(150 32% 52%)',claimedAt:1}));
const world={version:WORLD_VERSION,revision:1,cost:100,challengeStake:0,cells:seenWorld(claims.map(c=>c.cellId)),claims,disputes:[{cellId:'0,0',challengerId:'rival',defenderId:me,accepted:false}]};
const checks:{name:string;pass:boolean}[]=[];
const assert=(name:string,pass:boolean)=>{checks.push({name,pass});console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)throw Error(name);};
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
  const p=await browser.newPage({viewport:{width:width!,height:height!},hasTouch:width!<900,isMobile:width!<900});
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(`window.__name=(f)=>f;localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:true}));localStorage.setItem('futa05-test:severgrow.duel.identity.v1',${JSON.stringify(JSON.stringify({token:'local-planet-token',playerId:me,displayName:'Cedar',kind:'guest'}))});localStorage.setItem('futa05-test:futasaku.world.last.v1',${JSON.stringify(JSON.stringify(world))});`);
  await p.bringToFront();
  await p.goto(fixture.origin+'/test/');await p.waitForFunction(()=>!!(window as any).__severgrow?.ready?.());
  await p.waitForFunction(()=>!!(window as any).__severgrow.planet()?.ready);
  await p.locator('#menu-world').click();await p.waitForTimeout(700);
  await p.locator('#online-world-menu').click();await p.locator('#world-key-colour').click();
  await p.waitForSelector('#world-style-picker');
  for(const id of WORLD_IDS){
   await p.locator(`[data-world-style="${id}"]`).click();
   assert(`${width}: ${id} selector responds`,await p.locator(`[data-world-style="${id}"]`).getAttribute('aria-pressed')==='true');
   await p.waitForTimeout(200);await p.screenshot({path:`${out}/picker-${width}-${id}.png`});
   await p.locator('#world-panel-close').click(); await p.locator('#online-world-menu').click();
   await p.screenshot({path:`${out}/planet-${width}-${id}.png`});
   await p.locator('#online-world-menu').click(); await p.locator('#world-key-colour').click();
  }
  if(width===320){
   const settle=await p.evaluate(()=>{
    document.documentElement.classList.remove('reduce-motion');
    for(const id of ['ocean','forest'])document.querySelector<HTMLButtonElement>(`[data-world-style="${id}"]`)!.click();
    return document.querySelector('.planet-canvas')!.getAnimations().filter(a=>a.id==='world-material-settle').map(a=>a.effect!.getTiming().duration);
   });
   assert('rapid skin changes replace one 150ms surface beat',settle.length===1&&settle[0]===150);
   const still=await p.evaluate(()=>{
    document.documentElement.classList.add('reduce-motion');
    document.querySelector<HTMLButtonElement>('[data-world-style="volcanic"]')!.click();
    return document.querySelector('.planet-canvas')!.getAnimations().filter(a=>a.id==='world-material-settle').length;
   });
   assert('reduced motion cancels the material beat immediately',still===0);
  }
  await p.locator('#online-world-back').click();
  await p.locator('#menu-play').click(); await p.locator('#menu-campaign').click();
  if(await p.locator('#sheet-campaign-start:not([hidden])').count())await p.locator('#csa-resume').click();
  await p.waitForFunction(()=>{const l=(window as any).__severgrow.lesson?.();return !!(window as any).__severgrow.state?.()&&(!l||!l.stage&&l.handSettled);});
  await p.screenshot({path:`${out}/game-${width}-volcanic.png`});
  // A separate board instance draws the SAME production geometry/materials with a populated fixture.
  await p.evaluate(async ({moduleName,state,style,look,tiles})=>{
   const {DefaultArtBoardView}=await import(`/assets/${moduleName}`);
   const old=document.querySelector('#board')!;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='board';old.replaceWith(svg);
   const holder=document.createElement('div');holder.style.cssText='position:fixed;inset:44px 0 12px;z-index:100;background:#07090a;display:flex;justify-content:center;align-items:center;pointer-events:none';document.body.append(holder);holder.append(svg);
   svg.style.cssText='display:block;position:static;width:100%;height:100%;max-width:1000px;overflow:visible';
   const board=new DefaultArtBoardView(svg,{tap:()=>{},inspect:()=>{}});board.setup(state.config,state.terrain,style,look,'soil');
   (window as any).__worldGallery={board,tiles};
  },{moduleName,state,style:themeOf('soil').style,look:materialLook('soil','normal',true),tiles});
  for(const a of WORLD_IDS)for(const b of WORLD_IDS){
   const appearance=duelWorlds(a,b);
   const result=await p.evaluate(async appearance=>{
    const {board,tiles}=(window as any).__worldGallery;
    board.setWorldAppearance(appearance);
    if(appearance.environment==='ocean'&&appearance.owners[1]==='volcanic') { board.setLocalWorld('forest'); board.setLocalWorld('ocean'); }
    board.render(tiles,{targets:null,available:null,selectedHex:null,ghosts:[],cutKeys:[],weak:[],opps:[],coachHexes:[],focusKey:null,scars:[],usable:false,pulse:null,botFragile:false});
    return [...document.querySelectorAll('#board .world-terrain')].map(e=>({owner:e.closest('.tile')?.classList.contains('you')?0:1,world:e.getAttribute('data-world')}));
   },appearance);
   assert(`${width}: ${a}/${b} materials stay with their owner`,result.length===Object.values(tiles).filter(t=>t&&!t.root&&appearance.owners[t.owner]!=='futasaku').length && result.every(r=>r.world===appearance.owners[r.owner as 0|1]));
   const shading=await p.locator('#board .world-opponent-shade').count();
   assert(`${width}: ${a}/${b} ownership remains readable without colour alone`,shading===(b==='futasaku'?0:1));
   if(a!=='futasaku'&&(b===WORLD_IDS[(WORLD_IDS.indexOf(a)%4)+1]||a==='ocean'&&b==='ocean')){
    await p.evaluate(async()=>{await Promise.all([...document.querySelectorAll<SVGImageElement>('#board image')].map(e=>new Promise<void>(resolve=>{const i=new Image();i.src=e.getAttribute('href')!;i.decode().then(()=>resolve(),()=>resolve());})));});
    await p.screenshot({path:`${out}/board-${width}-${a}-${b}.png`});
   }
  }
  assert(`${width}: no page errors`,errors.length===0);await p.close();
 }
 writeFileSync(`${out}/results.json`,JSON.stringify(checks,null,2));
}finally{await browser.close();await fixture.close();}
