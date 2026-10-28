// THE GROWING TERRITORY, end to end (owner, 2026-10-27): the map grows around its tiles, a tile can
// be grown anywhere on the seen map, the fog shows where it can grow, the RANKING drops over the map,
// the activity strip flies to a placement, and "find my land" centres on your own tiles.
//
// A real economy (memory) behind the real HTTP app; the product build points at it. Three other
// players hold tiles; this device's guest gets 300 Seeds and grows a tile at the far east coast.
//
//   npx tsx web/e2e/territory-growth.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { chainRouters } from '../../server/src/feedback/feedback.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { WORLD_CELL_IDS } from '../../server/src/world.js';
import { createTerritoryChatRouter, memoryTerritoryChatStore } from '../../server/src/chat/territory.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const store = new MemoryWorldEconomyStore();
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({ service, config, live: chainRouters(createTerritoryChatRouter({ store: memoryTerritoryChatStore(storage), service, storage }), createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) })) });
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });
// three other players with land
const others = await Promise.all([guestOf(), guestOf(), guestOf()]);
const otherCells = [['0,0', '1,0', '2,0'], ['-5,3', '-4,3'], ['3,-6']];
for (const [i, g] of others.entries()) {
  await fund(g.player.id, otherCells[i]!.length);
  for (const [j, cell] of otherCells[i]!.entries()) await store.claim(g.player.id, cell, `other-${i}-${j}-req`, Date.now() - (10 - j) * 60_000);
}
const me = await guestOf();
await fund(me.player.id, 3);
await store.claim(me.player.id, '-2,-4', 'menu-owned-fixture', Date.now());
await store.acknowledgeInvitation(me.player.id); // the one-time 100 Seeds card is not what this suite tests
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind });

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

const count = (p: Page, sel: string) => p.evaluate((s) => document.querySelectorAll(s).length, sel);
const openTools = async (p: Page) => {
  if (!(await p.isVisible('#online-world-panel'))) await p.click('#online-world-menu');
  await p.waitForSelector('#online-world-panel:not([hidden])');
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, identity);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex.available', { timeout: 20_000 });
  await page.waitForTimeout(700);
  const before = await count(page, '.world-hex');
  check('the map opens at the v2 coast plus the land around the tiles', before >= WORLD_CELL_IDS.size, `${before} cells`);
  check('the fog shows land beyond the coast', (await count(page, '.world-fog.ring-1')) > 0 && (await count(page, '.world-fog.ring-2')) > 0);
  // ONE MENU KEY (owner, 2026-10-28): no row of keys over the map. The four corners mirror each
  // other: find-my-land top-left, MENU top-right, FIT bottom-right, all on one edge.
  check('there is no row of menu keys over the map', (await count(page, '#online-world-deck, #world-tab-actions')) === 0);
  const sym = await page.evaluate(() => {
    const g = document.getElementById('online-world-grid')!.getBoundingClientRect();
    const k = document.getElementById('online-world-menu')!.getBoundingClientRect();
    const f = document.getElementById('online-world-fit')!.getBoundingClientRect();
    return { menuTop: k.top - g.top, menuRight: g.right - k.right, fitBottom: g.bottom - f.bottom, fitRight: g.right - f.right,
      menuH: k.height, fitH: f.height, gridL: g.left, gridR: innerWidth - g.right };
  });
  check('the map window is centred on the screen', Math.abs(sym.gridL - sym.gridR) <= 1, JSON.stringify(sym));
  check('only one navigation key remains on the map', await page.locator('.world-grid > button').count()===1);
  await openTools(page);
  check('menu contains labelled My land, Fit map and Chat tools', await page.locator('.world-menu-tools button').count()===3 && await page.locator('#online-world-fit').isVisible());
  await page.click('#world-panel-close');
  check('the coordinates read-out is gone', (await count(page, '#online-world-coord')) === 0);
  const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, col: document.querySelector('.online-world .online-inner')!.getBoundingClientRect().right }));
  check('the strip never widens the screen (no sideways scroll)', overflow.doc <= overflow.win && overflow.col <= overflow.win, JSON.stringify(overflow));
  const dash = await page.evaluate(() => { const el = document.querySelector('.world-hex.available'); return el ? getComputedStyle(el).strokeDasharray : 'none'; });
  check('free tiles keep a solid edge', dash === 'none', dash);
  await page.screenshot({ path: `${SHOTS}/territory-open-390x844.png` });

  await page.click('#online-world-menu');
  await page.waitForSelector('#online-world-panel:not([hidden])');
  await page.screenshot({path:`${SHOTS}/single-menu-phone.png`});
  check('three labelled tools live only in the menu', await page.locator('.world-menu-tools button').count()===3);
  check('my land has an ivory ownership perimeter', await page.locator('.world-border-edge').evaluate(e=>getComputedStyle(e).stroke==='rgb(242, 229, 197)'));
  await page.click('#online-world-mine');
  check('My land returns to the map',await page.isHidden('#online-world-panel'));
  await page.screenshot({path:`${SHOTS}/owned-land-phone.png`});
  await page.click('#online-world-menu');
  await page.click('#online-world-fit');
  check('Fit is a one-tap reset and closes the menu', await page.isHidden('#online-world-panel') && await page.getAttribute('#online-world-fit','aria-pressed')==='true');
  const fit=await page.getAttribute('.world-map-svg','viewBox');
  const rect=await page.locator('.world-map-svg').boundingBox(); if(!rect)throw new Error('map absent');
  const x=rect.x+rect.width*.5,y=rect.y+rect.height*.5;
  await page.mouse.move(x,y);await page.mouse.wheel(0,-80);await page.waitForTimeout(100);
  check('wheel zoom works directly after Fit',await page.getAttribute('.world-map-svg','viewBox')!==fit);
  const beforeTap=await page.getAttribute('.world-map-svg','viewBox');
  await page.touchscreen.tap(x,y);
  check('ordinary tap does not zoom',await page.getAttribute('.world-map-svg','viewBox')===beforeTap);
  await page.waitForSelector('#online-world-panel:not([hidden])');
  check('tile actions appear in the same menu', await page.locator('#online-world-panel #online-world-selection').isVisible());
  await page.click('#world-panel-close');
  await page.click('#online-world-menu');await page.click('#online-world-fit');
  const beforePinch=await page.getAttribute('.world-map-svg','viewBox');
  const cdp=await context.newCDPSession(page);
  const points=(d:number)=>[{x:x-d,y,id:1},{x:x+d,y,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(35)});
  for(const d of [42,50,58,65])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
  check('real touch pinch zooms from Fit',await page.getAttribute('.world-map-svg','viewBox')!==beforePinch);
  check('pinch release does not open tile actions',await page.isHidden('#online-world-panel'));
  await page.click('#online-world-menu');await page.click('#online-world-chat');
  await page.waitForSelector('#world-chat-back');await page.click('#world-chat-back');
  check('chat returns to the menu',await page.isVisible('#online-world-panel'));
  await page.click('#world-panel-close');
  await page.setViewportSize({width:320,height:568});
  await page.click('#online-world-menu');await page.waitForTimeout(180);
  check('narrow phone menu stays within the viewport',await page.locator('#online-world-panel').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
  await page.screenshot({path:`${SHOTS}/single-menu-320.png`});
  await page.click('#world-panel-close');
  await page.setViewportSize({width:844,height:390});
  await page.click('#online-world-menu');await page.click('#online-world-chat');
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:240});visualViewport!.dispatchEvent(new Event('resize'));});
  check('landscape keyboard keeps chat usable',await page.locator('#world-chat-input').evaluate(e=>e.getBoundingClientRect().bottom<=visualViewport!.height));
  await page.evaluate(()=>{delete (visualViewport as any).height;visualViewport!.dispatchEvent(new Event('resize'));});
  await page.click('#world-chat-back');await page.click('#world-panel-close');
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(300);
  check('desktop also has only one map key',await page.locator('.world-grid > button').count()===1);
  await page.click('#online-world-menu');await page.screenshot({path:`${SHOTS}/single-menu-desktop.png`});
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} territory-growth checks failed`);
  process.exit(1);
}
console.log('territory-growth checks passed');
process.exit(0);
