/** Planet windows share motion, but must keep their own reading position and drafts. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const me='11111111-1111-4111-8111-111111111111';
const world={version:WORLD_VERSION,revision:1,cost:100,challengeStake:0,cells:seenWorld(['0,0']),claims:[{cellId:'0,0',ownerId:me,ownerName:'Cedar',ownerLevel:3,ownerTag:'',colour:'hsl(150 32% 52%)',claimedAt:1}],disputes:[]};
try{
 const p=await browser.newPage({viewport:{width:320,height:568},hasTouch:true,isMobile:true});
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(`window.__name=(f)=>f;localStorage.setItem('futa05-test:futasaku.world.last.v1',${JSON.stringify(JSON.stringify(world))});localStorage.setItem('futa05-test:severgrow.duel.identity.v1',${JSON.stringify(JSON.stringify({token:'local',playerId:me,displayName:'Cedar',kind:'guest'}))});localStorage.setItem('futa05-test:severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:false}));`);
 await p.goto(fixture.origin+'/test/');await p.waitForFunction(()=>!!(window as any).__severgrow?.ready?.()&&!!(window as any).__severgrow.planet()?.ready);
 await p.locator('#menu-world').click();await p.locator('#online-world-menu').click();await p.locator('#world-key-colour').click();
 const body=p.locator('#online-world-panel .world-panel-body');
 const saved=await body.evaluate(e=>{e.scrollTop=e.scrollHeight;return e.scrollTop;});assert(saved>20,'phone fixture has a scrollable picker');
 await p.locator('#world-key-achievements').click();
 assert.equal(await body.evaluate(e=>e.scrollTop),0,'a different page starts at its own top');
 await p.locator('#world-key-colour').click();
 assert(Math.abs(await body.evaluate(e=>e.scrollTop)-saved)<1,'colour page restores its own position');
 console.log('PASS Planet windows keep independent reading positions');
 await p.evaluate(()=>{const key=document.getElementById('world-key-colour')!;key.click();key.click();});
 await p.waitForTimeout(220);
 assert(await p.locator('#online-world-panel').isVisible(),'interrupted close/reopen leaves the window visible');
 assert.equal(await p.locator('#online-world-panel').evaluate(e=>(e as HTMLElement).inert),false,'reopened panel is immediately usable');
 console.log('PASS rapid pane close/reopen cancels stale exits');
 await p.locator('#online-world-chat').click();
 await p.locator('#world-chat-input').fill('Keep this quiet draft');
 await p.locator('#world-key-colour').click();await p.locator('#online-world-chat').click();
 assert.equal(await p.locator('#world-chat-input').inputValue(),'Keep this quiet draft','pane switching retains the chat draft');
 assert.equal(await p.locator('#online-world-panel').evaluate(e=>(e as HTMLElement).inert),true,'chat owns focus while the other window closes');
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS Planet chat switching preserves draft, focus ownership and clean teardown');
 await p.close();
}finally{await browser.close();await fixture.close();}
