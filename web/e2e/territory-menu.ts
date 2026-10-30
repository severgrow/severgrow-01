// THE TERRITORY MENU (owner, 2026-10-28): "fit map and my land was to be removed, and ranking,
// challenges, chat, latest should be separate options using just icons ... MENU button stays and it's
// the only button visible straight away, 4 other keys open after clicking menu ... tapping empty tile
// should NOT open the menu and still have option to grow/sell/challenge without opening the menu".
//
// A real economy (memory) behind the real HTTP app; the product build points at it. Three other
// players hold tiles, one of them right beside this device's own tile, so all three tile actions
// (grow, sell, challenge) can be reached from the tile bar.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/territory-menu.ts
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
const otherCells = [['0,0', '1,0', '2,0'], ['-5,3', '-4,3'], ['3,-6', '-1,-4']];
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
const keysOut = (p: Page) => p.evaluate(() => document.getElementById('online-world-keys')!.classList.contains('open'));
const visible = (p: Page, sel: string) => p.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].filter((e) => {
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && !e.closest('[hidden]');
}).length, sel);
/** A tile's centre on screen, or null when it is outside the map window. */
const tileAt = (p: Page, id: string) => p.evaluate((cell) => {
  const el = document.querySelector(`.world-hex[data-cell-id="${cell}"]`);
  const svg = document.querySelector('.world-map-svg')?.getBoundingClientRect();
  if (!el || !svg) return null;
  const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
  return x > svg.left + 30 && x < svg.right - 30 && y > svg.top + 70 && y < svg.bottom - 70 ? { x, y } : null;
}, id);
/** Tap a tile with a real touch when it is on screen; otherwise select it from the keyboard. */
const tapTile = async (p: Page, id: string) => {
  const at = await tileAt(p, id);
  if (at) await p.touchscreen.tap(at.x, at.y);
  else { await p.focus(`.world-hex[data-cell-id="${id}"]`); await p.keyboard.press('Enter'); }
  await p.waitForTimeout(120);
  return !!at;
};
/** How far each key's drawn icon sits from its key's centre, in CSS px (ink, not the svg box). */
const iconOffsets = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('#online-world-keys .world-key')].map((key) => {
  const svg = key.querySelector<SVGSVGElement>('svg.world-key-icon')!;
  const k = key.getBoundingClientRect(); const s = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal; const ink = (svg as unknown as SVGGraphicsElement).getBBox();
  const scale = Math.min(s.width / vb.width, s.height / vb.height);
  const ox = s.left + (s.width - vb.width * scale) / 2, oy = s.top + (s.height - vb.height * scale) / 2;
  const cx = ox + (ink.x - vb.x + ink.width / 2) * scale, cy = oy + (ink.y - vb.y + ink.height / 2) * scale;
  return { id: key.id, dx: +(cx - (k.left + k.width / 2)).toFixed(1), dy: +(cy - (k.top + k.height / 2)).toFixed(1) };
}));
const barKey = (p: Page) => p.evaluate(() => {
  const bar = document.getElementById('online-world-selection')!;
  return bar.hidden ? null : (bar.querySelector('.world-claim-button')?.textContent ?? '');
});

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

  // ---- at rest: MENU is the only key -------------------------------------------------------------
  check('Fit map and My land are gone', (await count(page, '#online-world-fit, #online-world-mine, .world-menu-tools')) === 0);
  check('at rest MENU is the only key visible on the map', (await visible(page, '.world-grid button')) === 1 && await page.isVisible('#online-world-menu'));
  check('the five keys are not reachable at rest', await page.evaluate(() => document.getElementById('online-world-keys')!.hasAttribute('inert')));
  const grid0 = await page.evaluate(() => { const g = document.getElementById('online-world-grid')!.getBoundingClientRect(); return { l: g.left, r: innerWidth - g.right }; });
  check('the map window is centred on the screen', Math.abs(grid0.l - grid0.r) <= 1, JSON.stringify(grid0));
  await page.screenshot({ path: `${SHOTS}/territory-rest-390.png` });

  // ---- MENU slides out five icon keys -------------------------------------------------------------
  await page.click('#online-world-menu');
  await page.waitForTimeout(320);
  check('MENU slides out its row', await keysOut(page) && (await page.getAttribute('#online-world-menu', 'aria-expanded')) === 'true');
  const row = await page.evaluate(() => {
    const menu = document.getElementById('online-world-menu')!.getBoundingClientRect();
    const grid = document.getElementById('online-world-grid')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('#online-world-keys .world-key')].map((k) => {
      const r = k.getBoundingClientRect();
      return { id: k.id, label: k.getAttribute('aria-label'), text: k.textContent?.replace(/\d/g, '').trim(), icon: !!k.querySelector('svg.world-key-icon'),
        top: Math.round(r.top - menu.top), w: Math.round(r.width), h: Math.round(r.height), left: r.left, right: r.right, gridL: grid.left, menuL: menu.left };
    });
  });
  check('five keys: ranking, challenges, achievements, colour, chat (LATEST removed)', row.map((k) => k.id).join(',') === 'world-key-ranking,world-key-challenges,world-key-achievements,world-key-colour,online-world-chat' && (await count(page, '#world-key-latest, #online-world-activity')) === 0, JSON.stringify(row.map((k) => k.id)));
  check('each key is an icon only, with a spoken name', row.every((k) => k.icon && !k.text && !!k.label), JSON.stringify(row.map((k) => [k.label, k.text])));
  check('the row sits on MENU\'s line, every key 44px', row.every((k) => k.top === 0 && k.w === 44 && k.h === 44), JSON.stringify(row.map((k) => [k.top, k.w, k.h])));
  check('the row runs left to right in order and ends at MENU', row.every((k, i) => i === 0 || k.left > row[i - 1]!.right) && row[row.length - 1]!.right < row[row.length - 1]!.menuL && row[0]!.left >= row[0]!.gridL, JSON.stringify(row.map((k) => Math.round(k.left))));
  check('the podium icon carries 1, 2, 3', await page.evaluate(() => [...document.querySelectorAll('#world-key-ranking text')].map((t) => t.textContent).join('') === '123'));
  const offsets = await iconOffsets(page);
  check('every icon sits in the centre of its key (within 0.75px)', offsets.every((o) => Math.abs(o.dx) <= .75 && Math.abs(o.dy) <= .75), JSON.stringify(offsets));
  const glyph = await page.evaluate(() => { const k = document.getElementById('online-world-menu')!.getBoundingClientRect(); const g = document.querySelector('#online-world-menu .world-menu-glyph')!.getBoundingClientRect(); return { dx: Math.round((g.left + g.width / 2) - (k.left + k.width / 2)), dy: Math.round((g.top + g.height / 2) - (k.top + k.height / 2)) }; });
  check('MENU\'s close mark sits in the centre of MENU', Math.abs(glyph.dx) <= 1 && Math.abs(glyph.dy) <= 1, JSON.stringify(glyph));
  check('the challenges key carries the swords', (await count(page, '#world-key-challenges svg path.fill')) === 1);
  await page.screenshot({ path: `${SHOTS}/territory-keys-390.png` });

  // ---- each key opens its own page ---------------------------------------------------------------
  await page.click('#world-key-ranking');
  await page.waitForSelector('#online-world-panel:not([hidden])');
  check('RANKING opens its own page', (await page.getAttribute('#online-world-panel', 'data-pane')) === 'ranking' && (await page.textContent('#world-panel-title')) === 'Ranking');
  check('the ranking lists every player', (await count(page, '.world-ranking-row')) === 4);
  check('the open key is lit', await page.evaluate(() => document.getElementById('world-key-ranking')!.classList.contains('on')));
  const under = await page.evaluate(() => { const p = document.getElementById('online-world-panel')!.getBoundingClientRect(); const k = document.getElementById('online-world-menu')!.getBoundingClientRect(); return p.top - k.bottom; });
  check('the window hangs under the key row, so the keys stay in reach', under >= 4 && under <= 12, String(under));
  check('the keys stay out while a page is open', (await visible(page, '#online-world-keys .world-key')) === 5);
  await page.screenshot({ path: `${SHOTS}/territory-ranking-390.png` });
  await page.click('#world-key-challenges');
  await page.waitForTimeout(200);
  check('CHALLENGES swaps the page in place', (await page.getAttribute('#online-world-panel', 'data-pane')) === 'challenges' && await page.isVisible('#world-challenges-empty'));
  await page.click('#world-key-challenges');
  await page.waitForTimeout(200);
  const pressed = await iconOffsets(page);
  check('icons stay centred after a key has been pressed (the press layer is not a grid row)', pressed.every((o) => Math.abs(o.dx) <= .75 && Math.abs(o.dy) <= .75), JSON.stringify(pressed));
  check('pressing the lit key again shuts its page', await page.isHidden('#online-world-panel') && await keysOut(page));
  await page.click('#online-world-chat');
  await page.waitForSelector('#online-world-chat-panel:not([hidden])');
  check('CHAT opens the chat on its own', await page.isHidden('#online-world-panel') && (await page.getAttribute('#online-world-chat', 'aria-expanded')) === 'true');
  await page.click('#world-key-ranking');
  await page.waitForTimeout(200);
  check('one window at a time: a page shuts the chat', await page.isHidden('#online-world-chat-panel') && await page.isVisible('#online-world-panel'));
  await page.click('#online-world-chat');
  await page.waitForSelector('#online-world-chat-panel:not([hidden])');
  await page.click('#world-chat-back');
  await page.waitForTimeout(200);
  check('the chat\'s close key shuts it and leaves the keys out', await page.isHidden('#online-world-chat-panel') && await keysOut(page));
  // ---- ACHIEVEMENTS (owner, 2026-10-29): one-time Seeds, claimed from the row ------------------
  check('the achievements key lights when a reward is ready (this player holds a tile)',
    (await page.textContent('#world-key-achievements .world-deck-count'))?.trim() !== '' && await page.isVisible('#world-key-achievements .world-deck-count'));
  await page.click('#world-key-achievements');
  await page.waitForSelector('#online-world-panel[data-pane="achievements"]:not([hidden])');
  check('ACHIEVEMENTS lists all 35 goals in five sections', (await count(page, '.world-achievement')) === 35 && (await count(page, '.world-achievement-heading')) === 5);
  check('no intro line and no reward teaser (owner, 2026-10-30)', (await count(page, '#world-achievements-intro, .world-achievement-reward')) === 0 && !(await page.textContent('#online-world-achievements'))?.toLowerCase().includes('seeds for your first'));
  const seedsBefore = Number((await page.textContent('#online-world-wallet'))?.replace(/\D/g, '') ?? 0);
  check('an earned row is a CLAIM key; an unearned row has no action', (await page.getAttribute('.world-achievement.ready', 'data-state')) === 'ready' && (await count(page, '.world-achievement[data-state="open"] .world-achievement-claim')) === 0);
  await page.click('.world-achievement.ready .world-achievement-claim');
  await page.waitForSelector('.world-achievement.claimed', { timeout: 10_000 });
  const seedsAfter = Number((await page.textContent('#online-world-wallet'))?.replace(/\D/g, '') ?? 0);
  check('CLAIM pays the Seeds into the wallet at once', seedsAfter - seedsBefore === 100, `${seedsBefore} -> ${seedsAfter}`);
  check('a claimed row is a tick, and the moment plays once', (await count(page, '.world-achievement.claimed .world-achievement-done')) === 1 && (await count(page, '.world-achievement.just-claimed')) <= 1);
  await page.screenshot({ path: `${SHOTS}/territory-achievements-390.png` });
  await page.click('#world-key-ranking');
  await page.waitForSelector('#online-world-panel:not([hidden])');
  await page.click('#online-world-menu');
  await page.waitForTimeout(300);
  check('MENU folds the row and the page away', !(await keysOut(page)) && await page.isHidden('#online-world-panel') && (await visible(page, '.world-grid button')) === 1);

  // ---- a tap selects; the tile bar carries grow / sell / challenge -------------------------------
  const free = await page.evaluate(() => {
    const svg = document.querySelector('.world-map-svg')!.getBoundingClientRect();
    for (const el of document.querySelectorAll('.world-hex.available')) {
      const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x > svg.left + 60 && x < svg.right - 60 && y > svg.top + 120 && y < svg.bottom - 120) return { x, y, id: el.getAttribute('data-cell-id')! };
    }
    return null;
  });
  if (!free) throw new Error('no free tile on screen');
  const viewBefore = await page.getAttribute('.world-map-svg', 'viewBox');
  await page.touchscreen.tap(free.x, free.y);
  await page.waitForTimeout(150);
  check('tapping a free tile opens no menu and no window', await page.isHidden('#online-world-panel') && !(await keysOut(page)) && await page.isHidden('#online-world-chat-panel'));
  check('…and does not move the map', (await page.getAttribute('.world-map-svg', 'viewBox')) === viewBefore);
  check('the tile bar offers GROW A TILE', (await barKey(page)) === 'GROW A TILE', String(await barKey(page)));
  const barBox = await page.evaluate(() => { const b = document.getElementById('online-world-selection')!.getBoundingClientRect(); const g = document.getElementById('online-world-grid')!.getBoundingClientRect(); return { bottom: Math.round(g.bottom - b.bottom), centre: Math.round((b.left + b.right) / 2 - (g.left + g.right) / 2) }; });
  check('the bar floats at the map\'s foot, centred', barBox.bottom >= 8 && barBox.bottom <= 16 && Math.abs(barBox.centre) <= 1, JSON.stringify(barBox));
  await page.screenshot({ path: `${SHOTS}/territory-grow-bar-390.png` });
  await page.click('#online-world-selection .world-claim-button');
  check('GROW asks once more', (await barKey(page)) === 'CONFIRM GROW');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(900);
  check('a background refresh keeps the armed key', (await barKey(page)) === 'CONFIRM GROW');
  await page.click('#online-world-selection .world-claim-button');
  await page.waitForFunction((id) => document.querySelector(`.world-hex[data-cell-id="${id}"]`)?.classList.contains('mine'), free.id, { timeout: 10_000 });
  check('CONFIRM GROW grows the tile from the bar', true);
  await page.waitForTimeout(300);
  const sellLabel = await barKey(page);
  check('the tile bar now offers to sell it', /sell/i.test(sellLabel ?? ''), String(sellLabel));
  await tapTile(page, free.id);
  check('a second tap on the same tile lets it go', await page.isHidden('#online-world-selection'));
  const touched = await tapTile(page, '-1,-4');
  check('a rival tile beside mine offers CHALLENGE in the bar', (await barKey(page)) === 'CHALLENGE', `${await barKey(page)} (${touched ? 'touch' : 'keyboard'})`);
  check('…without opening the offer by itself', (await count(page, '.world-challenge-sheet:not([hidden])')) === 0);
  await page.click('#online-world-selection .world-claim-button');
  await page.waitForTimeout(600);
  check('CHALLENGE opens the challenge offer', (await count(page, '.world-challenge-sheet:not([hidden])')) === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- a tap on the map shuts an open page --------------------------------------------------------
  await page.click('#online-world-menu');
  await page.waitForTimeout(250);
  await page.click('#world-key-ranking');
  await page.waitForSelector('#online-world-panel:not([hidden])');
  const svgBox = (await page.locator('.world-map-svg').boundingBox())!;
  await page.touchscreen.tap(svgBox.x + svgBox.width * .5, svgBox.y + svgBox.height * .85);
  await page.waitForTimeout(250);
  check('a tap on the map shuts the open page and selects the tile', await page.isHidden('#online-world-panel') && await page.isVisible('#online-world-selection'));
  // a ranking row glides the view to that player
  await page.click('#world-key-ranking');
  await page.waitForSelector('#online-world-panel:not([hidden])');
  const glideFrom = await page.getAttribute('.world-map-svg', 'viewBox');
  await page.locator('.world-ranking-row').nth(1).click();
  await page.waitForTimeout(80);
  const mid = await page.getAttribute('.world-map-svg', 'viewBox');
  const moving = await page.evaluate(() => document.getElementById('online-world-grid')!.classList.contains('moving'));
  await page.waitForTimeout(700);
  const glideTo = await page.getAttribute('.world-map-svg', 'viewBox');
  check('a ranking row glides the map to that player', glideTo !== glideFrom && mid !== glideTo && moving, `${glideFrom} → ${mid} → ${glideTo}`);
  check('the map rests sharp again after the glide', !(await page.evaluate(() => document.getElementById('online-world-grid')!.classList.contains('moving'))));
  await page.click('#online-world-menu');
  await page.waitForTimeout(250);

  // ---- gestures ---------------------------------------------------------------------------------
  const rect = (await page.locator('.world-map-svg').boundingBox())!;
  const x = rect.x + rect.width * .5, y = rect.y + rect.height * .5;
  const wheelFrom = await page.getAttribute('.world-map-svg', 'viewBox');
  await page.mouse.move(x, y); await page.mouse.wheel(0, -80); await page.waitForTimeout(100);
  check('wheel zoom works', (await page.getAttribute('.world-map-svg', 'viewBox')) !== wheelFrom);
  await tapTile(page, '0,0'); await tapTile(page, '0,0');
  const beforePinch = await page.getAttribute('.world-map-svg', 'viewBox');
  const cdp = await context.newCDPSession(page);
  const points = (d: number) => [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(35) });
  for (const d of [42, 50, 58, 65]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(d) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150);
  check('real touch pinch zooms', (await page.getAttribute('.world-map-svg', 'viewBox')) !== beforePinch);
  check('pinch release does not select a tile', await page.isHidden('#online-world-selection'));
  await page.waitForTimeout(200);
  check('the soft focus returns once the map rests', !(await page.evaluate(() => document.getElementById('online-world-grid')!.classList.contains('moving'))));

  // ---- small, landscape and desktop ---------------------------------------------------------------
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(200);
  await page.click('#online-world-menu'); await page.waitForTimeout(300);
  const narrow = await page.evaluate(() => {
    const g = document.getElementById('online-world-grid')!.getBoundingClientRect();
    return [...document.querySelectorAll('#online-world-keys .world-key')].every((k) => { const r = k.getBoundingClientRect(); return r.left >= g.left + 4 && r.right <= g.right; });
  });
  check('on a 320px phone the whole row fits inside the map', narrow);
  await page.click('#world-key-ranking'); await page.waitForTimeout(200);
  check('narrow phone window stays within the viewport', await page.locator('#online-world-panel').evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  await page.screenshot({ path: `${SHOTS}/territory-ranking-320.png` });
  await page.click('#online-world-menu'); await page.waitForTimeout(250);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.click('#online-world-menu'); await page.waitForTimeout(250);
  await page.click('#online-world-chat');
  await page.waitForSelector('#online-world-chat-panel:not([hidden])');
  await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, value: 240 }); visualViewport!.dispatchEvent(new Event('resize')); });
  check('landscape keyboard keeps chat usable', await page.locator('#world-chat-input').evaluate((e) => e.getBoundingClientRect().bottom <= visualViewport!.height));
  await page.evaluate(() => { delete (visualViewport as any).height; visualViewport!.dispatchEvent(new Event('resize')); });
  await page.click('#world-chat-back');
  await page.click('#online-world-menu'); await page.waitForTimeout(250);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  check('desktop also shows only MENU at rest', (await visible(page, '.world-grid button')) === 1);
  await page.click('#online-world-menu'); await page.waitForTimeout(300);
  const deskOffsets = await iconOffsets(page);
  const glyph2 = await page.evaluate(() => { const k = document.getElementById('online-world-menu')!.getBoundingClientRect(); const g = document.querySelector('#online-world-menu .world-menu-glyph')!.getBoundingClientRect(); const c = document.querySelector('#world-key-challenges .world-deck-count') as HTMLElement; return { dx: Math.round((g.left + g.width / 2) - (k.left + k.width / 2)), dy: Math.round((g.top + g.height / 2) - (k.top + k.height / 2)), countPos: getComputedStyle(c).position }; });
  check('after many presses MENU\'s mark is still centred and the lamp still rides the corner', Math.abs(glyph2.dx) <= 1 && Math.abs(glyph2.dy) <= 1 && glyph2.countPos === 'absolute', JSON.stringify(glyph2));
  check('on desktop too every icon is centred in its key', deskOffsets.every((o) => Math.abs(o.dx) <= .75 && Math.abs(o.dy) <= .75), JSON.stringify(deskOffsets));
  await page.click('#world-key-ranking'); await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/territory-ranking-desktop.png` });
  await context.close();
} finally {
  await browser.close();
  await web.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
}
if (failed) {
  console.log(`${failed} territory-menu checks failed`);
  process.exit(1);
}
console.log('territory-menu checks passed');
process.exit(0);
