/**
 * THE DRAW PILE WEARS ITS CARD BACK (owner, 2026-11-14: "the back of the cards - draw pile is
 * broken - no skin").
 *
 * The failure was not a missing asset: `back-*.webp` returned 200 and `.pile-stack` DID carry it.
 * The two slab pseudo-elements (`::before`/`::after`) were opaque `--c-surface` and painted above
 * their own element's background, so they hid the art completely and the pile read as plain grey
 * slabs with a diagonal hatch.
 *
 * That is why this suite checks two different things:
 *   1. COMPUTED STYLE — the stack has the back art and both slabs sit at `z-index:-1`.
 *   2. PIXELS — the art really reaches the screen. The deck is photographed, then the stack's
 *      `background-image` is removed and it is photographed again. If the slabs still covered the
 *      face (the bug), the two frames would be identical; the back contributes pixels only when it
 *      is the visible top layer. Comparing frames needs no image decoder and cannot be faked by
 *      CSS that is present but painted over.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const { server, url } = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const out = process.env.SHOTS ?? '/tmp/futa04-pile-back-shots';
mkdirSync(out, { recursive: true });
let checks = 0;

try {
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow-thumb', JSON.stringify({ side: 'right' }));
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
        sound: false, music: false, coach: false, speed: 'fast', reduceMotion: false, handSort: 'suit',
      }));
    });
    const page = await context.newPage();
    await page.goto(`${url}?seed=2`, { waitUntil: 'load' });
    await page.waitForSelector('#hand .card', { timeout: 30_000 });
    // The deck only becomes the Draw step's tappable pile once the deal animation has settled.
    await page.waitForSelector('#deck:not([disabled])', { timeout: 30_000 });
    await page.waitForTimeout(400);

    const style = await page.evaluate(async () => {
      const stack = document.querySelector<HTMLElement>('#deck .pile-stack')!;
      const cs = getComputedStyle(stack);
      const back = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage)?.[1] ?? '';
      let status = 0;
      try { status = (await fetch(back)).status; } catch { status = -1; }
      return {
        stackBg: cs.backgroundImage,
        backFile: back.split('/').pop() ?? '',
        backStatus: status,
        beforeZ: getComputedStyle(stack, '::before').zIndex,
        afterZ: getComputedStyle(stack, '::after').zIndex,
        beforeBg: getComputedStyle(stack, '::before').backgroundImage,
        afterBg: getComputedStyle(stack, '::after').backgroundImage,
        radius: cs.borderTopLeftRadius,
      };
    });

    assert(style.backFile.includes('back-'), `${width}px: the draw pile carries the card back ${JSON.stringify(style)}`);
    assert.equal(style.backStatus, 200, `${width}px: the back art is loadable`);
    assert.equal(style.beforeZ, '-1', `${width}px: the near slab paints behind the back`);
    assert.equal(style.afterZ, '-1', `${width}px: the far slab paints behind the back`);
    // One back, not three: the slabs stay plain silhouettes (see web/tests/layering-086.test.ts).
    assert.equal(style.beforeBg, 'none', `${width}px: the near slab carries no second printed back`);
    assert.equal(style.afterBg, 'none', `${width}px: the far slab carries no third printed back`);
    assert(style.radius.startsWith('5.9%'), `${width}px: every layer keeps the card's own corner`);
    checks += 7;

    const clip = await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>('#deck .pile-stack')!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // Freeze animations: the Draw step breathes the pile, and two frames of a breathing pile would
    // differ for a reason that has nothing to do with the back.
    const withBack = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
    writeFileSync(`${out}/${width}-pile.png`, Buffer.from(withBack, 'base64'));
    // Remove only the artwork: the slabs and the box shadow stay, so every changed pixel is one the
    // back itself painted.
    await page.addStyleTag({ content: '.futa04-cards #deck .pile-stack { background-image: none !important; }' });
    await page.waitForTimeout(120);
    const withoutBack = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
    writeFileSync(`${out}/${width}-pile-without-back.png`, Buffer.from(withoutBack, 'base64'));
    // Decoded in the page (no image library needed): how much of the face did the back paint?
    const diff = await page.evaluate(async ({ withBack, withoutBack }) => {
      const pixels = async (data: string) => {
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const a = await pixels(withBack), b = await pixels(withoutBack);
      let changed = 0, total = 0, sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(
          Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!),
        );
        if (d > 24) changed++;
        sum += d; total++;
      }
      return { changedFraction: changed / total, meanDiff: sum / total };
    }, { withBack, withoutBack });
    // Measured on this build: the back paints the face (mean difference ≈54/255, ≈29% of pixels
    // changed). With the slabs in front of it (the reported bug) it only peeks through the 2px band
    // they do not cover: ≈15/255 and ≈9%. The thresholds sit between the two, not near either.
    assert(diff.meanDiff > 30, `${width}px: the card back paints the pile's face, not a slab (mean difference ${diff.meanDiff.toFixed(1)}/255)`);
    assert(diff.changedFraction > 0.2, `${width}px: most of the pile's face is printed art (${(100 * diff.changedFraction).toFixed(0)}% changed)`);
    checks += 2;

    console.log(`PASS ${width}x${height}: ${style.backFile} shows as the pile's face (${style.beforeZ}/${style.afterZ} slabs behind)`);
    await context.close();
  }
  console.log(`${checks} draw-pile back checks passed`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
