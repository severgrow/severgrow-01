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
const grow = async (p: Page, cellId: string) => {
  await p.focus(`.world-hex[data-cell-id="${cellId}"]`);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.world-claim-button', { timeout: 10_000 });
  await p.click('.world-claim-button');
  await p.waitForFunction(() => document.querySelector('.world-claim-button')?.textContent === 'CONFIRM GROW');
  await p.click('.world-claim-button');
  await p.waitForSelector(`.world-hex.mine[data-cell-id="${cellId}"]`, { timeout: 20_000 });
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

  // anywhere: a tile far from any other, then one at the east coast
  await grow(page, '-2,-4');
  check('a first tile can go anywhere', true);
  await grow(page, '8,0');
  check('a second tile need not touch the first (owner experiment)', true);
  await page.waitForTimeout(300);
  const risen = await count(page, '.world-hex-face.rising');
  const after = await count(page, '.world-hex');
  check('a tile at the coast uncovers new land', after > before, `${before} → ${after}`);
  check('the new land rises in', risen > 0, `${risen} rising`);
  check('the line says how much was uncovered', /UNCOVERED/.test(await page.textContent('#online-world-notice') ?? ''), await page.textContent('#online-world-notice') ?? '');
  check('the coast moved: two rings of land beyond the new tile', (await count(page, '.world-hex[data-cell-id="10,0"]')) === 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/territory-grown-390x844.png` });
  // the next tile can go on the new land
  await grow(page, '10,0');
  check('the uncovered land can be grown on', true);

  // the ranking, in the one window
  const rippled = await page.evaluate(() => document.querySelectorAll('.world-ripple').length);
  check('growing a tile sends a ripple out over the land', rippled > 0, `${rippled} rings`);
  check('my land carries one soft outline', (await count(page, '.world-border-edge')) === 1 && (await count(page, '.world-border-glow')) === 1);
  await page.click('#online-world-menu');
  await page.waitForSelector('#online-world-panel:not([hidden])');
  await page.click('#world-tab-ranking');
  const place = (await page.textContent('#world-standing')) ?? '';
  check('my standing names my place and the tiles to pass the next player', /#\d+ of 4/i.test(place) && /to pass/i.test(place), place);
  check('the latest placements are listed under the ranking', (await count(page, '.world-activity-chip')) === 5);
  const panel = await page.evaluate(() => { const p = document.getElementById('online-world-panel')!.getBoundingClientRect(); const g = document.getElementById('online-world-grid')!.getBoundingClientRect(); return { l: p.left - g.left, r: g.right - p.right }; });
  check('the window is centred over the map', Math.abs(panel.l - panel.r) <= 1, JSON.stringify(panel));
  const rows = await page.$$eval('.world-ranking-row', (els) => els.map((e) => ({ text: e.textContent ?? '', mine: e.classList.contains('mine') })));
  check('the ranking lists every player, most tiles first', rows.length === 4 && /3$/.test(rows[0]!.text), rows.map((r) => r.text).join(' | '));
  check('my row is marked', rows.some((r) => r.mine && r.text.includes('YOU')));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/territory-ranking-390x844.png` });
  await page.click('.world-ranking-list li:last-child .world-ranking-row');
  check('picking a row closes the window', await page.evaluate(() => document.getElementById('online-world-panel')!.hidden === true));

  // find my land and the activity strip
  check('find my land wakes once I hold tiles', await page.isEnabled('#online-world-mine'));
  const vb0 = await page.getAttribute('.world-map-svg', 'viewBox');
  await page.click('#online-world-menu');
  check('the window reopens on the tab it was left on', (await page.getAttribute('#online-world-panel', 'data-tab')) === 'ranking');
  await page.click('.world-activity-chip:nth-child(5)');
  await page.waitForTimeout(200);
  const vb1 = await page.getAttribute('.world-map-svg', 'viewBox');
  check('an activity chip flies the map to that tile', vb0 !== vb1, `${vb0} → ${vb1}`);
  await page.click('#online-world-mine');
  await page.waitForTimeout(200);
  check('find my land moves the map back to my tiles', (await page.getAttribute('.world-map-svg', 'viewBox')) !== vb1);
  // land in several places: each press shows the next patch (owner, 2026-10-28)
  const vbA = await page.getAttribute('.world-map-svg', 'viewBox');
  await page.click('#online-world-mine');
  await page.waitForTimeout(200);
  const vbB = await page.getAttribute('.world-map-svg', 'viewBox');
  check('a second press of find-my-land shows a different patch of my land', vbA !== vbB && /^\d\/\d$/.test((await page.getAttribute('#online-world-mine', 'data-patch')) ?? ''), `${vbA} → ${vbB}`);

  // selling a tile (owner, 2026-10-27): my tile at 10,0, from the selection bar
  const walletBefore = await page.textContent('#online-world-wallet');
  await page.focus('.world-hex[data-cell-id="10,0"]');
  await page.keyboard.press('Enter');
  const sellKey = (await page.textContent('#online-world-selection .world-claim-button'))?.trim() ?? '';
  check('my selected tile offers to sell it', /^sell this tile · \+100$/i.test(sellKey), sellKey);
  await page.click('#online-world-selection .world-claim-button');
  await page.waitForFunction(() => /confirm sell/i.test(document.querySelector('#online-world-selection .world-claim-button')?.textContent ?? ''));
  await page.click('#online-world-selection .world-claim-button');
  await page.waitForSelector('.world-hex[data-cell-id="10,0"]:not(.mine)', { timeout: 20_000 });
  const walletAfter = await page.textContent('#online-world-wallet');
  check('selling gives back 100 and frees the tile', /100/.test(walletAfter ?? '') && walletBefore !== walletAfter, `${walletBefore} → ${walletAfter}`);
  check('the server freed it', !(await store.world()).claims.some((c) => c.cellId === '10,0'));

  // challenges: CURRENT and HISTORY are two sections of one tab, each with an honest empty line
  await page.click('#online-world-menu');
  await page.click('#world-tab-challenges');
  await page.waitForSelector('#online-world-panel[data-tab="challenges"]:not([hidden])');
  check('no open challenges says so', (await page.textContent('#world-challenges-empty'))?.trim() === 'No open challenges.');
  check('the history section says so too', (await page.textContent('#world-history-empty'))?.trim() === 'No past challenges yet.');
  const centred = await page.evaluate(() => { const p = document.getElementById('online-world-panel')!.getBoundingClientRect(); const g = document.getElementById('online-world-grid')!.getBoundingClientRect(); return { l: p.left - g.left, r: g.right - p.right }; });
  check('the challenges tab sits in the same centred window', Math.abs(centred.l - centred.r) <= 1, JSON.stringify(centred));
  await page.screenshot({ path: `${SHOTS}/territory-challenges-390x844.png` });
  await page.click('#world-panel-close');

  // the ambient life: own tiles glint, fresh tiles halo, fog breathes, motes drift
  check('my tiles carry the glint', (await count(page, '.world-hex-face.mine')) > 0);
  check('fresh tiles keep a soft halo', (await count(page, '.world-hex.fresh')) > 0 && (await count(page, '.world-halos .world-halo')) > 0);
  const soft = await page.evaluate(() => ['.world-fog-layer', '.world-spores', '.world-halos', '.world-border-glow']
    .map((sel) => document.querySelector(sel)?.getAttribute('filter') ?? 'none'));
  check('mist, motes, halos and glow are softly blurred', soft.every((f) => /^url\(#world-blur-/.test(f)), soft.join(' '));
  check('the fog breathes in two rings', (await count(page, '.world-fog-ring')) === 2);
  check('a few motes drift off the land', (await count(page, '.world-spore')) > 0);

  // TERRITORY CHAT (owner, 2026-10-28): one shared channel, from the bottom-left key
  await page.click('#online-world-chat');
  await page.waitForSelector('#online-world-chat-panel:not([hidden])');
  check('an empty chat says so', (await page.textContent('#world-chat-empty'))?.includes('Say hello') === true);
  await page.fill('#world-chat-input', 'hello territory');
  await page.press('#world-chat-input', 'Enter');
  await page.waitForSelector('.world-chat-line.mine');
  const mineLine = await page.textContent('.world-chat-line.mine');
  check('my message shows with my nickname and tag', /hello territory/.test(mineLine ?? '') && /#[0-9A-Z]{4}/.test(mineLine ?? ''), mineLine ?? '');
  check('the box clears after sending', (await page.inputValue('#world-chat-input')) === '');
  const other = others[0]!;
  const say = (text: string) => fetch(`${apiBase}/v1/territory/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${other.token}` }, body: JSON.stringify({ text, requestId: crypto.randomUUID() }) });
  await say('hi from the north');
  await page.waitForSelector('.world-chat-line:not(.mine)', { timeout: 10_000 });
  check("another player's message arrives while the chat is open", /hi from the north/.test((await page.textContent('.world-chat-line:not(.mine)')) ?? ''));
  const chatBox = await page.evaluate(() => { const c = document.getElementById('online-world-chat-panel')!.getBoundingClientRect(); const g = document.getElementById('online-world-grid')!.getBoundingClientRect(); const k = document.getElementById('online-world-chat')!.getBoundingClientRect(); return { left: c.left - g.left, keyLeft: k.left - g.left, above: k.top - c.bottom }; });
  check('the chat rises from its corner, on the key\'s edge', chatBox.left === chatBox.keyLeft && chatBox.above > 0 && chatBox.above < 16, JSON.stringify(chatBox));
  await page.screenshot({ path: `${SHOTS}/territory-chat-390x844.png` });
  await page.click('.world-chat-line:not(.mine)');
  check('tapping their message offers Block and Report', (await page.$$eval('.world-chat-mod button', (b) => b.map((x) => x.textContent))).join('|') === 'Block|Report');
  await page.click('.world-chat-mod button:last-child');
  await page.waitForFunction(() => /Reported/.test(document.getElementById('world-chat-status')?.textContent ?? ''));
  check('a report is acknowledged', true);
  await page.click('.world-chat-line:not(.mine)');
  await page.click('.world-chat-mod button:first-child');
  check('block asks once more', (await page.textContent('.world-chat-mod button:first-child')) === 'Confirm block');
  await page.click('.world-chat-mod button:first-child');
  await page.waitForFunction(() => !document.querySelector('.world-chat-line:not(.mine)'));
  check("a blocked player's messages disappear", true);
  await page.click('#online-world-menu');
  check('opening the menu shuts the chat (one window at a time)', await page.isHidden('#online-world-chat-panel') && await page.isVisible('#online-world-panel'));
  await page.waitForTimeout(350); // the window's 200 ms arrival
  const covered = await page.evaluate(() => { const p = document.getElementById('online-world-panel')!.getBoundingClientRect(); const k = document.getElementById('online-world-menu')!.getBoundingClientRect(); return { pTop: p.top, kTop: k.top, pRight: p.right, kRight: k.right }; });
  check('the menu window lies exactly over the menu key', covered.pTop === covered.kTop && covered.pRight === covered.kRight, JSON.stringify(covered));
  await page.click('#world-panel-close');

  // the desktop view: bigger, and still centred
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  const desk = await page.evaluate(() => { const g = document.getElementById('online-world-grid')!.getBoundingClientRect(); return { w: g.width, l: g.left, r: innerWidth - g.right }; });
  check('on a desktop the map window is large and centred', desk.w >= 700 && Math.abs(desk.l - desk.r) <= 1, JSON.stringify(desk));
  await page.screenshot({ path: `${SHOTS}/territory-desktop-1440x900.png` });
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
