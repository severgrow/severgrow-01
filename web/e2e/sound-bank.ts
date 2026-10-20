// The pre-rendered sound bank, in a real browser.
//
// Proves the allocation contract (createBuffer exactly once per unique voice at unlock, zero while
// playing), the three interaction layers (pointerdown -> tick, lift -> click, settle -> thud), that
// Sound off allocates and starts nothing, that a hidden document suspends the AudioContext, and that
// 30 cues at 4x CPU throttle produce no long task. It does not (and cannot) prove it sounds good:
// that needs ears.
//
//   npx tsx web/e2e/sound-bank.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/sound-bank.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { assertDistChannel } from './helpers/dist-channel.js';

const { server, url: BASE } = await servePreview(4197, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });

type Counters = { buffers: number; sources: number; starts: number };
type LongTask = { start: number; duration: number };

const instrument = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const sb = { buffers: 0, sources: 0, starts: 0 };
    (window as unknown as { __sb: Counters }).__sb = sb;
    (window as unknown as { __long: LongTask[] }).__long = [];
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const proto = AC.prototype as unknown as {
      createBuffer: (...a: unknown[]) => AudioBuffer;
      createBufferSource: () => AudioBufferSourceNode;
    };
    const createBuffer = proto.createBuffer;
    proto.createBuffer = function (this: AudioContext, ...a: unknown[]) {
      sb.buffers += 1;
      return createBuffer.apply(this, a as never);
    };
    const createSource = proto.createBufferSource;
    proto.createBufferSource = function (this: AudioContext) {
      sb.sources += 1;
      const src = createSource.call(this);
      const start = src.start.bind(src);
      src.start = (when?: number, ...rest: unknown[]) => {
        sb.starts += 1;
        start(when, ...(rest as never[]));
      };
      return src;
    };
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) sbLong().push({ start: entry.startTime, duration: entry.duration });
        }).observe({ entryTypes: ['longtask'] });
      } catch {
        /* longtask is optional; the suite still checks allocations */
      }
    }
    const sbLong = () => (window as unknown as { __long: LongTask[] }).__long;
  });
};

const seeded = (sound: boolean) => async (page: Page) => {
  await page.addInitScript((settings) => {
    localStorage.clear();
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify(settings));
  }, { sound, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false } as const);
};

const counters = (page: Page): Promise<Counters> => page.evaluate(() => ({ ...(window as unknown as { __sb: Counters }).__sb }));
const longTasks = (page: Page): Promise<LongTask[]> => page.evaluate(() => [...(window as unknown as { __long: LongTask[] }).__long]);
const bank = (page: Page) => page.evaluate(() => (window as any).__severgrow.soundBank() as { cues: number; samples: number; bytes: number; primed: number; ready: boolean; primeMs: number; state: string } | null);
const log = (page: Page) => page.evaluate(() => (window as any).__severgrow.soundLog() as { cue: string; layer: string }[]);

const waitBank = async (page: Page) => {
  await page.waitForFunction(() => {
    const b = (window as any).__severgrow?.soundBank?.();
    return b?.ready === true;
  }, undefined, { timeout: 10_000 });
};

try {
  // ---- one real page: the allocation contract and the three layers ----
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await instrument(page);
  await seeded(true)(page);
  await page.goto(`${BASE}?seed=2`);
  await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
  await assertDistChannel(page);

  // Nothing at all before a gesture.
  assert.deepEqual(await counters(page), { buffers: 0, sources: 0, starts: 0 }, 'no AudioContext work before a gesture');

  // pointerdown -> tick, lift -> click. This first gesture also unlocks and primes the bank.
  const settings = await page.locator('#menu-settings').boundingBox();
  assert(settings, 'the Settings button is on screen');
  await page.mouse.move(settings.x + settings.width / 2, settings.y + settings.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(40);
  let cues = await log(page);
  assert.equal(cues.at(-1)?.layer, 'tick', `pointerdown plays the quiet tick (${cues.at(-1)?.cue})`);
  await page.mouse.up();
  await page.waitForTimeout(40);
  cues = await log(page);
  assert.equal(cues.at(-1)?.layer, 'click', `release plays the click (${cues.at(-1)?.cue})`);
  await waitBank(page);

  const first = await bank(page);
  assert(first, 'the bank reports its stats');
  assert.equal(first.cues, 29, `the bank has 29 cues (${first.cues})`);
  assert.equal(first.samples, 167, `the bank has 167 unique buffers (${first.samples})`);
  assert(first.bytes < 1.5 * 1024 * 1024, `the bank is under 1.5 MB (${Math.round(first.bytes / 1024)} KB)`);
  assert(first.primeMs >= 0 && first.primeMs < 5, `the first click is baked in under 5 ms (${first.primeMs.toFixed(2)} ms, ${first.primed} first-tap buffers)`);
  assert(first.primed >= 1, 'the click is ready before the first gesture returns');
  assert.equal(first.state, 'running', 'the context runs after the gesture');
  const afterUnlock = await counters(page);
  assert.equal(afterUnlock.buffers, first.samples, `createBuffer runs exactly once per voice at unlock (${afterUnlock.buffers})`);

  // Close Settings, start a game, draw.
  // The Settings button's click is wired after the first async mount, so a click fired the moment
  // the menu appears can land too early (the same race settings-shots.ts retries).
  let opened = false;
  for (let i = 0; i < 20 && !opened; i++) {
    await page.click('#menu-settings', { force: true }).catch(() => undefined);
    opened = await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 700 }).then(() => true).catch(() => false);
  }
  assert(opened, 'the settings sheet opened');
  await page.locator('#sheet-settings [data-close]').click();
  await page.waitForSelector('#sheet-settings', { state: 'hidden' });
  await page.locator('#menu-new').click();
  await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 20_000 });
  await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 });
  await page.locator('#deck').click();
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT', undefined, { timeout: 20_000 });

  // Settle -> thud: play a legal Grow (Sprout) and look for the landing pair in the cue log.
  const grow = await page.evaluate(() => {
    const legal = (window as any).__severgrow.legal() as { t: string }[];
    return legal.find((a) => a.t === 'Sprout') ?? null;
  });
  assert(grow, 'a legal Grow is offered after the draw');
  const beforePlay = await counters(page);
  await page.evaluate((a) => (window as any).__severgrow.playFor(a, 0), grow);
  await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 });
  await page.waitForTimeout(400);
  cues = await log(page);
  assert(cues.some((c) => c.cue === 'place'), 'the landing plays the place tick');
  assert(cues.some((c) => c.cue === 'thud'), 'the settle layers the soft thud');
  assert(cues.some((c) => c.cue === 'draw'), 'the draw cue is unchanged');
  const afterPlay = await counters(page);
  assert.equal(afterPlay.buffers, beforePlay.buffers, `no createBuffer while playing (${afterPlay.buffers})`);
  assert(afterPlay.sources > beforePlay.sources, 'voices still start');

  // Hidden -> suspended, return -> running and playing again.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(80);
  assert.equal((await bank(page))?.state, 'suspended', 'a hidden document suspends the AudioContext');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => (window as any).__severgrow.soundBank()?.state === 'running', undefined, { timeout: 5_000 });

  // 4x CPU: 30 cues must not create an audio long task.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const beforeStress = await counters(page);
  await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      (window as any).__severgrow.soundCue('click');
      await new Promise((r) => setTimeout(r, 70));
    }
  });
  await page.waitForTimeout(250);
  const afterStress = await counters(page);
  assert(afterStress.starts - beforeStress.starts >= 30, `30 clicks start voices under 4x CPU (${afterStress.starts - beforeStress.starts})`);
  assert.equal(afterStress.buffers, beforeStress.buffers, 'still zero createBuffer under 4x CPU');
  const tasks = (await longTasks(page)).filter((t) => t.duration >= 50);
  assert.equal(tasks.length, 0, `no audio long task at 4x CPU (${tasks.map((t) => `${Math.round(t.duration)}ms`).join(', ')})`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();

  // ---- Sound off: no context, no bank, no voices ----
  const off = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await instrument(off);
  await seeded(false)(off);
  await off.goto(`${BASE}?seed=2`);
  await off.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
  await off.locator('#menu-new').click();
  await off.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 20_000 });
  await off.waitForTimeout(400);
  assert.equal((await bank(off))?.ready ?? false, false, 'Sound off builds no bank');
  assert.deepEqual(await counters(off), { buffers: 0, sources: 0, starts: 0 }, 'Sound off starts nothing');
  await off.close();

  console.log('Sound bank checks passed: 167 buffers baked once, 0 during play, pointerdown tick / lift click / settle thud, Sound off silent, hidden suspended, 30 cues at 4x CPU with no long task');
} finally {
  await browser.close();
  await server.close();
}
