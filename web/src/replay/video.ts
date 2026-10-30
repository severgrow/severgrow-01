// THE RECORDER (owner brief, 2026-10-26): the replay, recorded to a file the player can send.
//
// `canvas.captureStream(0)` plus `requestFrame()` per painted frame, so the video is exactly the
// frames the timeline planned — not whatever a busy tab happened to composite. MediaRecorder
// stamps each frame with the wall clock, so the frames are also paced to the model's own times:
// frame N goes on the canvas at its `at` and stays there for its `duration`. That is why a
// recording takes about as long as the replay itself; the UI says so instead of pretending.
//
// No dependency: the browser's own encoder, the best container it admits to supporting
// (VP9 → VP8 → WebM → MP4), and the same share-then-download rule the poster uses.
import { loadBoardArtUrls, warmBoardArt } from './board-canvas.js';
import type { BoardArt } from './board-canvas.js';
import { paintVideoFrame, videoPlan } from './frames.js';
import { replayFileBase } from './poster.js';
import type { PosterData } from './poster.js';
import type { ReplayModel } from './timeline.js';

/** In order of preference. VP9 is smallest; MP4 is what iOS Safari can record. */
export const VIDEO_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'] as const;

/** The first container this browser will actually record, or null when it can record none. */
export const pickVideoMime = (supported: (type: string) => boolean): string | null =>
  VIDEO_MIMES.find((mime) => supported(mime)) ?? null;

/** The file extension for a container the browser reported. */
export const videoExtension = (mime: string): string => (mime.includes('mp4') ? 'mp4' : 'webm');

/** "12s" / "1m 05s": how the recording's progress is spoken. Never a raw millisecond count. */
export const durationLabel = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
};

/** `futasaku-<winner>-<score>.webm` — the poster's own name, with the video's container. */
export const videoFileName = (d: PosterData, mime: string): string => `${replayFileBase(d)}.${videoExtension(mime)}`;

export type RecordVideoOptions = {
  model: ReplayModel;
  /** The board's pictures (the caller usually passes the module the on-screen board loaded). */
  art?: BoardArt | null;
  /** Aborting cancels the recording: the encoder is stopped and no file is produced. */
  signal?: AbortSignal;
  /** Called with how much of the replay has been recorded, and its whole length, in ms. */
  onProgress?: (doneMs: number, totalMs: number) => void;
  /** Tests may pin the container; players never do. */
  mimeType?: string;
};

export type RecordedVideo = {
  blob: Blob;
  /** The container the browser actually gave (reported in the UI and the file name). */
  mime: string;
  /** Wall-clock recording time; the file's own length is the model's `totalMs`. */
  ms: number;
  width: number;
  height: number;
  /** How many positions were painted into the encoder. */
  painted: number;
  /** Time spent painting pictures (the fast export reports it; the rest was the encoder). */
  paintMs?: number;
};

/** How far behind its own clock a recording may fall before it is called a failure. */
const STALL_FACTOR = 4;
const STALL_GRACE_MS = 15_000;

type CanvasTrack = MediaStreamTrack & { requestFrame?: () => void };

/**
 * Record the whole replay. Resolves to null when cancelled, and rejects (with a message the UI can
 * show) when this browser cannot record at all or the page stopped feeding the encoder.
 */
export const recordReplayVideo = async (o: RecordVideoOptions): Promise<RecordedVideo | null> => {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') {
    throw new Error('this browser cannot record video');
  }
  const mime = o.mimeType ?? pickVideoMime((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('this browser cannot record video');

  const plan = videoPlan(o.model);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('this browser cannot draw the video');

  await warmBoardArt(o.art ?? (await loadBoardArtUrls()));
  if (o.signal?.aborted) return null;

  // `captureStream(0)` means "only when I ask": one frame per painted position, frame-accurate.
  // A browser without `requestFrame` gets a timed stream instead, and the encoder samples it.
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0] as CanvasTrack | undefined;
  if (!track || typeof track.requestFrame !== 'function') {
    stream.getTracks().forEach((t) => t.stop());
    stream = canvas.captureStream(30);
    track = stream.getVideoTracks()[0] as CanvasTrack | undefined;
  }
  if (!track) throw new Error('this browser cannot capture the canvas');
  const requestFrame = () => track?.requestFrame?.();

  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('this browser cannot record video');
  }
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const encoded = new Promise<Blob | null>((resolve) => {
    recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mime })));
    recorder.addEventListener('error', () => resolve(null));
  });

  const startedAt = performance.now();
  let painted = 0;
  let next = 0;
  const paint = (index: number) => {
    paintVideoFrame(canvas, o.model, plan.steps[index]!);
    painted++;
    next = index + 1;
    requestFrame();
  };

  recorder.start();
  paint(0);

  let fell = false;
  await new Promise<void>((resolve) => {
    let raf = requestAnimationFrame(tick);
    function tick(): void {
      raf = 0;
      if (o.signal?.aborted) {
        resolve();
        return;
      }
      const t = performance.now() - startedAt;
      while (next < plan.steps.length && plan.steps[next]!.at <= t) paint(next);
      o.onProgress?.(Math.min(t, plan.totalMs), plan.totalMs);
      if (next >= plan.steps.length && t >= plan.totalMs) {
        resolve();
        return;
      }
      // A page that stops getting frames (a backgrounded tab) must not record forever, and must
      // not hand back a video with a frozen hole in it.
      if (t > plan.totalMs * STALL_FACTOR + STALL_GRACE_MS) {
        fell = true;
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    o.signal?.addEventListener(
      'abort',
      () => {
        if (raf) cancelAnimationFrame(raf);
        resolve();
      },
      { once: true },
    );
  });

  // THE LAST FRAME'S HOLD. MediaRecorder stamps a frame when it arrives and ends the file at the
  // LAST stamp, so the final picture would otherwise be worth nothing: the file would stop when the
  // result appeared and lose the replay's own end hold. One more request of the same final picture
  // at the end of the replay gives it its full duration, so the file's length is `totalMs`.
  if (!o.signal?.aborted && !fell) {
    paint(plan.steps.length - 1);
    await new Promise((done) => setTimeout(done, 90));
  }

  if (recorder.state !== 'inactive') recorder.stop();
  const blob = await encoded;
  stream.getTracks().forEach((t) => t.stop());
  const ms = Math.round(performance.now() - startedAt);
  if (o.signal?.aborted) return null;
  if (fell) throw new Error('the recording fell behind');
  if (!blob || blob.size === 0) return null;
  return { blob, mime, ms, width: plan.width, height: plan.height, painted };
};

/** A shareable file for the recording, named like the poster. */
export const videoFile = (video: RecordedVideo, d: PosterData): File =>
  new File([video.blob], videoFileName(d, video.mime), { type: video.mime });

/** The phone's share sheet when it can take a file; otherwise a plain download (as the poster). */
export const shareOrSaveVideo = async (
  video: RecordedVideo,
  data: PosterData,
  title: string,
): Promise<'shared' | 'saved' | 'cancelled'> => {
  const file = videoFile(video, data);
  const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  return saveVideo(video, data);
};

/** Save the file to the device (a plain download), never through the share sheet. */
export const saveVideo = (video: RecordedVideo, data: PosterData): 'saved' => {
  const file = videoFile(video, data);
  const url = URL.createObjectURL(video.blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
};
