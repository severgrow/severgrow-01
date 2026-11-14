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
  north:number[]; bytes: number; pendingFrame: boolean; flying: boolean; spinning: boolean; spaceVisible: boolean; fallback: boolean };
const planet = (p: Page): Promise<Snapshot | null> => p.evaluate(() => {
  const s = (window as unknown as { __severgrow: { planet: () => (Snapshot & { screenOf?: unknown }) | null } }).__severgrow.planet();
  return s ? { ...s, screenOf: undefined } : null;
});
const screenOf = (p: Page, id: string) => p.evaluate((tile) =>
  (window as unknown as { __severgrow: { planet: () => { screenOf: (id: string) => { x: number; y: number } | null } } }).__severgrow.planet().screenOf(tile), id);
const ready = (p: Page) => p.waitForFunction(() => (window as unknown as { __severgrow?: { ready?: () => boolean } }).__severgrow?.ready?.());
/**
 * At rest: no flight, nothing spinning, and the same pose and zoom across a quarter second. One idle
 * read is not enough on a slow software GPU: it can land in the gap between two frames of a flight
 * or a zoom ease, and the next check then reads a planet still on its way. (The slow star slide may
 * keep frames coming while the planet itself is still: that is rest.)
 */
const settled = (p: Page) => p.waitForFunction(() => {
  type S = { flying: boolean; spinning: boolean; q: number[]; zoom: number };
  const w = window as unknown as { __severgrow: { planet: () => S | null }; __settle?: { key: string; since: number } | undefined };
  const s = w.__severgrow.planet();
  if (!s || s.flying || s.spinning) { w.__settle = undefined; return false; }
  const key = `${s.q.map((v) => v.toFixed(6)).join(',')}|${s.zoom.toFixed(6)}`, now = performance.now();
  if (!w.__settle || w.__settle.key !== key) { w.__settle = { key, since: now }; return false; }
  return now - w.__settle.since >= 250;
}, undefined, { polling: 50, timeout: 15_000 }).catch(async error => {
  console.error('Planet settle diagnostic',await planet(p),{
    menu:await p.locator('#menu').isVisible(),world:await p.locator('#online-world-screen').isVisible(),
  });
  await p.screenshot({path:`${out}/settle-failure.png`}).catch(()=>undefined);
  throw error;
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
  if (!ok) {
    failed++;
    // Keep the exact failed contract visible even where Actions raw logs require sign-in.
    const detail=`${name}${note ? ` (${note})` : ''}`.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
    console.error(`::error title=Planet browser assertion::${detail}`);
  }
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
    // THE LOCKUP (owner, 2026-11-04): the kanji alone, FUTASAKU exactly as wide under it, the globe
    // centred on the pair and enclosing it.
    const lock = await p.evaluate(() => {
      const logo = document.getElementById('logo')!.getBoundingClientRect();
      const title = document.querySelector('#menu .title')!;
      const range = document.createRange(); range.selectNodeContents(title.firstChild!);
      const ink = range.getBoundingClientRect(), spacing = parseFloat(getComputedStyle(title).letterSpacing) || 0;
      const s = (window as unknown as { __severgrow: { planet: () => { disc: { x: number; y: number; r: number } } | null } }).__severgrow.planet();
      return { logo: [logo.left, logo.right, logo.top, logo.bottom], title: [ink.left, ink.right - spacing, ink.top, ink.bottom], disc: s?.disc ?? null,
        tree: !!document.querySelector('#logo image[href*="futasaku-white"], #logo image[href*="emblem"]') };
    });
    const [ll, lr, lt] = lock.logo as [number, number, number, number], [tl, tr, , tb] = lock.title as [number, number, number, number];
    check(`${path}: the logo is the kanji alone, as wide as FUTASAKU under it`, !lock.tree && Math.abs(ll - tl) < 1.5 && Math.abs(lr - tr) < 1.5,
      `kanji ${ll.toFixed(1)}-${lr.toFixed(1)}, wordmark ${tl.toFixed(1)}-${tr.toFixed(1)}`);
    const cx = (Math.min(ll, tl) + Math.max(lr, tr)) / 2, cy = (lt + tb) / 2;
    check(`${path}: the globe is centred on the logo group and encloses it`, !!lock.disc &&
      Math.hypot(lock.disc.x - cx, lock.disc.y - cy) < 3 && lock.disc.r > Math.hypot(lr - ll, tb - lt) / 2,
      lock.disc ? `centre ${lock.disc.x.toFixed(1)},${lock.disc.y.toFixed(1)} vs ${cx.toFixed(1)},${cy.toFixed(1)}, r ${lock.disc.r.toFixed(0)}` : 'no disc');
    // NEVER AN EGG (owner, 2026-11-04, iPhone Safari): the canvas box is the window it is drawn for,
    // so its shape on screen is its drawing's shape and the globe stays round.
    const box = await p.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.planet-canvas')!, r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, aspect: r.width / r.height, drawn: c.width / c.height };
    });
    check(`${path}: the planet's canvas is exactly the window, never stretched`,
      Math.abs(box.w - box.iw) < 1 && Math.abs(box.h - box.ih) < 1 && Math.abs(box.aspect - box.drawn) < .01, JSON.stringify(box));
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
    // NO JUMP (owner, 2026-11-04: "There is a jump of the planet ... they have to be in identical
    // position"). The first frame after the tap continues the menu's last one: same pose, zoom and
    // light, and the frame has only begun to close in.
    type Pose = { ready: boolean; q: number[]; zoom: number; light: number; frame: { x: number; y: number; width: number; height: number } } | null;
    const pose = (): Promise<Pose> => p.evaluate(() => {
      const s = (window as unknown as { __severgrow: { planet: () => Pose } }).__severgrow.planet();
      return s && { ready: s.ready, q: s.q, zoom: s.zoom, light: s.light, frame: s.frame };
    });
    await p.waitForFunction(() => !!(window as unknown as { __severgrow: { planet: () => { ready: boolean } | null } }).__severgrow.planet()?.ready, undefined, { timeout: 8000 }).catch(() => undefined);
    const lastMenu = await pose();
    if (lastMenu?.ready) {
      await p.locator('#menu-world').click();
      const firstWindow = (await pose())!;
      const panel = (await p.locator('#online-world-grid').boundingBox())!;
      const dot = Math.abs(lastMenu.q.reduce((sum, x, i) => sum + x * firstWindow.q[i]!, 0));
      // The frame starts where the menu's was and has made at most one small step of its journey to
      // the panel (a slow software GPU paints few, long frames, so a step is measured as a share of
      // the whole travel, not in pixels).
      const share = (from: number, now: number, to: number) => (Math.abs(to - from) < 1 ? 0 : Math.abs(now - from) / Math.abs(to - from));
      const step = Math.max(share(lastMenu.frame.x, firstWindow.frame.x, panel.x), share(lastMenu.frame.y, firstWindow.frame.y, panel.y),
        share(lastMenu.frame.width, firstWindow.frame.width, panel.width), share(lastMenu.frame.height, firstWindow.frame.height, panel.height));
      check(`[${tag}] no jump: the window's first frame is the menu's last`,
        dot > .9995 && Math.abs(firstWindow.zoom / lastMenu.zoom - 1) < .02 && Math.abs(firstWindow.light - lastMenu.light) < .06 && step < .35,
        `turn ${dot.toFixed(5)}, zoom ${lastMenu.zoom.toFixed(3)}->${firstWindow.zoom.toFixed(3)}, light ${lastMenu.light.toFixed(2)}->${firstWindow.light.toFixed(2)}, frame ${(step * 100).toFixed(0)}% of its way`);
      await p.waitForFunction(() => {
        const s = (window as unknown as { __severgrow: { planet: () => { ready: boolean; fallback: boolean } | null } }).__severgrow.planet();
        return !!s && (s.ready || s.fallback);
      });
    } else await openPlanet(p);
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
    // ONE SHEET, CROPPED (owner, 2026-11-04: the menu and the window must be identical, no jump): the
    // canvas covers the screen and never moves; the planet's frame and its crop are the panel exactly.
    const sheet = await p.evaluate(() => {
      const s = (window as unknown as { __severgrow: { planet: () => { frame: { x: number; y: number; width: number; height: number } } } }).__severgrow.planet();
      return { frame: s.frame, clip: (document.querySelector('.planet-canvas') as HTMLElement).style.clipPath };
    });
    // CSS shortens inset() like margin: 3 values mean top, left/right, bottom.
    const box = (sheet.clip.replace(/round.*$/, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    const insets = box.length === 4 ? box : box.length === 3 ? [box[0]!, box[1]!, box[2]!, box[1]!] : box.length === 2 ? [box[0]!, box[1]!, box[0]!, box[1]!] : [box[0]!, box[0]!, box[0]!, box[0]!];
    check(`[${tag}] the planet is framed and cropped to the Territory window exactly`,
      Math.abs(sheet.frame.x - grid.x) < 1 && Math.abs(sheet.frame.y - grid.y) < 1 && Math.abs(sheet.frame.width - grid.width) < 1 && Math.abs(sheet.frame.height - grid.height) < 1 &&
      insets.length >= 4 && Math.abs(insets[0]! - grid.y) < 1 && Math.abs(insets[3]! - grid.x) < 1 &&
      Math.abs(canvas.width - width!) < 1 && Math.abs(canvas.height - height!) < 1,
      `${JSON.stringify(sheet.frame)} vs ${JSON.stringify(grid)}; ${sheet.clip}`);
    check(`[${tag}] no flat map is allocated underneath, the MENU key is on top`,
      await p.locator('.world-map-svg').count() === 0 &&
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
    // Tappable means on screen AND not under the tile bar the previous tap opened (the level turn of
    // flat side up can bring this tile beneath it in a short landscape window).
    const rivalOpen = !!rivalAt && await p.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName === 'CANVAS', [rivalAt.x, rivalAt.y]);
    if (rivalAt && !rivalOpen) console.log(`note [${tag}] the rival's tile is under the tile bar here; its tap is checked at the other sizes`);
    if (rivalAt && rivalOpen && rivalAt.x > grid.x + 30 && rivalAt.x < grid.x + grid.width - 30) {
      await p.mouse.click(rivalAt.x, rivalAt.y);
      await p.waitForTimeout(150);
      check(`[${tag}] a rival's disputed tile selects`, (await planet(p))!.selected === '4,0');
      // Near the window's edge the planet turns it clear; let that finish before the next tap.
      await settled(p).catch(() => undefined);
    }

    // EVERY TILE CAN BE TAPPED (owner, 2026-11-04): plain ground well away from any land selects too.
    const plainAt = await screenOf(p, '0,-4');
    if (plainAt && plainAt.y > grid.y + 70 && plainAt.y < grid.y + grid.height - 90 && plainAt.x > grid.x + 30 && plainAt.x < grid.x + grid.width - 30) {
      await p.waitForTimeout(400); // apart from the last tap, so it is not read as a double tap
      await p.mouse.click(plainAt.x, plainAt.y);
      await p.waitForTimeout(150);
      check(`[${tag}] plain ground far from any land is a tile you can tap`, (await planet(p))!.selected === '0,-4', String((await planet(p))!.selected));
    }
    // A TILE TAPPED UNDER THE TILE BAR COMES CLEAR: the planet turns it up into the window, at the same zoom.
    {
      await p.waitForTimeout(400);
      const z = (await planet(p))!.zoom;
      await p.mouse.click(grid.x + grid.width / 2, grid.y + grid.height * .86);
      await p.waitForTimeout(80);
      await settled(p).catch(() => undefined);
      const now = (await planet(p))!;
      const at = now.selected ? await screenOf(p, now.selected) : null;
      check(`[${tag}] a tile tapped under the tile bar turns up clear of it`, !!at && at.y < grid.y + grid.height * .72 && Math.abs(now.zoom - z) < z * .01,
        at ? `${now.selected} now at ${((at.y - grid.y) / grid.height * 100).toFixed(0)}% of the window` : 'nothing selected');
    }
    // A delayed connection/pentagon message must never resize the camera's viewport.
    const noticeLayout=await p.evaluate(()=>{
      const grid=document.getElementById('online-world-grid')!,notice=document.getElementById('online-world-notice')!;
      const before=grid.getBoundingClientRect().toJSON(),text=notice.textContent;
      notice.textContent='Connection paused. Your land is safe. '.repeat(5);
      const during=grid.getBoundingClientRect().toJSON();notice.textContent=text;
      const after=grid.getBoundingClientRect().toJSON();
      return {before,during,after};
    });
    check(`[${tag}] status messages never move or resize the map window`,
      ['x','y','width','height'].every(k=>Math.abs(noticeLayout.before[k]-noticeLayout.during[k])<.5&&Math.abs(noticeLayout.before[k]-noticeLayout.after[k])<.5),JSON.stringify(noticeLayout));

    // A drag turns the planet and never selects.
    const before = (await planet(p))!;
    const ground0 = (await screenOf(p, '0,0'))!;
    const cx = grid.x + grid.width / 2, cy = grid.y + grid.height / 2;
    await p.mouse.move(cx - 60, cy);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(cx - 60 + i * 12, cy + i * 4); await p.waitForTimeout(16); }
    const releasePose=(await planet(p))!;
    // FLAT SIDE UP (owner, 2026-11-14: "the planet orientation switch to always show tiles flat side
    // up") replaces the exact north-up rule these two checks pinned. While dragging, the view keeps
    // the turn it had (no spin) and stays within 30 degrees of north, north still upward.
    // (A geodesic hex is a little irregular, so levelling one can take a degree or two past 30.)
    check(`[${tag}] dragging keeps the view's turn, within 30 degrees of north`,
      Math.abs((releasePose as any).roll-(before as any).roll)<1e-6&&Math.abs((releasePose as any).roll)<=Math.PI/6+.05&&releasePose.north[1]!>0,
      JSON.stringify({before:(before as any).roll,during:(releasePose as any).roll,north:releasePose.north}));
    await p.mouse.up();
    // Zoomed-out releases may coast, then the centre tile levels; wait for both to settle.
    await p.waitForFunction(()=>{
      const pl=(window as any).__severgrow.planet();
      return pl && !pl.flying && !pl.levelling;
    },undefined,{timeout:4000}).catch(()=>undefined);
    await settled(p);
    s = (await planet(p))!;
    check(`[${tag}] after release the centre tile rests flat side up`,
      (s as any).centreTilt!==null&&Math.abs((s as any).centreTilt)<.01&&Math.abs((s as any).roll)<=Math.PI/6+.05&&s.north[1]!>0,
      JSON.stringify({tilt:(s as any).centreTilt,roll:(s as any).roll,north:s.north}));
    check(`[${tag}] a drag turns the planet`, JSON.stringify(s.q) !== JSON.stringify(before.q));
    check(`[${tag}] a drag never changes the selection`, s.selected === before.selected);
    // Zoomed in: coast must stop almost immediately (top of planet not visible).
    const zoomInBefore = (await planet(p))!;
    await p.mouse.move(cx, cy);
    if (ios && webkitTouch) {
      // Mobile WebKit has no wheel — pinch in to fill the window before the coast check.
      // A packaged tap must run first so captureWebKitTouch can latch the CDP session.
      await p.touchscreen.tap(grid.x + 20, grid.y + grid.height - 20);
      const touch = (type: string, points: { x: number; y: number; id: number }[]) =>
        webkitTouch.session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y) })) });
      await touch('touchStart', [{ x: cx - 40, y: cy, id: 1 }]); await p.waitForTimeout(16);
      await touch('touchStart', [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }]);
      for (let i = 1; i <= 8; i++) {
        const d = 80 + i * 28;
        await touch('touchMove', [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }]);
        await p.waitForTimeout(16);
      }
      await touch('touchEnd', [{ x: cx - 150, y: cy, id: 1 }]); await p.waitForTimeout(16);
      await touch('touchEnd', [{ x: cx + 150, y: cy, id: 2 }]);
    } else {
      for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -180); await p.waitForTimeout(20); }
    }
    await p.waitForTimeout(80);
    await settled(p).catch(() => undefined);
    await p.mouse.move(cx - 40, cy);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) { await p.mouse.move(cx - 40 + i * 10, cy); await p.waitForTimeout(16); }
    const zoomedPose = (await planet(p))!;
    await p.mouse.up();
    await p.waitForTimeout(120);
    const zoomedAfter = (await planet(p))!;
    check(`[${tag}] zoomed-in release stops almost immediately`,
      zoomedAfter.q.every((v:number,i:number)=>Math.abs(v-zoomedPose.q[i]!)<.002),
      `Δ=${zoomedAfter.q.map((v:number,i:number)=>Math.abs(v-zoomedPose.q[i]!).toFixed(4)).join(',')}`);
    // Restore a comfortable zoom for the rest of the suite.
    if (ios && webkitTouch) {
      const touch = (type: string, points: { x: number; y: number; id: number }[]) =>
        webkitTouch.session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y) })) });
      while ((await planet(p))!.zoom > zoomInBefore.zoom * 1.05) {
        await touch('touchStart', [{ x: cx - 140, y: cy, id: 1 }]); await p.waitForTimeout(16);
        await touch('touchStart', [{ x: cx - 140, y: cy, id: 1 }, { x: cx + 140, y: cy, id: 2 }]);
        for (let i = 1; i <= 8; i++) {
          const d = 280 - i * 28;
          await touch('touchMove', [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }]);
          await p.waitForTimeout(16);
        }
        await touch('touchEnd', [{ x: cx - 20, y: cy, id: 1 }]); await p.waitForTimeout(16);
        await touch('touchEnd', [{ x: cx + 20, y: cy, id: 2 }]);
        await settled(p).catch(() => undefined);
      }
    } else {
      while ((await planet(p))!.zoom > zoomInBefore.zoom * 1.02) {
        await p.mouse.wheel(0, 180); await p.waitForTimeout(16);
      }
    }
    // The finger moved 120px right; the ground follows during the gesture.
    const moved = (await screenOf(p, '0,0'))!;
    check(`[${tag}] the ground follows the finger`, moved.x - ground0.x > 60, `${(moved.x - ground0.x).toFixed(0)}px`);

    // Nothing renders at rest while the planet fills the window. A slow software GPU may still be
    // finishing the frame the drag asked for, so the count starts after a beat; from then on, across
    // 600 ms, nothing at all may draw (a loop would draw dozens).
    await p.waitForTimeout(300);
    const frames = (await planet(p))!.frames;
    await p.waitForTimeout(600);
    const rest = (await planet(p))!;
    // A wide window shows space round the planet even close in; then the slow slide is the only
    // loop, and it must stay slow. Otherwise nothing renders at all.
    if (rest.spaceVisible) check(`[${tag}] at rest only the slow star slide runs`, rest.frames - frames <= 24, `${rest.frames - frames} frames in .6s`);
    else check(`[${tag}] no idle rendering while the ground fills the window`, rest.frames === frames, `frames ${frames}->${rest.frames}`);

    // THE WHEEL ZOOMS TOWARDS THE POINTER, like any map: the tile under it stays under it. (Out, so
    // a window already fully zoomed in still moves.)
    if (!ios) {
      // A tile in the open upper part of the window (never under the tile bar), chosen by a tap.
      await p.waitForTimeout(400);
      await p.mouse.click(grid.x + grid.width * .3, grid.y + grid.height * .35);
      await p.waitForTimeout(400);
      await settled(p).catch(() => undefined);
      const s0 = (await planet(p))!;
      const target = s0.selected ?? '1,0', at0 = await screenOf(p, target);
      if (at0 && Math.hypot(at0.x - cx, at0.y - cy) > 40) {
        await p.evaluate(id=>{
          const w=window as any;w.__wheelProbe=[];const stop=new AbortController();w.__wheelProbeStop=stop;
          const record=(phase:string,e:WheelEvent)=>{const s=w.__severgrow.planet();w.__wheelProbe.push({phase,x:e.clientX,y:e.clientY,q:s.q,zoom:s.zoom,north:s.north,frame:s.frame,point:s.screenOf(id)});};
          window.addEventListener('wheel',e=>record('before',e),{capture:true,signal:stop.signal});
          document.querySelector('.planet-canvas')!.addEventListener('wheel',e=>record('after',e as WheelEvent),{signal:stop.signal});
        },target);
        await p.mouse.move(at0.x, at0.y);
        for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(30); }
        await settled(p).catch(() => undefined);
        const at1 = await screenOf(p, target), wheelPose=(await planet(p))!,z1=wheelPose.zoom;
        const trace=await p.evaluate(()=>{const w=window as any;w.__wheelProbeStop.abort();return w.__wheelProbe;});
        const diagnostic=!at1||Math.hypot(at1.x-at0.x,at1.y-at0.y)>=6?JSON.stringify({tag,target,north0:s0.north,north1:wheelPose.north,q0:s0.q,q1:wheelPose.q,frame0:(s0 as any).frame,frame1:(wheelPose as any).frame,at0,at1,trace}):'';
        check(`[${tag}] the wheel zooms towards the pointer`, !!at1 && z1 < s0.zoom * .95 && Math.hypot(at1.x - at0.x, at1.y - at0.y) < 6,
          at1 ? `moved ${Math.hypot(at1.x - at0.x, at1.y - at0.y).toFixed(1)}px, zoom ${s0.zoom.toFixed(2)} -> ${z1.toFixed(2)} ${diagnostic}` : `tile gone ${diagnostic}`);
      }
    }
    // Zoom out to space: the stars slide slowly, and only while space is visible.
    await p.mouse.move(cx, cy);
    if (ios) {
      // Mobile WebKit has no wheel: zoom out with a real two-finger pinch (trusted touch events).
      await p.touchscreen.tap(grid.x + 20, grid.y + grid.height - 20);
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
    // Measured across 2 s: a big window on CI's software GPU draws a frame in ~400 ms, so one second
    // could hold only two. Moving at all and never at full rate is what matters. Wait a beat after
    // the zoom-out settle so the slide loop has started before we sample (coast checks add zoom churn).
    await p.waitForTimeout(400);
    s = (await planet(p))!;
    const spaceFrames = s.frames;
    await p.waitForTimeout(2000);
    const slide = (await planet(p))!.frames - spaceFrames;
    check(`[${tag}] the stars slide gently (a slow loop, never a full-rate one)`, slide >= 2 && slide <= 80, `${slide} frames in 2s`);
    await p.screenshot({ path: `${out}/planet-space-${tag}.png` });

    // A tap on tiles too small to hit flies in rather than guessing.
    const tiny = (await planet(p))!;
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(40);
    s = (await planet(p))!;
    check(`[${tag}] a tap on tiny tiles flies in and selects nothing`, s.flying && s.selected === tiny.selected);
    await settled(p);
    check(`[${tag}] ...to a tappable size`, (await planet(p))!.tilePx >= 40);

    // FULLY ZOOMED IN, A DOUBLE TAP ZOOMS BACK OUT (owner, 2026-11-04). The wheel is not automatable on
    // mobile WebKit, so this runs where it is.
    if (!ios) {
      await p.mouse.move(cx, cy);
      for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, -600); await p.waitForTimeout(30); }
      await settled(p).catch(() => undefined);
      const closest = (await planet(p))!.tilePx;
      // One native gesture: separate host round-trips can turn 60ms into >320ms on software GL.
      await p.mouse.dblclick(cx, cy, { delay: 60 });
      await settled(p).catch(() => undefined);
      const after = (await planet(p))!.tilePx;
      check(`[${tag}] fully zoomed in, a double tap zooms back out`, closest > 70 && after < closest * .8, `${closest.toFixed(0)}px -> ${after.toFixed(0)}px tiles`);
    }
    // The ranking's "fly to" (flyToOwner) brings my land back to the middle.
    await p.locator('#online-world-menu').click();
    await p.locator('#world-key-ranking').click();
    // HOW MUCH OF THE PLANET IS GROWN, on top of the ranking (owner, 2026-11-04).
    const meter = await p.locator('#world-planet-grown').evaluate((el) => ({ shown: !(el as HTMLElement).hidden && (el as HTMLElement).offsetHeight > 0, text: el.textContent ?? '', spoken: el.getAttribute('aria-label') ?? '' }));
    check(`[${tag}] the ranking opens on how much of the planet is grown`,
      meter.shown && new RegExp(`PLANET GROWN\\s*${claims.length} / ${world.cells.length.toLocaleString('en-US')}`).test(meter.text) && /tiles on the planet are grown/.test(meter.spoken),
      `${meter.text} · ${meter.spoken}`);
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
    await p.waitForFunction(() => !(window as unknown as { __severgrow: { planet: () => { flying: boolean } | null } }).__severgrow.planet()?.flying, undefined, { timeout: 10000 }).catch(() => undefined);
    check(`[${tag}] ...and comes to rest whole behind the menu`, (await planet(p) as (Snapshot & { mode?: string }) | null)?.mode === 'menu' && !(await planet(p))!.flying);
    check(`[${tag}] one planet only, reused (no second canvas)`, (await p.locator('.planet-canvas').count()) === 1);
    // CONTINUOUS (owner, 2026-11-04): back on the menu the planet is where the menu left it (plus the
    // second or so of slow turn since), never reset to a fixed starting pose.
    if (lastMenu?.ready) {
      const resumed = (await pose())!;
      const along = Math.abs(lastMenu.q.reduce((sum, x, i) => sum + x * resumed.q[i]!, 0));
      check(`[${tag}] back on the menu the planet carries on from where it was`, along > .99, `${along.toFixed(5)}`);
    }
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
      await p.waitForTimeout(1800); // 650ms requested fade plus completion headroom
      check(`[${tag}] leaving the menu for PLAY frees the planet after its 650ms fade`, (await planet(p)) === null && (await p.locator('.planet-canvas').count()) === 0);
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
      const box = (await p.locator('#online-world-grid').boundingBox())!;
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
      const box = (await p.locator('#online-world-grid').boundingBox())!;
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
