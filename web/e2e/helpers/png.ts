// A PNG SCREENSHOT, PIXELS IN NODE (no dependency): the gold-frame guard has to judge what the
// browser actually painted, not only what the DOM says it should paint. `page.screenshot()` hands
// back an encoded PNG, so this decodes the one shape Chromium and WebKit produce for a screenshot:
// 8-bit, non-interlaced, RGB or RGBA, one IDAT (or several, concatenated).
//
// Deliberately small: no palettes, no 16-bit, no interlacing, no ancillary-chunk handling. A
// screenshot that is none of those is a loud error, never a silently wrong picture.
import { inflateSync } from 'node:zlib';

export type Bitmap = { width: number; height: number; rgba: (x: number, y: number) => [number, number, number, number] };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export const decodePng = (png: Buffer): Bitmap => {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (png[i] !== SIGNATURE[i]) throw new Error('decodePng: not a PNG');
  }
  let at = 8;
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8]!;
      colour = body[9]!;
      interlace = body[12]!;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (depth !== 8) throw new Error(`decodePng: bit depth ${depth} (only 8 is handled)`);
  if (interlace !== 0) throw new Error('decodePng: interlaced PNG');
  if (colour !== 2 && colour !== 6) throw new Error(`decodePng: colour type ${colour} (only RGB/RGBA)`);
  const channels = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  const line = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let v = src[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`decodePng: filter ${filter}`);
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = line[x * channels]!;
      out[o + 1] = line[x * channels + 1]!;
      out[o + 2] = line[x * channels + 2]!;
      out[o + 3] = channels === 4 ? line[x * channels + 3]! : 255;
    }
    prev = Buffer.from(line);
  }
  return {
    width,
    height,
    rgba: (x: number, y: number) => {
      const o = (Math.round(y) * width + Math.round(x)) * 4;
      return [out[o]!, out[o + 1]!, out[o + 2]!, out[o + 3]!];
    },
  };
};

/**
 * The strongest warm metal (`red - blue`) in one angular sector of a ring around a hex centre.
 *
 * The gold atlas is a real gold ramp with its own lighting, so a side of the rim is not uniformly
 * bright; what is constant is that every side carries SOME strongly warm pixel. A side that has
 * been covered or dimmed by something painted above the frame loses exactly that.
 */
export const sideMetal = (
  bitmap: Bitmap,
  cx: number, cy: number, radius: number,
  fromDeg: number, toDeg: number,
  inner = 0.72, outer = 1.0,
): number => {
  let best = 0;
  const x0 = Math.max(0, Math.floor(cx - radius * outer));
  const y0 = Math.max(0, Math.floor(cy - radius * outer));
  const x1 = Math.min(bitmap.width - 1, Math.ceil(cx + radius * outer));
  const y1 = Math.min(bitmap.height - 1, Math.ceil(cy + radius * outer));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < radius * inner || d > radius * outer) continue;
      const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      if (deg < fromDeg || deg >= toDeg) continue;
      const [r, , b] = bitmap.rgba(x, y);
      if (r - b > best) best = r - b;
    }
  }
  return best;
};
