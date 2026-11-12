// THE MP4 WRITER (owner, 2026-10-30: "finish the replays — so it's easy to share or download as
// video").
//
// The browser's own H.264 encoder (WebCodecs) hands back compressed frames; this module packs them
// into a plain .mp4 file — the one format every phone, chat app and photo library takes. One video
// track, no audio, "fast start" (the index sits before the pictures, so a share preview can play it
// straight away). No dependency: the boxes below are the ISO base media file format's minimum.
//
// Pure: frames in, bytes out. A test can read every box back.

export type Mp4Sample = {
  /** The frame's bytes, as the encoder gave them (length-prefixed NAL units, `avc` format). */
  data: Uint8Array;
  /** Presentation time, in microseconds (WebCodecs' own unit). */
  timestamp: number;
  /** How long it is shown, in microseconds. */
  duration: number;
  /** A keyframe: a player may start here. */
  key: boolean;
};

export type Mp4Track = {
  width: number;
  height: number;
  /** The encoder's `decoderConfig.description`: the AVCDecoderConfigurationRecord (avcC). */
  avcC: Uint8Array;
};

/** The track's clock: 90 kHz, the video standard (every 30 fps frame is a whole 3000 ticks). */
export const MP4_TIMESCALE = 90_000;

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

class Writer {
  private parts: number[] = [];
  u8(v: number) { this.parts.push(v & 0xff); return this; }
  u16(v: number) { return this.u8(v >>> 8).u8(v); }
  u24(v: number) { return this.u8(v >>> 16).u16(v & 0xffff); }
  u32(v: number) { return this.u16(Math.floor(v / 0x10000) & 0xffff).u16(v & 0xffff); }
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.parts.push(b[i]! & 0xff); return this; }
  zeros(n: number) { for (let i = 0; i < n; i++) this.parts.push(0); return this; }
  done(): Uint8Array { return Uint8Array.from(this.parts); }
}

/** One box: size, four-letter type, body. */
const box = (type: string, ...body: Uint8Array[]): Uint8Array => {
  const size = 8 + body.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(ascii(type), 4);
  let at = 8;
  for (const b of body) { out.set(b, at); at += b.length; }
  return out;
};
/** A "full box": a box whose body starts with a version byte and three flag bytes. */
const full = (type: string, version: number, flags: number, ...body: Uint8Array[]) =>
  box(type, new Writer().u8(version).u24(flags).done(), ...body);

/** The identity matrix every header carries (16.16 and 2.30 fixed point). */
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

const ticks = (us: number) => Math.round((us * MP4_TIMESCALE) / 1_000_000);

/** The whole file. `samples` must be in presentation order (the encoder emits no B-frames here). */
export const muxMp4 = (track: Mp4Track, samples: readonly Mp4Sample[]): Uint8Array<ArrayBuffer> => {
  if (!samples.length) throw new Error('no frames to write');
  // Durations from the timestamps, so rounding never drifts: each sample ends where the next starts.
  const starts = samples.map((s) => ticks(s.timestamp));
  const last = samples.at(-1)!;
  const end = ticks(last.timestamp + last.duration);
  const durations = starts.map((t, i) => Math.max(1, (starts[i + 1] ?? end) - t));
  const total = durations.reduce((n, d) => n + d, 0);
  const totalMs = Math.round((total * 1000) / MP4_TIMESCALE);

  const ftyp = box('ftyp', new Writer().bytes(ascii('isom')).u32(0x200).bytes(ascii('isomiso2avc1mp41')).done());

  // stts: run-length (count, duration) pairs.
  const runs: [number, number][] = [];
  for (const d of durations) {
    const r = runs.at(-1);
    if (r && r[1] === d) r[0]++;
    else runs.push([1, d]);
  }
  const stts = full('stts', 0, 0, (() => { const w = new Writer().u32(runs.length); runs.forEach(([n, d]) => w.u32(n).u32(d)); return w.done(); })());
  const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const stss = full('stss', 0, 0, (() => { const w = new Writer().u32(keys.length); keys.forEach((k) => w.u32(k)); return w.done(); })());
  // One sample per chunk keeps the index trivially right.
  const stsc = full('stsc', 0, 0, new Writer().u32(1).u32(1).u32(1).u32(1).done());
  const stsz = full('stsz', 0, 0, (() => { const w = new Writer().u32(0).u32(samples.length); samples.forEach((s) => w.u32(s.data.length)); return w.done(); })());
  const avc1 = box(
    'avc1',
    new Writer()
      .zeros(6).u16(1) // reserved, data reference 1
      .zeros(16) // pre-defined / reserved
      .u16(track.width).u16(track.height)
      .u32(0x00480000).u32(0x00480000) // 72 dpi
      .u32(0).u16(1) // reserved, one frame per sample
      .zeros(32) // compressor name
      .u16(0x0018).u16(0xffff) // depth, pre-defined
      .done(),
    box('avcC', track.avcC),
  );
  const stsd = full('stsd', 0, 0, new Writer().u32(1).done(), avc1);

  const moovWith = (offsets: number[]) => {
    const stco = full('stco', 0, 0, (() => { const w = new Writer().u32(offsets.length); offsets.forEach((o) => w.u32(o)); return w.done(); })());
    const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
    const vmhd = full('vmhd', 0, 1, new Writer().zeros(8).done());
    const dinf = box('dinf', full('dref', 0, 0, new Writer().u32(1).done(), full('url ', 0, 1)));
    const minf = box('minf', vmhd, dinf, stbl);
    const mdhd = full('mdhd', 0, 0, new Writer().u32(0).u32(0).u32(MP4_TIMESCALE).u32(total).u16(0x55c4 /* 'und' */).u16(0).done());
    const hdlr = full('hdlr', 0, 0, new Writer().u32(0).bytes(ascii('vide')).zeros(12).bytes(ascii('FUTASAKU')).u8(0).done());
    const mdia = box('mdia', mdhd, hdlr, minf);
    const tkhd = full(
      'tkhd',
      0,
      3, // enabled, in movie
      (() => {
        const w = new Writer().u32(0).u32(0).u32(1).u32(0).u32(totalMs).zeros(8).u16(0).u16(0).u16(0).u16(0);
        MATRIX.forEach((m) => w.u32(m));
        return w.u32(track.width * 0x10000).u32(track.height * 0x10000).done();
      })(),
    );
    const trak = box('trak', tkhd, mdia);
    const mvhd = full(
      'mvhd',
      0,
      0,
      (() => {
        const w = new Writer().u32(0).u32(0).u32(1000).u32(totalMs).u32(0x00010000).u16(0x0100).zeros(10);
        MATRIX.forEach((m) => w.u32(m));
        return w.zeros(24).u32(2).done();
      })(),
    );
    return box('moov', mvhd, trak);
  };

  // Fast start: the index's size does not depend on the offsets it holds, so measure it first.
  const moovSize = moovWith(samples.map(() => 0)).length;
  const dataSize = samples.reduce((n, s) => n + s.data.length, 0);
  let at = ftyp.length + moovSize + 8;
  const offsets = samples.map((s) => { const o = at; at += s.data.length; return o; });
  const moov = moovWith(offsets);

  const out = new Uint8Array(ftyp.length + moov.length + 8 + dataSize);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  const mdatAt = ftyp.length + moov.length;
  new DataView(out.buffer).setUint32(mdatAt, 8 + dataSize);
  out.set(ascii('mdat'), mdatAt + 4);
  let p = mdatAt + 8;
  for (const s of samples) { out.set(s.data, p); p += s.data.length; }
  return out;
};
