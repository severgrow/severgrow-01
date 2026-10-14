#!/usr/bin/env node
// Regenerates the Futasaku Add-to-Home-Screen / PWA icons from the main-menu emblem.
//
// Why this exists: the icons under `web/src/assets/futa04-icons/` used to be a separate, busy
// green-on-white illustration that had nothing to do with the mark the menu shows. The owner asked
// for the Add-to-Home-Screen icon to be "the classic tree we have in main menu", i.e. the emblem at
// `web/src/assets/futasaku-emblem.webp` that `web/src/player/branding.ts` renders into `#logo`.
//
// That emblem is a plain black silhouette stored with an alpha channel; the menu draws it as a
// solid cream mark (`--c-accent`, `#efe5cb`) on the app backdrop (`--c-bg`, `#18191a`, the default
// "soil" theme). So this script treats the webp purely as an alpha mask, recolours it cream, and
// lays it on a solid `#18191a` square — no transparency anywhere, which iOS requires for the
// apple-touch-icon (transparent pixels render black there).
//
// The maskable icon places the tree's bounding box at 78% of the square side. That matters: Android
// masks to a circle of diameter 80%, and this tree's widest point sits on its bounding-box edge, so
// 78% keeps the whole tree inside the safe circle (measured max radial extent 78.3% of the
// half-side). The icons that are shown whole (the favicon, Android "any" and the iOS
// apple-touch-icon) fill a little more (84%) so the tree does not look lost in the tile; the tree's
// silhouette has empty top/bottom corners, so it never reaches the rounded corners iOS cuts away.
// The script prints both measurements for every file.
//
// Run:  node scripts/build-app-icons.mjs
// It needs Chromium (the same browser `playwright-core` installs for the web e2e suites) only to
// decode the .webp; everything else is plain Node + zlib, no image dependency.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';

const SOURCE = fileURLToPath(new URL('../web/src/assets/futasaku-emblem.webp', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../web/src/assets/futa04-icons/', import.meta.url));

const BACKGROUND = [0x18, 0x19, 0x1a]; // soil theme --c-bg: the app/menu backdrop
const INK = [0xef, 0xe5, 0xcb]; // --c-accent: the cream the menu tints the tree with
const MASKABLE_CONTENT = 0.78; // maskable tree bbox as a fraction of the side (see header note)
const ANY_CONTENT = 0.84; // shown-whole icons can be fuller; the tree keeps empty corners
const ALPHA_CUT = 8; // alpha at/below this counts as empty when measuring the tree

// `content` is the tree's bounding box as a fraction of the icon side. The maskable icon stays
// conservative so the whole tree sits inside Android's 80% safe circle; the icons that are shown
// whole (favicon, Android "any", the iOS apple-touch-icon) are filled a little more so the tree
// does not look lost in the tile. The tree's silhouette has empty top/bottom corners, so it never
// reaches the rounded corners iOS cuts away even at the fuller size.
const TARGETS = [
  { name: 'futasaku-icon-180.png', size: 180, content: ANY_CONTENT },
  { name: 'futasaku-icon-192.png', size: 192, content: ANY_CONTENT },
  { name: 'futasaku-icon-512.png', size: 512, content: ANY_CONTENT },
  { name: 'futasaku-icon-maskable-512.png', size: 512, content: MASKABLE_CONTENT },
];

// ---------- decode the webp through Chromium, re-encoded as PNG ----------

async function decodeEmblem() {
  const base64 = readFileSync(SOURCE).toString('base64');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pngBase64 = await page.evaluate(async (url) => {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, `data:image/webp;base64,${base64}`);
    return decodePng(Buffer.from(pngBase64, 'base64'));
  } finally {
    await browser.close();
  }
}

// ---------- minimal PNG codec (8-bit, RGB / RGBA, non-interlaced) ----------

function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNG supported');
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG colour type ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    raw.copy(cur, 0, rp, rp + stride); rp += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      cur[x] = v;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2];
      out[d + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 3, d = y * (stride + 1) + 1 + x * 3;
      raw[d] = rgb[s]; raw[d + 1] = rgb[s + 1]; raw[d + 2] = rgb[s + 2];
    }
  }
  const table = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour RGB, no alpha
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- image operations ----------

/** Tight bounding box of pixels with alpha above `cut`. */
function alphaBBox(img, cut) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] > cut) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('emblem has no opaque pixels');
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Area-averaged (premultiplied) downscale/upscale of an RGBA image to tw x th. */
function resample(img, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  const sx = img.width / tw, sy = img.height / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(img.height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(img.width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const d = (yy * img.width + xx) * 4, al = img.data[d + 3] / 255;
        r += img.data[d] * al; g += img.data[d + 1] * al; b += img.data[d + 2] * al; a += al; n++;
      }
      const o = (y * tw + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return { width: tw, height: th, data: out };
}

/** Build one square icon: solid background, tree centred with its bbox at `content` of the side. */
function buildIcon(emblem, bbox, size, content) {
  const box = Math.round(size * content);
  const scale = box / Math.max(bbox.w, bbox.h);
  const tw = Math.max(1, Math.round(bbox.w * scale));
  const th = Math.max(1, Math.round(bbox.h * scale));
  const art = resample(crop(emblem, bbox), tw, th);
  const offX = Math.round((size - tw) / 2), offY = Math.round((size - th) / 2);
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) { out[i * 3] = BACKGROUND[0]; out[i * 3 + 1] = BACKGROUND[1]; out[i * 3 + 2] = BACKGROUND[2]; }
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const s = (y * tw + x) * 4, a = art.data[s + 3] / 255;
    if (a <= 0) continue;
    const d = ((y + offY) * size + (x + offX)) * 3;
    for (let c = 0; c < 3; c++) out[d + c] = Math.round(INK[c] * a + out[d + c] * (1 - a));
  }
  return { width: size, height: size, data: out };
}

function crop(img, b) {
  const out = Buffer.alloc(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const s = ((b.minY + y) * img.width + b.minX + x) * 4, d = (y * b.w + x) * 4;
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3];
  }
  return { width: b.w, height: b.h, data: out };
}

/**
 * Measure the finished icon: how far the furthest tree pixel sits from the icon centre, and how the
 * tree's bounding box is centred. Reported as percentages of the half-side / side. For a maskable
 * icon the radial extent must stay within 80% (the Android safe circle).
 */
function measureIcon(image, size) {
  const bg = [image.data[0], image.data[1], image.data[2]];
  let minX = size, minY = size, maxX = -1, maxY = -1, radial = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = (y * size + x) * 3;
    const diff = Math.abs(image.data[d] - bg[0]) + Math.abs(image.data[d + 1] - bg[1]) + Math.abs(image.data[d + 2] - bg[2]);
    if (diff <= 24) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    radial = Math.max(radial, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2));
  }
  const boxCx = (minX + maxX + 1) / 2, boxCy = (minY + maxY + 1) / 2;
  return {
    widthPct: (maxX - minX + 1) / size * 100,
    heightPct: (maxY - minY + 1) / size * 100,
    offX: +(boxCx - size / 2).toFixed(1),
    offY: +(boxCy - size / 2).toFixed(1),
    radialPct: radial / (size / 2) * 100,
  };
}

// ---------- main ----------

const emblem = await decodeEmblem();
const bbox = alphaBBox(emblem, ALPHA_CUT);
console.log(`source emblem ${emblem.width}x${emblem.height}; tree bbox ${bbox.w}x${bbox.h} at (${bbox.minX},${bbox.minY})`);

for (const target of TARGETS) {
  const image = buildIcon(emblem, bbox, target.size, target.content);
  writeFileSync(`${OUT_DIR}${target.name}`, encodePng(target.size, target.size, image.data));
  const m = measureIcon(image, target.size);
  console.log(
    `${target.name}: ${target.size}x${target.size} RGB, tree at ${(target.content * 100).toFixed(0)}% | ` +
    `bbox ${m.widthPct.toFixed(1)}%x${m.heightPct.toFixed(1)}% of side, centre offset (${m.offX}, ${m.offY})px | ` +
    `max radial extent ${m.radialPct.toFixed(1)}% of half-side (safe-circle limit 80%)`,
  );
}
