// Two authenticated clients against the real HTTP services; Supabase's existing wire is simulated.
// Account classification is a memory fixture, not a production account or authentication-provider test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page, type WebSocketRoute } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { MatchService } from '../../server/src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { createLiveRuntime } from '../../server/src/live/runtime.js';
import { MemoryLiveStore } from '../../server/src/live/memory.js';
import { DEFAULT_LIVE_CONFIG } from '../../server/src/live/config.js';
import { chainRouters, MemoryFeedbackStore } from '../../server/src/feedback/feedback.js';
import { createChatRouter } from '../../server/src/chat/router.js';
import { memoryChatStore } from '../../server/src/chat/memory.js';

const out=process.env.SHOTS??'/tmp/online-presence-journey';mkdirSync(out,{recursive:true});
const baseline=process.env.JOURNEY_BASELINE==='1';
const missedInvite=process.env.JOURNEY_DROP_INVITE==='1';
let dropChallenge=false,dropped=0;
const wires=new Map<WebSocketRoute,Set<string>>();
const send=(topic:string,event:string,payload:unknown)=>{
 for(const [ws,topics] of wires)if(topics.has(`realtime:${topic}`))ws.send(JSON.stringify({topic:`realtime:${topic}`,event:'broadcast',payload:{event,payload}}));
};
const memory=new MemoryStorage(),config={...DEFAULT_SERVER_CONFIG,corsOrigins:['*']};
const broadcaster={async publish(id:string,payload:unknown){send(id,'ping',payload);}};
const liveStore = new MemoryLiveStore(memory);
const live=createLiveRuntime({storage:memory,live:liveStore,server:config,
 config:{...DEFAULT_LIVE_CONFIG,turnMs:37_000,presencePerPlayerPerMinute:1000,challengesPerPlayerPerHour:1000},broadcaster,
 notifier:{async publish(topic,payload){
  if(dropChallenge&&'challengeId' in payload){dropChallenge=false;dropped++;return;}
  send(topic,'challenge',payload);
 }}});
const service=new MatchService({storage:live.storage,config,broadcaster});
const server=createHttpServer({service,config,live:chainRouters(live.router(service),createChatRouter({service,storage:memory,
 store:memoryChatStore(memory,new MemoryFeedbackStore()),notifier:{async publish(id,payload){send(id,'chat',payload);}}}))});
const port=4305,api=`http://127.0.0.1:${port}`;
await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));
if(process.env.JOURNEY_SKIP_BUILD!=='1') {
 const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','web/vite.config.ts'],{env:{...process.env,CHANNEL:'futa05',VITE_DUEL_API_URL:api,VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:'local',VITE_FIND_OPPONENT:'1',VITE_LIVE_DUELS:'1'},encoding:'utf8'});
 assert.equal(build.status,0,build.stderr);
}
const fixture=await productFixture();
// Transport-only recovery checks may use the supported WebGL fallback on software-GPU hosts.
// Default visual/performance journeys retain their original rendering conditions.
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox',
 ...(process.env.JOURNEY_LOW_GPU==='1'?['--disable-webgl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])]});
const results:unknown[]=[];
let lastTraces:unknown[]=[];
const status=(p:Page)=>p.evaluate(()=>(window as any).__futasakuLive?.()?.status);
const waitOnline=(p:Page)=>p.waitForFunction(()=>{
 const s=(window as any).__futasakuLive?.()?.status;return s?.opponent.presence==='online'&&!s.block;
},undefined,{timeout:baseline?45000:10000,polling:50});
try {
 for(const accountFirst of [true,false])for(const accountSends of [true,false]) {
  if(process.env.JOURNEY_ONE==='1'&&(!accountFirst||!accountSends))continue;
  const credential=await service.createGuest();const registered=await service.authenticate(credential.token);
  await memory.updatePlayer({...registered,kind:'account',displayName:'RYK'});
  if(process.env.JOURNEY_OLD_SEARCH==='1'){
   await service.findOpponent(registered,null,null);
   const third=await service.authenticate((await service.createGuest('Away player')).token);
   await service.findOpponent(third,null,null);
  }
  const traces:{at:number;url:string;device:string}[]=[];
  const errors:string[]=[];
  lastTraces=traces;
  const pages:Page[]=[];
  for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]] as const) {
   const context=await browser.newContext({viewport:{width,height},hasTouch:device==='phone'});
   const p=await context.newPage();pages.push(p);
   p.on('pageerror',error=>errors.push(`${device}: ${error.message}`));
   p.on('response',r=>{if(r.url().startsWith(api+'/v1/')&&r.url().endsWith('/live'))traces.push({at:Date.now(),url:new URL(r.url()).pathname+':response',device});});
   p.on('request',r=>{if(r.url().startsWith(api+'/v1/'))traces.push({at:Date.now(),url:new URL(r.url()).pathname,device});});
   await p.routeWebSocket('**/realtime/v1/websocket**',ws=>{
    const topics=new Set<string>();wires.set(ws,topics);
    ws.onMessage(raw=>{const f=JSON.parse(String(raw));if(f.event==='phx_join')topics.add(f.topic);
     if(f.event==='phx_join'||f.event==='heartbeat')ws.send(JSON.stringify({topic:f.topic,event:'phx_reply',ref:f.ref,payload:{status:'ok',response:{}}}));});
    ws.onClose(()=>{wires.delete(ws);});
   });
   await p.addInitScript(({identity})=>{
    (window as any).__name=(f:unknown)=>f;
    (window as any).__journey={longTasks:[]};
    new PerformanceObserver(list=>{for(const task of list.getEntries())(window as any).__journey.longTasks.push({at:performance.timeOrigin+task.startTime,duration:task.duration});}).observe({type:'longtask',buffered:true});
    const observe=new MutationObserver(()=>{
     const journey=(window as any).__journey;
     if(!journey.entryAt&&document.querySelector('.match-chat')&&!document.getElementById('game')?.hidden){journey.entryAt=Date.now();journey.entryVisible=document.visibilityState;}
     if(document.querySelector('[data-live="pill"]')?.getAttribute('data-state')==='ready'&&!journey.readyAt){journey.readyAt=Date.now();journey.readyVisible=document.visibilityState;}
     const popup=document.querySelector<HTMLElement>('[data-mode="challenge"]');
     if(popup&&!popup.hidden&&!(window as any).__journey.incomingAt)(window as any).__journey.incomingAt=Date.now();
    });observe.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-state']});
    localStorage.setItem('futa05:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,eyeCandy:false,reduceMotion:true,speed:'skip'}));
    if(identity)localStorage.setItem('futa05:severgrow.duel.identity.v1',JSON.stringify(identity));
   },{identity:device==='desktop'?{token:credential.token,playerId:registered.id,displayName:'RYK',kind:'account'}:null});
   await p.goto(fixture.origin+'/');await openMenuEntry(p,'menu-online');
   await p.locator('#online-hub').waitFor({state:'visible'});
  }
  const [desktop,phone]=pages as [Page,Page];
  const first=accountFirst?desktop:phone,second=accountFirst?phone:desktop;
  await first.locator('#online-find').click();await first.locator('#online-waiting').waitFor({state:'visible'});
  const buttons=await first.locator('#online-search-options button').evaluateAll(els=>els.filter(el=>!(el as HTMLElement).hidden).map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};}));
  if(!baseline){assert.equal(buttons.length,3);assert(buttons.every(b=>Math.abs(b.width-buttons[0]!.width)<1&&Math.abs(b.height-buttons[0]!.height)<1));}
  await first.screenshot({path:`${out}/waiting-${accountFirst?'desktop':'phone'}.png`});
  const pairedAt=Date.now();await second.locator('#online-find').click();
  // Pairing includes the queue's existing fallback and the board's own entry sequence. Measure
  // opponent presence separately once both clients actually own an active match handle.
  await Promise.all(pages.map(p=>p.waitForFunction(()=>!!document.querySelector('.match-chat')&&!document.getElementById('game')?.hidden,undefined,{timeout:30000,polling:50})));
  const enteredAt=Date.now();
  try {await Promise.all([waitOnline(desktop),waitOnline(phone)]);} catch(error) {
   console.error('presence diagnostic',JSON.stringify({pairedAt,enteredAt,now:Date.now(),desktop:await status(desktop),phone:await status(phone),requests:traces,wires:[...wires.values()].map(s=>[...s])}));
   for(const p of pages)await p.screenshot({path:`${out}/presence-failure-${p===desktop?'desktop':'phone'}.png`});
   throw error;
  }
  const readyTimes=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__journey)));
  console.log('presentation',JSON.stringify(await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__futasakuLive?.().presentation)))));
  assert.equal((await status(desktop)).matchId,(await status(phone)).matchId,'both clients joined the same authoritative match');
  console.log('ready-times',JSON.stringify(readyTimes));
  for (const p of pages) {
    assert.equal(await p.locator('[data-duel-presence]').getAttribute('data-presence'), 'online', 'header uses server presence without a move');
    assert.equal(await p.locator('.match-chat-presence').getAttribute('data-presence'), 'online', 'chat agrees before any message');
    const labelBox = await p.locator('[data-duel-presence]').boundingBox();
    const boltBox = await p.locator('[data-live="pill"]').boundingBox();
    assert(labelBox && boltBox && labelBox.x >= boltBox.x + boltBox.width + 4, 'presence label clears the Blitz control');
  }
  // Model a phone returning after its heartbeat expired. No chat or gameplay action may be
  // needed to repair either device's indicators. Only test-local guest presence is altered.
  const phoneId = (await phone.evaluate(() => JSON.parse(localStorage.getItem('severgrow.duel.identity.v1')!).playerId)) as string;
  const desktopId = (await desktop.evaluate(() => JSON.parse(localStorage.getItem('severgrow.duel.identity.v1')!).playerId)) as string;
  const matchId = (await status(phone)).matchId;
  await phone.context().setOffline(true);
  await liveStore.setPresence(phoneId, 'in_match', matchId, Date.now() - 120000);
  send(`player:${desktopId}`, 'challenge', { kind: 'presence' });
  await desktop.waitForFunction(() => (window as any).__futasakuLive?.().status?.opponent.presence === 'offline', undefined, { polling: 100 });
  await phone.context().setOffline(false);
  await Promise.all([waitOnline(desktop), waitOnline(phone)]);
  for (const p of pages) {
    await p.waitForFunction(() => document.querySelector('.match-chat-presence')?.getAttribute('data-presence') === 'online', undefined, { polling: 100 });
    assert.equal(await p.locator('[data-duel-presence]').getAttribute('data-presence'), 'online');
  }
  console.log('PASS: both indicators recover from expired phone presence without a chat message');
  // Presence eligibility is expected once BOTH participants have entered. Keep the slower
  // client's board-loading interval in the report instead of mislabelling it as presence delay.
  const onlineMs=Math.max(0,Math.max(...readyTimes.map(t=>t.readyAt))-Math.max(...readyTimes.map(t=>t.entryAt))),pairingMs=enteredAt-pairedAt;
  const firstBoardToBothOnlineMs=Math.max(...readyTimes.map(t=>t.readyAt))-Math.min(...readyTimes.map(t=>t.entryAt));
  if(!baseline)assert(onlineMs<2500,`authoritative eligibility must update promptly after actual board entry: ${onlineMs}ms`);
  for(const p of pages)await p.waitForFunction(()=>!(window as any).__severgrow.busy()&&!(window as any).__severgrow.online()?.revealing);
  const metric=accountFirst&&accountSends&&process.env.JOURNEY_METRICS==='1';
  if(metric)await desktop.waitForTimeout(11000);
  const normalStart=Date.now();if(metric)await desktop.waitForTimeout(60000);
  const normalRequests=traces.filter(t=>t.at>=normalStart&&!t.url.endsWith(':response')).length;
  const sender=accountSends?desktop:phone,receiver=accountSends?phone:desktop;
  let releaseSent=()=>{};
  if(process.env.JOURNEY_HOLD_SENT==='1'){
   const hold=new Promise<void>(resolve=>{releaseSent=resolve;});
   await sender.route('**/v1/matches/*/live/challenge*',async route=>{
    const response=await route.fetch(); // Committed on the real service, only its HTTP reply stalls.
    await hold;await route.fulfill({response});
   });
  }
  if(process.env.JOURNEY_INTERRUPTED_POINTER==='1')await receiver.evaluate(()=>{
   // A pointer release outside the app/window need not reach this document. Losing focus must
   // clear the drag deferral, otherwise an authenticated invitation is fetched but never shown.
   document.dispatchEvent(new PointerEvent('pointerdown',{pointerId:19,bubbles:true}));
   window.dispatchEvent(new Event('blur'));
  });
  let release:()=>void=()=>{};let held:Promise<void>|null=null;
  if(accountFirst&&!accountSends) {
   let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});held=new Promise<void>(r=>{release=r;});let once=true;
   await receiver.route('**/v1/players/me/challenges*',async route=>{
    if(once){once=false;const response=await route.fetch();started();await held;await route.fulfill({response});}
    else await route.continue();
   });
   await receiver.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await ready;
  }
  await sender.locator('[data-live="pill"]').click();
  if(!baseline) {
   await sender.keyboard.press('Tab');
   assert.equal(await sender.evaluate(()=>document.activeElement?.getAttribute('data-live')),'confirm-cancel');
   await sender.keyboard.press('Shift+Tab');
   assert.equal(await sender.evaluate(()=>document.activeElement?.getAttribute('data-live')),'confirm-send');
  }
  await sender.screenshot({path:`${out}/sender-${accountFirst}-${accountSends}.png`});
  const copy=await sender.locator('[data-live="confirm"]').textContent();
  if(!baseline)assert(copy?.includes('37 seconds'),'confirmation uses authoritative configured limit');
  await sender.locator('[data-live="confirm-send"]').evaluate(el=>el.addEventListener('click',()=>{(window as any).__journey.sentAt=Date.now();},{once:true}));
  if(missedInvite)dropChallenge=true;
  const sentAt=Date.now();await sender.locator('[data-live="confirm-send"]').click();
  if(held){await sender.waitForTimeout(150);release();}
  await receiver.locator('[data-mode="challenge"]').waitFor({state:'visible',timeout:baseline?45000:missedInvite?12000:2500});
  if(process.env.JOURNEY_HOLD_SENT==='1'){
   await sender.locator('[data-live="pill"][data-state="waiting"]').waitFor({state:'visible',timeout:2500});
   releaseSent();
  }
  const invitationAutomationMs=Date.now()-sentAt;
  const invitationMs=await receiver.evaluate(()=>(window as any).__journey.incomingAt)-await sender.evaluate(()=>(window as any).__journey.sentAt);
  if(!baseline)assert(invitationMs<(missedInvite?12000:1000),`invitation ${missedInvite?'recovers through the existing status read':'arrives promptly'}: ${invitationMs}ms`);
  await receiver.screenshot({path:`${out}/receiver-${accountFirst}-${accountSends}.png`});
  await receiver.locator('[data-live="accept"]').click();
  await Promise.all(pages.map(p=>p.waitForFunction(()=>(window as any).__futasakuLive?.()?.status?.live)));
  for(const p of pages){
   await p.waitForFunction(()=>document.documentElement.dataset.blitzDuel==='1');
   assert(!(await p.locator('[data-duel-presence]').isVisible()),'Blitz uses the bolt instead of a second presence label');
   assert(await p.locator('[data-live="pill"]').isVisible(),'the presence-aware bolt stays visible');
  }
  const liveState=await status(desktop);
  const actorPage=liveState.actor===liveState.mySeat?desktop:phone,watcher=actorPage===desktop?phone:desktop;
  await Promise.all(pages.map(p=>p.waitForFunction(()=>!(window as any).__severgrow.busy()&&!(window as any).__severgrow.online()?.revealing)));
  const beforeRevision=await watcher.evaluate(()=>(window as any).__severgrow.online().revision),moveAt=Date.now();
  await actorPage.locator('#deck').click();
  await watcher.waitForFunction(before=>(window as any).__severgrow.online().revision>before&&(window as any).__severgrow.state().phase==='ACT',beforeRevision,{timeout:5000});
  const moveMs=Date.now()-moveAt;
  if(metric)await desktop.waitForTimeout(11000);
  const liveStart=Date.now();if(metric)await desktop.waitForTimeout(60000);
  const blitzRequests=traces.filter(t=>t.at>=liveStart&&!t.url.endsWith(':response')).length;
  for(const p of pages) {
   await p.locator('#match-chat-toggle').click();
   if(!baseline) {
    const layout=await p.evaluate(()=>{const logo=document.getElementById('hud-brand')!,panel=document.querySelector('.match-chat-panel')!;const a=logo.getBoundingClientRect(),b=panel.getBoundingClientRect();return {visible:getComputedStyle(logo).visibility!=='hidden'&&a.width>0,clear:a.bottom<=b.top||a.left>=b.right||a.right<=b.left};});
    assert(layout.visible&&layout.clear,JSON.stringify(layout));
   }
   await p.screenshot({path:`${out}/chat-${p===desktop?'desktop':'phone'}.png`});
   await p.locator('.match-chat-head-keys button:last-child').click();
  }
  const s=await status(desktop);assert(s?.live);
  const endedAt=Date.now();await live.service.leave(await service.authenticate(credential.token),s.matchId);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>{
   const s=(window as any).__futasakuLive?.()?.status;return s?.endedReason==='finished'&&!s.live;
  })));
  results.push({accountFirst,accountSends,pairingMs,onlineMs,firstBoardToBothOnlineMs,invitationMs,invitationAutomationMs,moveMs,dropped,endMs:Date.now()-endedAt,...(metric?{normalRequestsPerMinute:normalRequests,blitzRequestsPerMinute:blitzRequests}:{}),traces});
  assert.deepEqual(errors,[],'no unhandled client errors');
  console.log(JSON.stringify(results[results.length-1],(k,v)=>k==='traces'?undefined:v));
  if(accountFirst&&accountSends) {
   // Two tabs share localStorage. Reading an identity probes storage, so an unfiltered storage
   // listener can bounce probe writes between tabs forever. Unrelated keys must stay quiet.
   const extra=await desktop.context().newPage();
   await extra.goto(fixture.origin+'/');
   await extra.waitForFunction(()=>typeof (window as any).__futasakuLive==='function');
   for(const p of [desktop,extra])await p.evaluate(()=>{
    (window as any).__storageEvents=0;
    window.addEventListener('storage',()=>{(window as any).__storageEvents++;});
   });
   await desktop.evaluate(()=>localStorage.setItem('futasaku.storage.integration.probe',String(Date.now())));
   await extra.waitForFunction(()=>(window as any).__storageEvents>0,undefined,{timeout:2000});
   await extra.waitForTimeout(250);
   const counts=await Promise.all([desktop,extra].map(p=>p.evaluate(()=>(window as any).__storageEvents as number)));
   assert(counts.every(n=>n<20),`unrelated storage events must not bounce between tabs: ${counts}`);
   console.log('cross-tab unrelated storage events',JSON.stringify(counts));
   await extra.close();
  }
  for(const p of pages)await p.context().close();
 }
 writeFileSync(`${out}/measurements.json`,JSON.stringify(results,null,2));
} catch(error) {
 console.error('journey diagnostics',JSON.stringify({pages:await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(async p=>({status:await status(p),visible:await p.evaluate(()=>document.visibilityState)}))),requests:lastTraces}));
 throw error;
} finally {writeFileSync(`${out}/measurements.json`,JSON.stringify(results,null,2));await browser.close();await fixture.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
