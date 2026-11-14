/**
 * THE DRAW PILE IS THE RITUAL'S DECK (owner, 2026-11-14: "remove this weird rectangle from behind
 * the draw pile and make the draw pile look exactly like the pile in ritual at the end when cards
 * coming back together in middle screen").
 *
 * The ritual's deck is nine `.ritual-deck-layer`s (`web/index.html`), and EVERY layer contains a
 * printed `.card.back`. The dock's pile must be that same object: the face plus two fanned layers,
 * each printing the card back at the printed corner, each behind the face, with the fan coming from
 * one shared module (`web/src/ui/card-stack.ts`) instead of hand-typed px.
 *
 * A previous fix (earlier the same day) made the two layers PLAIN silhouettes, because a printed
 * back on every layer put extra printed frames inside the pile. The owner has since asked for the
 * ritual deck, whose layers are printed backs, so that rule is superseded here — the source of
 * truth is the ceremony itself.
 *
 * This suite checks three different things:
 *   1. COMPUTED STYLE — every visible layer prints the back, has no fill and no border of its own,
 *      and sits at `z-index:-1` behind the face.
 *   2. GEOMETRY — the two layers form the ritual's FAN (offset right/down, tilted), not a slab.
 *   3. PIXELS — the printed art really reaches the screen, and hiding the fanned layers really
 *      removes a band of pixels. Comparing frames needs no image decoder and cannot be faked by
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

/** The deck's fan numbers, as the pile's two pseudo-layers are told to draw them. */
const PILE_LAYERS = 3;
const FAN_NEAR = 1 / (PILE_LAYERS - 1);
const FAN_FAR = 1;

try {
  for (const [width, height] of [[320, 568], [390, 844], [1280, 800]] as const) {
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
      const layer = (which: '::before' | '::after') => {
        const l = getComputedStyle(stack, which);
        return {
          bg: l.backgroundImage, bgColor: l.backgroundColor, borderColor: l.borderTopColor,
          borderWidth: l.borderTopWidth, z: l.zIndex, radius: l.borderTopLeftRadius,
          translate: l.translate, rotate: l.rotate, shadow: l.boxShadow,
        };
      };
      const back = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage)?.[1] ?? '';
      let status = 0;
      try { status = (await fetch(back)).status; } catch { status = -1; }
      const r = stack.getBoundingClientRect();
      return {
        stackBg: cs.backgroundImage, backFile: back.split('/').pop() ?? '', backStatus: status,
        radius: cs.borderTopLeftRadius, box: { width: r.width, height: r.height },
        pileCardRadius: getComputedStyle(document.querySelector('#deck .pile-card')!).borderTopLeftRadius,
        before: layer('::before'), after: layer('::after'),
      };
    });

    assert(style.backFile.includes('back-'), `${width}px: the draw pile carries the card back ${JSON.stringify(style)}`);
    assert.equal(style.backStatus, 200, `${width}px: the back art is loadable`);
    // EVERY layer is the same printed back, exactly like the ritual's nine `.card.back` layers.
    for (const [name, layer] of [['near', style.after], ['far', style.before]] as const) {
      assert.equal(layer.bg, style.stackBg, `${width}px: the ${name} layer prints the same card back`);
      assert.equal(layer.bgColor, 'rgba(0, 0, 0, 0)', `${width}px: the ${name} layer paints no slab fill`);
      assert.equal(layer.borderWidth, '0px', `${width}px: the ${name} layer draws no frame of its own`);
      assert.equal(layer.z, '-1', `${width}px: the ${name} layer paints behind the face`);
    }
    assert(style.radius.startsWith('5.9%'), `${width}px: the face keeps the printed card corner (${style.radius})`);
    assert(style.pileCardRadius.startsWith('5.9%'), `${width}px: the card box keeps the printed card corner`);
    for (const [name, layer] of [['near', style.after], ['far', style.before]] as const) {
      assert(layer.radius.startsWith('5.9%'), `${width}px: the ${name} layer keeps the printed card corner (${layer.radius})`);
    }
    checks += 11;

    // THE FAN. Both layers move right and down and tilt counter-clockwise; the far one travels
    // exactly twice the near one (the ritual's `cardStackPose` at depth 1 and 2 of 3). A slab
    // would sit at `translate: none` / `rotate: none`. The poses are shares of the card box, so the
    // computed value stays in per cent (Chromium only resolves `translate` to px for lengths).
    const pose = (name: string, layer: { translate: string; rotate: string }) => {
      const pct = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(layer.translate);
      const deg = /(-?[\d.]+)deg/.exec(layer.rotate);
      assert(pct && deg, `${width}px: the ${name} layer is fanned (translate ${layer.translate}, rotate ${layer.rotate})`);
      return {
        x: (Number(pct![1]) / 100) * style.box.width,
        y: (Number(pct![2]) / 100) * style.box.height,
        rot: Number(deg![1]),
      };
    };
    const near = pose('near', style.after), far = pose('far', style.before);
    assert(near.x > 0 && near.y > 0 && near.rot < 0, `${width}px: the near layer fans right, down and tilts (${JSON.stringify(near)})`);
    assert(far.x > near.x && far.y > near.y && far.rot < near.rot, `${width}px: the far layer fans further (${JSON.stringify(far)})`);
    assert(Math.abs(far.x / near.x - FAN_FAR / FAN_NEAR) < 0.02 && Math.abs(far.y / near.y - FAN_FAR / FAN_NEAR) < 0.02,
      `${width}px: the two layers are the shared fan's two steps (${JSON.stringify({ near, far })})`);
    checks += 3;

    // The stack's one contact shadow belongs to the lowest visible layer, never to the face.
    const layers = Number(await page.locator('#deck').getAttribute('data-layers'));
    if (layers >= 3) {
      assert.equal(style.after.shadow, 'none', `${width}px: the face's near layer casts no second shadow`);
      assert.match(style.before.shadow, /rgba\(0, 0, 0, 0\.45\)/, `${width}px: the lowest layer casts the ritual's one shadow`);
      checks += 2;
    }

    // Nothing may run off the screen or push a scrollbar in the dock.
    const fit = await page.evaluate(() => {
      const r = document.querySelector('#deck')!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scroll: document.documentElement.scrollWidth, width: innerWidth };
    });
    assert(fit.left >= 0 && fit.right <= fit.width && fit.top >= 0 && fit.bottom <= height,
      `${width}px: the deck stays inside the viewport (${JSON.stringify(fit)})`);
    assert(fit.scroll <= fit.width + 1, `${width}px: the fanned layers add no horizontal scroll (${fit.scroll}/${fit.width})`);
    checks += 2;

    const clip = await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>('#deck .pile-stack')!.getBoundingClientRect();
      return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 };
    });
    const shot = async (name: string) => {
      const png = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
      writeFileSync(`${out}/${name}.png`, Buffer.from(png, 'base64'));
      return png;
    };
    // Decoded in the page (no image library needed): how many pixels differ between two frames?
    const diff = (a: string, b: string) => page.evaluate(async ({ a, b }) => {
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
      const pa = await pixels(a), pb = await pixels(b);
      let changed = 0, total = 0, sum = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(
          Math.abs(pa[i]! - pb[i]!), Math.abs(pa[i + 1]! - pb[i + 1]!), Math.abs(pa[i + 2]! - pb[i + 2]!),
        );
        if (d > 24) changed++;
        sum += d; total++;
      }
      return { changedFraction: changed / total, meanDiff: sum / total };
    }, { a, b });

    // Freeze animations: the Draw step breathes the pile, and two frames of a breathing pile would
    // differ for a reason that has nothing to do with the stack.
    const withLayers = await shot(`${width}-pile`);
    // Hide the two fanned layers only. The face stays, so every changed pixel is the fan itself.
    await page.addStyleTag({ content: '.futa04-cards #deck .pile-stack::before, .futa04-cards #deck .pile-stack::after { display: none !important; }' });
    await page.waitForTimeout(120);
    const withoutFan = await shot(`${width}-pile-without-fan`);
    const fan = await diff(withLayers, withoutFan);
    // The fan is two thin crescents down the right and bottom edges, never a tint: a few per cent of
    // the crop. With slabs (the reported bug) it covered everything; with no fan it would be zero.
    assert(fan.changedFraction > 0.02, `${width}px: the fanned layers paint a visible band (${(100 * fan.changedFraction).toFixed(1)}% changed)`);
    assert(fan.meanDiff > 1, `${width}px: the fanned layers really change the pixels (mean ${fan.meanDiff.toFixed(1)}/255)`);
    checks += 2;
    // Remove the printed art from every layer. If a grey slab still covered the face (the old bug)
    // the frame would barely change; now the art IS the pile.
    await page.addStyleTag({ content: '.futa04-cards #deck .pile-stack, .futa04-cards #deck .pile-stack::before, .futa04-cards #deck .pile-stack::after { background-image: none !important; }' });
    await page.waitForTimeout(120);
    const withoutBack = await shot(`${width}-pile-without-back`);
    const art = await diff(withLayers, withoutBack);
    // Measured on this build: the back paints the whole stack face (mean ≈50/255). With the old
    // opaque slabs in front it only peeked through a 2px band (≈15/255).
    assert(art.meanDiff > 30, `${width}px: the card back paints the pile, not a slab (mean difference ${art.meanDiff.toFixed(1)}/255)`);
    assert(art.changedFraction > 0.2, `${width}px: most of the pile is printed art (${(100 * art.changedFraction).toFixed(0)}% changed)`);
    checks += 2;

    console.log(`PASS ${width}x${height}: ${style.backFile} on all three layers, fanned ${near.x.toFixed(2)}/${far.x.toFixed(2)}px right`);
    await context.close();
  }
  console.log(`${checks} draw-pile-as-ritual-deck checks passed`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
