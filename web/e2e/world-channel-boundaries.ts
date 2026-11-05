/** A saved experimental cosmetic must never theme a production route. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
const fixture=await productFixture({offlineApiPort:65530});
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']});
try{
 for(const path of ['/','/2/','/3/','/test/']){
  const p=await browser.newPage({viewport:{width:390,height:844}});
  await p.addInitScript(`window.__name=(f)=>f;for(const prefix of ['futa05:','futa05-test:','futa05-3:']){localStorage.setItem(prefix+'severgrow.world-style.v1',JSON.stringify('ocean'));localStorage.setItem(prefix+'severgrow.settings.v1',JSON.stringify({sound:false,music:false,reduceMotion:true}));}`);
  await p.goto(fixture.origin+path);await p.waitForFunction(()=>!!(window as any).__severgrow?.ready?.());
  await p.locator('#menu-play').click();await p.locator('#menu-campaign').click();
  if(await p.locator('#sheet-campaign-start:not([hidden])').count())await p.locator('#csa-resume').click();
  await p.waitForFunction(()=>{const l=(window as any).__severgrow.lesson?.();return !!(window as any).__severgrow.state?.()&&(!l||!l.stage&&l.handSettled);});
  const material=await p.locator('#board .world-home-art').count();
  assert.equal(material,path==='/test/'?1:0,`${path}: correct experimental preference boundary`);
  console.log(`PASS ${path}: ${path==='/test/'?'selected Ocean world is applied':'saved experimental world is ignored'}`);
  await p.close();
 }
}finally{await browser.close();await fixture.close();}
