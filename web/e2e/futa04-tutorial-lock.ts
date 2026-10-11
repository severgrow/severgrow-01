// Tutorial focus lock: dead chrome stays dead; target still works; Exit releases.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = process.env.PW_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 800 },
] as const;
const SHOT_DIR = path.resolve('docs/screens/tutorial');
mkdirSync(SHOT_DIR, { recursive: true });

const server = await preview({
  configFile: 'web/vite.config.ts',
  preview: { port: 4198, strictPort: true },
  logLevel: 'silent',
});
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const errors: string[] = [];

const hashState = async (page: import('playwright-core').Page) => {
  const raw = await page.evaluate(() => JSON.stringify((window as any).__severgrow.state()));
  return createHash('sha1').update(raw ?? 'null').digest('hex');
};

const openTutorial = async (page: import('playwright-core').Page, chapter = 1) => {
  await page.addInitScript(() => {
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      speed: 'fast', reduceMotion: true, sound: false, music: false, coach: false, eyeCandy: false,
    }));
  });
  await page.goto(`http://localhost:4198/?tutorial=1&chapter=${chapter}`);
  await page.waitForFunction(() => !!(window as any).__severgrow?.tutorialGate?.()?.active, undefined, { timeout: 20000 });
  await page.waitForSelector('#futasaku-glass:not([hidden])');
};

try {
  // --- Lock fuzz on chapter 2 (draw pile), phone viewport ---
  {
    const page = await browser.newPage({ viewport: VIEWPORTS[1], hasTouch: true, isMobile: true });
    page.on('pageerror', e => errors.push(e.message));
    await openTutorial(page, 2);
    assert.match(await page.locator('#futasaku-glass .glass-copy').textContent() ?? '', /draw pile/i);
    const before = await hashState(page);
    const dead = ['#hud-menu', '#hud-history', '#menu-settings', '#hand-sort', '#tool-undo', '#discard'];
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
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
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
    assert.equal(await page.locator('#menu:not([hidden])').count(), 0, 'menu must stay closed');
    // Wrong-tap message appears
    await page.mouse.click(12, 12);
    await page.waitForTimeout(80);
    const copy = await page.locator('#futasaku-glass .glass-copy').textContent() ?? '';
    assert.match(copy, /glowing|Not there|Almost|locked/i);
    await page.screenshot({ path: path.join(SHOT_DIR, 'lock-wrong-tap.png') });

    // Fuzz 100 random points that the gate would block (outside target + window).
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

    // Shot of the draw step with dim + glow + pointer, then prove the real target works.
    await page.screenshot({ path: path.join(SHOT_DIR, 'chapter-02-draw.png') });
    await page.locator('#deck').click({ force: true });
    await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 15000 });

    // Exit releases lock
    await page.locator('#futasaku-glass [data-tut="exit"]').click({ force: true });
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

    // Lock proof: menu tap does nothing
    const before = await hashState(page);
    await page.locator('#hud-menu').click({ force: true });
    assert.equal(await hashState(page), before);
    await page.screenshot({ path: path.join(SHOT_DIR, 'lock-menu-blocked.png') });

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
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
        speed: 'fast', reduceMotion: true, sound: false, music: false, coach: false,
      }));
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

  console.log('futa04-tutorial-lock: ok');
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
