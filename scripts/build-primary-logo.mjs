#!/usr/bin/env node
// Approved source: web/src/assets/futasaku-primary-logo.svg (owner-supplied, unchanged).
// Keep established raster canvas sizes for replay exports and older brand tooling.
// Run this, build-app-icons.mjs, then build-email-wordmark.mjs when replacing the source.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(`${root}web/src/assets/futasaku-primary-logo.svg`);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const outputs = await page.evaluate(async (data) => {
    const image = new Image(); image.src = data; await image.decode();
    const targets = [
      { name: 'futasaku-wordmark-silhouette.webp', w: 2200, h: 715, box: [79, 57, 2072, 638] },
      { name: 'futasaku-white.webp', w: 2200, h: 715, box: [79, 57, 2072, 638] },
      { name: 'futasaku-emblem-silhouette.webp', w: 1254, h: 1254, box: [0, 0, 1254, 1254] },
      { name: 'futasaku-emblem.webp', w: 1254, h: 1254, box: [0, 0, 1254, 1254] },
    ];
    return targets.map(({ name, w, h, box: [x, y, bw, bh] }) => {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const g = canvas.getContext('2d');
      const scale = Math.min(bw / 1755, bh / 495);
      const dw = 1755 * scale, dh = 495 * scale;
      g.drawImage(image, x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh);
      return { name, data: canvas.toDataURL('image/webp', .92).split(',')[1] };
    });
  }, `data:image/svg+xml;base64,${source.toString('base64')}`);
  for (const { name, data } of outputs) {
    writeFileSync(`${root}web/src/assets/${name}`, Buffer.from(data, 'base64'));
    console.log(`Generated ${name} from the primary vector`);
  }
  // The card's supplied frame/paper is unchanged. Stamp the same vector into its existing centre.
  const card = await page.evaluate(async ({ source, frame }) => {
    const art = new Image(); art.src = source; await art.decode();
    const paper = new Image(); paper.src = frame; await paper.decode();
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 356;
    const g = canvas.getContext('2d'); g.drawImage(paper, 0, 0);
    const stamp = document.createElement('canvas'); stamp.width = 148; stamp.height = 48;
    const ink = stamp.getContext('2d');
    const markH = 148 * 495 / 1755;
    ink.drawImage(art, 0, (48 - markH) / 2, 148, markH);
    ink.globalCompositeOperation = 'source-in'; ink.fillStyle = '#d0bb8c'; ink.fillRect(0, 0, 148, 48);
    const pixels = ink.getImageData(0, 0, 148, 48);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const grain = (((i / 4 * 1103515245 + 12345) >>> 16) % 17) - 8;
      for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] += grain;
    }
    ink.putImageData(pixels, 0, 0); g.drawImage(stamp, 54, 151);
    return canvas.toDataURL('image/webp', .92).split(',')[1];
  }, {
    source: `data:image/svg+xml;base64,${source.toString('base64')}`,
    frame: `data:image/webp;base64,${readFileSync(`${root}web/src/assets/cards/back-frame.webp`).toString('base64')}`,
  });
  writeFileSync(`${root}web/src/assets/cards/back.webp`, Buffer.from(card, 'base64'));
  mkdirSync(`${root}web/public/brand`, { recursive: true });
  writeFileSync(`${root}web/public/brand/futasaku-primary-logo.svg`, source);
} finally { await browser.close(); }
