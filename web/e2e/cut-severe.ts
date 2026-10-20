// The Severe band, in a real browser: a 3-4 tile cut now has a 60ms hit-stop, a 2.5px shiver,
// a 1.012 zoom, a seam flash and neighbours that flinch; 1-2 stay quiet and 5+ keep their stronger
// shake. Also: Reduce motion is still a plain fade, and a tap during the cut still fast-forwards.
//
//   npx tsx web/e2e/cut-severe.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { cutPosition } from './cut-positions.js';
import { positionSave } from './position.js';
import { assertDistChannel } from './helpers/dist-channel.js';

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4198, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });

type Recorder = {
  /** the chain reaction: one rising pop per falling ring (from __severgrow.animLog) */
  pops: number[];
  shakes: number[];
  maxScale: number;
  flinches: number;
  floats: string[];
};
const record = (p: Page) => p.evaluate(() => {
  const proto = Element.prototype as unknown as {
    __m: Recorder; __mOrig?: typeof Element.prototype.animate; animate: typeof Element.prototype.animate;
  };
  proto.__m = { pops: [], shakes: [], maxScale: 1, flinches: 0, floats: [] };
  const orig = proto.animate;
  proto.__mOrig = orig;
  proto.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, opts?: number | KeyframeAnimationOptions) {
    const m = proto.__m;
    const json = JSON.stringify(frames);
    const cls = (this as Element).classList;
    if ((this as HTMLElement).id === 'board-wrap') {
      if (json.includes('translate(')) {
        // the shiver's amplitude: the largest absolute px in its translate keyframes
        let max = 0;
        for (const hit of json.matchAll(/translate\((-?[\d.]+)px/g)) max = Math.max(max, Math.abs(Number(hit[1])));
        m.shakes.push(max);
      }
      for (const hit of json.matchAll(/"scale":"([\d.]+)"/g)) m.maxScale = Math.max(m.maxScale, Number(hit[1]));
    }
    if (cls?.contains?.('tile') && json.includes('0.94')) m.flinches++;
    return orig.call(this, frames, opts);
  };
});
const readRecord = (p: Page) => p.evaluate(() => {
  const proto = Element.prototype as unknown as { __m: Recorder; __mOrig?: typeof Element.prototype.animate; animate: typeof Element.prototype.animate };
  if (proto.__mOrig) proto.animate = proto.__mOrig;
  const m = { ...proto.__m, shakes: [...proto.__m.shakes] };
  delete proto.__mOrig;
  return m;
});

const openSaved = async (n: number, cfg: Record<string, unknown>): Promise<{ p: Page; cut: number }> => {
  const { state, action, cut } = cutPosition(n, false);
  assert.equal(cut, n, `a ${n}-tile cut fixture exists`);
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.addInitScript(([s, g]) => {
    localStorage.clear();
    localStorage.setItem('main2:severgrow.save.v7', s as string);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify(g));
  }, [positionSave({ state }), cfg] as const);
  await p.goto(BASE);
  await assertDistChannel(p);   // loud if the served dist was built for another channel
  await p.waitForSelector('#menu-continue', { state: 'attached' });
  // The product menu hides Continue; its listener is still bound, so this is the same resume path.
  await p.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
  await p.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 20000 });
  await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30000 });
  // Record from before the cut: Severe's zoom fires 60ms after the tier is set, which is earlier
  // than a waitForFunction poll can reliably return.
  await record(p);
  await p.evaluate((a) => (window as any).__severgrow.playFor(a, 0), action);
  return { p, cut };
};

const watchCut = async (n: number, reduceMotion = false): Promise<{ tier: string | null; m: Recorder }> => {
  const { p } = await openSaved(n, { sound: false, music: false, coach: false, autoSkip: false, reduceMotion, speed: 'normal', vibration: false });
  try {
    await p.waitForFunction(() => !!document.documentElement.dataset.cutTier, undefined, { timeout: 8000 });
    const floats = new Set<string>();
    for (let i = 0; i < 200; i++) {
      for (const t of await p.evaluate(() => [...document.querySelectorAll('#captions .float')].map((e) => e.textContent))) if (t) floats.add(t);
      if (!(await p.evaluate(() => (window as any).__severgrow.busy()))) break;
      await p.waitForTimeout(30);
    }
    await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30000 });
    const tier = await p.evaluate(() => document.documentElement.dataset.cutTier ?? null);
    const m = (await readRecord(p)) as Recorder;
    const pops = await p.evaluate(() => ((window as any).__severgrow.animLog() as { ev: string; step: number }[]).filter((x) => x.ev === 'cascade').map((x) => x.step));
    return { tier, m: { ...m, pops, floats: [...floats] } };
  } finally {
    await p.close();
  }
};

try {
  const two = await watchCut(2);
  assert.equal(two.tier, 'small', 'a 2-tile cut is Small');
  assert.deepEqual(two.m.shakes, [], 'Small: no shiver');
  assert.equal(two.m.maxScale, 1, 'Small: no camera zoom');
  assert.equal(two.m.flinches, 0, 'Small: neighbours do not flinch');
  assert.deepEqual(two.m.floats, ['−2'], 'Small: one −N');
  assert.deepEqual(two.m.pops, [], 'Small: no chain reaction (it stays quiet)');

  const three = await watchCut(3);
  assert.equal(three.tier, 'severe', 'a 3-tile cut is Severe');
  assert.equal(three.m.shakes.length, 1, 'Severe: exactly one board shiver');
  assert(Math.abs(three.m.shakes[0]! - 2.5) < 0.01, `Severe: the shiver is 2.5px, not Big's 4-6px (${three.m.shakes[0]})`);
  assert(Math.abs(three.m.maxScale - 1.012) < 0.0005, `Severe: the camera zooms to 1.012 (${three.m.maxScale})`);
  assert(three.m.flinches >= 1, `Severe: surviving neighbours flinch (${three.m.flinches})`);
  assert.deepEqual(three.m.floats, ['−3'], 'Severe: one −N');
  assert(three.m.pops.length >= 1, 'Severe: the chain reaction pops');
  assert.deepEqual(three.m.pops, three.m.pops.map((_, i) => i), `Severe: one pop per ring, stepping up (${three.m.pops})`);

  const four = await watchCut(4);
  assert.equal(four.tier, 'severe', 'a 4-tile cut is Severe');
  assert.equal(four.m.shakes.length, 1, 'Severe (4): one board shiver');
  assert(four.m.flinches >= 1, 'Severe (4): neighbours flinch');

  const five = await watchCut(5);
  assert.equal(five.tier, 'big', 'a 5-tile cut is still Big');
  assert.equal(five.m.shakes.length, 1, 'Big: one board shiver');
  assert(Math.abs(five.m.shakes[0]! - 4) < 0.01, `Big: the shake is still 4px (${five.m.shakes[0]})`);
  assert.equal(five.m.flinches, 0, 'Big: the Severe neighbour flinch is not added');

  const eight = await watchCut(8);
  assert.equal(eight.tier, 'huge', 'an 8-tile cut is Huge');
  assert(Math.abs(eight.m.shakes[0]! - 6) < 0.01, `Huge: the shake is still 6px (${eight.m.shakes[0]})`);
  assert.equal(eight.m.flinches, 0, 'Huge: the Severe neighbour flinch is not added');
  assert(eight.m.pops.length >= 2 && eight.m.pops.length <= 6, `Huge: a climbing chain of 2-6 pops (${eight.m.pops})`);
  assert.deepEqual(eight.m.pops, eight.m.pops.map((_, i) => i), 'Huge: pops step up in order');

  const reduced = await watchCut(3, true);
  assert.equal(reduced.tier, 'severe', 'Reduce motion still knows a 3-tile cut is Severe');
  assert.deepEqual(reduced.m.shakes, [], 'Reduce motion: no shiver');
  assert.equal(reduced.m.maxScale, 1, 'Reduce motion: no zoom');
  assert.equal(reduced.m.flinches, 0, 'Reduce motion: no flinch');
  assert.deepEqual(reduced.m.floats, [], 'Reduce motion: no floating payoff');
  assert.deepEqual(reduced.m.pops, [], 'Reduce motion: no chain reaction');

  // A tap during the cut fast-forwards it and the gate opens again.
  {
    const { p } = await openSaved(3, { sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false });
    try {
      await p.waitForFunction(() => !!document.documentElement.dataset.cutTier, undefined, { timeout: 8000 });
      assert.equal(await p.evaluate(() => (window as any).__severgrow.busy()), true, 'the cut holds the gate');
      const t0 = Date.now();
      await p.locator('#deck').click({ force: true, timeout: 3000 });
      await p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 3000 });
      const ms = Date.now() - t0;
      assert(ms < 1400, `a tap during the cut fast-forwards it (${ms}ms)`);
    } finally {
      await p.close();
    }
  }

  console.log('Severe cut checks passed: 2 small (no pops), 3/4 severe (2.5px shiver, zoom, flinch, rising pops), 5 big and 8 huge unchanged, Reduce motion a fade, tap fast-forwards');
} finally {
  await browser.close();
  await server.close();
}
