// NO BROWSER PLACEHOLDER, EVER (owner, 2026-11-15: "should never ever happen").
//
// His screenshot of /test/ in iOS Safari showed board tiles and card-shaped sprites painted as
// WebKit's own broken-image tile — a light-blue square with a white question mark. It happens when a
// picture's file is not there (here: a stale shell whose build the deploy replaced). The board's own
// guard only covered the pictures it remembered to ask about; this suite proves the page-wide guard:
// with EVERY art file answering 404, no `<image>` is left pointing at a failed file and no `<img>`
// is left with a source that did not load.
//
// Run: npx tsx web/e2e/futa04-art-placeholder.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import { assertDistChannel } from './helpers/dist-channel.js';
import { closePreview, servePreview } from './helpers/preview-port.js';

const served = await servePreview(4194, { build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, logLevel: 'silent' });
const BASE = served.url;
// The owner's screenshot is iOS Safari, so the same proof is worth running on WebKit:
// PW_ENGINE=webkit npx tsx web/e2e/futa04-art-placeholder.ts
const engine = process.env.PW_ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch({
  ...(process.env.PW_CHROMIUM && engine === chromium ? { executablePath: process.env.PW_CHROMIUM } : {}),
  ...(process.env.PW_WEBKIT && engine === webkit ? { executablePath: process.env.PW_WEBKIT } : {}),
  ...(engine === chromium ? { args: ['--no-sandbox'] } : {}),
});
let checks = 0;
const check = (value: unknown, name: string) => { assert(value, name); checks++; };
const ART = /\.(webp|png|jpe?g|avif|svg)(\?|$)/i;
mkdirSync('/tmp/main2-shots', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let failed = 0;
  const blocked = new Set<string>();
  // A deploy that replaced the build: every picture's file is gone, the code is not.
  await page.route('**/assets/**', async (route) => {
    if (!ART.test(new URL(route.request().url()).pathname)) return route.continue();
    failed++;
    blocked.add(route.request().url());
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' });
  });
  await page.goto(`${BASE}?seed=219682080`);
  await assertDistChannel(page);
  await page.waitForFunction(() => document.querySelectorAll('#board g.hex-cell').length === 37, undefined, { timeout: 30_000 });
  // Give every picture that the board asks for time to fail and be taken back out.
  await page.waitForTimeout(2500);
  check(failed > 5, `the suite really did break the art (${failed} files blocked)`);

  const left = await page.evaluate(() => {
    const images = [...document.querySelectorAll('svg image')];
    const live = images.filter((node) => {
      const href = node.getAttribute('href') ?? '';
      return href && !/^(data:|blob:)/.test(href);
    }).map((node) => node.getAttribute('href') ?? '');
    const brokenImg = [...document.querySelectorAll('img')]
      .filter((img) => img.getAttribute('src') && img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src'));
    return { images: images.length, live, brokenImg, hexes: document.querySelectorAll('#board g.hex-cell').length };
  });
  const absolute = (href: string) => new URL(href, `${BASE}`).href;
  const keptFailed = left.live.filter((href) => blocked.has(absolute(href)));
  check(keptFailed.length === 0, `no SVG <image> keeps a href to a file that 404'd (${JSON.stringify(keptFailed.slice(0, 6))})`);
  check(left.brokenImg.length === 0, `no <img> keeps a src that did not load (${JSON.stringify(left.brokenImg.slice(0, 6))})`);
  check(left.hexes === 37, 'the board itself still stands, on its flat fallback');
  check(left.images > 0, 'the guard removes elements, not the whole board');

  // A picture added AFTER the guard was installed is caught the same way (a card, a replay, a future
  // painter): it is taken out in the same task, before anything can be painted.
  const late = await page.evaluate(async () => {
    const svg = document.querySelector('#board')!;
    const ns = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(ns, 'image');
    node.setAttribute('id', 'late-broken-art');
    node.setAttribute('href', './assets/this-file-does-not-exist.webp');
    node.setAttribute('width', '100');
    node.setAttribute('height', '100');
    svg.append(node);
    const img = document.createElement('img');
    img.id = 'late-broken-img';
    img.src = './assets/this-file-does-not-exist.webp';
    img.width = 100; img.height = 100;
    document.body.append(img);
    await new Promise((ok) => setTimeout(ok, 1200));
    return {
      imageLeft: !!document.getElementById('late-broken-art'),
      imgSrc: document.getElementById('late-broken-img')?.getAttribute('src') ?? null,
    };
  });
  check(late.imageLeft === false, 'a late <image> for a missing file is removed');
  check(late.imgSrc === null, 'a late <img> for a missing file loses its src');

  await page.screenshot({ path: '/tmp/main2-shots/390x844-no-placeholder.png' });
  console.log(`art-placeholder: ${checks} checks passed (${failed} art files blocked)`);
} finally {
  await browser.close();
  await closePreview(served.server);
}
