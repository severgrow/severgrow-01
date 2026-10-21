// Explicit Futa04 help and message checks. No game hooks are used to perform these moves.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { apply } from '../../src/engine/index.js';

const external = process.env.FUTA04_URL;
// A FREE port (helpers/preview-port.ts) unless an external URL was supplied.
const served = external ? null : await servePreview(4195, { logLevel: 'silent' });
const server = served?.server ?? null;
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox', '--ignore-certificate-errors'], ...(external && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const base = external ?? served!.url;
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
    'Android icons decode at the declared sizes with a separate mask-safe icon and Futa04-local launch scope');
  // Seeded match (not Tutorial): focus lock keeps #hud-menu inert mid-step.
  await menu.goto(`${base}?seed=219682080`);
  // The reload is still booting when this runs: the app installs __severgrow partway through its
  // module, so a bare `.state()` can throw inside the predicate and fail the wait at once instead
  // of retrying. Guard the hook so the wait is on the app's own state, not on a boot transient.
  await menu.waitForFunction(() => !!(window as any).__severgrow?.state() && !(window as any).__severgrow.busy());
  for (const topic of ['fruit', 'strengthen', 'draw']) {
    await menu.click('#hud-menu');
    await menu.click('#gm-howto');
    // FUTASAKU: the pause menu opens the Match Intel "How to" tab, not a separate sheet.
    check(await menu.locator('#futasaku-glass[data-mode="intel"] [data-intel-tab="howto"][aria-selected="true"]').isVisible(),
      `${topic}: the pause menu opens the Match Intel How to reference`);
    check((await menu.locator('#futasaku-glass .intel-tab[data-intel-tab="howto"]').textContent())?.trim() === 'How to', `${topic}: the tab is named How to`);
    await menu.locator(`#futasaku-glass .intel-howto [data-tip="${topic}"]`).click();
    check(await menu.locator('#sheet-futa04-help').isVisible(), `${topic}: explicit lesson opens during a game`);
    check(!/\bfruit(?:ed)?\b/i.test(await menu.locator('#sheet-futa04-help').innerText()), `${topic}: help uses Bomb terminology`);
    if (topic === 'fruit') check((await menu.locator('#first-tip-title').innerText()).includes('Bomb'), 'Bomb help title');
    check((await menu.locator('#first-tip-title').innerText()).length > 3 && (await menu.locator('#first-tip-text').innerText()).length > 60, `${topic}: full lesson is populated`);
    await menu.click('#first-tip-ok');
    check(!await menu.locator('#sheet-futa04-help').isVisible(), `${topic}: acknowledgement closes help`);
    check(!!await menu.evaluate(() => (window as any).__severgrow.state()), `${topic}: lessons leave the match available`);
  }
  await menu.close();
  // Futasaku 0.4 ships the default skin; the V3 skin is a localhost-only art preview
  // (main.ts V3_MODE), so these viewports no longer select it. The layout, cockpit and Match
  // Intel assertions below are skin-independent and now run on the default art only.
  for (const [width, height, large, left] of [[360,640,false,false],[390,664,true,true],[390,844,false,false],[430,932,true,false],[768,1024,false,false],[1440,900,false,false]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 800, isMobile: width < 600, ignoreHTTPSErrors: true });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ large, left }) => {
      (window as any).__name = (f: unknown) => f;
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ coach: true, sound: false, music: false, reduceMotion: true, speed: 'fast', autoSkip: false, largeText: large }));
      localStorage.setItem('main2:severgrow-thumb', JSON.stringify({ side: left ? 'left' : 'right' }));
    }, { large, left });
    await page.goto(`${base}?seed=219682080`);
    await page.waitForFunction(() => (window as any).__severgrow?.state() && !(window as any).__severgrow.busy());
    await page.waitForTimeout(250);
    // MEASURE THE INFORMATION LAYOUT ONLY ONCE IT IS MOUNTED. `mountInformation` adds the
    // `futa04-information` class, the rail and the stylesheet after the game starts, and every
    // style this check reads (the trio's chrome, the muted disabled ink) lives in that stylesheet.
    // Sampling before it landed read the unstyled default and reported `inkRule: false` on a loaded
    // CI runner for a UI that was correct a moment later. This is a readiness gate: no assertion
    // below is relaxed, and the same values are still compared.
    await page.waitForFunction(() => {
      const rail = document.getElementById('futa04-information-rail');
      return !!rail && document.documentElement.classList.contains('futa04-information');
    }, undefined, { timeout: 15_000 });
    // …and for the ONE property the ink rule reads, because the muted ink is a CSS outcome too.
    // The mount class, the rail and the stylesheet arrive as separate steps, so on a loaded runner
    // the row can exist while a disabled key still paints at the enabled ink: the measurement then
    // reads `inkRule: false` for a key that is muted a frame later (seen at 1440x900 on a79e1c2's
    // CI). This waits for the state the assertion describes, and times out — failing — if the mute
    // never comes. Nothing is compared more loosely; the colours are still read from the page.
    await page.waitForFunction(() => {
      const undo = document.getElementById('tool-undo') as HTMLButtonElement | null;
      const hint = document.getElementById('futa04-help-button');
      if (!undo || !hint) return false;
      const ink = (el: Element) => getComputedStyle(el).color;
      return undo.disabled ? ink(undo) !== ink(hint) : ink(undo) === ink(hint);
    }, undefined, { timeout: 8_000 });
    check(await page.locator('#futa04-help-button').isVisible(), `${width}: hint is discoverable`);
    const tools = await page.evaluate(() => {
      const hint = document.querySelector<HTMLElement>('#futa04-help-button')!;
      const buttons = ['tool-undo', 'futa04-help-button', 'hand-sort'].map(id => document.getElementById(id)!);
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
        // 0.6 changed what "matching" means for a DISABLED key: it keeps the trio's chrome (border,
        // face) and its place in the row, but its ink is deliberately muted so it reads unavailable.
        // So chrome must match for all three, and the ink must match for the enabled ones only -
        // plus an explicit check that a disabled key is quieter than a live one, which is the point
        // of the change. This replaces a stricter-looking `color` comparison that pinned the old
        // uniform ink; the assertions below are not loosened anywhere else.
        // Chrome WITHOUT the ink: the `border` shorthand carries its colour, so comparing it whole
        // would smuggle the colour rule back in. Width, style and face are the shared hardware.
        chrome: (() => {
          const parts = (s2: CSSStyleDeclaration) => `${s2.borderTopWidth}|${s2.borderTopStyle}|${s2.backgroundColor}`;
          return [style, undo, getComputedStyle(buttons[2]!)].every(s2 => parts(s2) === parts(style));
        })(),
        // The rule, stated once: a disabled key is muted, an enabled one matches the others.
        inkRule: (buttons[0] as HTMLButtonElement).disabled ? undo.color !== style.color : undo.color === style.color,
        offMap: hint.closest('#futa04-information-rail') === null && hint.parentElement?.id === 'futa04-actions',
        taps: buttons.every((button, i) => { const box = boxes[i]!; const pseudo = getComputedStyle(button,'::after');
          const extra = pseudo.display !== 'none' ? 16 : 0;
          return box.width+extra >= 44 && box.height+extra >= 44;
        }), overlaps };
    });
    check(tools.icon && tools.offMap, `${width}: bulb replaces Hint text beside the existing tools`);
    check(tools.aligned && tools.separate && tools.fits && tools.chrome && tools.inkRule && tools.taps,
      `${width}: tool trio matches, aligns and retains separate touch targets (${JSON.stringify(tools)})`);
    check(tools.overlaps.length === 0, `${width}: tools never cover piles, moves or cards (${tools.overlaps})`);
    check(await page.locator('#deck.coach-glow').count() === 0, `${width}: Deck has no square suggestion outline`);
    check(await page.locator('.pile-label:visible').count() === 0, `${width}: pile descriptions leave no visible clutter`);
    check(!await page.locator('#step-cue').isVisible(), `${width}: routine board prompt is gone`);
    await page.waitForFunction(() => document.getElementById('smart-led-text')?.textContent?.trim() === '0:0', undefined, { timeout: 8000 });
    check((await page.locator('#smart-led-text').innerText()) === '0:0', `${width}: live score rests in the LED`);
    check((await page.locator('#smart-led-cells').evaluate(el=>getComputedStyle(el).animationName)) === 'none', `${width}: short LED message stays still`);
    check(!await page.locator('#turn-pill').isVisible(), `${width}: no competing turn pill`);
    const before = await page.evaluate(() => (window as any).__severgrow.state());
    await page.click('#futa04-help-button');
    check(await page.locator('#futasaku-glass[data-mode="intel"]').isVisible(), `${width}: Match Intel opens in the glass`);
    // The glass can still hold its pre-open responsive rect for one frame after the click, so
    // measuring too early reads a stale (mobile) box; wait for layout to settle first. The
    // assertion below is unchanged.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const layout = await page.evaluate(() => {
      const sheet = document.querySelector('#futasaku-glass') as HTMLElement;
      const r = sheet.getBoundingClientRect();
      const close = sheet.querySelector<HTMLButtonElement>('.intel-close')!;
      const target=close.getBoundingClientRect();
      const dock=document.getElementById('dock')!.getBoundingClientRect();
      return { fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1,
        aligned:r.left>=dock.left-1&&r.right<=dock.right+1,
        taps:target.width>=44&&target.height>=44,
        cards:sheet.querySelectorAll('.intel-card').length,
        overflow: sheet.scrollWidth > sheet.clientWidth + 1 };
    });
    if (!layout.fits || layout.overflow) console.log('sheet layout', layout, await page.locator('#futasaku-glass').boundingBox());
    await page.screenshot({ path: `/tmp/main2-shots/info-${width}x${height}-help.png` });
    check(layout.fits && layout.aligned && !layout.overflow, `${width}: glass fits the cockpit and viewport`);
    check(layout.taps && layout.cards>0, `${width}: close target and public card thumbnail are present`);
    await page.keyboard.press('Escape');
    check(!await page.locator('#futasaku-glass').isVisible(), `${width}: Escape closes Match Intel`);
    check(JSON.stringify(await page.evaluate(() => (window as any).__severgrow.state())) === JSON.stringify(before), `${width}: reading Match Intel leaves state intact`);
    await page.locator('#deck').click({ force: true });
    await page.waitForFunction(() => !(window as any).__severgrow.busy());
    check(JSON.stringify(await page.evaluate(() => (window as any).__severgrow.state())) === JSON.stringify(apply(before, { t: 'Draw', from: 'deck' })), `${width}: draw still matches engine`);
    // Assert on the value the WAIT observed, not a second, later read. The old form waited for
    // '0:0' and then re-read the node; if the LED text changed in between (a moment/flavour line
    // taking the display over), the wait passed and the assertion failed on a different value. That
    // is what made this fail intermittently in CI while passing locally, and it was never about the
    // score: the engine assertion above already proves the Draw was applied.
    // `#smart-led-text` is a 0x0 clipped node carrying the value for tests and screen readers (the
    // visible score is drawn on the #smart-led-cells canvas), so `textContent` is the right property
    // and is exactly what the cockpit sets. The captured value is printed in the failure message so
    // the next failure diagnoses itself instead of needing another investigation.
    const led = await page
      .waitForFunction(() => {
        const t = document.getElementById('smart-led-text')?.textContent?.trim();
        return t === '0:0' ? t : false;
      }, undefined, { timeout: 8000 })
      .then((h) => h.jsonValue() as Promise<string | null>)
      .catch(() => null);
    check(led === '0:0', `${width}: score remains after Draw (led read ${JSON.stringify(led)})`);
    check(await page.locator('#board .coach-ring').count() === 0, `${width}: automatic suggestions leave no white tile circles`);
    const cockpit = await page.evaluate(() => {
      const rect=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
      const led=rect('smart-led'),context=rect('smart-context'),undo=rect('tool-undo'),tips=rect('futa04-help-button'),sort=rect('hand-sort');
      const close=(a:number,b:number)=>Math.abs(a-b)<1;
      return { top:close(led.top,context.top),bottom:close(undo.top,tips.top)&&close(tips.top,sort.top),
        width:close(led.width,undo.width+tips.width+(tips.left-undo.right)),
        columns:close(led.left,undo.left)&&close(context.left,sort.left),
        fixed: [context,undo,tips,sort].every(r=>r.width>=44&&r.height>=44),
        icon: !!document.querySelector('#smart-context svg'),
        count: document.querySelectorAll('#smart-panel button:not(#smart-selector button)').length };
    });
    check(cockpit.top&&cockpit.bottom&&cockpit.width&&cockpit.columns&&cockpit.fixed&&cockpit.icon&&cockpit.count===4,
      `${width}: LED and four fixed buttons align in exactly two rows (${JSON.stringify(cockpit)})`);
    await page.click('#futa04-help-button');
    await page.keyboard.press('Escape');
    check(!await page.locator('#futasaku-glass').isVisible(), `${width}: Escape closes`);
    check(await page.evaluate(() => document.activeElement?.id === 'futa04-help-button'), `${width}: focus returns to Match Intel`);
    const boundaries = await page.evaluate(() => {
      const rail = document.querySelector('#futa04-information-rail')!.getBoundingClientRect();
      const board = document.querySelector('#board-wrap')!.getBoundingClientRect();
      const panel = document.querySelector('#smart-panel')!.getBoundingClientRect();
      const box = document.querySelector('#futa04-box')!.getBoundingClientRect();
      return rail.top>=board.top && rail.bottom<=board.bottom && panel.left>=box.left-1 && panel.right<=box.right+1 &&
        document.querySelector('#futa04-information-rail')!.parentElement?.id === 'board-wrap';
    });
    check(boundaries, `${width}: notices stay over board and LED controls stay inside cockpit`);
    await page.click('#hud-menu');
    check(!await page.locator('#futa04-help-button').isVisible(), `${width}: Pause suppresses background help`);
    check(errors.length === 0, `${width}: no browser errors (${errors.join(' | ')})`);
    await page.screenshot({ path: `/tmp/main2-shots/info-${width}x${height}-pause.png` });
    await page.close();
  }
  console.log(`${checks} information checks passed`);
} finally { await browser.close(); server?.httpServer.close(); }
