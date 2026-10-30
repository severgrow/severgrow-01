// THE MP4 WRITER: the file the replay video is shared as. These tests read every box back.
import { describe, expect, it } from 'vitest';
import { MP4_TIMESCALE, muxMp4 } from '../src/replay/mp4.js';
import type { Mp4Sample } from '../src/replay/mp4.js';

type Box = { type: string; start: number; size: number; body: number };

/** The boxes inside [from, to), with where each one's body starts. */
const boxes = (b: Uint8Array, from = 0, to = b.length): Box[] => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Box[] = [];
  for (let at = from; at < to; ) {
    const size = v.getUint32(at);
    const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
    out.push({ type, start: at, size, body: at + 8 });
    expect(size).toBeGreaterThanOrEqual(8);
    at += size;
  }
  return out;
};
const find = (b: Uint8Array, path: string[]): Box => {
  let list = boxes(b);
  let hit: Box | undefined;
  for (const [i, type] of path.entries()) {
    hit = list.find((x) => x.type === type);
    if (!hit) throw new Error(`no ${path.slice(0, i + 1).join('/')}`);
    // container bodies: stsd and dref skip a full-box header and an entry count
    if (i === path.length - 1) break;
    const skip = type === 'stsd' || type === 'dref' ? 8 : type === 'avc1' ? 78 : 0;
    list = boxes(b, hit.body + skip, hit.start + hit.size);
  }
  return hit!;
};
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at);

const AVCC = Uint8Array.from([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 2, 0x67, 0x64, 1, 0, 2, 0x68, 0xee]);
const sample = (i: number, us: number, dur: number, key = i === 0): Mp4Sample => ({
  data: Uint8Array.from([0, 0, 0, 2, 0x65 + i, i]),
  timestamp: us,
  duration: dur,
  key,
});

describe('muxMp4', () => {
  const samples = [sample(0, 0, 33_333), sample(1, 33_333, 33_334), sample(2, 66_667, 500_000), sample(3, 566_667, 33_333, true)];
  const file = muxMp4({ width: 1080, height: 1350, avcC: AVCC }, samples);

  it('is ftyp, then the index (fast start), then the pictures', () => {
    expect(boxes(file).map((x) => x.type)).toEqual(['ftyp', 'moov', 'mdat']);
    const total = boxes(file).reduce((n, x) => n + x.size, 0);
    expect(total).toBe(file.length);
  });

  it('every chunk offset points at its own frame bytes', () => {
    const stco = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco']);
    expect(u32(file, stco.body + 4)).toBe(samples.length);
    samples.forEach((s, i) => {
      const at = u32(file, stco.body + 8 + i * 4);
      expect([...file.subarray(at, at + s.data.length)]).toEqual([...s.data]);
    });
  });

  it('sizes, keyframes and the clock add up to the frames given', () => {
    const stsz = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz']);
    expect(u32(file, stsz.body + 8)).toBe(samples.length);
    const stss = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stss']);
    expect(u32(file, stss.body + 4)).toBe(2);
    expect([u32(file, stss.body + 8), u32(file, stss.body + 12)]).toEqual([1, 4]);
    const stts = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stts']);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < u32(file, stts.body + 4); i++) {
      const n = u32(file, stts.body + 8 + i * 8);
      count += n;
      sum += n * u32(file, stts.body + 12 + i * 8);
    }
    expect(count).toBe(samples.length);
    // 0.6 s exactly, in 90 kHz ticks: the last frame ends where the timeline ends
    expect(sum).toBe(Math.round(0.6 * MP4_TIMESCALE));
    const mdhd = find(file, ['moov', 'trak', 'mdia', 'mdhd']);
    expect(u32(file, mdhd.body + 12)).toBe(MP4_TIMESCALE);
    expect(u32(file, mdhd.body + 16)).toBe(sum);
  });

  it('carries the picture size and the encoder record', () => {
    const avc1 = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1']);
    expect(new DataView(file.buffer).getUint16(avc1.body + 24)).toBe(1080);
    expect(new DataView(file.buffer).getUint16(avc1.body + 26)).toBe(1350);
    const avcC = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1', 'avcC']);
    expect([...file.subarray(avcC.body, avcC.start + avcC.size)]).toEqual([...AVCC]);
  });

  it('refuses an empty recording', () => {
    expect(() => muxMp4({ width: 2, height: 2, avcC: AVCC }, [])).toThrow();
  });
});
