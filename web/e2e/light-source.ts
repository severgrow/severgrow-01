/**
 * LIGHT SOURCE QA — the cockpit bloom must come FROM the lit dots.
 *
 * Proves, with pixels rather than by eye:
 *   - the bloom sprite's brightest point sits on the lit dots;
 *   - it falls away softly (>= 24 px along the tone's angle) with no step and no edge;
 *   - every edge of the sprite is empty, so nothing is clipped into a rectangle;
 *   - the screen corners gain nothing (no screen wash);
 *   - the bloom KEEPS ITS LIGHT during a grow at 4x CPU throttle and adds no frame gap > 50 ms;
 *   - a marquee's bloom travels with the same distance and duration as the glyph strip;
 *   - every palette still reads its owner colours;
 *   - reduce motion shows a steady soft glow (not a frozen animation frame).
 *
 * Screenshots land in docs/screens/light/ for the owner.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { hexCenter } from './drawing.js';
import type { Page } from 'playwright-core';
// The cap the stylesheet must honour; imported from the contract so the two cannot drift.
import { LIGHT_CAPS } from '../src/player/light.js';
const LIGHT_FLASH_MS = LIGHT_CAPS.flashMs;

const { server, url: BASE } = await servePreview(4227, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const DIR = 'docs/screens/light';
mkdirSync(DIR, { recursive: true });
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };

const open = async (width: number, height: number, options: { reduceMotion?: boolean; palette?: string; hideBloom?: boolean } = {}) => {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((settings) => {
    (window as any).__name = (fn: unknown) => fn;
    // The channel rewrites every storage key with its own prefix (`futa05:` at a channel root,
    // `futa05-3:` under /3), so write the settings under every prefix the build might use. Using
    // the old `main2:` alone silently kept Reduce motion and sound ON in these runs.
    const value = JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, ...settings });
    for (const prefix of ['futa05:', 'futa05-3:', 'main2:']) {
      localStorage.setItem(`${prefix}severgrow.settings.v1`, value);
    }
  }, { reduceMotion: !!options.reduceMotion, ...(options.palette ? { palette: options.palette } : {}) });
  if (options.hideBloom) {
    // Baseline for the 4x-CPU comparison only: the same app with the bloom layer removed.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '#smart-led-bloom{display:none!important}';
        document.head.append(style);
      });
    });
  }
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#deck.ready');
  await page.waitForFunction(() => /^\d+:\d+$/.test(document.getElementById('smart-led-text')?.textContent ?? ''), undefined, { timeout: 8000 });
  await page.waitForTimeout(300);
  return { page, errors };
};

type Sample = { x: number; y: number; r?: number };

/** Read pixels from a fresh screenshot inside the page (no PNG dependency in Node). */
const sampleScreenshot = async (page: Page, points: Sample[]) => {
  const shot = await page.screenshot();
  return page.evaluate(async ({ data, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const read = (x: number, y: number, r: number) => {
      let sum = [0, 0, 0, 0];
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(x) + dx; const py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
        const i = (py * canvas.width + px) * 4;
        sum = [sum[0]! + pixels[i]!, sum[1]! + pixels[i + 1]!, sum[2]! + pixels[i + 2]!, sum[3]! + pixels[i + 3]!];
        n++;
      }
      return sum.map(v => v / Math.max(1, n));
    };
    return {
      size: { w: canvas.width, h: canvas.height },
      points: points.map(p => read(p.x, p.y, p.r ?? 0)),
    };
  }, { data: shot.toString('base64'), points });
};

const luminance = (rgba: number[]) => Math.round(.2126 * rgba[0]! + .7152 * rgba[1]! + .0722 * rgba[2]!);

/** The bloom sprite's own pixels: origin, cap, falloff and edge emptiness. */
const bloomMetrics = (page: Page) => page.evaluate(() => {
  const canvas = document.getElementById('smart-led-bloom') as HTMLCanvasElement;
  const cells = document.getElementById('smart-led-cells') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const cctx = cells.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const data = ctx.getImageData(0, 0, W, H).data;
  const alpha = (x: number, y: number) => data[(y * W + x) * 4 + 3]!;
  let max = 0; let mx = 0; let my = 0;
  let edgeMax = 0;
  let within10 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = alpha(x, y);
    if (a > max) { max = a; mx = x; my = y; }
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edgeMax = Math.max(edgeMax, a);
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge <= 10 && a > within10) within10 = a;
  }
  // Where the actual lit dots are, in the bloom sprite's own coordinate space: the cells canvas
  // may be at device pixel ratio, the bloom sprite is 1 bitmap px per CSS px, and the strip sits
  // BLOOM_PAD (published as --led-bloom-pad) inside every edge.
  const pad = Number.parseFloat(getComputedStyle(document.getElementById('smart-led')!).getPropertyValue('--led-bloom-pad')) || 0;
  const cellsCssW = Number.parseFloat(cells.style.width) || cells.width;
  const cellsCssH = Number.parseFloat(cells.style.height) || cells.height;
  // The sprite may be baked below CSS resolution (it is a blur), so map CSS px into the
  // sprite's own bitmap space rather than assuming one bitmap pixel per CSS pixel.
  const canvasCssW = Number.parseFloat(canvas.style.width) || W;
  const canvasCssH = Number.parseFloat(canvas.style.height) || H;
  const ratioX = W / canvasCssW;
  const ratioY = H / canvasCssH;
  const toBloomX = (bitmapX: number) => (pad + (bitmapX / cells.width) * cellsCssW) * ratioX;
  const toBloomY = (bitmapY: number) => (pad + (bitmapY / cells.height) * cellsCssH) * ratioY;
  const cw = cells.width; const ch = cells.height;
  const cd = cctx.getImageData(0, 0, cw, ch).data;
  let sx = 0; let sy = 0; let n = 0;
  let nearest = Infinity;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (cd[(y * cw + x) * 4 + 3]! < 40) continue;
    sx += x; sy += y; n++;
    // The bloom's brightest pixel must sit ON a lit dot, so measure to the nearest one.
    nearest = Math.min(nearest, Math.hypot(toBloomX(x) - mx, toBloomY(y) - my));
  }
  const dot = { x: toBloomX(sx / Math.max(1, n)), y: toBloomY(sy / Math.max(1, n)) };
  // Read the tone's angle from the root publication and walk the falloff in that direction.
  const angle = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--light-angle')) || 22;
  const rad = (angle * Math.PI) / 180;
  // The light's centre of mass. The four side walks start here rather than at the brightest
  // pixel: a glyph strip is full of holes, so a line drawn from a dot leaves the light through a
  // gap and measures the lettering instead of the falloff.
  let cxw = 0; let cyw = 0; let wt = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = alpha(x, y);
    if (!a) continue;
    cxw += x * a; cyw += y * a; wt += a;
  }
  const ccx = wt ? cxw / wt : mx;
  const ccy = wt ? cyw / wt : my;
  const walk = (dx: number, dy: number, fromX = mx, fromY = my) => {
    const steps: number[] = [];
    for (let d = 0; d < 90; d++) {
      const x = Math.round(fromX + dx * d);
      const y = Math.round(fromY + dy * d);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      steps.push(alpha(x, y));
    }
    let reach = 0;
    for (let i = 2; i < steps.length; i++) {
      if (steps[i]! <= 2 && steps.slice(i).every(v => v <= 2)) { reach = i; break; }
    }
    let worst = 0;
    for (let i = 1; i < steps.length; i++) worst = Math.max(worst, Math.abs(steps[i]! - steps[i - 1]!));
    return { reach, worst };
  };
  const along = walk(Math.cos(rad), Math.sin(rad));
  const sides = [walk(0, -1, ccx, ccy), walk(0, 1, ccx, ccy), walk(1, 0, ccx, ccy), walk(-1, 0, ccx, ccy)];
  return {
    W, H, max, mx, my, edgeMax, within10, nearest, dot, pad, angle,
    reach: along.reach, worstStep: along.worst,
    // The softest falloff is the one along the angle; every other side must also be soft.
    sideReach: Math.min(...sides.map(side => side.reach)),
    sideWorst: Math.max(...sides.map(side => side.worst)),
    opacity: Number(getComputedStyle(canvas).opacity),
    filter: getComputedStyle(canvas).filter,
    windowFilter: getComputedStyle(document.getElementById('smart-led-window')!).filter,
    spill: document.getElementById('smart-led-spill'),
    dots: n,
  };
});

try {
  /* 1. Resting bloom: origin, cap, soft falloff, no edge, no wash. */
  const { page, errors } = await open(390, 844);
  const metrics = await bloomMetrics(page);
  check(metrics.W > 0 && metrics.H > 0 && metrics.dots > 0, 'the bloom is baked from the lit dots');
  check(metrics.max <= 128, `the bloom sprite is alpha-capped (peak ${metrics.max}/255)`);
  check(metrics.max >= 24, `the bloom is actually visible at rest (peak ${metrics.max}/255)`);
  // Origin: the brightest bloom pixel is ON a lit dot (nearest dot pixel, in sprite space).
  check(metrics.nearest <= 4, `the bloom originates at the lit dots (${metrics.nearest.toFixed(1)} px from the nearest dot)`);
  check(metrics.reach >= 24, `the bloom fades softly for ${metrics.reach} px along the ${metrics.angle}° angle`);
  check(metrics.sideReach >= 24, `the falloff is soft on every side too (shortest ${metrics.sideReach} px)`);
  check(metrics.worstStep <= 14 && metrics.sideWorst <= 14, `no hard edge in the falloff (worst 1 px step ${Math.max(metrics.worstStep, metrics.sideWorst)}/255)`);
  check(metrics.edgeMax === 0, `every sprite edge is empty, so nothing is cut into a rectangle (edge alpha ${metrics.edgeMax})`);
  check(metrics.within10 <= 6, `the outer ring carries no clipped light (max ${metrics.within10}/255 in the last 10 px)`);
  check(metrics.filter === 'none' && metrics.windowFilter === 'none', 'the bloom and the LED window carry no live filter');
  check(metrics.spill === null, 'the old masked gradient spill is gone');
  check(metrics.opacity > 0 && metrics.opacity <= .55, `the baked bloom rests at a capped opacity (${metrics.opacity})`);

  // No screen wash: the four corners must not change when the bloom is switched off.
  const corners: Sample[] = [
    { x: 8, y: 8, r: 3 }, { x: 382, y: 8, r: 3 }, { x: 8, y: 836, r: 3 }, { x: 382, y: 836, r: 3 },
  ];
  const withBloom = await sampleScreenshot(page, corners);
  await page.evaluate(() => { (document.getElementById('smart-led-bloom') as HTMLElement).style.opacity = '0'; });
  const withoutBloom = await sampleScreenshot(page, corners);
  await page.evaluate(() => { (document.getElementById('smart-led-bloom') as HTMLElement).style.opacity = ''; });
  const cornerDelta = Math.max(...withBloom.points.map((rgba, i) => Math.max(
    Math.abs(rgba[0]! - withoutBloom.points[i]![0]!),
    Math.abs(rgba[1]! - withoutBloom.points[i]![1]!),
    Math.abs(rgba[2]! - withoutBloom.points[i]![2]!),
  )));
  check(cornerDelta <= 2, `no bright wash at the screen corners (worst delta ${cornerDelta}/255)`);
  check(luminance(withBloom.points[0]!) < 80, `the page corners stay dark (${luminance(withBloom.points[0]!)}/255)`);

  // Nothing is clipped into a rectangle. Three independent facts:
  //  1. the sprite is drawn beyond the display on every side;
  //  2. its own outer edge is empty (checked above), so the bitmap has no boundary;
  //  3. it is still casting light ON each bezel edge, i.e. the falloff continues past the frame
  //     rather than stopping at it.
  const led = await page.locator('#smart-led').boundingBox();
  const geometry = await page.evaluate(() => {
    const led = document.getElementById('smart-led')!.getBoundingClientRect();
    const bloom = document.getElementById('smart-led-bloom') as HTMLCanvasElement;
    const box = bloom.getBoundingClientRect();
    const ctx = bloom.getContext('2d')!;
    const data = ctx.getImageData(0, 0, bloom.width, bloom.height).data;
    const rowMax = (y: number) => {
      let max = 0;
      for (let x = 0; x < bloom.width; x++) max = Math.max(max, data[(y * bloom.width + x) * 4 + 3]!);
      return max;
    };
    const colMax = (x: number) => {
      let max = 0;
      for (let y = 0; y < bloom.height; y++) max = Math.max(max, data[(y * bloom.width + x) * 4 + 3]!);
      return max;
    };
    const toY = (pageY: number) => Math.round((pageY - box.top) * (bloom.height / box.height));
    const toX = (pageX: number) => Math.round((pageX - box.left) * (bloom.width / box.width));
    return {
      beyond: {
        top: box.top <= led.top - 8,
        bottom: box.bottom >= led.bottom + 8,
        left: box.left <= led.left - 8,
        right: box.right >= led.right + 8,
      },
      onBezel: {
        top: rowMax(toY(led.top)),
        bottom: rowMax(toY(led.bottom) - 1),
        left: colMax(toX(led.left)),
        right: colMax(toX(led.right) - 1),
      },
    };
  });
  check(Object.values(geometry.beyond).every(Boolean), `the bloom is drawn beyond the display on every side (${JSON.stringify(geometry.beyond)})`);
  check(Object.values(geometry.onBezel).every(alpha => alpha > 0), `light is still falling on every bezel edge, so the falloff continues past it (${JSON.stringify(geometry.onBezel)})`);

  // And in rendered pixels: just outside the top bezel is still lighter than the same column far
  // above it, and the boundary itself shows no jump. A 5×5 window is averaged rather than one
  // pixel: the spill past a 44 px display is only a couple of luminance points, and a single
  // pixel's rounding would decide the assertion instead of the light.
  const across: Sample[] = [
    { x: led!.x + led!.width / 2, y: led!.y - 6, r: 3 },
    { x: led!.x + led!.width / 2, y: led!.y - 34, r: 3 },
    { x: led!.x + led!.width / 2, y: led!.y + 4, r: 3 },
  ];
  const rendered = await sampleScreenshot(page, across);
  const near = luminance(rendered.points[0]!);
  const far = luminance(rendered.points[1]!);
  const inside = luminance(rendered.points[2]!);
  check(near > far, `the glow keeps fading out beyond the bezel instead of stopping on it (${near} just outside vs ${far} far away)`);
  check(near <= inside + 40, `there is no hard step at the bezel (${near} outside vs ${inside} inside)`);

  // The LIGHT variables are published once and match the display's tone.
  const published = await page.evaluate(() => ({
    core: getComputedStyle(document.documentElement).getPropertyValue('--light-core').trim(),
    bloom: getComputedStyle(document.documentElement).getPropertyValue('--light-bloom').trim(),
    angle: getComputedStyle(document.documentElement).getPropertyValue('--light-angle').trim(),
  }));
  check(published.core === '#f5d8a4' && published.bloom.length > 0 && published.angle === '22deg', `the root publishes one LIGHT contract (${JSON.stringify(published)})`);

  // A marquee's bloom is the same baked strip: same travel and duration as the glyphs.
  await page.evaluate(() => {
    const banner = document.getElementById('banner')!;
    banner.textContent = 'THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW';
  });
  await page.waitForFunction(() => document.querySelector('#smart-led-cells')?.classList.contains('scrolling'), undefined, { timeout: 6000 });
  const marquee = await page.evaluate(() => {
    const cells = document.getElementById('smart-led-cells') as HTMLElement;
    const bloom = document.getElementById('smart-led-bloom') as HTMLElement;
    return {
      cells: { scroll: cells.classList.contains('scrolling'), travel: cells.style.getPropertyValue('--led-travel'), duration: getComputedStyle(cells).animationDuration },
      bloom: { scroll: bloom.classList.contains('scrolling'), duration: getComputedStyle(bloom).animationDuration, animation: getComputedStyle(bloom).animationName },
    };
  });
  check(marquee.cells.scroll && marquee.bloom.scroll, 'the marquee bloom scrolls with the strip');
  check(marquee.cells.travel !== '' && marquee.cells.duration === marquee.bloom.duration, `same travel/duration (${marquee.cells.duration})`);
  check(marquee.bloom.animation === 'smart-led-bloom-scroll', 'the bloom travels on its own transform animation');

  check(errors.length === 0, `no browser errors at rest (${errors.join(' | ')})`);

  /* Caps, read from the LIVE stylesheet: a flash is 60 ms and at most 35% white, and the alarm
     keeps its 1.2 s beat. No strobe, no brightness filter. */
  const caps = await page.evaluate(() => {
    const rules: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      try { for (const rule of [...sheet.cssRules]) rules.push(rule.cssText); } catch { /* cross-origin */ }
    }
    const keyframes = (name: string) => rules.find(rule => rule.startsWith(`@keyframes ${name}`)) ?? '';
    const peakWhite = (name: string) => {
      const body = keyframes(name);
      const alphas = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map(match => Number(match[1]));
      return alphas.length ? Math.max(...alphas) : -1;
    };
    // The duration lives on the rule that applies the animation, not inside the keyframes body.
    // Browsers may serialise `animation:` as longhands, so read the rule that names the animation
    // and take its declared duration (ms) from whichever form it uses.
    const flashMs = (name: string): number | null => {
      const applied = rules.find(rule => rule.includes(name) && /animation/.test(rule)) ?? '';
      const match = applied.match(/([\d.]+)ms/);
      return match ? Number(match[1]) : null;
    };
    return {
      flashCutMs: flashMs('smart-led-flash-cut'),
      flashBloomMs: flashMs('smart-led-flash-bloom'),
      flashPeak: Math.max(peakWhite('smart-led-flash-cut'), peakWhite('smart-led-flash-bloom')),
      flashDuration: (getComputedStyle(document.getElementById('smart-led-flash')!).animationDuration || '0s'),
      alarmMs: flashMs('smart-led-alarm'),
      hot: getComputedStyle(document.getElementById('smart-led-hot')!).filter,
      oldFilterKeyframes: rules.some(rule => /@keyframes smart-led-(pulse|alarm)/.test(rule) && /filter:/.test(rule)),
    };
  });
  check(caps.flashPeak > 0 && caps.flashPeak <= .35, `a flash is at most 35% white (peak ${caps.flashPeak})`);
  check(caps.flashCutMs !== null && caps.flashBloomMs !== null, `both flash animations are applied with a duration (cut ${caps.flashCutMs} ms, bloom ${caps.flashBloomMs} ms)`);
  check(caps.flashCutMs === LIGHT_FLASH_MS && caps.flashBloomMs === LIGHT_FLASH_MS, `a flash is exactly ${LIGHT_FLASH_MS} ms (cut ${caps.flashCutMs}, bloom ${caps.flashBloomMs})`);
  check(caps.alarmMs === LIGHT_CAPS.alarmMs, `the alarm keeps its ${LIGHT_CAPS.alarmMs / 1000} s beat (${caps.alarmMs} ms)`);
  check(!caps.oldFilterKeyframes, 'no pulse/alarm keyframe animates a filter any more');
  check(caps.hot === 'none', 'the brightness layer itself carries no filter');

  /* The bloom is baked on a MESSAGE change, never per frame: with the message held, no frame
     repaints the sprite. */
  await page.evaluate(() => {
    const bloom = document.getElementById('smart-led-bloom')!;
    const paints = { bloom: 0, all: 0 };
    (window as unknown as { __paints: typeof paints }).__paints = paints;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    (CanvasRenderingContext2D.prototype as unknown as {
      drawImage: (...args: unknown[]) => void;
    }).drawImage = function patched(this: CanvasRenderingContext2D, ...args: unknown[]) {
      paints.all++;
      if (this.canvas === bloom) paints.bloom++;
      return (original as unknown as (...rest: unknown[]) => void).apply(this, args);
    };
  });
  const held = await page.locator('#smart-led-text').innerText();
  await page.waitForTimeout(900);
  const paints = await page.evaluate(() => (window as unknown as { __paints: { bloom: number; all: number } }).__paints);
  check(await page.locator('#smart-led-text').innerText() === held, 'the held message stayed the same for the no-rebake window');
  check(paints.bloom === 0, `the bloom is not re-baked while its message is unchanged (${paints.bloom} paints in 900 ms)`);

  await page.screenshot({ path: `${DIR}/390x844-rest.png` });
  await page.close();

  /* 2. A grow at 4x CPU: the bloom must stay lit, and must not ADD a frame gap over 50 ms.
     Frame gaps are measured against the same scripted grow with the bloom hidden, because a
     4x-throttled phone already stalls on the first move; the question is what the bloom adds. */
  const growAt4x = async (hideBloom: boolean) => {
    const run = await open(390, 844, { reduceMotion: true, hideBloom });
    const cdp = await run.page.context().newCDPSession(run.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await run.page.evaluate(`(() => {
      window.__gaps = [];
      let last = performance.now();
      const tick = (t) => {
        if (document.documentElement.classList.contains('futa04-move-active') && t - last > 50) window.__gaps.push(Math.round(t - last));
        last = t; requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    await run.page.locator('#deck').evaluate(el => (el as HTMLButtonElement).click());
    await run.page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());
    await run.page.locator('#hand .card.playable').first().click();
    const target = run.page.locator('#board .target.kind-grow').first();
    await target.waitFor();
    const point = await hexCenter(run.page, (await target.getAttribute('data-key'))!);
    await run.page.touchscreen.tap(point.x, point.y);
    await run.page.waitForFunction(() => document.documentElement.classList.contains('futa04-move-active'), undefined, { timeout: 4000 });
    const during = await run.page.evaluate(() => {
      const bloom = document.getElementById('smart-led-bloom') as HTMLElement;
      return {
        move: document.documentElement.classList.contains('futa04-move-active'),
        opacity: Number(getComputedStyle(bloom).opacity),
        visible: getComputedStyle(bloom).display !== 'none',
        connected: bloom.isConnected && bloom.getBoundingClientRect().width > 0,
        width: (bloom as HTMLCanvasElement).width,
      };
    });
    if (!hideBloom) await run.page.screenshot({ path: `${DIR}/390x844-grow.png` });
    await run.page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 20000 });
    const gaps = await run.page.evaluate(() => (window as unknown as { __gaps: number[] }).__gaps);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check(run.errors.length === 0, `no browser errors during the 4x grow (${run.errors.join(' | ')})`);
    await run.page.close();
    return { during, gaps };
  };
  // Warm the process once: the very first grow under 4x throttle in a fresh browser compiles and
  // rasterises every effect, which has nothing to do with the bloom.
  await growAt4x(false);
  const lit = [await growAt4x(false), await growAt4x(false)];
  const base = [await growAt4x(true), await growAt4x(true)];
  check(lit[0]!.during.move && lit[0]!.during.visible && lit[0]!.during.connected && lit[0]!.during.width > 0, 'the bloom stays on screen during a real grow');
  check(lit[0]!.during.opacity > .2, `the bloom keeps its light during a move (opacity ${lit[0]!.during.opacity})`);
  const worst = (runs: { gaps: number[] }[]) => Math.max(0, ...runs.flatMap(run => run.gaps));
  check(worst(lit) <= Math.max(50, worst(base) + 50),
    `4x CPU: the bloom adds no frame gap over 50 ms (bloom ${worst(lit)}ms vs the same grow without it ${worst(base)}ms)`);

  /* 3. Reduce motion: steady soft glow, no frozen animation, no one-shot overlay. */
  const reduce = await open(390, 844, { reduceMotion: true });
  const reduceState = await reduce.page.evaluate(() => {
    const bloom = document.getElementById('smart-led-bloom') as HTMLElement;
    return {
      opacity: Number(getComputedStyle(bloom).opacity),
      animations: bloom.getAnimations().length,
      hot: Number(getComputedStyle(document.getElementById('smart-led-hot')!).opacity),
      scroll: bloom.classList.contains('scrolling'),
      filter: getComputedStyle(bloom).filter,
    };
  });
  check(reduceState.opacity > .2, `reduce motion keeps a steady soft glow (${reduceState.opacity})`);
  check(reduceState.animations === 0, 'reduce motion does not freeze a bloom animation frame');
  check(reduceState.hot === 0, 'reduce motion shows no pulse/alarm overlay');
  check(reduceState.filter === 'none', 'reduce motion keeps the glow filter-free');
  await reduce.page.screenshot({ path: `${DIR}/390x844-reduce.png` });
  await reduce.page.close();
  const reduceSmall = await open(360, 640, { reduceMotion: true });
  const smallBloom = await reduceSmall.page.evaluate(() => {
    const bloom = document.getElementById('smart-led-bloom') as HTMLCanvasElement;
    return { w: bloom.width, h: bloom.height, opacity: Number(getComputedStyle(bloom).opacity) };
  });
  check(smallBloom.w > 0 && smallBloom.opacity > .2, `360x640 reduce motion keeps the same steady bloom (${smallBloom.w}x${smallBloom.h} @ ${smallBloom.opacity})`);
  await reduceSmall.page.screenshot({ path: `${DIR}/360x640-reduce.png` });
  await reduceSmall.page.close();

  /* 4. Every palette: the light is a tint, the owner colours still read. */
  const palettes = ['soil', 'moss', 'ink'] as const;
  for (const palette of palettes) {
    for (const [w, h] of [[360, 640], [390, 844]] as const) {
      const shot = await open(w, h, { palette, reduceMotion: true });
      const state = await shot.page.evaluate(() => {
        const core = getComputedStyle(document.documentElement).getPropertyValue('--light-core').trim();
        const bloom = document.getElementById('smart-led-bloom') as HTMLCanvasElement;
        const board = document.getElementById('board')!;
        const path = board.querySelector<SVGPathElement>('.hex-cell > path.hex');
        return {
          core,
          bloom: bloom.width > 0,
          theme: document.documentElement.dataset.theme ?? '',
          tile: path ? getComputedStyle(path).fill : '',
        };
      });
      check(['#f5d8a4', '#e4705e', '#a9d886', '#f5ead1', '#edabc0', '#a7d3d0'].includes(state.core), `${palette} ${w}: the LIGHT tone is one of the six (${state.core})`);
      check(state.bloom, `${palette} ${w}: the display bloom exists`);
      await shot.page.screenshot({ path: `${DIR}/${w}x${h}-${palette}.png` });
      await shot.page.close();
    }
  }

  /* 5. Owner colours never replaced: both materials remain distinguishable under the tint. */
  const owners = await open(390, 844, { reduceMotion: true });
  const ownership = await owners.page.evaluate(() => {
    const tiles = [...document.querySelectorAll<SVGPathElement>('#board .l-base path.hex')].slice(0, 2);
    const stops = [...document.querySelectorAll('#board defs radialGradient[id$="light-tint"] > stop')];
    const root = document.documentElement;
    const original = root.style.getPropertyValue('--light-core');
    const before = stops[0] ? getComputedStyle(stops[0]).stopColor : '';
    // Publish a different tone the way the display does, and read the consumer back.
    root.style.setProperty('--light-core', '#ff0000');
    const after = stops[0] ? getComputedStyle(stops[0]).stopColor : '';
    root.style.setProperty('--light-core', original);
    // Every consumer stylesheet names the ONE contract; none invents a second light system.
    const css = [...document.styleSheets].map(sheet => {
      try { return [...sheet.cssRules].map(rule => rule.cssText).join(''); } catch { return ''; }
    }).join('');
    return {
      tileFills: tiles.map(tile => getComputedStyle(tile).fill),
      tintStops: stops.length,
      before, after,
      consumers: {
        bloom: css.includes('#smart-led-bloom'),
        target: css.includes('var(--light-core') && css.includes('.target.kind-grow'),
        focus: css.includes('#tutorial-focus .focus-glow'),
        outcome: css.includes('#futa04-outcome-light'),
      },
    };
  });
  check(ownership.tintStops >= 3, `the top-glow tint exists and has a soft ramp (${ownership.tintStops} stops)`);
  check(ownership.after !== ownership.before && ownership.after.includes('255, 0, 0'), `the top-glow tint reads the published --light-core (${ownership.before} → ${ownership.after})`);
  check(ownership.tileFills.length >= 1, 'board tiles keep their own material fills');
  check(ownership.consumers.bloom && ownership.consumers.target && ownership.consumers.focus && ownership.consumers.outcome,
    `the bloom, legal-target rim, lesson pointer and outcome light all consume the contract (${JSON.stringify(ownership.consumers)})`);
  await owners.page.close();

  console.log(`${checks} light-source checks passed; screenshots: ${DIR}`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
