/** Standalone iPhone viewport and full-desktop composition regression checks. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const server = await preview({ configFile:'web/vite.config.ts', preview:{ port:4199, strictPort:true }, logLevel:'silent' });
const browser = await chromium.launch({ executablePath:process.env.PW_CHROMIUM ?? '/usr/bin/chromium', args:['--no-sandbox'] });
const base = 'http://localhost:4199/?seed=1';

try {
  const pwa = await browser.newPage({ viewport:{width:393,height:806}, isMobile:true, hasTouch:true });
  await pwa.addInitScript(() => {
    (window as any).__name=(fn:unknown)=>fn;
    Object.defineProperty(navigator,'standalone',{get:()=>true});
    Object.defineProperty(screen,'height',{get:()=>852});
    localStorage.setItem('main2:severgrow.settings.v1',JSON.stringify({sound:false,music:false,coach:false,autoSkip:false,reduceMotion:true}));
  });
  await pwa.goto(base);
  // Chromium has no iPhone safe-area env values. Reproduce their measured CSS
  // effect to test the recovered physical height and home-indicator clearance.
  await pwa.addStyleTag({content:'#safe-probe{padding-top:59px!important;padding-bottom:34px!important}.game>.hud{top:59px!important}.game>.play{padding-bottom:34px!important}'});
  await pwa.evaluate(()=>window.dispatchEvent(new Event('resize')));
  await pwa.waitForSelector('#deck.ready');
  await pwa.waitForTimeout(1100);
  const geometry = async () => pwa.evaluate(() => {
    const box=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect();
    const cards=[...document.querySelectorAll('#hand .card')].map(c=>c.getBoundingClientRect());
    return { game:box('#game').bottom, play:box('.play').bottom, dock:box('#dock').bottom,
      hand:Math.max(...cards.map(c=>c.bottom)), screen:screen.height, appHeight:document.documentElement.style.getPropertyValue('--futasaku-app-height') };
  });
  const first=await geometry();
  assert.equal(first.game,852,'standalone surface fills the physical screen');
  assert.equal(first.play,852,'play background extends to the bottom edge');
  assert.equal(first.dock,818,'dock occupies the area above the home indicator');
  assert(first.hand<=818 && first.hand>790,'hand uses the recovered space while clearing the home indicator');
  assert.equal(first.appHeight,'852px');
  await pwa.setViewportSize({width:393,height:852});
  await pwa.waitForTimeout(250);
  const resized=await geometry();
  assert.equal(resized.game,852,'viewport correction remains stable after resize');
  assert.equal(resized.dock,818,'safe-area position remains stable after resize');
  await pwa.close();

  const safari=await browser.newPage({viewport:{width:393,height:806},isMobile:true,hasTouch:true});
  await safari.addInitScript(()=>{(window as any).__name=(fn:unknown)=>fn;Object.defineProperty(screen,'height',{get:()=>852});});
  await safari.goto(base);await safari.waitForSelector('#deck.ready');
  const safariHeight=await safari.evaluate(()=>({game:document.querySelector('#game')!.getBoundingClientRect().height, override:document.documentElement.style.getPropertyValue('--futasaku-app-height')}));
  assert.equal(safariHeight.game,806,'Safari tab still uses its own visible viewport');
  assert.equal(safariHeight.override,'','standalone correction is absent in Safari');
  await safari.close();

  const desktop=await browser.newPage({viewport:{width:1920,height:1080}});
  await desktop.addInitScript(()=>{(window as any).__name=(fn:unknown)=>fn;});
  await desktop.goto(base);await desktop.waitForSelector('#deck.ready');
  const wide=await desktop.evaluate(()=>{
    const rect=(s:string)=>document.querySelector(s)!.getBoundingClientRect();
    return {boardRight:rect('#board-wrap').right,dockLeft:rect('#dock').left,dockWidth:rect('#dock').width,
      control:rect('#smart-context').width,card:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw'))};
  });
  assert(wide.boardRight<1150 && wide.dockLeft>1000 && wide.dockWidth>=750,'board and right instrument area share the screen');
  assert.equal(wide.control,64,'cockpit uses larger full-desktop controls');
  assert(wide.card>=110,'cards are visibly larger on full desktop');
  await desktop.close();
  console.log('Standalone viewport, Safari isolation, resize and desktop composition passed.');
} finally {
  await browser.close();
  await new Promise<void>(resolve=>server.httpServer.close(()=>resolve()));
}
