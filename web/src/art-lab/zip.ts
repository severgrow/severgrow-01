// A small ZIP writer and reader (stored entries, no compression: the pictures are already WebP/PNG,
// so deflate would gain nothing). No dependency. Reads only what it writes (and any stored zip).
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export type ZipEntry = { name: string; data: Uint8Array };
const enc = new TextEncoder();

/** A fixed date (1 Jan 2026) so the same pack always makes the same bytes. */
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export const zip = (entries: readonly ZipEntry[]): Uint8Array => {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    locals.push(new Uint8Array(lh.buffer), name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, DOS_TIME, true); ch.setUint16(14, DOS_DATE, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = centrals.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** Reads a zip's stored entries. Throws a plain-English error for anything else. */
export const unzip = (bytes: Uint8Array): ZipEntry[] => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('This is not a zip file.');
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('This zip is damaged.');
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('This zip was re-packed with compression. Open the original pack exported from the Art Lab.');
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.push({ name, data: bytes.slice(start, start + size) });
    p += 46 + nameLen + extra + comment;
  }
  return out;
};
