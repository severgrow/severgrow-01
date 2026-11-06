// Real product regression: changing a card selection must not replace unchanged tile artwork.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {newGame} from '../../src/engine/index.js';
import {positionSave} from './position.js';
import {resumeSavedGame} from './helpers/menu-nav.js';
import {servePreview} from './helpers/preview-port.js';

const f=await servePreview(4248,{logLevel:'silent'});
const b=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
mkdirSync('/tmp/v081-board',{recursive:true});
try{
 for(const [width,height] of [[390,844],[1280,800]] as const)for(const strengthening of [false,true]){
  const p=await b.newPage({viewport:{width,height}}),s=newGame(7);
  s.phase='ACT';s.actor=0;s.turnPlayer=0;
  if(strengthening){s.terrain['-1,1']='normal';s.board['-1,1']={owner:0,strength:1};}
  await p.addInitScript(save=>{(window as any).__name=(x:unknown)=>x;localStorage.setItem('main2:severgrow.save.v7',save);localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,reduceMotion:true,speed:'skip'}));},positionSave({state:s}));
  await p.goto(f.url);await resumeSavedGame(p);
  await p.waitForFunction(()=>document.querySelectorAll('#board .l-tiles > .tile').length>0);
  await p.waitForTimeout(1600);
  await p.evaluate(()=>{(window as any).__tiles=new Map([...document.querySelectorAll('#board .l-tiles > .tile')].map(n=>[n.getAttribute('data-key'),n]));});
  await p.evaluate(()=>{(window as any).__turnMutations=0;new MutationObserver(records=>{(window as any).__turnMutations+=records.length;}).observe(document.documentElement,{attributes:true,attributeFilter:['data-futa04-turn']});});
  await p.locator('#hand [data-card]').first().click();
  assert.equal(await p.evaluate(()=>(window as any).__turnMutations),0,'selecting a card never republishes the unchanged turn attribute');
  assert(await p.evaluate(()=>[...(window as any).__tiles].every(([key,n]:[string,Element])=>n===document.querySelector(`#board .l-tiles > [data-key="${key}"]`))),'selection retains all unchanged art nodes');
  const grow=await p.evaluate(strengthening=>{const g=(window as any).__severgrow;return g.legal().find((a:any)=>a.t==='Sprout'&&(strengthening?`${a.coord.q},${a.coord.r}`==='-1,1':!g.state().board[`${a.coord.q},${a.coord.r}`]));},strengthening);
  assert(grow,'fixture has a legal grow');
  await p.evaluate(a=>(window as any).__severgrow.playFor(a,0),grow);
  await p.waitForFunction(()=>!(window as any).__severgrow.busy());
  const added=`${grow.coord.q},${grow.coord.r}`;
  assert(await p.locator(`#board .l-tiles > [data-key="${added}"]`).count(),'new grow appears');
  assert(await p.evaluate(added=>[...(window as any).__tiles].filter(([key]:[string,Element])=>key!==added).every(([key,n]:[string,Element])=>n===document.querySelector(`#board .l-tiles > [data-key="${key}"]`)),added),'a move preserves the other tiles');
  if(strengthening){
   assert(await p.evaluate(added=>(window as any).__tiles.get(added)!==document.querySelector(`#board .l-tiles > [data-key="${added}"]`),added),'strength changes invalidate only the changed artwork');
   assert.equal(await p.locator(`#board .l-tiles > [data-key="${added}"] .seed-stone-value`).textContent(),String((await p.evaluate(()=>(window as any).__severgrow.state())).board[added].strength));
  }
  await p.screenshot({path:`/tmp/v081-board/${strengthening?'strengthen':'grow'}-${width}.png`});
  if(!strengthening){
   await p.keyboard.press('u');await p.waitForFunction(added=>!(window as any).__severgrow.busy()&&!(window as any).__severgrow.state().board[added],added);
   assert.equal(await p.locator(`#board .l-tiles > [data-key="${added}"]`).count(),0,'undo removes cached art');
  }
  await p.setViewportSize({width:height,height:width});await p.waitForTimeout(200);
  assert(await p.evaluate(()=>document.querySelectorAll('#board .l-tiles > .tile').length>0),'orientation/setup restores current art');
  await p.close();console.log('PASS retained art, changed strength, undo and resize:',width,strengthening);
 }
 const partial=await b.newPage({viewport:{width:390,height:844}});
 await partial.route(/\/ash-[^/]+\.webp$/,route=>route.abort());await partial.goto(f.url);
 await partial.waitForFunction(()=>document.documentElement.classList.contains('futa04-card-art-s0-ready'));
 assert(!await partial.evaluate(()=>document.documentElement.classList.contains('futa04-card-art-s1-ready')),'failed face keeps its text fallback');
 await partial.evaluate(()=>{
  const chat=document.getElementById('world-chat-list')!;chat.textContent='My fruit trees';
  const ranking=document.getElementById('online-world-screen')??document.createElement('div');ranking.id='online-world-screen';
  const name=document.createElement('button');name.id='v081-player-name';name.textContent='Fruit Garden';name.setAttribute('aria-label','Fruit Garden');ranking.append(name);if(!ranking.isConnected)document.body.append(ranking);
  const text=document.createElement('p');text.id='v081-copy';text.textContent='Fruit card';document.body.append(text);
 });
 await partial.waitForFunction(()=>document.getElementById('v081-copy')?.textContent==='Bomb');
 assert.equal(await partial.locator('#world-chat-list').textContent(),'My fruit trees','compatibility copy never rewrites player messages');
 assert.equal(await partial.locator('#v081-player-name').textContent(),'Fruit Garden','Planet names retain their real spelling');
 assert.equal(await partial.locator('#v081-player-name').getAttribute('aria-label'),'Fruit Garden','spoken Planet names also stay unchanged');
 await partial.close();console.log('PASS partial art loading and untouched player chat');
}finally{await b.close();await f.server.close();}
