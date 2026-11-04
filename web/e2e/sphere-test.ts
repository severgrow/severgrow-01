// THE PLANET on /test/ (owner, 2026-11-04): the Territory window shows its ground as a planet in
// space. Proves, in a real browser against the built product:
//   - the whole futa05 game has it (owner, 2026-11-04: "Yes, planet goes live"), on every route;
//   - behind the main menu the planet is the backdrop, whole and dim, at the opening flight's start;
//   - it sits inside the Territory window, wearing its header, MENU key and tile bar;
//   - real tiles: a tap on a tile selects it through Territory's own selection bar;
//   - a pentagon or empty space never selects; a drag turns the planet and never selects;
//   - wheel/pinch zoom, a tap on tiles too small to hit flies in instead of guessing;
//   - space: the slow star slide runs only while space is visible, and nothing renders at rest;
//   - reduced motion: no fly-in, no slide; no WebGL: a readable fallback;
//   - Back puts the menu up at once and the planet flies out behind it; starting a game frees it.
// Chromium here, WebKit (iPhone engine) through sphere-test-ios.ts.
import { mkdirSync } from 'node:fs';
import { chromium, webkit, type Page } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { captureWebKitTouch } from './helpers/webkit-touch.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';

const ios = process.env.SPHERE_WEBKIT === '1';
const out = process.env.SHOTS ?? '/tmp/sphere-test';
mkdirSync(out, { recursive: true });
const fixture = await productFixture({ offlineApiPort: 65530 });
const webkitTouch = ios ? captureWebKitTouch() : null;
const browser = await (ios ? webkit : chromium).launch(ios ? {} : {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const ME = '11111111-1111-4111-8111-111111111111';
const mine = ['0,0', '1,0', '0,1', '-1,1', '1,-1', '2,-1', '-1,0', '2,0', '0,2'];
const rival = ['4,-1', '5,-1', '4,0', '5,-2', '3,-2'];
const claim = (cellId: string, ownerId: string, colour: string) =>
  ({ cellId, ownerId, ownerName: ownerId === ME ? 'Cedar' : 'Ash', ownerLevel: 3, ownerTag: '', colour, claimedAt: 1 });
const claims = [...mine.map((c) => claim(c, ME, 'hsl(150 32% 52%)')), ...rival.map((c) => claim(c, 'rival', 'hsl(4 42% 63%)'))];
const world = { version: WORLD_VERSION, revision: 1, cost: 100, challengeStake: 0, cells: seenWorld(claims.map((c) => c.cellId)), claims,
  disputes: [{ cellId: '4,0', challengerId: ME, defenderId: 'rival', accepted: false }] };

const seed = (page: Page, reduce = false) => page.addInitScript(`window.__name=(f)=>f;
for (const prefix of ['futa05-test:', 'futa05:', 'futa05-3:']) {
  localStorage.setItem(prefix + 'severgrow.settings.v1', ${JSON.stringify(JSON.stringify({ sound: false, music: false, coach: false, reduceMotion: reduce }))});
  localStorage.setItem(prefix + 'severgrow.duel.identity.v1', ${JSON.stringify(JSON.stringify({ token: 'local-planet-token', playerId: ME, displayName: 'Cedar', kind: 'guest' }))});
  localStorage.setItem(prefix + 'futasaku.world.last.v1', ${JSON.stringify(JSON.stringify(world))});
}`);
type Snapshot = { ready: boolean; cells: number; zoom: number; tilePx: number; q: number[]; selected: string | null; frames: number;
  bytes: number; pendingFrame: boolean; flying: boolean; spinning: boolean; spaceVisible: boolean; fallback: boolean };
const planet = (p: Page): Promise<Snapshot | null> => p.evaluate(() => {
  const s = (window as unknown as { __severgrow: { planet: () => (Snapshot & { screenOf?: unknown }) | null } }).__severgrow.planet();
  return s ? { ...s, screenOf: undefined } : null;
});
const screenOf = (p: Page, id: string) => p.evaluate((tile) =>
  (window as unknown as { __severgrow: { planet: () => { screenOf: (id: string) => { x: number; y: number } | null } } }).__severgrow.planet().screenOf(tile), id);
const ready = (p: Page) => p.waitForFunction(() => (window as unknown as { __severgrow?: { ready?: () => boolean } }).__severgrow?.ready?.());
const settled = (p: Page) => p.waitForFunction(() => {
  const s = (window as unknown as { __severgrow: { planet: () => { pendingFrame: boolean; spinning: boolean } | null } }).__severgrow.planet();
  return !!s && !s.pendingFrame && !s.spinning;
});
const openPlanet = async (p: Page) => {
  await p.locator('#menu-world').click();
  await p.waitForFunction(() => {
    const s = (window as unknown as { __severgrow: { planet: () => { ready: boolean; fallback: boolean } | null } }).__severgrow.planet();
    return !!s && (s.ready || s.fallback);
  });
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
  if (!ok) failed++;
};

try {
  // ---- every route: THE PLANET, with the planet behind the menu --------------------------------
  for (const path of ['/', '/2/', '/3/']) {
    const p = await browser.newPage();
    await seed(p);
    await p.goto(fixture.origin + path);
    await ready(p);
    const label = await p.locator('#menu-world-label').textContent();
    check(`${path}: the menu names it THE PLANET`, /THE PLANET/.test(label ?? ''), label ?? '');
    await p.waitForFunction(() => !!(window as unknown as { __severgrow: { planet: () => unknown } }).__severgrow.planet(), undefined, { timeout: 8000 }).catch(() => undefined);
    const behind = await planet(p) as (Snapshot & { mode?: string }) | null;
    check(`${path}: the planet is the menu's backdrop`, !!behind && behind.mode === 'menu' && (behind.ready || behind.fallback), JSON.stringify(behind)?.slice(0, 80));
    check(`${path}: the menu stays on top and tappable`, await p.locator('#menu-play').isVisible() &&
      await p.locator('.planet-canvas').evaluate((el) => getComputedStyle(el).pointerEvents === 'none'));
    await p.close();
  }

  // ---- /test/: the planet in the Territory window --------------------------------------------
  for (const [width, height] of ios ? [[390, 844]] : [[390, 844], [320, 568], [844, 390], [1440, 1000]]) {
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width: width!, height: height! }, hasTouch: true, isMobile: width! < 900, deviceScaleFactor: 2 });
    const p = await context.newPage();
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await seed(p);
    await p.goto(fixture.origin + '/test/');
    await ready(p);
    check(`[${tag}] the menu names it THE PLANET`, /THE PLANET/.test((await p.locator('#menu-world-label').textContent()) ?? ''));
    await openPlanet(p);
    const first = (await planet(p))!;
    if (!first.ready) {
      check(`[${tag}] no WebGL here: the window shows the readable fallback`, first.fallback && await p.locator('.planet-fallback').isVisible());
      console.log(`LIMIT ${tag}: this runner has no WebGL; interactive rendering unverified`);
      await context.close();
      continue;
    }
    check(`[${tag}] the window title is THE PLANET`, (await p.locator('#online-world-title').textContent()) === 'THE PLANET');
    check(`[${tag}] the flying-in opening is under way or done`, first.flying || first.zoom > 2, `zoom ${first.zoom.toFixed(2)}`);
    await settled(p);
    let s = (await planet(p))!;
    check(`[${tag}] a 5,762-tile planet, opening at a tappable tile size`, s.cells === 5762 && s.tilePx >= 40 && s.tilePx <= 48, `${s.tilePx.toFixed(1)}px`);
    const grid = (await p.locator('#online-world-grid').boundingBox())!;
    const canvas = (await p.locator('.planet-canvas').boundingBox())!;
    check(`[${tag}] the planet fills the Territory window exactly`,
      Math.abs(grid.x - canvas.x) < 1 && Math.abs(grid.y - canvas.y) < 1 && Math.abs(grid.width - canvas.width) < 1 && Math.abs(grid.height - canvas.height) < 1);
    check(`[${tag}] the flat map is hidden underneath, the MENU key is on top`,
      await p.locator('.world-map-svg').evaluate((el) => getComputedStyle(el).visibility === 'hidden') &&
      await p.locator('#online-world-menu').isVisible());
    await p.screenshot({ path: `${out}/planet-open-${tag}.png` });

    // A tap on my tile selects it through Territory's own tile bar, and never moves the camera.
    const mineAt = (await screenOf(p, '1,0'))!;
    const q0 = s.q;
    await p.mouse.click(mineAt.x, mineAt.y);
    await p.waitForTimeout(150);
    s = (await planet(p))!;
    check(`[${tag}] a tap selects the real tile under it`, s.selected === '1,0', String(s.selected));
    check(`[${tag}] Territory's tile bar opens for it`, await p.locator('#online-world-selection').isVisible());
    check(`[${tag}] selecting never turns the planet`, JSON.stringify(s.q) === JSON.stringify(q0));
    await p.screenshot({ path: `${out}/planet-selected-${tag}.png` });
    // The rival's disputed tile is selectable too.
    const rivalAt = await screenOf(p, '4,0');
    if (rivalAt && rivalAt.x > canvas.x + 30 && rivalAt.x < canvas.x + canvas.width - 30) {
      await p.mouse.click(rivalAt.x, rivalAt.y);
      await p.waitForTimeout(150);
      check(`[${tag}] a rival's disputed tile selects`, (await planet(p))!.selected === '4,0');
    }

    // A drag turns the planet and never selects.
    const before = (await planet(p))!;
    const ground0 = (await screenOf(p, '0,0'))!;
    const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
    await p.mouse.move(cx - 60, cy);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(cx - 60 + i * 12, cy + i * 4); await p.waitForTimeout(16); }
    await p.waitForTimeout(140);
    await p.mouse.up();
    await settled(p);
    s = (await planet(p))!;
    check(`[${tag}] a drag turns the planet`, JSON.stringify(s.q) !== JSON.stringify(before.q));
    check(`[${tag}] a drag never changes the selection`, s.selected === before.selected);
    // The finger moved 120px right; the tile under it went with it (a flick may carry it further).
    const moved = (await screenOf(p, '0,0'))!;
    check(`[${tag}] the ground follows the finger`, moved.x - ground0.x > 60, `${(moved.x - ground0.x).toFixed(0)}px`);

    // Nothing renders at rest while the planet fills the window.
    const frames = s.frames;
    await p.waitForTimeout(500);
    const rest = (await planet(p))!;
    // A wide window shows space round the planet even close in; then the slow slide is the only
    // loop, and it must stay slow. Otherwise nothing renders at all.
    if (rest.spaceVisible) check(`[${tag}] at rest only the slow star slide runs`, rest.frames - frames <= 20, `${rest.frames - frames} frames in .5s`);
    else check(`[${tag}] no idle rendering while the ground fills the window`, rest.frames === frames, `frames ${frames}->${rest.frames}`);

    // Zoom out to space: the stars slide slowly, and only while space is visible.
    await p.mouse.move(cx, cy);
    if (ios) {
      // Mobile WebKit has no wheel: zoom out with a real two-finger pinch (trusted touch events).
      await p.touchscreen.tap(canvas.x + 20, canvas.y + canvas.height - 20);
      const touch = (type: string, points: { x: number; y: number; id: number }[]) =>
        webkitTouch!.session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y) })) });
      await touch('touchStart', [{ x: cx - 130, y: cy, id: 1 }]); await p.waitForTimeout(16);
      await touch('touchStart', [{ x: cx - 130, y: cy, id: 1 }, { x: cx + 130, y: cy, id: 2 }]);
      for (let i = 1; i <= 10; i++) { const d = 260 - i * 24; await touch('touchMove', [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }]); await p.waitForTimeout(16); }
      await touch('touchEnd', [{ x: cx - 10, y: cy, id: 1 }]); await p.waitForTimeout(16); await touch('touchEnd', [{ x: cx + 10, y: cy, id: 2 }]);
    } else for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 500); await p.waitForTimeout(40); }
    await settled(p).catch(() => undefined);
    await p.waitForTimeout(300);
    s = (await planet(p))!;
    check(`[${tag}] zoomed out, the whole planet sits in space`, s.spaceVisible && s.zoom < 1, `zoom ${s.zoom.toFixed(2)}, ${s.tilePx.toFixed(1)}px tiles`);
    const spaceFrames = s.frames;
    await p.waitForTimeout(1000);
    const slide = (await planet(p))!.frames - spaceFrames;
    check(`[${tag}] the stars slide gently (a slow loop, never a full-rate one)`, slide >= 3 && slide <= 40, `${slide} frames in 1s`);
    await p.screenshot({ path: `${out}/planet-space-${tag}.png` });

    // A tap on tiles too small to hit flies in rather than guessing.
    const tiny = (await planet(p))!;
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(40);
    s = (await planet(p))!;
    check(`[${tag}] a tap on tiny tiles flies in and selects nothing`, s.flying && s.selected === tiny.selected);
    await settled(p);
    check(`[${tag}] ...to a tappable size`, (await planet(p))!.tilePx >= 40);

    // The ranking's "fly to" (flyToOwner) brings my land back to the middle.
    await p.locator('#online-world-menu').click();
    await p.locator('#world-key-ranking').click();
    const row = p.locator('#online-world-ranking button').first();
    if (await row.count()) {
      await row.click();
      await settled(p);
      const home = (await screenOf(p, '0,0'))!;
      check(`[${tag}] the ranking flies to a player's land`, Math.hypot(home.x - cx, home.y - cy) < 140, `${Math.hypot(home.x - cx, home.y - cy).toFixed(0)}px from the middle`);
    }

    check(`[${tag}] no page scroll or overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && scrollY === 0));
    check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    // Back: the menu is up at once, and the planet flies out behind it to the menu's pose.
    await p.keyboard.press('Escape');
    await p.locator('#online-world-back').click();
    await p.waitForTimeout(60);
    const back = await planet(p) as (Snapshot & { mode?: string }) | null;
    check(`[${tag}] Back shows the menu at once`, await p.locator('#menu').isVisible());
    check(`[${tag}] ...while the planet flies out behind it`, back?.mode === 'menu' && back.flying, JSON.stringify(back)?.slice(0, 90));
    await p.waitForFunction(() => !(window as unknown as { __severgrow: { planet: () => { flying: boolean } | null } }).__severgrow.planet()?.flying, undefined, { timeout: 4000 }).catch(() => undefined);
    check(`[${tag}] ...and comes to rest whole behind the menu`, (await planet(p) as (Snapshot & { mode?: string }) | null)?.mode === 'menu' && !(await planet(p))!.flying);
    check(`[${tag}] one planet only, reused (no second canvas)`, (await p.locator('.planet-canvas').count()) === 1);
    if (width === 390 && !ios) {
      // Five more visits leave nothing behind.
      for (let i = 0; i < 5; i++) {
        await openPlanet(p); await settled(p);
        await p.locator('#online-world-back').click();
        await p.waitForTimeout(150);
      }
      check(`[${tag}] five more visits still leave exactly one canvas`, (await p.locator('.planet-canvas').count()) === 1);
      // Starting a game frees it.
      await p.locator('#menu-play').click();
      await p.waitForTimeout(600);
      check(`[${tag}] leaving the menu for PLAY frees the planet`, (await planet(p)) === null && (await p.locator('.planet-canvas').count()) === 0);
    }
    await context.close();
  }

  // ---- iPhone engine: a real touch drag and pinch ----------------------------------------------
  if (ios && webkitTouch) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await context.newPage();
    await seed(p);
    await p.goto(fixture.origin + '/test/');
    await ready(p);
    await openPlanet(p);
    if ((await planet(p))!.ready) {
      await settled(p);
      const box = (await p.locator('.planet-canvas').boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await p.touchscreen.tap(box.x + 20, box.y + box.height - 20);
      const touch = (type: string, points: { x: number; y: number; id: number }[]) =>
        webkitTouch.session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y) })) });
      const z0 = (await planet(p))!.zoom;
      await touch('touchStart', [{ x: x - 30, y, id: 1 }]); await p.waitForTimeout(16);
      await touch('touchStart', [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }]);
      for (let i = 1; i <= 8; i++) { const d = 60 - i * 5; await touch('touchMove', [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }]); await p.waitForTimeout(16); }
      await touch('touchEnd', [{ x: x - 10, y, id: 1 }]); await p.waitForTimeout(16); await touch('touchEnd', [{ x: x + 10, y, id: 2 }]);
      await settled(p);
      check('[iPhone engine] a pinch zooms the planet', (await planet(p))!.zoom < z0 * .8, `${z0.toFixed(2)} -> ${(await planet(p))!.zoom.toFixed(2)}`);
    } else console.log('LIMIT iPhone engine: no WebGL on this runner; touch rendering unverified');
    await context.close();
  }

  // ---- reduced motion: no fly-in, no slide ------------------------------------------------------
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await seed(p, true);
    await p.goto(fixture.origin + '/test/');
    await ready(p);
    await openPlanet(p);
    const s = (await planet(p))!;
    if (s.ready) {
      await settled(p);
      check('[reduced motion] opens straight on my land, no fly-in', !(await planet(p))!.flying && (await planet(p))!.tilePx >= 40);
      const box = (await p.locator('.planet-canvas').boundingBox())!;
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 10; i++) await p.mouse.wheel(0, 500);
      await p.waitForTimeout(300);
      const f = (await planet(p))!.frames;
      await p.waitForTimeout(800);
      check('[reduced motion] space stays still: no slide loop', (await planet(p))!.frames === f && (await planet(p))!.spaceVisible);
    } else console.log('LIMIT reduced motion: no WebGL on this runner');
    await p.close();
  }

  // ---- no WebGL: a readable fallback --------------------------------------------------------------
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seed(p);
    await p.addInitScript(`(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return this.classList.contains('planet-canvas')&&kind==='webgl'?null:original.call(this,kind,...args);};})()`);
    await p.goto(fixture.origin + '/test/');
    await ready(p);
    await openPlanet(p);
    check('[no WebGL] the window explains instead of going blank', await p.locator('.planet-fallback').isVisible());
    await p.locator('#online-world-back').click();
    await p.close();
  }
} finally {
  await browser.close();
  await fixture.close();
}
if (failed) { console.log(`${failed} planet check(s) failed`); process.exit(1); }
console.log(`PASS planet checks; screenshots in ${out}`);
