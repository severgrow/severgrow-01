#!/usr/bin/env node
/**
 * Rasterise the owner pure-vector brand SVGs into the PNG / WebP derivatives the
 * PWA icons, card back, OG card and email still need. Live UI loads the SVGs
 * directly (web/src/player/branding.ts).
 *
 *   PW_CHROMIUM=/path/to/chrome node scripts/build-brand-from-svg.mjs
 *
 * Sources (owner, 2026-11-07):
 *   plain-wordmark.svg  — menus / HUD / small marks
 *   paint-wordmark.svg  — home menu only (true vector paint)
 *   hex-emblem.svg      — app icon + card back (kanji-in-hex)
 * Favicon stays the cream tree-only PNG (no kanji favicon SVG in the pack).
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'web/src/assets/brand');
const publicBrand = join(root, 'web/public/brand');
const iconsDir = join(root, 'web/src/assets/futa04-icons');
const cardsDir = join(root, 'web/src/assets/cards');

const CHROME = process.env.PW_CHROMIUM
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PLAIN_SVG = join(brand, 'plain-wordmark.svg');
const PAINT_SVG = join(brand, 'paint-wordmark.svg');
const HEX_SVG = join(brand, 'hex-emblem.svg');

/** Render an SVG file to a PNG buffer at the given CSS pixel size (deviceScaleFactor 1). */
async function rasterSvg(page, svgPath, width, height) {
  const svg = readFileSync(svgPath);
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return page.evaluate(async ({ uri, width, height }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { uri, width, height });
}

async function rasterWebp(page, svgPath, width, height, quality = 0.92) {
  const svg = readFileSync(svgPath);
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return page.evaluate(async ({ uri, width, height, quality }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/webp', quality).split(',')[1];
  }, { uri, width, height, quality });
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  mkdirSync(brand, { recursive: true });
  mkdirSync(publicBrand, { recursive: true });
  mkdirSync(iconsDir, { recursive: true });

  // PLAIN / PAINT viewBox is 2106×662. Ship crisp PNG fallbacks for OG / email / canvas.
  const plainW = 1053, plainH = 331; // 0.5× viewBox — sharp at HUD and OG sizes
  const plainPng = await rasterSvg(page, PLAIN_SVG, plainW, plainH);
  writeFileSync(join(brand, 'plain-wordmark.png'), Buffer.from(plainPng, 'base64'));
  copyFileSync(join(brand, 'plain-wordmark.png'), join(publicBrand, 'plain-wordmark.png'));
  console.log(`plain-wordmark.png ${plainW}×${plainH}`);

  const paintPng = await rasterSvg(page, PAINT_SVG, plainW, plainH);
  writeFileSync(join(brand, 'paint-wordmark.png'), Buffer.from(paintPng, 'base64'));
  copyFileSync(join(brand, 'paint-wordmark.png'), join(publicBrand, 'paint-wordmark.png'));
  console.log(`paint-wordmark.png ${plainW}×${plainH} (archive / OG fallback; live UI uses SVG)`);

  // HEX emblem → square PNG master for icons + public brand copy.
  const hexSize = 1024;
  const hexPng = await rasterSvg(page, HEX_SVG, hexSize, hexSize);
  writeFileSync(join(brand, 'hex-emblem.png'), Buffer.from(hexPng, 'base64'));
  copyFileSync(join(brand, 'hex-emblem.png'), join(publicBrand, 'hex-emblem.png'));
  console.log(`hex-emblem.png ${hexSize}×${hexSize}`);

  // Also refresh the compatibility emblem webp the older icon script accepted.
  const hexWebp = await rasterWebp(page, HEX_SVG, 1254, 1254);
  writeFileSync(join(root, 'web/src/assets/futasaku-emblem.webp'), Buffer.from(hexWebp, 'base64'));
  writeFileSync(join(root, 'web/src/assets/futasaku-emblem-silhouette.webp'), Buffer.from(hexWebp, 'base64'));
  console.log('futasaku-emblem.webp refreshed from hex-emblem.svg');

  // Card back: stamp HEX into the existing paper frame, centred.
  // 0.48 of the short side was the first stamp. The face-down emblem is 8%
  // larger than that (owner, 2026-11-08): same hex geometry, still clear of
  // the paper edge. Do not scale the whole card to get this.
  const frame = readFileSync(join(cardsDir, 'back-frame.webp')).toString('base64');
  const hexUri = `data:image/svg+xml;base64,${readFileSync(HEX_SVG).toString('base64')}`;
  const card = await page.evaluate(async ({ frame, hexUri }) => {
    const paper = new Image(); paper.src = `data:image/webp;base64,${frame}`; await paper.decode();
    const art = new Image(); art.src = hexUri; await art.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 356;
    const g = canvas.getContext('2d');
    g.drawImage(paper, 0, 0);
    const stamp = Math.round(Math.min(256, 356) * 0.48 * 1.08);
    const x = Math.round((256 - stamp) / 2);
    const y = Math.round((356 - stamp) / 2);
    // Bake the cream mark; slight grain so it matches the face-down paper.
    const plate = document.createElement('canvas');
    plate.width = stamp; plate.height = stamp;
    const ink = plate.getContext('2d');
    ink.drawImage(art, 0, 0, stamp, stamp);
    ink.globalCompositeOperation = 'source-in';
    ink.fillStyle = '#d0bb8c';
    ink.fillRect(0, 0, stamp, stamp);
    const pixels = ink.getImageData(0, 0, stamp, stamp);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const grain = (((i / 4 * 1103515245 + 12345) >>> 16) % 17) - 8;
      for (let c = 0; c < 3; c++) pixels.data[i + c] = Math.max(0, Math.min(255, pixels.data[i + c] + grain));
    }
    ink.putImageData(pixels, 0, 0);
    g.drawImage(plate, x, y);
    return canvas.toDataURL('image/webp', 0.92).split(',')[1];
  }, { frame, hexUri });
  writeFileSync(join(cardsDir, 'back.webp'), Buffer.from(card, 'base64'));
  console.log('cards/back.webp stamped with hex-emblem.svg');

  // Public + src SVG copies stay in sync (already copied by the ship step; re-copy for safety).
  for (const name of ['plain-wordmark.svg', 'paint-wordmark.svg', 'hex-emblem.svg']) {
    copyFileSync(join(brand, name), join(publicBrand, name));
  }
} finally {
  await browser.close();
}

// Rebuild app icons from the refreshed emblem webp via the existing measured pipeline.
const { spawnSync } = await import('node:child_process');
const icon = spawnSync(process.execPath, [join(root, 'scripts/build-app-icons.mjs')], {
  env: { ...process.env, PW_CHROMIUM: CHROME },
  stdio: 'inherit',
});
if (icon.status !== 0) process.exit(icon.status ?? 1);

// Copy the 192 / 180 icons next to public root expectations (build-app-icons writes futa04-icons).
copyFileSync(join(iconsDir, 'futasaku-icon-192.png'), join(iconsDir, 'futasaku-favicon-192.png'));
copyFileSync(join(iconsDir, 'futasaku-icon-192.png'), join(root, 'web/public/futasaku-favicon-192.png'));
copyFileSync(join(iconsDir, 'futasaku-icon-180.png'), join(root, 'web/public/futasaku-icon-180.png'));
console.log('app icons + favicon-192 refreshed from HEX SVG');
