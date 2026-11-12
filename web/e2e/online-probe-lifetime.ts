// Check the leak detector against native EventTarget behaviour, without loading the game.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installProbe } from './helpers/online-probe.js';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  const context = await browser.newContext();
  await installProbe(context);
  await context.addInitScript({ content: 'window.__name = f => f;' });
  const page = await context.newPage();
  await page.goto('about:blank');
  const result = await page.evaluate(() => {
    const w = window as any;
    const type = 'futasaku-probe-lifetime';
    const count = () => w.__probe.listeners()[`document|${type}|0`] ?? 0;
    let calls = 0;
    const cancelled = () => { calls++; };
    const retained = () => { calls++; };
    const signal = new AbortController();
    document.addEventListener(type, cancelled, { signal: signal.signal });
    const active = count();
    signal.abort();
    const automaticallyRemoved = count();
    document.dispatchEvent(new Event(type));
    const cancelledCalls = calls;
    const second = new AbortController();
    document.addEventListener(type, cancelled, { signal: second.signal });
    document.addEventListener(type, retained);
    document.removeEventListener(type, cancelled);
    second.abort();
    const afterAbort = count();
    document.dispatchEvent(new Event(type));
    const nativeCalls = calls;
    document.removeEventListener(type, retained);
    document.addEventListener(type, cancelled, { signal: signal.signal });
    const alreadyAborted = count();
    document.addEventListener(type, retained);
    document.addEventListener(type, retained);
    const deduplicated = count();
    document.removeEventListener(type, retained);
    const empty = count();
    return { active, automaticallyRemoved, cancelledCalls, afterAbort, nativeCalls, alreadyAborted, deduplicated, empty };
  });
  assert.deepEqual(result, { active: 1, automaticallyRemoved: 0, cancelledCalls: 0, afterAbort: 1, nativeCalls: 1, alreadyAborted: 0, deduplicated: 1, empty: 0 });
  console.log('Probe agrees with native cancellation, callback identity and duplicate registration.');
  await context.close();
} finally {
  await browser.close();
}
