// Pictures in the browser: decode an upload, measure it for the checks, and make the files the game
// loads (each tier at its exact size). WebP where the browser can write it (Chrome, Firefox, Edge);
// Safari cannot, so there the files are PNG and named .png (the pack says so; the game reads both).
import { hasTransparency, seamScore, solidOutsideHex } from './checks.js';
import type { ImageMeta } from './checks.js';
import { CARD } from './slots.js';
import type { Slot } from './slots.js';

export type Decoded = { bitmap: ImageBitmap; mime: string; bytes: number; svg?: string };

export const decode = async (blob: Blob): Promise<Decoded> => {
  const mime = blob.type || 'application/octet-stream';
  if (mime === 'image/svg+xml') {
    const svg = await blob.text();
    const img = new Image();
    const url = URL.createObjectURL(blob);
    try {
      img.src = url;
      await img.decode();
      return { bitmap: await createImageBitmap(img, { resizeWidth: 96, resizeHeight: 96 }), mime, bytes: blob.size, svg };
    } finally { URL.revokeObjectURL(url); }
  }
  try {
    return { bitmap: await createImageBitmap(blob), mime, bytes: blob.size };
  } catch {
    throw new Error('This file could not be opened as a picture.');
  }
};

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

/** Pixels of a picture scaled to fit `max` (enough for the checks, cheap on big uploads). */
const sample = (b: ImageBitmap, max = 256) => {
  const k = Math.min(1, max / Math.max(b.width, b.height));
  const w = Math.max(1, Math.round(b.width * k)), h = Math.max(1, Math.round(b.height * k));
  const g = canvas(w, h).getContext('2d', { willReadFrequently: true })!;
  g.drawImage(b, 0, 0, w, h);
  return { data: g.getImageData(0, 0, w, h).data, w, h };
};

export const measure = (d: Decoded, slot: Slot): ImageMeta => {
  const s = sample(d.bitmap);
  return {
    width: d.svg ? 24 : d.bitmap.width, height: d.svg ? 24 : d.bitmap.height, mime: d.mime, bytes: d.bytes,
    anyTransparent: hasTransparency(s.data),
    solidOutsideHex: solidOutsideHex(s.data, s.w, s.h),
    ...(slot.rule.seamless ? { seam: seamScore(s.data, s.w, s.h) } : {}),
  };
};

let webpOk: boolean | null = null;
/** Whether this browser can write WebP (Safari cannot: it hands back PNG). */
export const canWriteWebp = () => {
  if (webpOk === null) webpOk = canvas(2, 2).toDataURL('image/webp').startsWith('data:image/webp');
  return webpOk;
};

const encode = (c: HTMLCanvasElement, opaque: boolean): Promise<{ bytes: Uint8Array; mime: string }> => new Promise((ok, fail) => {
  const mime = canWriteWebp() ? 'image/webp' : 'image/png';
  c.toBlob(async (b) => {
    if (!b) return fail(new Error('This picture could not be converted.'));
    ok({ bytes: new Uint8Array(await b.arrayBuffer()), mime: b.type || mime });
  }, mime, opaque ? 0.86 : 0.9);
});

/** Gold art is the complete bonus hex, not a floating nugget. Normalise the alpha
 * silhouette to the *actual point-up* hex and trim external transparent margins.
 * This runs only when a designer uploads Gold, never in the live renderer.
 * All output pixels remain within that exact six-sided shape.
 */
const drawEdgeFittedGold = (g: CanvasRenderingContext2D, bitmap: ImageBitmap, w: number, h: number) => {
  const dim = 768, base = 512;
  const sampled = canvas(base, base), sc = sampled.getContext('2d', { willReadFrequently: true })!;
  sc.drawImage(bitmap, 0, 0, base, base);
  const alphaBox = (ctx: CanvasRenderingContext2D, size: number) => {
    const pixels = ctx.getImageData(0, 0, size, size).data;
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3]! < 64) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
  };
  const original = alphaBox(sc, base);
  if (!original) return;
  // A wide hex was authored flat-top; rotate the artwork ONCE into FUTASAKU's
  // point-up family. Point-up art is never rotated simply for being on the board.
  const turn = original.w > original.h * 1.07 ? Math.PI / 6 : 0;
  const rotated = canvas(dim, dim), rg = rotated.getContext('2d', { willReadFrequently: true })!;
  rg.translate(dim / 2, dim / 2);
  rg.rotate(turn);
  rg.drawImage(sampled, -base / 2, -base / 2, base, base);
  rg.setTransform(1, 0, 0, 1, 0, 0);
  const box = alphaBox(rg, dim);
  if (!box) return;

  const radius = Math.min(w, h) / 2;
  g.save();
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (-90 + 60 * i) * Math.PI / 180;
    const x = w / 2 + radius * Math.cos(a), y = h / 2 + radius * Math.sin(a);
    if (!i) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.clip();
  // Height reaches the top/bottom vertices; width reaches the left/right pair.
  // No inset padding, no shared-edge enlargement and no oversized prop canvas.
  const fullW = radius * Math.sqrt(3), fullH = radius * 2;
  g.drawImage(rotated, box.x, box.y, box.w, box.h,
    (w - fullW) / 2, (h - fullH) / 2, fullW, fullH);
  g.restore();
};

/** The picture at exactly w×h (covering, centred). A single card becomes a sheet of nine. */
export const render = async (d: Decoded, slot: Slot, w: number, h: number) => {
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  if (slot.id === 'gold') {
    drawEdgeFittedGold(g, d.bitmap, w, h);
  } else if (slot.rule.shape === 'card-sheet' && d.bitmap.width < CARD.w * 2) {
    for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) g.drawImage(d.bitmap, (col * w) / 3, (r * h) / 3, w / 3, h / 3);
  } else {
    const k = Math.max(w / d.bitmap.width, h / d.bitmap.height);
    const dw = d.bitmap.width * k, dh = d.bitmap.height * k;
    g.drawImage(d.bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  return encode(c, slot.rule.alpha === 'forbidden');
};

/** A 3×3 tiling of a seamless texture, so hard edges show (the seam check's preview). */
export const tilePreview = (b: ImageBitmap, size = 240) => {
  const c = canvas(size, size), g = c.getContext('2d')!, t = size / 3;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.drawImage(b, x * t, y * t, t, t);
  return c;
};
