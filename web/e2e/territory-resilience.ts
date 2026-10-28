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
  const corners = await page.evaluate(() => {
    const g = document.getElementById('online-world-grid')!.getBoundingClientRect();
    return ['online-world-mine', 'online-world-menu', 'online-world-fit', 'online-world-chat'].map((id) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return { id, w: r.width, h: r.height, top: r.top - g.top, left: r.left - g.left, right: g.right - r.right, bottom: g.bottom - r.bottom,
        frame: getComputedStyle(document.getElementById(id)!, '::before').backgroundImage.includes('button-frame-supplied') };
    });
  });
  const [tl, tr, br, bl] = corners;
  check('four corner keys: tiles, menu, zoom, chat — one size, the cockpit frame, one edge',
    corners.every((c) => c.w === 44 && c.h === 44 && c.frame) &&
    tl!.top === tl!.left && tr!.top === tr!.right && br!.bottom === br!.right && bl!.bottom === bl!.left && tl!.top === br!.bottom,
    JSON.stringify(corners.map((c) => [c.id.replace('online-world-', ''), c.w, c.top, c.left, c.right, c.bottom, c.frame])));
  check('the coordinates read-out is gone', (await count(page, '#online-world-coord')) === 0);
  const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, col: document.querySelector('.online-world .online-inner')!.getBoundingClientRect().right }));
  check('the strip never widens the screen (no sideways scroll)', overflow.doc <= overflow.win && overflow.col <= overflow.win, JSON.stringify(overflow));
  const dash = await page.evaluate(() => { const el = document.querySelector('.world-hex.available'); return el ? getComputedStyle(el).strokeDasharray : 'none'; });
  check('free tiles keep a solid edge', dash === 'none', dash);
  await page.screenshot({ path: `${SHOTS}/territory-open-390x844.png` });

  // Fresh local review probes; never production.
  await page.click('#online-world-chat');
  await page.waitForSelector('#online-world-chat-panel:not([hidden])');
  const other=others[0]!;
  await fetch(`${apiBase}/v1/territory/chat`, {method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${other.token}`},body:JSON.stringify({text:'A message for keyboard moderation',requestId:crypto.randomUUID()})});
  await page.waitForSelector('.world-chat-line:not(.mine)');
  await page.focus('.world-chat-line:not(.mine)');
  await page.waitForTimeout(4300);
  check('refresh preserves the focused message', await page.locator('.world-chat-line:not(.mine)').evaluate(e=>e===document.activeElement));
  console.log('AUDIT_FOCUS_AFTER_POLL',await page.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id})));
  let hiddenReads=0;
  await page.route('**/v1/territory/chat',async route=>{if(route.request().method()==='GET')hiddenReads++;await route.continue();});
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));
  await page.waitForTimeout(4500);
  check('hidden chat makes no history requests', hiddenReads===0);
  console.log('AUDIT_HIDDEN_READS',hiddenReads);
  await page.evaluate(()=>delete (document as any).hidden);
  await page.unroute('**/v1/territory/chat');
  await page.click('.world-chat-line:not(.mine)');
  console.log('AUDIT_TARGETS',await page.$$eval('.world-chat-mod button, #world-chat-send',es=>es.map(e=>({text:e.textContent,height:e.getBoundingClientRect().height}))));
  await page.screenshot({path:`${SHOTS}/audit-mobile-message-actions.png`});
  await page.click('.world-chat-line:not(.mine)');
  let loseResponse=true,delaySend=false;
  await page.route('**/v1/territory/chat',async route=>{
    if(route.request().method()==='POST' && loseResponse){
      loseResponse=false;await route.fetch();await route.abort();return;
    }
    if(route.request().method()==='POST' && delaySend){await new Promise(r=>setTimeout(r,500));}
    await route.continue();
  });
  await page.fill('#world-chat-input','Ambiguous response retry');
  await page.click('#world-chat-send');
  await page.waitForFunction(()=>document.getElementById('world-chat-status')?.textContent?.includes('Could not send'));
  await page.click('#world-chat-send');
  await page.waitForFunction(()=>document.getElementById('world-chat-input')?.getAttribute('data-none')===null);
  await page.waitForTimeout(700);
  check('lost-response retry creates only one message', await page.locator('.world-chat-text').filter({hasText:'Ambiguous response retry'}).count()===1);
  console.log('AUDIT_RETRY_DUPLICATES',await page.locator('.world-chat-text').filter({hasText:'Ambiguous response retry'}).count());
  delaySend=true;
  await page.fill('#world-chat-input','First text');
  await page.click('#world-chat-send');
  await page.fill('#world-chat-input','Next draft typed during send');
  await page.waitForTimeout(900);
  check('send completion preserves the next draft', await page.inputValue('#world-chat-input')==='Next draft typed during send');
  console.log('AUDIT_DRAFT_AFTER_PENDING',JSON.stringify(await page.inputValue('#world-chat-input')));
  delaySend=false;
  // A mobile visual viewport shrinks when the OS keyboard opens; layout viewport stays the same.
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:430});visualViewport!.dispatchEvent(new Event('resize'));});
  check('composer stays inside visible keyboard viewport', await page.locator('#world-chat-input').evaluate(e=>e.getBoundingClientRect().bottom<=visualViewport!.height));
  console.log('AUDIT_KEYBOARD',await page.locator('#world-chat-input').evaluate(e=>({bottom:e.getBoundingClientRect().bottom,visibleBottom:visualViewport!.height})));
  await page.screenshot({path:`${SHOTS}/audit-keyboard-390x844.png`});
  await page.evaluate(()=>{delete (visualViewport as any).height;visualViewport!.dispatchEvent(new Event('resize'));});
  await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);
  console.log('AUDIT_NARROW',await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,panel:document.getElementById('online-world-chat-panel')!.getBoundingClientRect().toJSON()})));
  await page.screenshot({path:`${SHOTS}/audit-chat-320x568.png`});
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);
  await page.screenshot({path:`${SHOTS}/audit-chat-landscape.png`});
  console.log('AUDIT_LANDSCAPE',await page.evaluate(()=>({panel:document.getElementById('online-world-chat-panel')!.getBoundingClientRect().toJSON(),input:document.getElementById('world-chat-input')!.getBoundingClientRect().toJSON()})));
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(250);
  await page.screenshot({path:`${SHOTS}/audit-chat-desktop.png`});
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
