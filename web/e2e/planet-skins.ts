// The public Planet paints each owner's chosen set; the local picker saves only the signed-in
// owner's preference. An older map response with no skin field still opens normally.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';

const me = '11111111-1111-4111-8111-111111111111';
const claim = (cellId: string, ownerId: string, skin?: 'forest' | 'ash' | 'water' | 'toxic') => ({
  cellId, ownerId, ownerName: ownerId === me ? 'Cedar' : 'Rival', ownerLevel: 3,
  ownerTag: '', colour: ownerId === me ? '#76ad88' : '#c18a75', claimedAt: 1,
  ...(skin ? { skin } : {}),
});
const claims = [
  claim('0,0', me, 'forest'), claim('1,0', me, 'forest'),
  claim('2,0', 'ash-owner', 'ash'), claim('1,1', 'water-owner', 'water'),
  claim('0,1', 'toxic-owner', 'toxic'), claim('-1,0', 'older-owner'),
];
const world = { version: WORLD_VERSION, revision: 1, cost: 100, challengeStake: 0,
  cells: seenWorld(claims.map(c => c.cellId)), claims };
const fixture = await productFixture({ offlineApiPort: 65530 });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const posts: string[] = [];
  await page.route('**/v1/world/skin*', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': '*' } });
      return;
    }
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() as { skin: string } : null;
    if (body) posts.push(body.skin);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': '*' },
      body: JSON.stringify({ ok: true, skin: body?.skin ?? 'forest' }) });
  });
  await page.route(/\/v1\/world(\?|$)/, route => route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, world }) }));
  await page.addInitScript(({ world, me }) => {
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: true }));
    localStorage.setItem('futa05-test:severgrow.duel.identity.v1', JSON.stringify({ token: 'skin-token', playerId: me, displayName: 'Cedar', kind: 'guest' }));
    localStorage.setItem('futa05-test:futasaku.world.last.v1', JSON.stringify(world));
  }, { world, me });
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.());
  await page.locator('#menu-world').click();
  await page.waitForFunction(() => (window as any).__severgrow?.planet?.()?.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/futa086-planet-four-skins.png' });
  await page.locator('#online-world-menu').click();
  await page.locator('#world-key-colour').click();
  const picker = page.locator('#world-skin-switch');
  await picker.waitFor({ state: 'visible' });
  assert.equal(await picker.locator('button[data-field="mine"]').count(), 4);
  await picker.locator('button[data-field="mine"][data-value="water"]').click();
  await page.waitForFunction(() => document.querySelector('#world-skin-switch button[data-field="mine"][data-value="water"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(150);
  assert.deepEqual(posts, ['water']);
  assert.deepEqual(errors, []);
  console.log('Planet skins: four public sets, older plain claim, authenticated picker POST, no page errors');
} finally {
  await browser.close();
  await fixture.close();
}
