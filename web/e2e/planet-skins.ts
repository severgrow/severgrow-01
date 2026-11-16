// The public Planet paints each owner's chosen set; the local picker saves only the signed-in
// owner's preference. An older map response with no skin field still opens normally.
//
// THE ADMIN GATE (owner, 2026-11-16): the picker is the admin account "RYK"'s alone, so this suite
// signs in as that account. A non-admin viewer's planet defaults are covered by the unit guard
// (web/tests/skin-picker-gate.test.ts), not by this browser suite.
//
// THE PIXELS ARE THE PROOF (owner, 2026-11-16: "theres still pink visible under it - it should be
// replacing the color and fitting in the hex nicely. also some of the skins tiles are rotated").
// Everything below is measured from the planet's OWN DRAWING BUFFER — readPixels right after the
// ground pass — in the pose the player actually gets (MOTION ON: the landing flight sets the roll;
// reduced motion keeps the lattice's own offset and was why the last round of evidence looked tilted):
//   * RIM: a ring just inside every skinned tile's boundary, all the way round the hexagon, must carry
//     no owner-coloured pixel and must be as far from the owner's colour as the art is. The old guard
//     sampled an 11x11 patch in the MIDDLE of the tile, which is exactly why the pink rim was missed.
//   * ORIENTATION: every skinned tile is compared with every other by turning one screen-space patch
//     and keeping the best match. One tile a hex edge (60 degrees) round shows up as a 60 degree best
//     turn; the shipped renderer must keep them all at ~0.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';
import { buildSphere, latticeMap, type V3 } from '../src/sphere/geometry.js';
import { rotate, type Quat } from '../src/sphere/rotation.js';
import { EYE, projection, type Frame } from '../src/sphere/renderer.js';

const me = '11111111-1111-4111-8111-111111111111';
// A MAGENTA OWNER (the owner's own report, 2026-11-15: his land read as "color on tiles and skin on
// top", a magenta holding showing under a water skin). Nothing in the four skin pictures is magenta,
// so any magenta left on a skinned tile at ANY radius is the owner's colour bleeding through.
const MY_COLOUR = '#c0247e';
const OWNER_RGB = [192, 36, 126];
const claim = (cellId: string, ownerId: string, skin?: 'forest' | 'ash' | 'water' | 'toxic') => ({
  cellId, ownerId, ownerName: ownerId === me ? 'Cedar' : 'Rival', ownerLevel: 3,
  ownerTag: '', colour: ownerId === me ? MY_COLOUR : '#c18a75', claimedAt: 1,
  ...(skin ? { skin } : {}),
});
// One compact block of my own land, so all seven tiles sit in the middle of the planet together, and
// three rivals around it, one wearing each other set. '-1,0' is in the block on purpose: it is the
// tile the OLD per-tile levelling turned a whole hex edge round against its neighbours.
const mine = ['0,0', '1,0', '0,1', '1,1', '2,0', '-1,1', '-1,0'];
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

/** Where the tiles are, from the pose the buffer was drawn in. */
type Pose = { w: number; h: number; dpr: number; q: Quat; zoom: number; frame: Frame; view: { width: number; height: number }; cells: Record<string, { x: number; y: number } | null> };

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
    // MOTION ON: the pose the player gets (the landing flight sets the roll).
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
    // RYK: since ae5ee76a the skin picker (and therefore the planet's skin) is the admin account's
    // alone, so this suite signs in as that account. `kind: 'account'` is what the gate reads.
    localStorage.setItem('futa05-test:severgrow.duel.identity.v1', JSON.stringify({ token: 'skin-token', playerId: me, displayName: 'RYK', kind: 'account' }));
    localStorage.setItem('futa05-test:futasaku.world.last.v1', JSON.stringify(world));
  }, { world, me });
  // THE PIXELS THE PLANET ACTUALLY DREW. A WebGL canvas keeps its drawing buffer only for the frame it
  // drew, so the ground pass — the draw after which the whole picture is in the buffer — is wrapped,
  // and read back on the spot together with the pose of THAT frame.
  await page.addInitScript((ids: string[]) => {
    const store = { w: 0, h: 0, buf: null as Uint8Array | null, pose: null as any, cells: null as any };
    (window as any).__planetPixels = store;
    const proto = WebGLRenderingContext.prototype, draw = proto.drawArrays;
    proto.drawArrays = function (this: WebGLRenderingContext, mode: number, first: number, count: number) {
      const out = draw.call(this, mode, first, count);
      // The ground pass is the big one (~104k vertices); the sky is a single triangle.
      if (count > 50_000) {
        const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
        if (store.w !== w || store.h !== h || !store.buf) { store.w = w; store.h = h; store.buf = new Uint8Array(w * h * 4); }
        this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, store.buf);
        const p = (window as any).__severgrow?.planet?.();
        if (p) {
          store.pose = { q: p.q, zoom: p.zoom, frame: p.frame, view: { width: innerWidth, height: innerHeight } };
          store.cells = Object.fromEntries(ids.map(id => [id, p.screenOf(id)]));
        }
      }
      return out;
    } as typeof draw;
    // Sample the drawn frame at the points the test asks for (CSS px), in device pixels.
    (window as any).__planetSample = (points: { x: number; y: number }[]) => {
      const store = (window as any).__planetPixels as { w: number; h: number; buf: Uint8Array | null };
      if (!store.buf) throw new Error('the planet drew no ground frame to sample');
      const dpr = store.w / window.innerWidth;
      const out: [number, number, number][] = [];
      for (const p of points) {
        // CSS px (y down) -> the drawing buffer's own rows, which start at the BOTTOM.
        const x = Math.round(p.x * dpr), row = Math.round(p.y * dpr);
        if (x < 0 || row < 0 || x >= store.w || row >= store.h) { out.push([-1, -1, -1]); continue; }
        const o = ((store.h - 1 - row) * store.w + x) * 4;
        out.push([store.buf[o]!, store.buf[o + 1]!, store.buf[o + 2]!]);
      }
      return out;
    };
  }, mine);
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.());
  await page.locator('#menu-world').click();
  await page.waitForFunction(() => (window as any).__severgrow?.planet?.()?.ready);
  // MOTION ON: wait for the landing flight to finish, then for the view to rest.
  await page.waitForFunction(() => !(window as any).__severgrow.planet().flying, undefined, { timeout: 30000 });
  await page.waitForFunction(() => (window as any).__severgrow.planet().frames > 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/futa086-planet-skins-after.png' });

  const pose: Pose = await page.evaluate(() => {
    const store = (window as any).__planetPixels;
    if (!store?.pose) throw new Error('the planet drew no ground frame');
    return { ...store.pose, w: store.w, h: store.h, dpr: store.w / window.innerWidth, cells: store.cells };
  });
  assert.equal(pose.dpr, 1, 'expected a 1x device pixel ratio for this fixture');

  // THE TILE GEOMETRY THE SHADER USED, from the same sphere the page builds.
  const sphere = buildSphere();
  const map = latticeMap(sphere);
  const at = projection(pose.view, pose.frame, pose.zoom);
  const screenOf = (p: V3) => {
    const r = rotate(pose.q, p), w = EYE - r[2];
    return { x: ((r[0] * at.f / at.aspect) / w + at.ox + 1) / 2 * pose.view.width,
             y: (1 - ((r[1] * at.f) / w + at.oy)) / 2 * pose.view.height };
  };
  /** Each of my tiles' screen hexagon + its radius, or null when it faces away. */
  const hexes: { id: string; centre: { x: number; y: number }; corners: { x: number; y: number }[]; r: number }[] = [];
  for (const id of mine) {
    const i = map.cellOf.get(id);
    if (i === undefined) continue;
    const c = sphere.cells[i]!;
    if (rotate(pose.q, c.centre)[2] < 0) continue;
    const centre = screenOf(c.centre);
    const corners = c.corners.map(k => screenOf(sphere.corners[k]!));
    const r = corners.reduce((s, p) => s + Math.hypot(p.x - centre.x, p.y - centre.y), 0) / corners.length;
    hexes.push({ id, centre, corners, r });
  }
  assert.ok(hexes.length >= 6, `only ${hexes.length} skinned tiles were on screen, need 6`);

  // ---- RIM: no owner colour anywhere just inside the boundary --------------------------------
  const rimPoints: { x: number; y: number }[] = [];
  const rimOwner: string[] = []; // which tile each point belongs to
  for (const h of hexes) for (let e = 0; e < 6; e++) {
    const a = h.corners[e]!, b = h.corners[(e + 1) % 6]!;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const edge = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
      for (const f of [0.88, 0.92, 0.96]) {
        rimPoints.push({ x: h.centre.x + (edge.x - h.centre.x) * f, y: h.centre.y + (edge.y - h.centre.y) * f });
        rimOwner.push(h.id);
      }
    }
  }
  const rimPixels = await page.evaluate((points: { x: number; y: number }[]) => (window as any).__planetSample(points), rimPoints) as [number, number, number][];
  let rimWorst = { dist: Infinity, rgb: [0, 0, 0] as number[], tile: '' };
  let rimTinted = 0, rimCount = 0;
  for (let i = 0; i < rimPixels.length; i++) {
    const [r, g, b] = rimPixels[i]!;
    if (r < 0) continue;
    rimCount++;
    const dist = Math.hypot(r - OWNER_RGB[0]!, g - OWNER_RGB[1]!, b - OWNER_RGB[2]!);
    // A magenta-ish pixel: red clearly above green, red above blue, and not near-black.
    if (r > g + 20 && r > b + 10 && r > 50) rimTinted++;
    if (dist < rimWorst.dist) rimWorst = { dist, rgb: [r, g, b], tile: rimOwner[i]! };
  }
  // Measured on the shipped renderer: 0 owner-hued rim pixels, closest colour distance 138. WITH the
  // old owner line the same ring measured 988 of 2646 pixels owner-hued, closest distance 78 (the
  // owner's own water holding: 12% owner-hued, closest distance 75).
  const failures: string[] = [];
  if (rimTinted > 0) failures.push(`${rimTinted} of ${rimCount} rim pixels carried the owner's hue (${rimWorst.tile} nearest ${rimWorst.rgb.join(',')})`);
  if (rimWorst.dist <= 100) failures.push(`a rim pixel sat only ${rimWorst.dist.toFixed(0)} from the owner colour (${rimWorst.rgb.join(',')})`);
  console.log(`Planet skin rim: ${rimCount} pixels round ${hexes.length} boundaries, ${rimTinted} owner-hued, nearest owner-colour distance ${rimWorst.dist.toFixed(0)}`);

  // ---- ORIENTATION: every tile's art the same way up, measured on screen ---------------------
  const N = 26, FRAC = 0.55;
  const grid: { x: number; y: number }[] = [];
  for (const h of hexes) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    grid.push({ x: h.centre.x + ((i / (N - 1)) * 2 - 1) * h.r * FRAC,
                y: h.centre.y + ((j / (N - 1)) * 2 - 1) * h.r * FRAC });
  }
  const gridPixels = await page.evaluate((points: { x: number; y: number }[]) => (window as any).__planetSample(points), grid) as [number, number, number][];
  const patches = hexes.map((h, t) => {
    const lum: number[] = [];
    for (let k = 0; k < N * N; k++) {
      const [r, g, b] = gridPixels[t * N * N + k]!;
      lum.push(r < 0 ? NaN : .3 * r + .59 * g + .11 * b);
    }
    return { id: h.id, lum };
  });
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const corr = (a: number[], b: number[]) => {
    const ma = mean(a), mb = mean(b);
    let na = 0, nb = 0, ab = 0;
    for (let i = 0; i < a.length; i++) { const x = a[i]! - ma, y = b[i]! - mb; na += x * x; nb += y * y; ab += x * y; }
    return ab / Math.sqrt(na * nb || 1);
  };
  /** The best match for `b` turned by `deg` against `a` (nearest-neighbour resampling). */
  const turned = (p: { lum: number[] }, deg: number) => {
    const th = (deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const out: number[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, y = (j / (N - 1)) * 2 - 1;
      const ii = Math.round(((x * c - y * s) + 1) / 2 * (N - 1)), jj = Math.round(((x * s + y * c) + 1) / 2 * (N - 1));
      out.push(ii < 0 || ii >= N || jj < 0 || jj >= N ? NaN : p.lum[jj * N + ii]!);
    }
    return out;
  };
  let worstTurn = 0, centreWorst = 1;
  for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
    const a = patches[i]!, b = patches[j]!;
    let bestTurn = 0, bestCorr = -2;
    for (let deg = -90; deg <= 90; deg += 3) {
      const t = turned(b, deg);
      const keep: [number, number][] = [];
      for (let k = 0; k < t.length; k++) if (!Number.isNaN(t[k]!) && !Number.isNaN(a.lum[k]!)) keep.push([a.lum[k]!, t[k]!]);
      const c = corr(keep.map(p => p[0]), keep.map(p => p[1]));
      if (c > bestCorr) { bestCorr = c; bestTurn = deg; }
    }
    centreWorst = Math.min(centreWorst, bestCorr);
    // A tile a hex edge round shows up as a best turn of 60; one picture, one orientation is ~0.
    if (Math.abs(bestTurn) > Math.abs(worstTurn)) worstTurn = bestTurn;
  }
  // Measured on the shipped renderer: every pair at 0 degrees, correlation >= .95. WITH the old
  // per-tile levelling every pair involving '-1,0' came out at 60 degrees.
  if (centreWorst < .8) failures.push(`two skinned tiles showed different pictures (correlation ${centreWorst.toFixed(2)})`);
  if (Math.abs(worstTurn) > 6) failures.push(`two skinned tiles sat ${worstTurn} degrees apart on screen`);
  console.log(`Planet skin orientation: ${patches.length} tiles, worst pair ${worstTurn} degrees, pictures correlate >= ${centreWorst.toFixed(2)}`);
  assert.deepEqual(failures, [], failures.join('; '));

  // THE PICK REACHES THE PLANET (owner, 2026-11-16: "changing tile skin should change it on the planet
  // too"). The world read here keeps answering Forest for my land, as a server does until it is read
  // again, so only the pick itself can repaint it. Sampled from the drawn buffer at my tiles' centres.
  const myPatch = async () => page.evaluate((ids: string[]) => {
    const store = (window as any).__planetPixels;
    const pts = ids.map((id) => store.cells[id]).filter(Boolean) as { x: number; y: number }[];
    return (window as any).__planetSample(pts) as [number, number, number][];
  }, mine);
  const before = await myPatch();
  await page.locator('#online-world-menu').click();
  await page.locator('#world-key-colour').click();
  const picker = page.locator('#world-skin-switch');
  await picker.waitFor({ state: 'visible' });
  assert.equal(await picker.locator('button[data-field="mine"]').count(), 4);
  await picker.locator('button[data-field="mine"][data-value="water"]').click();
  await page.waitForFunction(() => document.querySelector('#world-skin-switch button[data-field="mine"][data-value="water"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(150);
  assert.deepEqual(posts, ['water']);
  const frames = await page.evaluate(() => (window as any).__severgrow.planet().frames as number);
  await page.keyboard.press('Escape');
  await page.waitForFunction((n) => (window as any).__severgrow.planet().frames > n, frames, { timeout: 10000 });
  await page.waitForTimeout(300);
  const after = await myPatch();
  const moved = after.map((c, i) => Math.abs(c[0] - before[i]![0]) + Math.abs(c[1] - before[i]![1]) + Math.abs(c[2] - before[i]![2]));
  const repainted = moved.filter((d) => d > 60).length;
  console.log(`Planet skins: after picking Water, ${repainted} of ${moved.length} of my tiles repainted (${moved.join(',')})`);
  assert.ok(repainted >= Math.ceil(moved.length * 0.7), `picking Water must repaint my land on the planet at once: ${moved.join(',')}`);
  assert.deepEqual(errors, []);
  console.log('Planet skins: four public sets, older plain claim, authenticated picker POST, no page errors');
} finally {
  await browser.close();
  await fixture.close();
}
