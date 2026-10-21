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
  // THE SCORE FACE, read at the one moment it is guaranteed to be on the glass. The sign talks
  // through the turn (DRAW!, then its idle nudge), so a later read could catch a step word.
  const scoreInk = await page.evaluate(() => {
    const cells = document.getElementById('smart-led-cells') as HTMLCanvasElement;
    const ctx = cells.getContext('2d')!;
    const data = ctx.getImageData(0, 0, cells.width, cells.height).data;
    const tones = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 250) continue;
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      tones.set(key, (tones.get(key) ?? 0) + 1);
    }
    const mid = Math.floor(cells.width / 2);
    const mainInk = (from: number, to: number) => {
      const half = new Map<string, number>();
      for (let y = 0; y < cells.height; y++) for (let x = from; x < to; x++) {
        const i = (y * cells.width + x) * 4;
        if (data[i + 3]! < 250) continue;
        const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
        half.set(key, (half.get(key) ?? 0) + 1);
      }
      return [...half.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    };
    return {
      mode: document.getElementById('smart-led')!.getAttribute('data-mode'),
      text: document.getElementById('smart-led-text')!.textContent ?? '',
      inks: [...tones.entries()].sort((a, b) => b[1] - a[1]).map(([ink]) => ink),
      left: mainInk(0, mid),
      right: mainInk(mid, cells.width),
    };
  });
  return { page, errors, scoreInk };
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
  let dotTop = Infinity; let dotBottom = -Infinity;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (cd[(y * cw + x) * 4 + 3]! < 40) continue;
    sx += x; sy += y; n++;
    const by = (pad + (y / cells.height) * cellsCssH) * ratioY;
    if (by < dotTop) dotTop = by;
    if (by > dotBottom) dotBottom = by;
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
  // Up/down are measured from the LIT DOTS' own vertical centre, not the light's centre of mass:
  // stretching the lower tail moves the centre of mass down, which would make the two sides
  // incomparable (the same offset would sample a different distance on each).
  const midY = Number.isFinite(dotTop) ? (dotTop + dotBottom) / 2 : ccy;
  const up = walk(0, -1, ccx, midY);
  const down = walk(0, 1, ccx, midY);
  const sides = [up, down, walk(1, 0, ccx, ccy), walk(-1, 0, ccx, ccy)];
  // Alpha at equal distances above and below the light's own centre of mass: the owner's ask is
  // that the tail reaches further down (onto the keys under the display), not equally all round.
  const avg = (x: number, y: number, r = 1) => {
    let sum = 0; let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const px = Math.round(x) + dx; const py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      sum += alpha(px, py); n++;
    }
    return Math.round(sum / Math.max(1, n));
  };
  return {
    W, H, max, mx, my, edgeMax, within10, nearest, dot, pad, angle,
    reach: along.reach, worstStep: along.worst,
    upReach: up.reach, downReach: down.reach,
    atUp: avg(ccx, midY - 16), atDown: avg(ccx, midY + 16),
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
  const { page, errors, scoreInk } = await open(390, 844);
  const metrics = await bloomMetrics(page);
  check(metrics.W > 0 && metrics.H > 0 && metrics.dots > 0, 'the bloom is baked from the lit dots');
  check(metrics.max <= 128, `the bloom sprite is alpha-capped (peak ${metrics.max}/255)`);
  check(metrics.max >= 24, `the bloom is actually visible at rest (peak ${metrics.max}/255)`);
  // Origin: the brightest bloom pixel is ON a lit dot (nearest dot pixel, in sprite space).
  check(metrics.nearest <= 4, `the bloom originates at the lit dots (${metrics.nearest.toFixed(1)} px from the nearest dot)`);
  check(metrics.reach >= 24, `the bloom fades softly for ${metrics.reach} px along the ${metrics.angle}° angle`);
  // The bloom leans DOWN by design (owner, 2026-10-21: "less above the screen more on the buttons
  // below"), so the shortest side is the upper one. Sides must still fade softly rather than stop,
  // and the downward side must clearly beat the upward one.
  check(metrics.sideReach >= 14, `the falloff is soft on every side (shortest ${metrics.sideReach} px)`);
  check(metrics.downReach > metrics.upReach * 1.6, `the light leans down (${metrics.downReach} px below vs ${metrics.upReach} px above)`);
  check(metrics.worstStep <= 14 && metrics.sideWorst <= 14, `no hard edge in the falloff (worst 1 px step ${Math.max(metrics.worstStep, metrics.sideWorst)}/255)`);
  check(metrics.edgeMax === 0, `every sprite edge is empty, so nothing is cut into a rectangle (edge alpha ${metrics.edgeMax})`);
  check(metrics.within10 <= 6, `the outer ring carries no clipped light (max ${metrics.within10}/255 in the last 10 px)`);
  check(metrics.filter === 'none' && metrics.windowFilter === 'none', 'the bloom and the LED window carry no live filter');
  check(metrics.spill === null, 'the old masked gradient spill is gone');
  // Owner, 2026-10-20: intensity down by ~35% (the old amber rest was .44; x .65 = .286).
  // Owner, 2026-10-21: another 15% down, so the amber rest was .243.
  // Owner, 2026-10-21: another 15% of current strength, so the amber rest is .207 (.44 x .4696).
  check(Math.abs(metrics.opacity - .207) <= .006, `the bloom rests at 65% x 85% x 85% of its old strength (${metrics.opacity}, was .44)`);
  check(metrics.opacity < .22, `the bloom no longer rests at the old strength (${metrics.opacity})`);
  check(metrics.opacity > .17, `the bloom is still a visible halo (${metrics.opacity})`);
  // The tail is longer BELOW the dots: the light catches the keys under the display.
  check(metrics.atDown > metrics.atUp,
    `at equal distance the light is stronger below the dots than above (${metrics.atDown} below vs ${metrics.atUp} above)`);
  check(metrics.downReach > metrics.upReach * 1.6,
    `the reach below is much longer than above (${metrics.downReach} vs ${metrics.upReach} px in the sprite)`);
  // The old 2.5x-ish ceiling belonged to the gentle 1.25 tail; the owner asked for a much steeper
  // lean, so the bound follows the published ratio. The real "not a wash" guard is the spill check
  // below (nothing meaningful beyond ~30 px) and the peak/intensity checks above.
  check(metrics.downReach <= metrics.upReach * 2.6,
    `the downward stretch stays a tail, not a wash (${metrics.downReach} vs ${metrics.upReach} px)`);

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

  /* 1a. THE SCORE'S DIGITS CARRY THE TWO PLAYERS' COLOURS (owner, 2026-10-21).
     The resting face reads "12:8": your digits green, theirs red, the colon the warm punctuation.
     An interim pass made both sides one cream; the owner asked for the colours back, so position
     AND hue now both say whose number is whose. */
  const AMBER = '245,216,164'; // #f5d8a4, the separator's warm punctuation
  // (Read by `open()` at the instant the sign came to rest.)
  check(scoreInk.mode === 'score', `the display rests on the score (mode ${scoreInk.mode}, "${scoreInk.text}")`);
  check(/^\d+:\d+$/.test(scoreInk.text), `the resting face is the score (${scoreInk.text})`);
  // Canvas compositing rounds a channel by a unit now and then, so inks match by proximity.
  const nearInk = (ink: string, r: number, g: number, b: number, tol = 3) => {
    const [ir, ig, ib] = ink.split(',').map(Number) as [number, number, number];
    return Math.abs(ir - r) <= tol && Math.abs(ig - g) <= tol && Math.abs(ib - b) <= tol;
  };
  // Owner (2026-10-21): the score goes back to green for you and red for them, split at the
  // separator. The separator stays the warm punctuation. This is the reverse of the interim
  // neutral pass, so the assertion is inverted deliberately.
  const nearGreen = (ink: string) => nearInk(ink, 169, 216, 134, 45);
  const nearRed = (ink: string) => nearInk(ink, 228, 112, 94, 45);
  const [ar, ag, ab] = AMBER.split(',').map(Number) as [number, number, number];
  check(scoreInk.inks.every(ink => nearGreen(ink) || nearRed(ink) || nearInk(ink, ar, ag, ab)),
    `the score uses only green, red and the warm separator (inks: ${scoreInk.inks.join(' | ')})`);
  check(nearGreen(scoreInk.left), `your digits are green (${scoreInk.left})`);
  check(nearRed(scoreInk.right), `their digits are red (${scoreInk.right})`);
  check(!nearRed(scoreInk.left) && !nearGreen(scoreInk.right),
    'the two players never swap inks (position still says whose is whose)');
  await page.screenshot({ path: `${DIR}/390x844-score.png` });

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

  /* 1b. THE MARQUEE MUST NEVER WASH THE COCKPIT (owner regression, 2026-10-20).
     A marquee bakes ONE sprite for the WHOLE message. Measured before the fix, that sprite was
     2678 x 182 CSS px over a 92 px display and painted across the cockpit and the hand, adding up
     to 205/255 to the screen. The bloom now lives in a fixed, feathered clip: the display plus a
     26 px wing each side and an 84 px lip above/below. These checks are the ones that make the
     screenshot impossible — pixels, not intent. */
  type Wash = {
    clip: { w: number; h: number; x: number; y: number };
    led: { w: number; h: number; x: number; y: number };
    sprite: { w: number; h: number; peak: number };
    scrolling: boolean;
    insideMax: number;
    insideAt: { x: number; y: number } | null;
    beyond28: number;
    /** The same measure split by side: the bloom deliberately pools DOWN onto the keys. */
    beyond28Up: number;
    beyond28Down: number;
    outsideBand: number;
    uiLuma: number;
  };

  /** Added light (0-255 luminance) from the bloom, and where it lands. */
  const washOf = async (p: Page, label: string): Promise<Wash> => {
    // RE-ARM THE NOTICE, THEN FREEZE IT. The display shows a notice for about 2.2 s and then
    // returns to the score, so a measurement taken a moment later would photograph a different
    // message (or the score) and the numbers would describe the wrong thing. Writing the banner's
    // own text back is a mutation, so the notice rail re-announces it. The wait lets the 190 ms
    // reel transition finish first: pausing mid-reel would leave the previous frame's canvas on
    // the glass, which is exactly the kind of diff that lies about the bloom.
    await p.evaluate(() => {
      const banner = document.getElementById('banner');
      if (banner) banner.textContent = banner.textContent;
    });
    await p.waitForTimeout(260);
    // Freeze every animation so the two frames are the same instant (the marquee is moving), and
    // record the state that was frozen: this is the message the pixels below belong to.
    const scrolling = await p.evaluate(() => {
      for (const a of document.getAnimations()) { try { a.pause(); } catch { /* already gone */ } }
      return document.getElementById('smart-led-bloom')?.classList.contains('scrolling') === true;
    });
    const shotWith = await p.screenshot();
    await p.evaluate(() => { (document.getElementById('smart-led-bloom') as HTMLElement).style.opacity = '0'; });
    const shotWithout = await p.screenshot();
    await p.evaluate(() => {
      (document.getElementById('smart-led-bloom') as HTMLElement).style.opacity = '';
      for (const a of document.getAnimations()) { try { a.play(); } catch { /* already gone */ } }
    });
    const measured = await p.evaluate(async ({ withData, withoutData, scrolling }) => {
      const load = async (src: string) => {
        const image = new Image(); image.src = `data:image/png;base64,${src}`; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const g = c.getContext('2d')!; g.drawImage(image, 0, 0);
        return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
      };
      const [on, off] = await Promise.all([load(withData), load(withoutData)]);
      const lum = (s: typeof on, x: number, y: number) => {
        const i = (y * s.w + x) * 4;
        return .2126 * s.d[i]! + .7152 * s.d[i + 1]! + .0722 * s.d[i + 2]!;
      };
      const clipEl = document.getElementById('smart-led-bloom-clip')!;
      const clipR = clipEl.getBoundingClientRect();
      const ledR = document.getElementById('smart-led')!.getBoundingClientRect();
      // The display's own face: glyphs and the alarm blink live here, and are not part of the wash.
      const winR = document.getElementById('smart-led-window')!.getBoundingClientRect();
      const bloom = document.getElementById('smart-led-bloom') as HTMLCanvasElement;
      const sprite = bloom.getBoundingClientRect();
      const ctx = bloom.getContext('2d')!;
      const alpha = ctx.getImageData(0, 0, bloom.width, bloom.height).data;
      let peak = 0;
      for (let i = 3; i < alpha.length; i += 4) peak = Math.max(peak, alpha[i]!);
      // A pixel is "the display's own" when it is inside the glass (plus 6 px of bezel).
      const own = (x: number, y: number) =>
        x >= winR.left - 6 && x <= winR.right + 6 && y >= winR.top - 6 && y <= winR.bottom + 6;
      // Distance from the display's own box (0 inside it).
      const away = (x: number, y: number) => {
        const dx = Math.max(winR.left - x, 0, x - winR.right);
        const dy = Math.max(winR.top - y, 0, y - winR.bottom);
        return Math.hypot(dx, dy);
      };
      let insideMax = 0; let insideAt: { x: number; y: number } | null = null;
      let beyond28 = 0; let beyond28Up = 0; let beyond28Down = 0; let outsideBand = 0; let uiLuma = 0;
      for (let y = 0; y < on.h; y++) for (let x = 0; x < on.w; x++) {
        const add = lum(on, x, y) - lum(off, x, y);
        if (add <= 0) continue;
        const inBand = x >= clipR.left && x < clipR.right && y >= clipR.top && y < clipR.bottom;
        if (!inBand) { outsideBand = Math.max(outsideBand, add); continue; }
        if (own(x, y)) continue;
        if (add > insideMax) { insideMax = add; insideAt = { x, y }; }
        if (away(x, y) > 30) {
          beyond28 = Math.max(beyond28, add);
          if (y < ledR.top) beyond28Up = Math.max(beyond28Up, add);
          else if (y > ledR.bottom) beyond28Down = Math.max(beyond28Down, add);
        }
      }
      // The illuminated UI next to the display: the brightest pixel of the key row below it. The
      // bloom must stay well under it (it is light spilling on a bezel, not a lamp).
      const keyRowTop = Math.round(ledR.bottom + 2);
      for (let y = keyRowTop; y < Math.min(on.h, keyRowTop + 70); y++) for (let x = Math.round(clipR.left); x < Math.min(on.w, clipR.right); x++) {
        const v = lum(off, x, y);
        if (v > uiLuma) uiLuma = v;
      }
      return {
        clip: { w: Math.round(clipR.width), h: Math.round(clipR.height), x: Math.round(clipR.left), y: Math.round(clipR.top) },
        led: { w: Math.round(ledR.width), h: Math.round(ledR.height), x: Math.round(ledR.left), y: Math.round(ledR.top) },
        sprite: { w: Math.round(sprite.width), h: Math.round(sprite.height), peak },
        scrolling,
        insideMax: Math.round(insideMax), insideAt, beyond28: Math.round(beyond28),
        beyond28Up: Math.round(beyond28Up), beyond28Down: Math.round(beyond28Down),
        outsideBand: Math.round(outsideBand), uiLuma: Math.round(uiLuma),
      };
    }, { withData: shotWith.toString('base64'), withoutData: shotWithout.toString('base64'), scrolling });
    if (process.env.E2E_DEBUG === '1') console.log(`wash ${label}: ${JSON.stringify(measured)}`);
    return measured;
  };

  const marqueeWash: Record<string, Wash> = {};
  const shortWash: Record<string, Wash> = {};
  for (const [w, h] of [[390, 844], [360, 640]] as const) {
    const run = await open(w, h);
    const tag = `${w}x${h}`;
    // The display machine may replace the banner with its own beat after a moment, so poke the
    // marquee until it takes and hold it there (a real marquee is exactly this state).
    const LONG = 'THIS IS A LONG MESSAGE TO TEST THE MECHANICAL LED WINDOW';
    let scrolling = false;
    for (let attempt = 0; attempt < 12 && !scrolling; attempt++) {
      await run.page.evaluate((text) => { (document.getElementById('banner') as HTMLElement).textContent = text; }, LONG);
      await run.page.waitForTimeout(250);
      scrolling = await run.page.evaluate(() => document.querySelector('#smart-led-cells')?.classList.contains('scrolling') === true);
    }
    check(scrolling, `${tag}: the marquee took (the state the owner saw)`);
    check(await run.page.evaluate(() => document.getElementById('smart-led-text')?.textContent ?? '') === LONG,
      `${tag}: the long message is on the display`);
    // Freeze it here: washOf pauses the animations, and the strip must stay a marquee for the
    // measurement (this is the state that produced the wash).
    await run.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.pause(); } catch { /* gone */ } } });
    const long = await washOf(run.page, `${tag} marquee`);
    marqueeWash[tag] = long;
    check(long.scrolling, `${tag}: the marquee really is scrolling (the state the owner saw)`);
    // (a) The hard bound: nothing at all outside the fixed band, whatever the message is.
    check(long.outsideBand <= 1, `${tag}: no bloom light outside the display's fixed band (max +${long.outsideBand}/255)`);
    // (b) Inside the band the light must stay a whisper ABOVE the display, because there is nothing
    // up there to light. BELOW it the owner deliberately asked for a pool on the undo / Match Intel
    // keys, so that side gets its own (still small) ceiling. The absolute wash guard is
    // `outsideBand` above: nothing at all escapes the fixed band, whatever the message is.
    check(long.beyond28Up <= 10, `${tag}: above the display, beyond 30 px, the bloom adds at most +${long.beyond28Up}/255 (limit 10)`);
    check(long.beyond28Down <= 45, `${tag}: below the display the pool stays a whisper, not a wash (+${long.beyond28Down}/255, limit 45)`);
    check(long.insideMax < long.uiLuma, `${tag}: the bloom stays under the lit UI it spills on (${long.insideMax} vs ${long.uiLuma})`);
    // (c) The bloom's brightest spill stays well under the illuminated UI beside it, and is a
    //     halo at the bezel — never a panel wash.
    check(long.insideMax <= 30, `${tag}: the brightest bloom spill beside the glass is +${long.insideMax}/255 (limit 30)`);
    check(long.insideMax + 20 < long.uiLuma,
      `${tag}: the bloom stays well under the illuminated keys (spill +${long.insideMax} vs key luminance ${long.uiLuma})`);
    // (d) The sprite is capped, and the visible band is the display plus the fixed wing/lip.
    check(long.sprite.peak <= 91, `${tag}: the marquee sprite is alpha-capped at ${long.sprite.peak}/255 (cap .34)`);
    check(long.clip.w === long.led.w + 52 && long.clip.h === long.led.h + 168,
      `${tag}: the bloom is confined to the display + 26 px each side, 84 px above/below (${long.clip.w}x${long.clip.h} for a ${long.led.w}x${long.led.h} display)`);
    await run.page.screenshot({ path: `${DIR}/${tag}-marquee.png` });

    // A short message must not produce a bigger or brighter light than the long one.
    await run.page.evaluate(() => { (document.getElementById('banner') as HTMLElement).textContent = 'TAP THE DRAW PILE'; });
    await run.page.waitForFunction(() => !document.querySelector('#smart-led-cells')?.classList.contains('scrolling'), undefined, { timeout: 6000 });
    await run.page.waitForTimeout(350);
    const short = await washOf(run.page, `${tag} short`);
    shortWash[tag] = short;
    check(short.clip.w === long.clip.w && short.clip.h === long.clip.h,
      `${tag}: a long marquee does not widen the light (short ${short.clip.w}x${short.clip.h}, long ${long.clip.w}x${long.clip.h})`);
    check(short.sprite.peak === long.sprite.peak, `${tag}: a long marquee does not brighten the light (peak ${short.sprite.peak} vs ${long.sprite.peak})`);
    // Message LENGTH must not change the light: the same side-split ceilings apply to the short one.
    check(short.beyond28Up <= 10, `${tag}: the short message is just as contained above (+${short.beyond28Up}/255)`);
    check(short.beyond28Down <= 45, `${tag}: the short message pools below without washing (+${short.beyond28Down}/255)`);
    check(short.insideMax <= 30, `${tag}: the short message's spill is a halo too (+${short.insideMax}/255)`);
    check(run.errors.length === 0, `${tag}: no browser errors on a marquee (${run.errors.join(' | ')})`);
    await run.page.close();
  }
  if (process.env.E2E_DEBUG === '1') console.log('marquee wash', JSON.stringify({ marqueeWash, shortWash }));

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

  /* 5. Owner colours are never replaced, and a TILE's glow never follows the display.
     A top-rank tile's halo belongs to the tile (its rank and its owner's moss/lava material).
     The display's tone swings through a turn; if a tile read it, every top tile would change
     colour at every outcome (owner, 2026-10-20: "the glow on the tiles ... looks a bit random at
     the end of turn, esp on enemies tiles changing from red to green and back"). */
  const owners = await open(390, 844, { reduceMotion: true });
  const ownership = await owners.page.evaluate(() => {
    const tiles = [...document.querySelectorAll<SVGPathElement>('#board .l-base path.hex')].slice(0, 2);
    const root = document.documentElement;
    const original = root.style.getPropertyValue('--light-core');
    // Publishing a tone must not touch anything on the board.
    const glows = () => [...document.querySelectorAll<SVGImageElement>('#board .top-glow')];
    const before = glows().map(glow => `${glow.getAttribute('href')}|${glow.getAttribute('style') ?? ''}`);
    const fills = tiles.map(tile => getComputedStyle(tile).fill);
    root.style.setProperty('--light-core', '#ff0000');
    const after = glows().map(glow => `${glow.getAttribute('href')}|${glow.getAttribute('style') ?? ''}`);
    const fillsAfter = tiles.map(tile => getComputedStyle(tile).fill);
    root.style.setProperty('--light-core', original);
    // Every consumer stylesheet names the ONE contract; none invents a second light system.
    const css = [...document.styleSheets].map(sheet => {
      try { return [...sheet.cssRules].map(rule => rule.cssText).join(''); } catch { return ''; }
    }).join('');
    return {
      tileFills: fills,
      fillsAfter,
      tintElements: document.querySelectorAll('#board .top-glow-tint, #board radialGradient[id$="light-tint"]').length,
      topGlowStyle: css.includes('.top-glow'),
      glows: before.length,
      glowsChanged: JSON.stringify(before) !== JSON.stringify(after),
      consumers: {
        bloom: css.includes('#smart-led-bloom'),
        target: css.includes('var(--light-core') && css.includes('.target.kind-grow'),
        focus: css.includes('#tutorial-focus .focus-glow'),
        outcome: css.includes('#futa04-outcome-light'),
      },
    };
  });
  check(ownership.tintElements === 0, `no board element follows the display's tone (${ownership.tintElements} tint nodes)`);
  check(ownership.topGlowStyle, 'top-rank tiles keep their own halo rule');
  check(!ownership.glowsChanged, `publishing a new display tone does not change a single tile halo (${ownership.glows} on screen)`);
  check(JSON.stringify(ownership.tileFills) === JSON.stringify(ownership.fillsAfter), 'publishing a new display tone does not change a tile fill');
  check(ownership.tileFills.length >= 1, 'board tiles keep their own material fills');
  check(ownership.consumers.bloom && ownership.consumers.target && ownership.consumers.focus && ownership.consumers.outcome,
    `the bloom, legal-target rim, lesson pointer and outcome light all consume the contract (${JSON.stringify(ownership.consumers)})`);
  await owners.page.close();

  /* 6. ONE ROOM: the result light tints the WHOLE background, behind the cockpit, the dock, the
     hand and the board, with no seam (owner, 2026-10-20: "when colour of background behind the map
     changes colour it should change across the whole background, also under cockpit and the hand
     and all"). The old styling was two soft ellipses under the map, so the colour stopped at an
     edge halfway down the screen. The element's only animated property is opacity, so setting it
     to the beat's peak is exactly what the game paints. */
  for (const palette of ['soil', 'moss'] as const) {
    for (const [w, h] of [[360, 640], [390, 844]] as const) {
      const run = await open(w, h, { palette, reduceMotion: true });
      const tag = `${palette} ${w}x${h} room`;
      await run.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.pause(); } catch { /* gone */ } } });
      const plain = await run.page.screenshot();
      const points = await run.page.evaluate(() => {
        const R = (sel: string) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
        return { led: R('#smart-led'), box: R('#futa04-box'), hand: R('#hand'), card: R('#hand .card'), key: R('#smart-context'), board: R('#board') };
      });
      // The real element, at the peak opacity the pulse animates to.
      await run.page.evaluate(() => {
        const el = document.getElementById('futa04-outcome-light')!;
        el.dataset.tone = 'good';
        el.style.opacity = '0.3';
      });
      await run.page.waitForTimeout(80);
      const lit = await run.page.screenshot();
      await run.page.screenshot({ path: `${DIR}/${w}x${h}-${palette}-room.png` });
      const probes = await run.page.evaluate(async ({ plainData, litData, points }) => {
        const load = async (src: string) => {
          const image = new Image(); image.src = `data:image/png;base64,${src}`; await image.decode();
          const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
          const g = c.getContext('2d')!; g.drawImage(image, 0, 0);
          return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
        };
        const [a, b] = await Promise.all([load(plainData), load(litData)]);
        const rgb = (s: typeof a, x: number, y: number) => {
          const i = (Math.round(y) * s.w + Math.round(x)) * 4;
          return [s.d[i]!, s.d[i + 1]!, s.d[i + 2]!] as [number, number, number];
        };
        const delta = (x: number, y: number) => {
          const p = rgb(a, x, y); const q = rgb(b, x, y);
          return Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]);
        };
        const W = a.w; const H = a.h;
        const spot = (x: number, y: number) => delta(Math.min(W - 2, Math.max(1, x)), Math.min(H - 2, Math.max(1, y)));
        const corners = { tl: spot(4, 4), tr: spot(W - 5, 4), bl: spot(4, H - 5), br: spot(W - 5, H - 5) };
        const behindCockpit = points.box && points.led ? spot(points.box.x - 8, points.led.cy) : 0;
        const behindHand = points.hand ? spot(points.hand.cx, Math.min(H - 3, points.hand.y + points.hand.h - 2)) : 0;
        const behindBoardTop = points.board ? spot(points.board.cx, points.board.y + 2) : 0;
        /* WHERE THE TINT CAN ACTUALLY END. An opaque hex, the board plate or a card hides the page
           entirely, so a walk across the screen measures those edges, not the light's (the map's
           hexes sit right at the left margin on a tall phone). A seam is instead ruled out by the
           layer's own geometry: ONE element over the viewport, and a full-bleed gradient in its
           background — no shaped patch can therefore stop halfway. */
        const layer = document.getElementById('futa04-outcome-light')!;
        const box = layer.getBoundingClientRect();
        const style = getComputedStyle(layer);
        const backdrop = style.backgroundImage;
        const fullBleed = box.width >= W - 1 && box.height >= H - 1 && box.left <= 0 && box.top <= 0;
        const noPatch = /linear-gradient\(/.test(backdrop);
        // The same tint in every corner, so no part of the page is left out.
        const spread = Math.max(...Object.values(corners)) - Math.min(...Object.values(corners));
        // The cockpit's own keys and the cards keep their own colours.
        const keyBefore = points.key ? rgb(a, points.key.cx, points.key.cy) : null;
        const keyAfter = points.key ? rgb(b, points.key.cx, points.key.cy) : null;
        const cardBefore = points.card ? rgb(a, points.card.cx, points.card.cy) : null;
        const cardAfter = points.card ? rgb(b, points.card.cx, points.card.cy) : null;
        const drift = (x: [number, number, number] | null, y: [number, number, number] | null) =>
          !x || !y ? 99 : Math.abs(y[0] - x[0]) + Math.abs(y[1] - x[1]) + Math.abs(y[2] - x[2]);
        return {
          corners, behindCockpit, behindHand, behindBoardTop, spread,
          fullBleed, noPatch, backdrop: backdrop.slice(0, 120),
          keyDrift: drift(keyBefore, keyAfter), cardDrift: drift(cardBefore, cardAfter),
          size: `${W}x${H}`,
        };
      }, { plainData: plain.toString('base64'), litData: lit.toString('base64'), points });
      const weakest = Math.min(...Object.values(probes.corners));
      check(weakest > 0, `${tag}: the colour reaches all four screen corners (weakest +${weakest})`);
      check(probes.behindCockpit > 0, `${tag}: it reaches the background behind the cockpit (+${probes.behindCockpit})`);
      check(probes.behindHand > 0, `${tag}: it reaches the background behind the hand (+${probes.behindHand})`);
      check(probes.fullBleed, `${tag}: the light is one layer over the whole viewport (no shaped patch)`);
      check(probes.noPatch, `${tag}: its background is a full-bleed wash, so the colour cannot stop at an edge (${probes.backdrop})`);
      // Summed over the three channels: a spread of 8 is under 3 per channel, invisible; the old
      // ellipse styling left whole screen areas at 0.
      check(probes.spread <= 8, `${tag}: the same tint in every corner, so the colour has no boundary (corner spread ${probes.spread})`);
      check(probes.keyDrift <= 6, `${tag}: the cockpit's keys keep their own colours (rgb drift ${probes.keyDrift})`);
      check(probes.cardDrift <= 6, `${tag}: the cards keep their own colours (rgb drift ${probes.cardDrift})`);
      check(run.errors.length === 0, `${tag}: no browser errors (${run.errors.join(' | ')})`);
      await run.page.close();
    }
  }

  console.log(`${checks} light-source checks passed; screenshots: ${DIR}`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
