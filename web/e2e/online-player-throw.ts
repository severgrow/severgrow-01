import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startLocalDuel, openSeat, openDuel, tapExposed, endTurnViaPage, exposedPoint } from './helpers/local-duel.js';
import { createLiveApi } from '../src/online/live/api.js';
import { PINNED } from '../src/logic/motion.js';
const out = '/tmp/player-throw'; mkdirSync(out, {recursive:true});
const duel = await startLocalDuel({port:4322});
try {
 for(const mode of ['async','blitz']) for(const width of [390,1440]) {
  if(process.env.THROW_GESTURE==='swipe'&&width!==390)continue;
  if(process.env.THROW_ONE==='1' && (mode!=='async'||width!==390))continue;
  const m=await duel.newMatch(), actor=m.starterSeat, other=actor===0?1:0;
  const s=await openSeat(duel,m,actor,{viewport:{width,height:width<500?844:900},isMobile:width<500});
  await s.page.evaluate('window.__name=f=>f'); await openDuel(s,m.matchId);
  await s.page.waitForFunction(()=>!(window as any).__severgrow.busy());
  if(mode==='blitz') {
   const a=createLiveApi({baseUrl:duel.apiBase,token:()=>m.guests[actor].token});
   const b=createLiveApi({baseUrl:duel.apiBase,token:()=>m.guests[other].token});
   await a.presence('in_match',m.matchId);await b.presence('in_match',m.matchId);
   const c=await a.challenge(m.matchId);await b.accept(c.challenge.id);
   await s.page.waitForFunction(()=>document.documentElement.dataset.blitzDuel==='1');
  }
  await tapExposed(s,'#deck');
  await s.page.waitForFunction(()=>(window as any).__severgrow.state()?.phase==='ACT'&&!(window as any).__severgrow.busy());
  await s.page.evaluate(()=>{
   (window as any).__throws=[];
   (window as any).__throwDurations=[];
   new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes){
    if(!(n instanceof HTMLElement)||!n.matches('.flyer.card:not(.opp):not(.back)'))continue;
    (window as any).__throwDurations.push(n.getAnimations()[0]?.effect?.getTiming().duration);
    const rows:any[]=[];(window as any).__throws.push(rows);
    const sample=()=>{const b=n.getBoundingClientRect();rows.push({x:b.x,y:b.y,w:b.width,h:b.height,opacity:+getComputedStyle(n).opacity,pile:document.getElementById('discard-top')?.dataset.faceKey});if(n.isConnected)requestAnimationFrame(sample);};sample();
   }}).observe(document.body,{childList:true,subtree:true});
  });
  const before=await s.page.locator('#discard-top').getAttribute('data-face-key');
  if(process.env.THROW_GESTURE==='swipe') {
   await s.page.evaluate(()=>document.querySelector<HTMLButtonElement>('#moves .end, #moves .futa04-skip, .futa04-skip, .end')!.click());
   await s.page.waitForFunction(()=>(window as any).__severgrow.state()?.phase==='DISCARD'&&!(window as any).__severgrow.busy());
   const card = await s.page.evaluate(()=>(window as any).__severgrow.legal().find((a:any)=>a.t==='Discard').card);
   const p = (await exposedPoint(s,`#hand [data-card="${card}"]`))!;
   const cdp=await s.context.newCDPSession(s.page);
   const points=(y:number)=>[{x:p.x,y,id:1,radiusX:6,radiusY:6,force:1}];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(p.y)});
   for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(p.y-150*i/10)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await cdp.detach();
  } else await endTurnViaPage(s);
  await s.page.waitForFunction(()=>!(window as any).__severgrow.online()?.myTurn,undefined,{timeout:15000});
  await s.page.waitForFunction(()=>!(window as any).__severgrow.busy());
  await s.page.waitForTimeout(800);
  const flights=await s.page.evaluate(()=>(window as any).__throws) as any[][];
  writeFileSync(`${out}/${mode}-${width}.json`,JSON.stringify({before,flights},null,2));
  await s.page.screenshot({path:`${out}/${mode}-${width}.png`});
  assert.equal(flights.length,1,`${mode}/${width}: one visible player throw`);
  const durations = await s.page.evaluate(()=>(window as any).__throwDurations) as number[];
  assert.equal(durations[0], PINNED.boomerang, 'own throw keeps the offline cadence instead of accelerated server replay');
  const visible=flights[0]!.filter(p=>p.opacity>.4&&p.w>10);
  assert(visible.length>=3,`${mode}/${width}: visible flight, not an instant pile update`);
  assert(Math.hypot(visible.at(-1).x-visible[0].x,visible.at(-1).y-visible[0].y)>40);
  assert(visible.some(p=>p.pile===before),'old pile remains until the card arrives');
  console.log(`PASS ${mode}/${width}: player card travels and covers the previous pile`);
  await s.context.close();
 }
}finally{await duel.close();}
