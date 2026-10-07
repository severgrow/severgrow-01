// Explicit Test2 help and message checks. No game hooks are used to perform these moves.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { apply } from '../../src/engine/index.js';

const external = process.env.TEST2_URL;
const server = external ? null : await preview({ configFile: 'web/vite.config.ts', preview: { port: 4195, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox', '--ignore-certificate-errors'], ...(external && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const base = external ?? 'http://localhost:4195/';
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
try {
  // Lessons must work before a game has been created.
  const menu = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  await menu.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
  await menu.goto(base);
  await menu.waitForFunction(() => !!(window as any).__severgrow);
  const appIcon = await menu.evaluate(async () => {
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!;
    const image = new Image(); image.src = apple.href; await image.decode();
    const manifestURL = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
    const manifest = await fetch(manifestURL).then(r=>r.json());
    const icons = await Promise.all(manifest.icons.map(async (icon: {src:string;sizes:string;purpose:string}) => {
      const asset = new Image(); asset.src = new URL(icon.src,manifestURL).href; await asset.decode();
      return { ...icon, width:asset.naturalWidth,height:asset.naturalHeight };
    }));
    return { apple:apple.href, width:image.naturalWidth,height:image.naturalHeight,
      name:manifest.name, start:manifest.start_url, scope:manifest.scope, icons };
  });
  check(appIcon.apple.endsWith('futasaku-icon-180.png') && appIcon.width===180 && appIcon.height===180,
    'iPhone Home Screen loads the new 180px Futasaku artwork');
  check(appIcon.name==='Futasaku' && appIcon.start==='./' && appIcon.scope==='./' && appIcon.icons.length===3 &&
    appIcon.icons.every((icon: {src:string;sizes:string;width:number;height:number})=>icon.src.startsWith('futasaku-icon-') && icon.sizes===`${icon.width}x${icon.height}`) &&
    appIcon.icons.some((icon: {purpose:string})=>icon.purpose==='maskable'),
    'Android icons decode at the declared sizes with a separate mask-safe icon and Test2-local launch scope');
  for (const topic of ['fruit', 'strengthen', 'draw']) {
    await menu.click('#menu-howto');
    await menu.locator(`#howto-body [data-tip="${topic}"]`).click();
    check(await menu.locator('#sheet-test2-help').isVisible(), `${topic}: explicit lesson opens before a game`);
    check(!/\bfruit(?:ed)?\b/i.test(await menu.locator('#sheet-test2-help').innerText()), `${topic}: help uses Bomb terminology`);
    if (topic === 'fruit') check((await menu.locator('#first-tip-title').innerText()).includes('Bomb'), 'Bomb help title');
    check((await menu.locator('#first-tip-title').innerText()).length > 3 && (await menu.locator('#first-tip-text').innerText()).length > 60, `${topic}: full lesson is populated`);
    await menu.click('#first-tip-ok');
    check(!await menu.locator('#sheet-test2-help').isVisible(), `${topic}: acknowledgement closes help`);
    check(!await menu.evaluate(() => (window as any).__severgrow.state()), `${topic}: reading doesn't create a game`);
  }
  await menu.close();
  for (const [width, height, large, left, v3] of [[360,640,false,false,false],[390,664,true,true,true],[390,844,false,false,true],[430,932,true,false,false],[768,1024,false,false,false],[1440,900,false,false,true]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 800, isMobile: width < 600, ignoreHTTPSErrors: true });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ large, left }) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ coach: true, sound: false, music: false, reduceMotion: true, speed: 'fast', autoSkip: false, largeText: large }));
      localStorage.setItem('main2:severgrow-thumb', JSON.stringify({ side: left ? 'left' : 'right' }));
    }, { large, left });
    await page.goto(`${base}?seed=219682080${v3 ? '&design=v3' : ''}`);
    await page.waitForFunction(() => (window as any).__severgrow?.state() && !(window as any).__severgrow.busy());
    await page.waitForTimeout(250);
    check(await page.locator('#test2-help-button').isVisible(), `${width}: hint is discoverable`);
    const tools = await page.evaluate(() => {
      const hint = document.querySelector<HTMLElement>('#test2-help-button')!;
      const buttons = ['tool-undo', 'test2-help-button', 'hand-sort'].map(id => document.getElementById(id)!);
      const boxes = buttons.map(button => button.getBoundingClientRect());
      const obstacles = [...document.querySelectorAll<HTMLElement>('#deck, #discard, #moves button, #hand .card')]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .map(node => ({ id: node.id || node.className, box: node.getBoundingClientRect() }));
      const overlaps = boxes.flatMap((box, i) => obstacles.filter(({ box: other }) =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)
        .map(({ id }) => `${buttons[i]!.id}/${id}`));
      const style = getComputedStyle(hint);
      const undo = getComputedStyle(buttons[0]!);
      return { icon: !!hint.querySelector('svg path') && !hint.textContent?.trim(),
        aligned: boxes.every(box => Math.abs(box.top + box.height / 2 - boxes[0]!.top - boxes[0]!.height / 2) < 1 && Math.abs(box.height-boxes[0]!.height) < 1),
        separate: boxes.every((box, i) => !i || box.left >= boxes[i-1]!.right + 3),
        fits: boxes.every(box => box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight),
        matching: style.border === undo.border && style.backgroundColor === undo.backgroundColor && style.color === undo.color,
        offMap: hint.closest('#test2-information-rail') === null && hint.parentElement?.id === 'test2-actions',
        taps: buttons.every((button, i) => { const box = boxes[i]!; const pseudo = getComputedStyle(button,'::after');
          const extra = pseudo.display !== 'none' ? 16 : 0;
          return box.width+extra >= 44 && box.height+extra >= 44;
        }), overlaps };
    });
    check(tools.icon && tools.offMap, `${width}: bulb replaces Hint text beside the existing tools`);
    check(tools.aligned && tools.separate && tools.fits && tools.matching && tools.taps,
      `${width}: tool trio matches, aligns and retains separate touch targets (${JSON.stringify(tools)})`);
    check(tools.overlaps.length === 0, `${width}: tools never cover piles, moves or cards (${tools.overlaps})`);
    check(await page.locator('#deck.coach-glow').count() === 0, `${width}: Deck has no square suggestion outline`);
    check(await page.locator('.pile-label:visible').count() === 0, `${width}: pile descriptions leave no visible clutter`);
    const pulse = await page.evaluate(() => {
      const root = document.documentElement;
      const text = document.querySelector<HTMLElement>('#step-cue .cue-text')!;
      const reduced = getComputedStyle(text).animationName;
      root.classList.remove('reduce-motion');
      const regular = getComputedStyle(text).animationName;
      const animation = text.getAnimations()[0];
      const frames = animation?.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [];
      const duration = animation?.effect?.getTiming().duration;
      root.classList.add('reduce-motion');
      return { reduced, regular, duration, frames: frames.map(frame => ({ opacity: Number(frame.opacity), transform: frame.transform })) };
    });
    check(pulse.reduced === 'none' && pulse.regular === 'test2-cue-breathe' && pulse.duration === 3100 &&
      pulse.frames.every(frame => frame.opacity >= .94 && frame.opacity <= 1 && ['scale(1)', 'scale(1.085)'].includes(String(frame.transform))),
      `${width}: idle prompt has an intentional 8.5% zoom and respects Reduce motion (${JSON.stringify(pulse)})`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check(await page.evaluate(() => {
      document.documentElement.classList.remove('reduce-motion');
      const disabled = getComputedStyle(document.querySelector('#step-cue .cue-text')!).animationName === 'none';
      document.documentElement.classList.add('reduce-motion');
      return disabled;
    }), `${width}: system Reduce motion also disables the pulse`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    check(await page.locator('#step-cue').innerText().then(text => text.toUpperCase().includes('DRAW')), `${width}: current step`);
    check(!await page.locator('#turn-pill').isVisible(), `${width}: no competing turn pill`);
    const before = await page.evaluate(() => (window as any).__severgrow.state());
    await page.click('#test2-help-button');
    check(await page.locator('#sheet-test2-help').isVisible(), `${width}: explicit help opens`);
    await page.locator('#sheet-test2-help').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    const layout = await page.evaluate(() => {
      const sheet = document.querySelector('#sheet-test2-help') as HTMLElement;
      const message = document.querySelector('#coach-suggested') as HTMLElement;
      const r = sheet.getBoundingClientRect();
      const controls = [...sheet.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.getClientRects().length);
      return { fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1,
        unclipped: message.scrollWidth <= message.clientWidth + 1 && getComputedStyle(message).whiteSpace === 'normal',
        taps: controls.every(button => { const b = button.getBoundingClientRect(); return b.width >= 44 && b.height >= 44; }),
        progress: document.querySelector('#coach-step')?.textContent,
        overflow: sheet.scrollWidth > sheet.clientWidth + 1 };
    });
    if (!layout.fits || layout.overflow) console.log('sheet layout', layout, await page.locator('#sheet-test2-help').boundingBox());
    await page.screenshot({ path: `/tmp/main2-shots/info-${width}x${height}-help.png` });
    check(layout.fits && !layout.overflow, `${width}: dialog fits viewport`);
    check(layout.unclipped, `${width}: full advice is readable`);
    check(layout.taps, `${width}: controls have 44px targets`);
    check(layout.progress?.startsWith('Tip '), `${width}: progress is labelled`);
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => !!document.activeElement?.closest('#sheet-test2-help')), `${width}: keyboard remains in help`);
    await page.click('#coach-show');
    check(!await page.locator('#sheet-test2-help').isVisible(), `${width}: Show closes help`);
    check(JSON.stringify(await page.evaluate(() => (window as any).__severgrow.state())) === JSON.stringify(before), `${width}: reading help leaves state intact`);
    check(await page.locator('#guide-arrow').isVisible(), `${width}: Show points to actual move`);
    await page.click('#deck');
    await page.waitForFunction(() => !(window as any).__severgrow.busy());
    check(JSON.stringify(await page.evaluate(() => (window as any).__severgrow.state())) === JSON.stringify(apply(before, { t: 'Draw', from: 'deck' })), `${width}: draw still matches engine`);
    check(await page.locator('#step-cue').innerText().then(text => text.toUpperCase().includes('GROW')), `${width}: Grow label follows state`);
    check(await page.locator('#board .coach-ring').count() === 0, `${width}: automatic suggestions leave no white tile circles`);
    const skipFit = await page.evaluate(() => {
      const skip = document.querySelector('#moves > .test2-skip')!.getBoundingClientRect();
      const bulb = document.querySelector('#test2-help-button')!.getBoundingClientRect();
      const sort = document.querySelector('#hand-sort')!.getBoundingClientRect();
      return { aligned:Math.abs(skip.left-bulb.left)<1 && Math.abs(skip.right-sort.right)<1,
        height:Math.abs(skip.height-bulb.height)<1, above:skip.bottom<=bulb.top-1, skip:[skip.x,skip.y,skip.width,skip.height], bulb:[bulb.x,bulb.y,bulb.width,bulb.height], sort:[sort.x,sort.y,sort.width,sort.height] };
    });
    check(skipFit.aligned && skipFit.height && skipFit.above, `${width}: Skip exactly spans bulb and ordering buttons above them (${JSON.stringify(skipFit)})`);
    // Draw piles ease back into the cockpit after the phase changes; measure the
    // settled geometry rather than an intermediate transition frame.
    await page.waitForTimeout(260);
    const frame = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('#test2-box')!;
      const css = getComputedStyle(box);
      const skip = document.querySelector('#moves .test2-skip')!.getBoundingClientRect();
      const tools = document.querySelector('#test2-actions')!.getBoundingClientRect();
      const faces = [...document.querySelectorAll('#test2-box .pile-card')].map(el=>el.getBoundingClientRect());
      const counters = [...document.querySelectorAll('#test2-box .pile-count')].map(el=>el.getBoundingClientRect());
      return { invisible:css.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(css.borderTopWidth) === 0 && css.boxShadow === 'none',
        top:faces.every(face=>Math.abs(face.top-skip.top)<1), bottom:counters.every(counter=>Math.abs(counter.bottom-tools.bottom)<1) };
    });
    check(frame.invisible && frame.top && frame.bottom, `${width}: invisible box shares exact top and bottom alignment (${JSON.stringify(frame)})`);
    if (width === 360 || width === 1440) {
      const image = await page.screenshot({ type: 'jpeg', quality: 35, scale: 'css' });
      if (image.length <= 192 * 1024) {
        console.log(`TEST2_SCREENSHOT_BEGIN ${width}x${height}-hint-bulb.jpg image/jpeg ${image.length} bytes`);
        console.log(image.toString('base64'));
        console.log(`TEST2_SCREENSHOT_END ${width}x${height}-hint-bulb.jpg`);
      }
    }
    await page.click('#test2-help-button');
    await page.keyboard.press('Escape');
    check(!await page.locator('#sheet-test2-help').isVisible(), `${width}: Escape closes`);
    check(await page.evaluate(() => document.activeElement?.id === 'test2-help-button'), `${width}: focus returns to Hint`);
    const boundaries = await page.evaluate(() => {
      const rail = document.querySelector('#test2-information-rail')!.getBoundingClientRect();
      const board = document.querySelector('#board-wrap')!.getBoundingClientRect();
      const cue = document.querySelector('#step-cue')!.getBoundingClientRect();
      const under = parseFloat(getComputedStyle(document.querySelector('#board-wrap')!).getPropertyValue('--cam-under')) || 0;
      return rail.top >= board.top && rail.bottom <= board.bottom &&
        Math.abs(cue.left + cue.width / 2 - (board.left + board.width / 2)) <= 1 &&
        Math.abs(cue.top + cue.height / 2 - (board.top + (board.height - under) / 2)) <= 1 &&
        getComputedStyle(document.querySelector('#step-cue')!).pointerEvents === 'none' &&
        cue.left >= 0 && cue.right <= innerWidth &&
        document.querySelector('#test2-information-rail')!.parentElement?.id === 'board-wrap';
    });
    check(boundaries, `${width}: guidance floats centrally over the board without blocking or reserving a row`);
    await page.click('#hud-menu');
    check(!await page.locator('#test2-help-button').isVisible(), `${width}: Pause suppresses background help`);
    check(errors.length === 0, `${width}: no browser errors (${errors.join(' | ')})`);
    await page.screenshot({ path: `/tmp/main2-shots/info-${width}x${height}-pause.png` });
    await page.close();
  }
  console.log(`${checks} information checks passed`);
} finally { await browser.close(); server?.httpServer.close(); }
