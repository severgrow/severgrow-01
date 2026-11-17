/** Controlled Planet/chat loading paths, with no production network or data writes. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';

const fixture = await productFixture({ offlineApiPort: 65530 });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? chromium.executablePath(),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const owner = '11111111-1111-4111-8111-111111111111';
const claim = (cellId: string) => ({ cellId, ownerId: owner, ownerName: 'Cedar', ownerLevel: 3,
  ownerTag: '', colour: 'hsl(150 32% 52%)', claimedAt: 1 });
const oldWorld = { version: WORLD_VERSION, revision: 1, cost: 100, challengeStake: 0,
  cells: seenWorld(['0,0']), claims: [claim('0,0')], disputes: [] };
const freshWorld = { ...oldWorld, revision: 2, cells: seenWorld(['0,0', '1,0']),
  claims: [claim('0,0'), claim('1,0')] };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version' };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const stored = (world: typeof oldWorld | null) => ({ world, owner });

try {
  // The menu already knows the last valid world. A fresh response arrives in 80 ms while
  // private wallet/challenge endpoints take 800 ms. Its ownership must reach the Planet first.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let release!: () => void;
  let privateFirstEnd = Infinity;
  const firstPaths: string[] = [];
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    firstPaths.push(path);
    let body: unknown = { ok: false, code: 'UNAVAILABLE', message: 'test fixture' };
    let ms = 0;
    if (path === '/v1/world') { await gate; ms = 80; body = { ok: true, world: freshWorld }; }
    else if (path === '/v1/seeds/wallet') { await gate; ms = 800; body = { ok: true, wallet: { balance: 50, lifetimeEarned: 50, lifetimeSpent: 0, worldInvitationSeen: true } }; }
    else if (path === '/v1/world/challenges') { await gate; ms = 800; body = { ok: true, incoming: [], outgoing: [], serverNow: Date.now() }; }
    else if (path === '/v1/territory/chat') body = { ok: true, messages: [] };
    if (ms) await delay(ms);
    if (path === '/v1/seeds/wallet' || path === '/v1/world/challenges')
      privateFirstEnd = Math.min(privateFirstEnd, performance.now());
    await route.fulfill({ status: (body as { ok: boolean }).ok ? 200 : 503, headers: cors,
      contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(storedWorld => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
    localStorage.setItem('futa05-test:severgrow.duel.identity.v1', JSON.stringify({ token: 'local', playerId: storedWorld.owner, displayName: 'Cedar', kind: 'guest' }));
    if (storedWorld.world) localStorage.setItem('futa05-test:futasaku.world.last.v1', JSON.stringify(storedWorld.world));
  }, stored(oldWorld));
  const bootAt = performance.now();
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction(() => !!(window as any).__severgrow?.ready?.());
  const bootMs = Math.round(performance.now() - bootAt);
  const cachedAt = performance.now();
  await page.locator('#menu-world').click();
  await page.locator('#online-world-menu').click();
  await page.locator('#world-key-ranking').click();
  await page.waitForFunction(() => document.querySelector('#online-world-ranking .world-ranking-tiles')?.textContent === '1');
  const cachedMs = Math.round(performance.now() - cachedAt);
  const t0 = performance.now();
  release();
  try {
    await page.waitForFunction(() => document.querySelector('#online-world-ranking .world-ranking-tiles')?.textContent === '2', null, { timeout: 6000 });
  } catch (error) {
    console.log('PLANET_DIAGNOSTIC', JSON.stringify({ firstPaths,
      ranking: await page.locator('#online-world-ranking').textContent(),
      notice: await page.locator('#online-world-notice').textContent() }));
    throw error;
  }
  const worldPaintAt = performance.now();
  const worldMs = Math.round(performance.now() - t0);
  console.log('PLANET', JSON.stringify({ bootMs, cachedMs, worldMs, worldNetworkMs: 80, privateNetworkMs: 800,
    beforeFirstPrivateResponse: worldPaintAt < privateFirstEnd,
    source: 'fresh public territory visible in the ranking pane after delayed local endpoints' }));
  if (!process.env.FOUNDATION_BASELINE)
    assert(worldPaintAt < privateFirstEnd, `public Planet was held by private reads: ${worldMs} ms`);
  await page.close();

  // On a first visit with no map cached, chat's authenticated GET should start while the
  // independent public map is still in flight. The user sees the already warmed page on opening.
  const chatPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let worldEnded = 0; let chatStarted = 0; let worldStarted = 0;
  await chatPage.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { ok: false, code: 'UNAVAILABLE', message: 'test fixture' };
    if (path === '/v1/world') { worldStarted ||= performance.now(); await delay(900);
      worldEnded = performance.now(); body = { ok: true, world: freshWorld }; }
    else if (path === '/v1/territory/chat') { chatStarted ||= performance.now(); body = { ok: true, messages: [] }; }
    else if (path === '/v1/seeds/wallet') body = { ok: true, wallet: { balance: 50, lifetimeEarned: 50, lifetimeSpent: 0, worldInvitationSeen: true } };
    else if (path === '/v1/world/challenges') body = { ok: true, incoming: [], outgoing: [], serverNow: Date.now() };
    await route.fulfill({ status: (body as { ok: boolean }).ok ? 200 : 503, headers: cors,
      contentType: 'application/json', body: JSON.stringify(body) });
  });
  await chatPage.addInitScript(storedWorld => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
    localStorage.setItem('futa05-test:severgrow.duel.identity.v1', JSON.stringify({ token: 'local', playerId: storedWorld.owner, displayName: 'Cedar', kind: 'guest' }));
  }, stored(null));
  await chatPage.goto(fixture.origin + '/test/');
  await chatPage.waitForFunction(() => !!(window as any).__severgrow?.ready?.());
  await chatPage.waitForTimeout(1200);
  console.log('CHAT', JSON.stringify({ chatAfterWorldStartMs: Math.round(chatStarted - worldStarted),
    chatBeforeWorldEndMs: Math.round(worldEnded - chatStarted), worldStarted: !!worldStarted, chatStarted: !!chatStarted }));
  if (!process.env.FOUNDATION_BASELINE)
    assert(chatStarted > 0 && worldStarted > 0 && chatStarted < worldEnded, 'chat prefetch waited for the public map');
  await chatPage.close();
} finally { await browser.close(); await fixture.close(); }
