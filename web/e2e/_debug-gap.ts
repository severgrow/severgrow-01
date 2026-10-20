import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
const DIST='web/dist';
const types: Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((req,res)=>{const p=decodeURIComponent((req.url??'/').split('?')[0]!);if(!p.startsWith('/3/')){res.writeHead(404);res.end();return;}let f=join(DIST,p.slice(3)||'index.html');if(!existsSync(f)||f.endsWith('/'))f=join(DIST,'index.html');res.writeHead(200,{'content-type':types[extname(f)]??'application/octet-stream'});res.end(readFileSync(f));});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const URL3=`http://127.0.0.1:${(server.address() as AddressInfo).port}/3/`;
const browser=await chromium.launch({args:['--no-sandbox']});
for (const [w,h] of [[360,640],[390,844],[320,568]] as const){
  const page=await browser.newPage({viewport:{width:w,height:h},isMobile:true,hasTouch:true});
  await page.goto(URL3,{waitUntil:'networkidle'});
  const done=CAMPAIGN_LEVELS.slice(0,4).map(l=>l.id);
  await page.evaluate(`localStorage.setItem('severgrow.campaign.progress.v3', ${JSON.stringify(JSON.stringify({version:1,unlocked:5,completed:done,best:{}}))})`);
  await page.reload({waitUntil:'networkidle'});
  await page.evaluate(()=> (document.getElementById('menu-play') as HTMLButtonElement).click());
  await page.waitForSelector('#menu-campaign:not([hidden])',{timeout:10000});
  await page.evaluate(()=> (document.getElementById('menu-campaign') as HTMLButtonElement).click());
  await page.waitForSelector('#game:not([hidden]), #sheet-campaign-start:not([hidden])',{timeout:15000});
  if(await page.evaluate(()=>!document.getElementById('sheet-campaign-start')!.hidden)) await page.evaluate(()=> (document.getElementById('csa-resume') as HTMLButtonElement).click());
  await page.waitForFunction(()=>!!(window as any).__severgrow?.state?.(),undefined,{timeout:15000});
  const ok=await page.waitForFunction(()=> (window as any).__severgrow?.lesson?.()?.beat?.id==='5:intro:bloom-cards',undefined,{timeout:20000}).then(()=>true).catch(()=>false);
  await page.waitForTimeout(700);
  const out=await page.evaluate(`(() => {
    const R=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();return {t:+r.top.toFixed(1),b:+r.bottom.toFixed(1),l:+r.left.toFixed(1),r:+r.right.toFixed(1),h:+r.height.toFixed(1)};};
    const plate=document.getElementById('lesson-plate');
    const ex=plate.querySelector('.lesson-example');
    const hexes=[...document.querySelectorAll('#board .hex-cell')];
    const pr=plate.getBoundingClientRect();
    const covers=hexes.filter(e=>{const r=e.getBoundingClientRect();return pr.left<r.right-0.5&&pr.right>r.left+0.5&&pr.top<r.bottom-0.5&&pr.bottom>r.top+0.5;}).length;
    return { beat:(window).__severgrow.lesson()?.beat?.id, plate:R(plate), ex:R(ex), exHidden:ex.hidden, rows:[...(ex.querySelectorAll('.lesson-example-row'))].filter(r=>!r.hidden).length, hexes:hexes.length, covers, gap:+(Math.min(...hexes.map(e=>e.getBoundingClientRect().top))-document.querySelector('#game > .hud').getBoundingClientRect().bottom).toFixed(1) };
  })()`);
  console.log(w+'x'+h, ok?'beat-ok':'beat-MISSING', JSON.stringify(out));
  await page.close();
}
await browser.close();await server.close();
