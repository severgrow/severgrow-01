// Production candidate accessibility, storage and offline/recovery boundaries.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { apply, newGame, viewFor, legalActions } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { positionSave } from './position.js';
const root = process.env.SITE_DIR ?? '/tmp/severor-site';
const mime: Record<string,string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.png':'image/png', '.webmanifest':'application/manifest+json', '.json':'application/json' };
const server = createServer({ key: readFileSync('/tmp/severor-key.pem'), cert: readFileSync('/tmp/severor-cert.pem') }, (req,res) => {
  let path = resolve(root, '.'+new URL(req.url!, 'https://localhost').pathname);
  if (!path.startsWith(resolve(root)+'/') && path !== resolve(root)) { res.writeHead(403).end(); return; }
  if (existsSync(path) && statSync(path).isDirectory()) path += '/index.html';
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type',mime[extname(path)] ?? 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise<void>(ok => server.listen(4193,'127.0.0.1',ok));
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args:['--no-sandbox','--ignore-certificate-errors'] });
const BASE='https://localhost:4193'; let checks=0;
const check=(v:unknown,n:string)=>{assert(v,n);checks++;};
const wait=async(p:any)=>{await p.waitForFunction(()=>!!(window as any).__severgrow);await p.waitForTimeout(350);};
try {
for (const palette of ['soil','moss','ink']) for (const variant of ['right','left','large','low']) {
  const context=await browser.newContext({ignoreHTTPSErrors:true,hasTouch:true,isMobile:true,viewport:{width:390,height:664}});
  await context.addInitScript(([palette,variant])=>{
    (window as any).__name=(f:unknown)=>f;
    if(sessionStorage.getItem('seeded'))return;
    sessionStorage.setItem('seeded','1');
    localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({palette,largeText:variant==='large',materialDetail:variant==='low'?'low':'normal',sound:false,coach:false,reduceMotion:true,speed:'skip'}));
    localStorage.setItem('main2:severgrow-thumb',JSON.stringify({side:variant==='left'?'left':'right'}));
  },[palette,variant]);
  const p=await context.newPage();await p.goto(BASE+'/test2/?seed=219682080');await wait(p);
  await p.keyboard.press('Tab');
  check(await p.evaluate(()=>!!document.activeElement?.closest('button')),`${palette}/${variant}: keyboard focus`);
  await p.waitForFunction(() => (window as any).__severgrow?.state()?.phase === 'DRAW');
  await p.keyboard.press('d');
  await p.waitForFunction(() => (window as any).__severgrow?.state()?.phase === 'ACT');
  check(await p.evaluate(()=>(window as any).__severgrow.state().phase==='ACT'),`${palette}/${variant}: keyboard draw`);
  check(await p.evaluate(()=>document.fonts.check('700 20px "Futasaku Numerals"')),`${palette}/${variant}: numeral font loaded`);
  const numbers=await p.evaluate(()=>{const canvas=document.createElement('canvas'),c=canvas.getContext('2d')!;c.font='700 20px "Futasaku Numerals"';return [...'123456789'].map(n=>c.measureText(n).width);});
  check(Math.max(...numbers)-Math.min(...numbers)<0.01,`${palette}/${variant}: equal-width digits 1–9`);
  const hand=await p.locator('#hand .card').count();check(hand===8,`${palette}/${variant}: eight-card hand`);
  const clipping=await p.evaluate(()=>[...document.querySelectorAll('#hand .card')].every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}));
  check(clipping,`${palette}/${variant}: cards on screen`);
  await p.screenshot({path:`/tmp/main2-shots/${palette}-${variant}.png`});
  console.log(`${palette}/${variant}: accessibility and type passed`);
  await context.close();
}
for(const handSize of [4,7,9]){
  const c=await browser.newContext({ignoreHTTPSErrors:true,hasTouch:true,isMobile:true,viewport:{width:360,height:640}});
  const s=apply(newGame(42,{handSize}),{t:'Draw',from:'deck'});
  await c.addInitScript(save=>{(window as any).__name=(f:unknown)=>f;localStorage.setItem('main2:severgrow.save.v7',save);localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,coach:false,reduceMotion:true}));},positionSave({state:s}));
  const p=await c.newPage();await p.goto(BASE+'/test2/');await wait(p);await p.click('#menu-continue');await p.waitForTimeout(300);
  check(await p.locator('#hand .card').count()===handSize+1,`${handSize+1} cards render`);
  check(await p.evaluate(()=>[...document.querySelectorAll('#hand .c-num')].every(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.width>0;})),`${handSize+1} ranks visible`);
  await p.screenshot({path:`/tmp/main2-shots/hand-${handSize+1}.png`});await c.close();
}
for(const bad of ['{junk',JSON.stringify({v:1,seed:42,actions:[]})]){
  const c=await browser.newContext({ignoreHTTPSErrors:true});await c.addInitScript(value=>localStorage.setItem('main2:severgrow.save.v7',value),bad);
  const p=await c.newPage();await p.goto(BASE+'/test2/');await wait(p);check(!await p.locator('#menu-continue').isVisible(),'corrupt/obsolete save ignored');check(await p.locator('#menu-new').isVisible(),'fresh game remains available');await c.close();
}
{
  const c=await browser.newContext({ignoreHTTPSErrors:true});await c.addInitScript(()=>{for(const k of ['getItem','setItem','removeItem'])Object.defineProperty(Storage.prototype,k,{value(){throw new Error('storage blocked');},configurable:true});});
  const p=await c.newPage();await p.goto(BASE+'/test2/');await wait(p);await p.click('#menu-new');await p.click('[data-level="1"]');await p.waitForTimeout(400);check(await p.evaluate(()=>!!(window as any).__severgrow.state()),'blocked storage still permits play');await c.close();
}
// Tutorial arrows must lead to actual taps, including tap-again instead of hidden Confirm.
{
  const c=await browser.newContext({ignoreHTTPSErrors:true,hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
  await c.addInitScript(()=>{(window as any).__name=(f:unknown)=>f;localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,coach:true,reduceMotion:true,speed:'skip',autoSkip:false}));});
  const p=await c.newPage();await p.goto(BASE+'/test2/');await wait(p);await p.click('#menu-tutorial');
  let followed=0;
  for(let step=0;step<6;step++){
    await p.waitForFunction(()=>{const h=(window as any).__severgrow;return !h.busy()&&h.state()?.actor===0;});
    const before=await p.evaluate(()=>(window as any).__severgrow.state().history.length);
    await p.click('#futa04-help-button');
    check(await p.locator('#sheet-futa04-help').isVisible(), 'tutorial help opens a readable sheet');
    await p.click('#coach-show');await p.waitForTimeout(80);
    for(let j=0;j<6;j++){
      if(!await p.locator('#guide-arrow').isVisible())break;
      const t=await p.locator('#guide-arrow').getAttribute('data-target');assert(t);
      check(t!=='confirm','tutorial never points at hidden Confirm');
      if(t.startsWith('card:'))await p.locator(`#hand [data-card="${t.slice(5)}"]`).click();
      else if(t.startsWith('hex:'))await p.locator(`#board g.hex-cell[data-key="${t.slice(4)}"]`).click();
      else if(t.startsWith('kind:')) {
        const label=await p.locator(`#moves [data-kind="${t.slice(5)}"]`).first().getAttribute('aria-label');
        await p.locator('#smart-bloom-button').click();
        if(await p.locator('#smart-bloom-selector').isVisible()) await p.locator('#smart-bloom-selector').getByRole('menuitem',{name:label ?? ''}).first().click();
      }
      else if(t==='end'||t==='cancel'||t==='button') {
        await p.locator('#smart-context').click();
        if(await p.locator('#smart-selector').isVisible()) await p.locator('#smart-selector button').first().click();
      }
      else {const sel=({deck:'#deck',discard:'#discard'} as Record<string,string>)[t];assert(sel);await p.locator(sel).first().click();}
      await p.waitForTimeout(80);
      if(await p.evaluate(()=>(window as any).__severgrow.state().history.length)>before)break;
    }
    if(await p.evaluate(()=>(window as any).__severgrow.state().history.length)>before)followed++;
  }
  check(followed>=5,'tutorial arrows play at least five suggested moves');await c.close();
}
// Finishing a complete candidate game changes only candidate stats/saves.
{
  const c=await browser.newContext({ignoreHTTPSErrors:true});await c.addInitScript(()=>{(window as any).__name=(f:unknown)=>f;localStorage.setItem('severgrow.stats.v1','MAIN');localStorage.setItem('test:severgrow.stats.v1','TEST');localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({level:1,sound:false,coach:false,speed:'skip',reduceMotion:true,autoSkip:false}));});
  const p=await c.newPage();await p.goto(BASE+'/test2/?seed=42');await wait(p);
  for(let i=0;i<600;i++){
    await p.waitForFunction(()=>{const h=(window as any).__severgrow,s=h.state();return !h.busy()&&(s.actor===0||s.phase==='GAME_OVER');});
    const s=await p.evaluate(()=>(window as any).__severgrow.state() as State);if(s.phase==='GAME_OVER')break;
    const a=chooseLevelAction(viewFor(s,0),1,42+i);check(legalActions(viewFor(s,0)).some(x=>JSON.stringify(x)===JSON.stringify(a)), 'chosen action legal');
    const outcome=await p.evaluate(({a,s})=>{const h=(window as any).__severgrow;if(JSON.stringify(h.state())!==JSON.stringify(s))return 'advanced';return h.playFor(a,0)?'played':'rejected';},{a,s});
    if(outcome==='advanced')continue;check(outcome==='played','legal player action applied');
  }
  check(await p.evaluate(()=>(window as any).__severgrow.state().phase==='GAME_OVER'),'full game completes');
  const raw=await p.evaluate(()=>({...localStorage}));check(raw['severgrow.stats.v1']==='MAIN'&&raw['test:severgrow.stats.v1']==='TEST','finishing preserves other stats');check(!!raw['main2:severgrow.stats.v1'],'candidate records own stats');await c.close();
}
console.log('Cards, save corruption, blocked storage and completed-game statistics passed');
// Cache coexistence, Main worker exclusion and offline launch under actual HTTPS scopes.
{
  const c=await browser.newContext({ignoreHTTPSErrors:true});await c.addInitScript(()=>(window as any).__name=(f:unknown)=>f);
  const p=await c.newPage();await p.goto(BASE+'/');await wait(p);await p.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active);
  await p.evaluate(async()=>{await caches.open('test-sentinel');await (await caches.open('severgrow-v2-scoped')).put('./sentinel',new Response('main'));});
  // a browser that kept an old Futa04 cache (the V3 art manifest from an earlier release) must not be served it
  await p.evaluate(async()=>{await (await caches.open('severor-main2-v1')).put(new URL('/test2/design-v3/manifest.json',location.href).href,new Response('{"tiers":{"lo":[],"hi":[]}}'));});
  await p.goto(BASE+'/test2/');await wait(p);await p.waitForFunction(async()=>(await navigator.serviceWorker.getRegistration())?.active?.scriptURL.endsWith('/test2/test2-sw.js'));await p.reload();await wait(p);
  check(await p.evaluate(async()=>{const m=await (await fetch('design-v3/manifest.json?r=1')).json();return m.tiers.lo.length>0&&!!m.hash;}),'Futa04 never serves a stale art manifest');
  const scope=await p.evaluate(()=>navigator.serviceWorker.controller?.scriptURL);check(scope?.endsWith('/test2/test2-sw.js'),'Futa04 scoped worker controls candidate');
  await p.goto(BASE+'/test2/?seed=42');await wait(p);await p.locator('#deck').evaluate(el=>(el as HTMLButtonElement).click());await p.waitForTimeout(300);
  await p.goto(BASE+'/test2/');await wait(p);await c.setOffline(true);await p.reload();await wait(p);
  check(await p.locator('#menu-continue').isVisible(),'offline saved-game launch');await p.click('#menu-continue');await p.waitForTimeout(300);check(await p.evaluate(()=>!!(window as any).__severgrow.state()),'offline resume');
  const keys=await p.evaluate(()=>caches.keys());check(keys.includes('test-sentinel')&&keys.includes('severgrow-v2-scoped')&&keys.includes('severor-main2-v2')&&!keys.includes('severor-main2-v1'),'channel caches coexist; the old Futa04 cache is dropped');
  await c.setOffline(false);await p.goto(BASE+'/test/');await wait(p);check(await p.locator('#menu-lab').count()===1,'experimental Test preserved');await c.close();
}
console.log('Scoped offline launch and cache coexistence passed');
// A font-file failure is allowed to fall back; it must not reload the app.
{
  const c=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});const p=await c.newPage();let docs=0;
  p.on('request',r=>{if(r.isNavigationRequest())docs++;});await p.route('**/*.woff2',r=>r.abort());
  await p.goto(BASE+'/test2/');await wait(p);await p.waitForTimeout(1000);
  check(docs===1,'missing font files do not trigger reload');await c.close();
}
// Observe navigation completion instead of assuming an asset failure finishes in 1.6s.
async function settleRecovery(p:any, recovered:()=>boolean) {
  const deadline=Date.now()+10000;
  while(!recovered()&&Date.now()<deadline) await new Promise(ok=>setTimeout(ok,50));
  await p.waitForLoadState('load');
  await p.waitForTimeout(1000);
}
// Persistent missing entry script reloads once; successful startup resets the same raw key.
for (const asset of ['index', 'fonts']) {
  const c=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});const p=await c.newPage();let docs=0;
  p.on('request',r=>{if(r.isNavigationRequest())docs++;});await p.route(`**/test2/assets/${asset}-*.js`,r=>r.abort());
  await p.goto(BASE+'/test2/').catch(()=>{});
  await settleRecovery(p,()=>docs>=2);
  check(docs===2,`${asset}: persistent asset failure makes exactly one recovery reload (${docs} documents)`);
  check(await p.evaluate(()=>({...sessionStorage})['main2:fresh-reload'])==='1','recovery raw namespace retained on failure');
  await p.unroute(`**/test2/assets/${asset}-*.js`);await p.reload();await wait(p);
  check(await p.evaluate(()=>({...sessionStorage})['main2:fresh-reload'])===undefined,'working startup resets same recovery key');
  await p.route(`**/test2/assets/${asset}-*.js`,r=>r.abort());const before=docs;await p.reload().catch(()=>{});await settleRecovery(p,()=>docs-before>=2);check(docs-before===2,'later upgrade can recover once again');await c.close();
}
console.log(`${checks} quality/storage/offline checks passed`);
} finally {await browser.close();server.close();}
