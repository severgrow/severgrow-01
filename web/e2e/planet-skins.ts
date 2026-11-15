// The public Planet paints each owner's chosen set; the local picker saves only the signed-in
// owner's preference. An older map response with no skin field still opens normally.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';

const me = '11111111-1111-4111-8111-111111111111';
// A MAGENTA OWNER (the owner's own report, 2026-11-15: his land read as "color on tiles and skin on
// top", a magenta holding showing under a water skin). Nothing in the four skin pictures is magenta,
// so any magenta left on a skinned tile's middle is the owner's colour bleeding through — the exact
// thing the pixel check below refuses.
const MY_COLOUR = '#c0247e';
const claim = (cellId: string, ownerId: string, skin?: 'forest' | 'ash' | 'water' | 'toxic') => ({
  cellId, ownerId, ownerName: ownerId === me ? 'Cedar' : 'Rival', ownerLevel: 3,
  ownerTag: '', colour: ownerId === me ? MY_COLOUR : '#c18a75', claimedAt: 1,
  ...(skin ? { skin } : {}),
});
// One compact block of my own land, so all six tiles sit in the middle of the planet together (the
// pixel check below compares their middles), and three rivals around it, one wearing each other set.
const mine = ['0,0', '1,0', '0,1', '1,1', '2,0', '-1,1'];
const claims = [
  ...mine.map((id) => claim(id, me, 'forest')),
  claim('2,1', 'ash-owner', 'ash'), claim('3,0', 'water-owner', 'water'),
  claim('-1,2', 'toxic-owner', 'toxic'), claim('-2,0', 'older-owner'),
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
  // THE PIXELS THE PLANET ACTUALLY DREW (owner, 2026-11-15). A WebGL canvas keeps its drawing buffer
  // only for the frame it drew, so the ground pass — the draw after which the whole picture is in the
  // buffer — is wrapped and read back on the spot. With `reduceMotion` the planet draws one settled
  // frame, so this is the same frame the screenshot shows, and it needs no PNG decoder.
  await page.addInitScript(() => {
    const store = { w: 0, h: 0, buf: null as Uint8Array | null };
    (window as any).__planetPixels = store;
    const proto = WebGLRenderingContext.prototype, draw = proto.drawArrays;
    proto.drawArrays = function (this: WebGLRenderingContext, mode: number, first: number, count: number) {
      const out = draw.call(this, mode, first, count);
      // The ground pass is the big one (~104k vertices); the sky is a single triangle.
      if (count > 50_000) {
        const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
        if (store.w !== w || store.h !== h || !store.buf) { store.w = w; store.h = h; store.buf = new Uint8Array(w * h * 4); }
        this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, store.buf);
      }
      return out;
    } as typeof draw;
  });
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.());
  await page.locator('#menu-world').click();
  await page.waitForFunction(() => (window as any).__severgrow?.planet?.()?.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/futa086-planet-four-skins.png' });
  // THE SKIN IS THE PICTURE ALONE, AND IT IS THE SAME PICTURE EVERYWHERE (owner, 2026-11-15).
  // Sampled straight out of the planet's own drawing buffer: a magenta owner colour (above) must leave
  // no magenta on the middle of a skinned tile, and the middle of every one of my forest tiles must
  // match the others' — one picture, one orientation, no per-tile shuffle.
  const pixels = await page.evaluate((ids: string[]) => {
    const store = (window as any).__planetPixels as { w: number; h: number; buf: Uint8Array | null };
    if (!store?.buf) throw new Error('the planet drew no ground frame to sample');
    const planet = (window as any).__severgrow.planet();
    const dpr = store.w / window.innerWidth;
    const HALF = 5; // an 11x11 CSS-px patch: the tile is 44 px across, so this is its middle
    const patches: { magenta: number; unit: number[] }[] = [];
    for (const id of ids) {
      const p = planet.screenOf(id);
      if (!p) continue;
      const cx = Math.round(p.x * dpr), cy = Math.round((window.innerHeight - p.y) * dpr);
      const lum: number[] = [];
      let magenta = 0, outside = false;
      for (let dy = -HALF; dy <= HALF; dy++) for (let dx = -HALF; dx <= HALF; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= store.w || y >= store.h) { outside = true; continue; }
        const o = (y * store.w + x) * 4, r = store.buf[o]!, g = store.buf[o + 1]!, b = store.buf[o + 2]!;
        lum.push(.3 * r + .59 * g + .11 * b);
        // The owner's magenta is strong and cool-red; no skin picture (forest, ash, water, toxic) is.
        if (r > g + 20 && r > b + 10 && r > 50) magenta++;
      }
      if (outside || !lum.length) continue;
      const mean = lum.reduce((s, v) => s + v, 0) / lum.length;
      const centred = lum.map((v) => v - mean);
      const norm = Math.hypot(...centred) || 1;
      patches.push({ magenta: magenta / lum.length, unit: centred.map((v) => v / norm) });
    }
    let worst = 1;
    for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
      const a = patches[i]!.unit, b = patches[j]!.unit;
      worst = Math.min(worst, a.reduce((s, v, k) => s + v * b[k]!, 0));
    }
    return { tiles: patches.length, magenta: patches.length ? Math.max(...patches.map((t) => t.magenta)) : 1, worstPair: worst };
  }, mine);
  assert.ok(pixels.tiles >= 5, `only ${pixels.tiles} skinned tiles were on screen, need 5 to compare`);
  // Tolerance: two percent of a patch's 121 pixels, i.e. a stray pixel or two, never a wash. Measured
  // 0.000 with the skin taking the picture's colour outright.
  assert.ok(pixels.magenta <= .02, `the owner colour showed through the skin on ${(pixels.magenta * 100).toFixed(1)}% of a tile's middle`);
  // Tolerance .8: the same picture under slightly different per-tile light and tone measures >= .9;
  // the nine shuffled paintings measured as low as .14.
  assert.ok(pixels.worstPair >= .8, `two skinned tiles showed different pictures (correlation ${pixels.worstPair.toFixed(2)})`);
  console.log(`Planet skin pixels: no owner tint (${pixels.magenta.toFixed(3)}), one picture (worst pair ${pixels.worstPair.toFixed(2)})`);
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
