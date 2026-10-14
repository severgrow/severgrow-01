// Tutorial focus lock: dead chrome stays dead; target still works; menu Exit releases.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const server = await preview({
  configFile: 'web/vite.config.ts',
  preview: { port: 4198, strictPort: true },
  logLevel: 'silent',
});
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const errors: string[] = [];
const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 800 },
] as const;
const SHOT_DIR = path.resolve('docs/screens/tutorial');
mkdirSync(SHOT_DIR, { recursive: true });

const hashState = async (page: import('playwright-core').Page) => {
  const raw = await page.evaluate(() => JSON.stringify((window as any).__severgrow.state()));
  return createHash('sha1').update(raw ?? 'null').digest('hex');
};

const openTutorial = async (page: import('playwright-core').Page, chapter = 1) => {
  await page.addInitScript(() => {
    const settings = JSON.stringify({
      speed: 'fast', reduceMotion: true, sound: false, music: false, coach: false, eyeCandy: false,
    });
    for (const k of ['severgrow.settings.v1', 'futa04:severgrow.settings.v1', 'main2:severgrow.settings.v1']) {
      localStorage.setItem(k, settings);
    }
  });
  await page.goto(`http://localhost:4198/?tutorial=1&chapter=${chapter}`);
  // the free turn has no step lock; every other chapter opens locked
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return !!h?.tutorial() && (!!h.tutorialGate?.()?.active || !!document.querySelector('#futasaku-glass:not([hidden])'));
  }, undefined, { timeout: 20000 });
  await page.waitForSelector('#futasaku-glass:not([hidden])');
};

try {
  // --- Lock fuzz on chapter 2 (draw pile), phone viewport ---
  {
    const page = await browser.newPage({ viewport: VIEWPORTS[1], hasTouch: true, isMobile: true });
    page.on('pageerror', e => errors.push(e.message));
    await openTutorial(page, 2);
    assert.match(await page.locator('#futasaku-glass .glass-copy').textContent() ?? '', /^DRAW$/);
    // Glass Exit is gone — leave via the pause menu.
    assert.equal(await page.locator('#futasaku-glass [data-tut="exit"]').count(), 0, 'glass Exit must be removed');
    const before = await hashState(page);
    const dead = ['#hud-history', '#menu-settings', '#hand-sort', '#tool-undo', '#discard'];
    for (const sel of dead) {
      const el = page.locator(sel).first();
      if (await el.count()) await el.click({ force: true }).catch(() => undefined);
    }
    // Non-target card / hex / home
    await page.locator('#hand .card').nth(1).click({ force: true }).catch(() => undefined);
    await page.locator('#board .hex-cell').first().click({ force: true }).catch(() => undefined);
    // Wheel zoom + keyboard
    await page.mouse.wheel(0, 400);
    await page.keyboard.press('Tab');
    // Enter/Space can open the pause sheet via a focused control — Escape closes it again.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Pinch-ish drag on board
    const board = page.locator('#board-wrap');
    const box = await board.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
      await page.mouse.up();
    }
    assert.equal(await hashState(page), before, 'dead taps must not change game state');
    assert.equal(await page.locator('#menu:not([hidden])').count(), 0, 'main menu must stay closed');
    // Wrong taps stay silent — glass copy must not flip to a "locked" toast.
    await page.mouse.click(12, 12);
    await page.waitForTimeout(80);
    const copy = await page.locator('#futasaku-glass .glass-copy').textContent() ?? '';
    assert.match(copy, /^DRAW$/);
    assert.doesNotMatch(copy, /locked|Not there|Almost|glowing/i);
    await page.screenshot({ path: path.join(SHOT_DIR, 'lock-wrong-tap.png') });

    // Fuzz against the step gate (not the pause-sheet allow list).
    const sheetOpen = await page.evaluate(() => !document.getElementById('scrim')?.hidden);
    if (sheetOpen) {
      await page.locator('#gm-resume, #sheet-menu [data-close]').first().click({ force: true });
      await page.waitForFunction(() => !!document.getElementById('scrim')?.hidden, undefined, { timeout: 5000 });
    }
    await page.waitForFunction(() => {
      const gate = (window as any).__severgrow?.tutorialGate?.();
      const allow = gate?.allow?.selectors ?? [];
      return !!gate?.active && allow.includes('#deck') && !allow.includes('#scrim');
    }, undefined, { timeout: 5000 });
    const beforeFuzz = await hashState(page);
    let fuzzed = 0;
    for (let i = 0; i < 200 && fuzzed < 100; i++) {
      const x = 8 + Math.floor(Math.random() * 374);
      const y = 8 + Math.floor(Math.random() * 828);
      const blocked = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const gate = (window as any).__severgrow?.tutorialGate?.();
        if (!gate?.active) return false;
        return gate.wouldBlock(el);
      }, { x, y });
      if (!blocked) continue;
      await page.mouse.click(x, y);
      fuzzed++;
    }
    assert.ok(fuzzed >= 80, `expected enough blocked fuzz taps, got ${fuzzed}`);
    assert.equal(await hashState(page), beforeFuzz, 'fuzz taps must not change state');
    assert.equal(errors.length, 0, `console errors: ${errors.join('; ')}`);

    // Focus dim must punch real pixel holes (userSpaceOnUse), stay contour-free, and
    // keep #hud-menu above the glass sheet (glass hosted inside #game with HUD).
    const focusOk = await page.evaluate(() => {
      const focus = document.getElementById('tutorial-focus');
      const glass = document.getElementById('futasaku-glass');
      const menu = document.getElementById('hud-menu');
      const game = document.getElementById('game');
      const mask = focus?.querySelector('mask');
      const hole = focus?.querySelector('.focus-hole');
      const glow = focus?.querySelector('.focus-glow');
      if (!focus || !glass || !menu || !mask || !hole || !glow) return { ok: false, why: 'missing' };
      const hw = parseFloat(hole.getAttribute('width') || '0');
      const hh = parseFloat(hole.getAttribute('height') || '0');
      const mz = Number.parseInt(getComputedStyle(menu).zIndex, 10) || 0;
      const hz = Number.parseInt(getComputedStyle(document.querySelector('.game > .hud')!).zIndex, 10) || 0;
      const gz = Number.parseInt(getComputedStyle(glass).zIndex, 10) || 0;
      const stroke = getComputedStyle(glow).stroke;
      const strokeWidth = getComputedStyle(glow).strokeWidth;
      const menuBox = menu.getBoundingClientRect();
      const glassBox = glass.getBoundingClientRect();
      const sampleX = Math.min(menuBox.left + menuBox.width / 2, Math.max(4, menuBox.left + 8));
      const sampleY = Math.min(menuBox.top + menuBox.height / 2, Math.max(4, menuBox.top + 8));
      const topEl = document.elementFromPoint(sampleX, sampleY);
      return {
        ok: true,
        maskUnits: mask.getAttribute('maskUnits'),
        hasForeign: !!focus.querySelector('foreignObject'),
        holeSize: hw * hh,
        menuAboveGlass: Math.max(mz, hz) > gz,
        glassInsideGame: !!game && game.contains(glass) && game.contains(focus),
        noContour: (stroke === 'none' || stroke === 'rgba(0, 0, 0, 0)') && (strokeWidth === '0px' || strokeWidth === '0'),
        menuHit: !!(topEl && (topEl === menu || menu.contains(topEl))),
        glassCoversMenuY: glassBox.top < menuBox.bottom && glassBox.bottom > menuBox.top
          && glassBox.left < menuBox.right && glassBox.right > menuBox.left,
      };
    });
    assert.equal(focusOk.ok, true, 'tutorial focus scene present');
    assert.equal(focusOk.maskUnits, 'userSpaceOnUse', 'cutout mask uses screen pixels');
    assert.equal(focusOk.hasForeign, false, 'no foreignObject backdrop crush');
    assert.ok((focusOk.holeSize as number) > 2000, `focus hole must be sized, got ${focusOk.holeSize}`);
    assert.equal(focusOk.glassInsideGame, true, 'glass/focus must live inside #game for HUD stacking');
    assert.equal(focusOk.menuAboveGlass, true, '#hud-menu / hud must sit above #futasaku-glass');
    assert.equal(focusOk.noContour, true, 'focus glow must have no outline stroke/contour');
    if (focusOk.glassCoversMenuY) {
      assert.equal(focusOk.menuHit, true, 'menu button must win hit-testing when glass overlaps it');
    }

    // Map sits in the leftover band with equal gaps glass→board and board→dock.
    // Wait for camera tutorial-centering + pad reserve to settle.
    await page.waitForFunction(() => {
      const glass = document.getElementById('futasaku-glass')?.getBoundingClientRect();
      const dock = document.getElementById('dock')?.getBoundingClientRect();
      const cells = [...document.querySelectorAll('#board .hex-cell')];
      if (!glass || !dock || !cells.length) return false;
      let top = Infinity; let bottom = -Infinity;
      for (const el of cells) {
        const r = el.getBoundingClientRect();
        if (r.height <= 0) continue;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      if (!Number.isFinite(top)) return false;
      const gapTop = top - glass.bottom;
      const gapBottom = dock.top - bottom;
      return gapTop > 4 && gapBottom > 4 && Math.abs(gapTop - gapBottom) <= 16;
    }, undefined, { timeout: 8000 });
    const headH = await page.evaluate(() => {
      const title = document.querySelector('#futasaku-glass .glass-led-window')?.getBoundingClientRect();
      const next = document.querySelector('#futasaku-glass [data-tut="next"]')?.getBoundingClientRect();
      const prev = document.querySelector('#futasaku-glass [data-tut="previous"]')?.getBoundingClientRect();
      return {
        title: title ? Math.round(title.height) : 0,
        next: next ? Math.round(next.height) : 0,
        prev: prev ? Math.round(prev.height) : 0,
      };
    });
    assert.ok(headH.title > 0, 'tutorial title LED should be sized');
    if (headH.next) assert.equal(headH.next, headH.title, `NEXT height must match title: ${JSON.stringify(headH)}`);
    if (headH.prev) assert.equal(headH.prev, headH.title, `PREVIOUS height must match title: ${JSON.stringify(headH)}`);

    // Shot of the draw step with dim + glow + pointer, then prove the real target works.
    await page.screenshot({ path: path.join(SHOT_DIR, 'chapter-02-draw.png') });
    await page.locator('#deck').click({ force: true });
    await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 15000 });

    // Menu opens; Exit tutorial is first and releases the lock.
    await page.locator('#hud-menu').click();
    await page.waitForSelector('#sheet-menu:not([hidden])');
    const firstVisible = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('#sheet-menu .sheet-body > button')]
        .filter(b => !b.hidden && getComputedStyle(b).display !== 'none');
      return buttons[0]?.id ?? '';
    });
    assert.equal(firstVisible, 'gm-exit-tutorial', 'Exit tutorial must be the first menu option');
    await page.locator('#gm-exit-tutorial').click();
    await page.waitForFunction(() => !(window as any).__severgrow?.tutorialGate?.()?.active, undefined, { timeout: 10000 });
    const leftover = await page.evaluate(() =>
      ['#game', '#menu', '#levels', '#scrim']
        .filter(sel => document.querySelector(`${sel}[inert]`))
        .map(sel => sel));
    assert.deepEqual(leftover, [], `tutorial inert roots remain after exit: ${leftover.join(',')}`);
    await page.close();
  }

  // --- One screenshot per chapter at 390x844 ---
  {
    const page = await browser.newPage({ viewport: VIEWPORTS[1], hasTouch: true, isMobile: true });
    page.on('pageerror', e => errors.push(e.message));
    for (let chapter = 1; chapter <= 13; chapter++) {
      await openTutorial(page, chapter);
      await page.waitForTimeout(350);
      const pad = String(chapter).padStart(2, '0');
      await page.screenshot({ path: path.join(SHOT_DIR, `chapter-${pad}.png`) });
    }
    // Pointer / glow sample during a grow step
    await openTutorial(page, 2);
    await page.locator('#deck').click({ force: true });
    await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOT_DIR, 'chapter-02-grow.png') });

    // Menu stays reachable and looks usable (not inert / not blocked by the gate).
    const menuBlocked = await page.evaluate(() => {
      const menu = document.getElementById('hud-menu');
      const gate = (window as any).__severgrow?.tutorialGate?.();
      return !menu || !!gate?.wouldBlock(menu);
    });
    assert.equal(menuBlocked, false, '#hud-menu must stay reachable during tutorial');
    await page.locator('#hud-menu').click();
    await page.waitForSelector('#sheet-menu:not([hidden]) #gm-exit-tutorial:not([hidden])');
    await page.screenshot({ path: path.join(SHOT_DIR, 'lock-menu-blocked.png') });
    await page.locator('#sheet-menu [data-close], #gm-resume').first().click({ force: true });
    await page.waitForFunction(() => !!document.getElementById('sheet-menu')?.hidden, undefined, { timeout: 5000 });

    // Back / exit path via API
    await page.evaluate(() => (window as any).__severgrow.exitTutorial());
    await page.waitForFunction(() => !(window as any).__severgrow?.tutorialGate?.()?.active);
    const leftover = await page.evaluate(() =>
      ['#game', '#menu', '#levels', '#scrim'].filter(sel => document.querySelector(`${sel}[inert]`)));
    assert.deepEqual(leftover, []);
    await page.close();
  }

  // --- Normal game has no gate ---
  {
    const page = await browser.newPage({ viewport: VIEWPORTS[1] });
    await page.addInitScript(() => {
      const settings = JSON.stringify({
        speed: 'fast', reduceMotion: true, sound: false, music: false, coach: false,
      });
      for (const k of ['severgrow.settings.v1', 'futa04:severgrow.settings.v1', 'main2:severgrow.settings.v1']) {
        localStorage.setItem(k, settings);
      }
    });
    await page.goto('http://localhost:4198/');
    await page.waitForSelector('#menu-new, #menu-play, #menu-tutorial');
    const gate = await page.evaluate(() => (window as any).__severgrow?.tutorialGate?.());
    assert.ok(!gate || gate.active === false, 'normal boot must not arm the tutorial gate');
    const leftover = await page.evaluate(() =>
      ['#game', '#menu', '#levels', '#scrim'].filter(sel => document.querySelector(`${sel}[inert]`)));
    assert.deepEqual(leftover, [], 'normal game must not inert tutorial roots');
    await page.close();
  }

  // Multi-viewport smoke: gate stays active, pointer stays on-screen when visible
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp, hasTouch: vp.width < 1000, isMobile: vp.width < 1000 });
    await openTutorial(page, 2);
    const active = await page.evaluate(() => (window as any).__severgrow.tutorialGate().active);
    assert.equal(active, true, `gate active at ${vp.width}x${vp.height}`);
    const pointerOk = await page.evaluate(() => {
      const focus = document.getElementById('tutorial-focus');
      if (!focus || focus.hasAttribute('hidden')) return true;
      if (focus.dataset.pointer !== '1') return true; // hidden when blocked is OK
      const g = focus.querySelector('.focus-pointer');
      if (!g) return true;
      const r = (g as SVGGElement).getBoundingClientRect();
      return r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;
    });
    assert.equal(pointerOk, true, `pointer on-screen at ${vp.width}x${vp.height}`);
    await page.close();
  }

  // Large text: the tutorial window's copy scales like every other Futasaku surface
  // (the Match Intel reference already steps 13px → 15px), and nothing clips.
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }] as const) {
    const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
    page.on('pageerror', e => errors.push(e.message));
    await openTutorial(page, 2);
    await page.evaluate(() => document.documentElement.classList.add('large-text'));
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const glass = document.getElementById('futasaku-glass')!;
      const why = document.querySelector('#futasaku-glass .glass-why');
      const btns = [...glass.querySelectorAll<HTMLButtonElement>('.glass-head-slot > button')];
      const rect = glass.getBoundingClientRect();
      return {
        why: why ? parseFloat(getComputedStyle(why).fontSize) : 0,
        clipped: btns.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => (b.textContent || '').trim()),
        right: rect.right,
        bottom: rect.bottom,
        dockTop: document.getElementById('dock')!.getBoundingClientRect().top,
        vw: innerWidth,
      };
    });
    assert.ok(m.why >= 14, `${vp.width}x${vp.height}: Large text grows the tutorial copy (${m.why}px)`);
    assert.equal(m.clipped.length, 0, `${vp.width}x${vp.height}: Large text clips no head button (${m.clipped.join(', ')})`);
    assert.ok(m.right <= m.vw + 1, `${vp.width}x${vp.height}: the large-text glass still fits the screen`);
    assert.ok(m.bottom < m.dockTop, `${vp.width}x${vp.height}: the large-text glass stays above the dock`);
    await page.close();
  }

  console.log('futa04-tutorial-lock: ok');
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
