/** The display's steady-state cost: the numbers, asserted (Futasaku 0.4 cockpit).
 *
 * WHY THIS EXISTS (measured 2026-10-29). Over 3 s in the duel cockpit at 4x CPU throttle:
 *
 *   before  idle (the idle re-prompt blinking)   beginMain 540   animTicks 378
 *   after   the same state                       beginMain   6   animTicks 182
 *
 * The whole cost was one OPACITY animation on the glyph <canvas>: Chrome does not composite an
 * opacity animation on directly-composited canvas content, so a 1 Hz blink ran on the main thread
 * every frame. The same animation on a plain box around the canvas composites for free.
 *
 * This suite keeps that true: it counts the display's own animations, proves the blink/pulse ride
 * plain boxes, proves a marquee's bitmap is bounded by the glass instead of the message, and
 * proves the display stops when it cannot be seen.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { BLOOM_PAD } from '../src/player/led-cells.js';
import { seedSettings } from './helpers/settings-seed.js';

const { server, url: BASE } = await servePreview(4261, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };

const LONG = 'THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW';

const open = async (options: { reduceMotion?: boolean } = {}): Promise<{ page: Page; errors: string[] }> => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'normal', reduceMotion: !!options.reduceMotion, eyeCandy: true });
  await page.addInitScript('window.__name = window.__name || ((fn) => fn);');
  await page.goto(`${BASE}?seed=219682080`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 90000 });
  await page.waitForTimeout(4200); // the idle re-prompt (the blink) is up by now
  return { page, errors };
};

/** The display's live animations, as `element[properties]`. */
const displayAnimations = (page: Page) => page.evaluate(() => {
  const seen: string[] = [];
  for (const animation of document.getAnimations()) {
    const effect = animation.effect as KeyframeEffect | null;
    const target = effect?.target as Element | null;
    if (!target || !target.closest('#smart-led')) continue;
    const props = new Set<string>();
    for (const keyframe of effect?.getKeyframes() ?? []) {
      for (const key of Object.keys(keyframe)) {
        if (!['offset', 'easing', 'composite', 'computedOffset'].includes(key)) props.add(key);
      }
    }
    seen.push(`${target.id || target.tagName.toLowerCase()}[${[...props].sort().join('+')}]`);
  }
  return seen;
});

/** beginMain / animTicks / frames for `ms`, from a browser-level trace (the probe method). */
const frames = async (page: Page, session: Awaited<ReturnType<typeof browser.newBrowserCDPSession>>, ms: number) => {
  const events: Array<{ name?: string; ph?: string }> = [];
  const onData = (payload: { value?: typeof events }) => events.push(...(payload.value ?? []));
  session.on('Tracing.dataCollected', onData);
  const done = new Promise<void>((resolve) => session.once('Tracing.tracingComplete', () => resolve()));
  await session.send('Tracing.start', { categories: 'devtools.timeline,cc,disabled-by-default-devtools.timeline.frame,toplevel', transferMode: 'ReportEvents' });
  await page.waitForTimeout(ms);
  await session.send('Tracing.end');
  await done;
  session.off('Tracing.dataCollected', onData);
  const counts: Record<string, number> = {};
  for (const event of events) if (event.name && !event.name.startsWith('__metadata') && event.ph !== 'M') counts[event.name] = (counts[event.name] ?? 0) + 1;
  return { beginMain: counts['SendBeginMainFrame'] ?? 0, animTicks: counts['AnimationHost::TickAnimations'] ?? 0, frames: counts['MainFrame.Draw'] ?? 0 };
};

try {
  /* 1. THE IDLE RE-PROMPT COSTS (ALMOST) NOTHING. This is the state a player sits in while
     thinking, and it used to be the most expensive thing in the game. */
  const { page, errors } = await open();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const session = await browser.newBrowserCDPSession();

  const animations = await displayAnimations(page);
  check(animations.some((entry) => entry.startsWith('smart-led-ink[opacity]')), `the idle blink rides the ink box (${animations.join(' ')})`);
  check(animations.some((entry) => entry.startsWith('smart-led-bloom[opacity]')), `the glow blinks with it (${animations.join(' ')})`);
  check(animations.every((entry) => !entry.startsWith('smart-led-cells[opacity]')), 'the glyph canvas itself carries NO opacity animation');
  check(animations.every((entry) => !entry.startsWith('smart-led-hot[opacity]')), 'the brightness canvas carries NO opacity animation');

  // One warm-up window first: the first blink transition promotes and rasterises the display's
  // layers once, and that one-off cost belongs to no steady state.
  await frames(page, session, 900);
  const alarm = await frames(page, session, 3000);
  check(alarm.beginMain <= 90, `the idle blink costs ${alarm.beginMain} begin-main frames / 3 s at 4x CPU (was 540; limit 90)`);

  /* 2. A STATIC MESSAGE COSTS ZERO: no animation at all on the display once the notice is gone. */
  await page.evaluate(() => {
    document.getElementById('smart-led')!.classList.remove('led-alarm');
    document.getElementById('smart-led-window')!.classList.remove('led-alarm');
    document.documentElement.classList.remove('idle-urgency');
  });
  await page.waitForTimeout(300);
  const resting = await displayAnimations(page);
  check(resting.length === 0, `a resting static message runs no display animation (${resting.join(' ')})`);

  /* 3. A MARQUEE IS BOUNDED BY THE GLASS, NOT THE MESSAGE, and still scrolls exactly as before. */
  await page.evaluate((text) => { document.getElementById('banner')!.textContent = `${text} `; }, LONG);
  await page.waitForFunction(() => document.querySelector('#smart-led-cells')?.classList.contains('scrolling'), undefined, { timeout: 6000 });
  const marquee = await page.evaluate(() => {
    const cells = document.getElementById('smart-led-cells') as HTMLCanvasElement;
    const bloom = document.getElementById('smart-led-bloom') as HTMLCanvasElement;
    return {
      css: Number.parseFloat(cells.style.width) || 0,
      travel: Number.parseFloat(cells.style.getPropertyValue('--led-travel')) || 0,
      glass: document.getElementById('smart-led-window')!.clientWidth,
      animation: getComputedStyle(cells).animationName,
      duration: cells.style.getPropertyValue('--led-duration'),
      bloomCss: Number.parseFloat(bloom.style.width) || 0,
    };
  });
  check(marquee.animation === 'smart-led-scroll', `the long message still scrolls (${marquee.animation})`);
  check(marquee.css <= marquee.travel + marquee.glass + 2,
    `the strip is one period plus the glass, not three copies (${marquee.css} px for a ${marquee.glass} px glass and a ${marquee.travel} px period)`);
  check(marquee.travel % 14.5 === 0, `the loop is a whole number of dot columns (${marquee.travel} px)`);
  // Its own strip is the same bound plus the pad the falloff needs on each side.
  check(marquee.bloomCss <= marquee.travel + marquee.glass + 4 * BLOOM_PAD + 2,
    `the bloom strip is bounded the same way (${marquee.bloomCss} px, one period + glass + 4 x pad)`);
  check(marquee.duration !== '', `the marquee keeps its duration (${marquee.duration})`);
  check(await page.evaluate(() => getComputedStyle(document.getElementById('smart-led-bloom')!).animationName) === 'smart-led-bloom-scroll',
    'the bloom still travels with its own transform animation');
  // A 3 s marquee is composited: three transform animations over bounded textures must not ask
  // the main thread for a frame. Limit 90 = 30/s, ten times the measured 18-21 per 2 s window and
  // a fifth of the 540 the canvas blink used to cost.
  const scrolling = await frames(page, session, 3000);
  check(scrolling.beginMain <= 90, `a marquee costs ${scrolling.beginMain} begin-main frames / 3 s at 4x CPU (limit 90)`);
  check(errors.length === 0, `no browser errors (${errors.join(' | ')})`);
  await page.close();

  /* 4. NOTHING RUNS WHEN IT CANNOT BE SEEN. A synthetic visibility change (headless Chromium will
     not background a page) must pause every display animation — and keep its phase. */
  const hidden = await open();
  check(await hidden.page.evaluate(() => !document.documentElement.classList.contains('led-hidden')),
    'the display is awake while the page is visible');
  const gated = await hidden.page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const cells = getComputedStyle(document.getElementById('smart-led-cells')!);
    const bloom = getComputedStyle(document.getElementById('smart-led-bloom')!);
    return {
      asleep: document.documentElement.classList.contains('led-hidden'),
      cells: cells.animationPlayState,
      bloom: bloom.animationPlayState,
      // CSS animations only: a WAAPI one-shot (the message reel) is transient and not a loop.
      states: document.getAnimations()
        .filter((animation) => 'animationName' in animation)
        .filter((animation) => !!((animation.effect as KeyframeEffect | null)?.target as Element | null)?.closest('#smart-led'))
        .map((animation) => `${(animation as CSSAnimation).animationName}:${animation.playState}`),
    };
  });
  check(gated.asleep, 'a hidden page puts the display to sleep');
  check(gated.cells === 'paused' && gated.bloom === 'paused', `the marquee and the blink are paused, not cancelled (${gated.cells}/${gated.bloom})`);
  check(gated.states.length > 0 && gated.states.every((entry) => entry.endsWith(':paused')),
    `every display CSS animation stops (${gated.states.join(',')})`);
  const awake = await hidden.page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    return {
      asleep: document.documentElement.classList.contains('led-hidden'),
      cells: getComputedStyle(document.getElementById('smart-led-cells')!).animationPlayState,
    };
  });
  check(!awake.asleep && awake.cells !== 'paused', 'coming back resumes the display');
  check(hidden.errors.length === 0, `no browser errors while asleep (${hidden.errors.join(' | ')})`);
  await hidden.page.close();

  /* 5. REDUCE MOTION: a still, readable display, with no animation objects at all. */
  const still = await open({ reduceMotion: true });
  const stillAnimations = await displayAnimations(still.page);
  check(stillAnimations.length === 0, `reduce motion leaves the display with no animations (${stillAnimations.join(' ')})`);
  check(still.errors.length === 0, `no browser errors under reduce motion (${still.errors.join(' | ')})`);
  await still.page.close();

  console.log(`${checks} LED quiet checks passed (idle blink: ${alarm.beginMain} begin-main frames / 3 s at 4x CPU; was 540)`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
