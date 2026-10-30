// THE FAST EXPORT (owner, 2026-10-30: "finish the replays — so it's easy to share or download as
// video — find a smart way to do it super nice").
//
// The old export recorded the screen in real time (a 30 s replay took 30 s) and gave Chrome a .webm
// that iPhones, WhatsApp and Instagram will not take. This one paints every picture itself and hands
// it straight to the phone's own H.264 encoder (WebCodecs), as fast as the encoder runs — usually a
// few seconds — and packs the result into a plain .mp4 (`mp4.ts`), the one file every phone, chat
// app and photo library accepts. The pictures MOVE: tiles pop in along the beat's reveal order and
// cut tiles fade, like the replay screen (`frames.ts` → `motionFrames`).
//
// Constrained Baseline H.264 first: it never reorders frames (so the file needs no composition
// table) and every decoder ever made plays it. A browser without WebCodecs H.264 keeps the old
// real-time recorder (`video.ts`); the caller asks `canEncodeMp4` first.
import { loadBoardArtUrls, warmBoardArt } from './board-canvas.js';
import type { BoardArt } from './board-canvas.js';
import { motionFrames, paintMotionFrameCached, VIDEO_H, VIDEO_W } from './frames.js';
import { muxMp4 } from './mp4.js';
import type { Mp4Sample } from './mp4.js';
import type { RecordedVideo } from './video.js';
import type { ReplayModel } from './timeline.js';

/** Constrained Baseline, Main, then High, all level 4.0 (1080×1350 at 30 fps fits 4.0). */
export const MP4_CODECS = ['avc1.42e028', 'avc1.4d0028', 'avc1.640028'] as const;
/** A keyframe at least this often, so a share preview can start anywhere and seek cleanly. */
const KEY_EVERY_US = 2_000_000;
/** Plenty for a board of art at 1080×1350 (motion is short; most of the file is held stills). */
const BITRATE = 8_000_000;

type EncoderConfig = {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  avc: { format: 'avc' };
  latencyMode?: 'quality' | 'realtime';
};

const config = (codec: string): EncoderConfig => ({
  codec,
  width: VIDEO_W,
  height: VIDEO_H,
  bitrate: BITRATE,
  framerate: 30,
  avc: { format: 'avc' },
  latencyMode: 'quality',
});

/** The first H.264 profile this browser's encoder takes, or null (then the recorder is used). */
export const pickMp4Codec = async (): Promise<string | null> => {
  const VE = (globalThis as { VideoEncoder?: { isConfigSupported(c: EncoderConfig): Promise<{ supported?: boolean }> } }).VideoEncoder;
  if (!VE || typeof (globalThis as { VideoFrame?: unknown }).VideoFrame === 'undefined') return null;
  for (const codec of MP4_CODECS) {
    try {
      if ((await VE.isConfigSupported(config(codec))).supported) return codec;
    } catch {
      // try the next profile
    }
  }
  return null;
};

export type EncodeOptions = {
  model: ReplayModel;
  art?: BoardArt | null;
  signal?: AbortSignal;
  /** 0 … 1 of the pictures encoded. */
  onProgress?: (fraction: number) => void;
  /** Tests may pin a profile. */
  codec?: string;
};

/**
 * Encode the whole replay to an .mp4. Resolves to null when cancelled; rejects with a message when
 * the encoder refuses or fails (the caller then says so plainly — never a fake "saved").
 */
export const encodeReplayMp4 = async (o: EncodeOptions): Promise<RecordedVideo | null> => {
  const codec = o.codec ?? (await pickMp4Codec());
  if (!codec) throw new Error('this browser cannot encode H.264');
  await warmBoardArt(o.art ?? (await loadBoardArtUrls()));
  if (o.signal?.aborted) return null;

  const frames = motionFrames(o.model);
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  // The beat's still picture, painted once and reused under each moving frame of that beat.
  const cache = { canvas: document.createElement('canvas'), index: null as number | null };
  cache.canvas.width = VIDEO_W;
  cache.canvas.height = VIDEO_H;

  const started = performance.now();
  let paintMs = 0;
  const samples: Mp4Sample[] = [];
  let avcC: Uint8Array | null = null;
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const description = meta?.decoderConfig?.description;
      if (description && !avcC) {
        avcC = description instanceof ArrayBuffer
          ? new Uint8Array(description.slice(0))
          : new Uint8Array((description as ArrayBufferView).buffer.slice(
              (description as ArrayBufferView).byteOffset,
              (description as ArrayBufferView).byteOffset + (description as ArrayBufferView).byteLength,
            ));
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, timestamp: chunk.timestamp, duration: chunk.duration ?? 0, key: chunk.type === 'key' });
    },
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config(codec) as VideoEncoderConfig);

  // Durations come from the plan, not the encoder: a held still keeps its full length.
  const planned = new Map<number, number>();
  let lastKey = -Infinity;
  try {
    for (let i = 0; i < frames.length; i++) {
      if (o.signal?.aborted) break;
      if (failure) throw failure;
      const f = frames[i]!;
      const p0 = performance.now();
      paintMotionFrameCached(canvas, o.model, f, cache);
      paintMs += performance.now() - p0;
      const timestamp = f.at * 1000;
      const duration = f.duration * 1000;
      const key = timestamp - lastKey >= KEY_EVERY_US;
      if (key) lastKey = timestamp;
      const vf = new VideoFrame(canvas, { timestamp, duration });
      encoder.encode(vf, { keyFrame: key });
      vf.close();
      planned.set(timestamp, duration);
      // Backpressure: never let a phone queue hundreds of 1080p pictures in memory.
      while (encoder.encodeQueueSize > 3 && !failure) await new Promise((r) => setTimeout(r, 4));
      if (i % 8 === 0) {
        o.onProgress?.(i / frames.length);
        // Yield so the page stays responsive (the progress line repaints, Cancel can be pressed).
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (!o.signal?.aborted) await encoder.flush();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (o.signal?.aborted) return null;
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  if (!avcC || samples.length === 0) throw new Error('the encoder gave no video');
  // Keep the planned timing exactly (the encoder may drop a chunk's duration).
  samples.sort((a, b) => a.timestamp - b.timestamp);
  samples.forEach((s) => (s.duration = planned.get(s.timestamp) ?? s.duration));
  o.onProgress?.(1);
  const bytes = muxMp4({ width: VIDEO_W, height: VIDEO_H, avcC }, samples);
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'video/mp4' }),
    mime: 'video/mp4',
    ms: Math.round(performance.now() - started),
    width: VIDEO_W,
    height: VIDEO_H,
    painted: frames.length,
    paintMs: Math.round(paintMs),
  };
};
