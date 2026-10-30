// THE REPLAY AS A VIDEO (owner brief, 2026-10-26): "is it difficult to have a video export? …
// download the whole game". Whole replay, silent — a range is a later question.
//
// A video is the replay's OWN frames in order: nothing is invented here. `timeline.ts` already
// decided what each beat is and how long it is held; this module turns frame N into a canvas
// picture, and `video.ts` hands those pictures to the encoder. The picture itself is the poster's
// layout (the same names, score and board geometry) plus the replay's one-line turn read-out, which
// the poster leaves in the empty band above the board.
//
// The layout is a pure function of the model and a frame index, so a test can prove the frame at
// index N carries frame N's board — and that the timing matches `ReplayModel.totalMs` exactly.
import { drawReplayPoster, paintPosterCells, posterFor, posterLayout, POSTER_H, POSTER_W } from './poster.js';
import type { PosterData, PosterLayout, PosterTurn } from './poster.js';
import type { ReplayModel } from './timeline.js';
import type { Player, Tile } from '../../../src/engine/index.js';
import type { TileMotion } from './board-canvas.js';

/** The video keeps the poster's own 4:5 portrait frame, at the size a phone screen wants. */
export const VIDEO_W = POSTER_W;
export const VIDEO_H = POSTER_H;

/**
 * One painted position: when it goes on the canvas, and how long it stays there. `index` is the
 * timeline frame (or `-1` for the opening position of a replay with no beats), and `end` marks the
 * final hold, where the replay's surface shows the result instead of a turn.
 */
export type VideoStep = {
  index: number;
  /** Start from the first painted frame, in ms. */
  at: number;
  duration: number;
  end: boolean;
};

export type VideoPlan = {
  width: number;
  height: number;
  /** Exactly the replay's own `totalMs`: the video is the match, not a re-timing of it. */
  totalMs: number;
  steps: VideoStep[];
};

/**
 * The frames the recorder paints, in order. Beat i is painted at `frame.at` and held for its own
 * duration; after the last beat the result rests for the model's `endHold` (the replay's own final
 * hold), which makes the painted timeline add up to `totalMs` to the millisecond.
 */
export const videoPlan = (model: ReplayModel): VideoPlan => {
  const steps: VideoStep[] = model.frames.map((frame) => ({
    index: frame.index,
    at: frame.at,
    duration: frame.duration,
    end: false,
  }));
  const lastBeat = steps.at(-1);
  const holdStart = lastBeat ? lastBeat.at + lastBeat.duration : 0;
  const hold = Math.max(0, model.totalMs - holdStart);
  if (hold > 0) {
    steps.push({ index: lastBeat?.index ?? -1, at: holdStart, duration: hold, end: true });
  }
  return { width: VIDEO_W, height: VIDEO_H, totalMs: model.totalMs, steps };
};

/** The position a step paints: the beat's board and score, or the opening for an empty replay. */
export const videoFrameData = (model: ReplayModel, index: number): PosterData => {
  const base = posterFor(model);
  const frame = index >= 0 ? model.frames[index] : undefined;
  return {
    ...base,
    board: frame?.board ?? model.from.board,
    score: frame?.scores ?? model.from.scores,
  };
};

/**
 * The one line a video frame says: the result, on the final hold — and nothing before it. The video
 * is the replay screen recorded, and that screen no longer writes "… to move" (owner, 2026-10-26):
 * the board and the score tell the match, the result closes it.
 */
export const videoTurn = (model: ReplayModel, step: VideoStep): PosterTurn | undefined =>
  step.end && model.result ? { text: model.result.title, seat: null } : undefined;

/** Whose move a video picture shows (the pip in the score row), and whether it is the final hold. */
export const videoMoment = (model: ReplayModel, step: VideoStep): { live: Player | null; end: boolean } => ({
  live: step.end ? null : (model.frames[step.index]?.turn ?? null),
  end: step.end,
});

/** A pure, testable description of one video frame (identical geometry to the still poster). */
export const videoLayoutAt = (model: ReplayModel, step: VideoStep): PosterLayout => posterLayout(videoFrameData(model, step.index));

/** Paint one video frame onto a canvas. The same painter the still poster uses, by construction. */
export const paintVideoFrame = (
  canvas: HTMLCanvasElement,
  model: ReplayModel,
  step: VideoStep,
): HTMLCanvasElement => drawReplayPoster(videoFrameData(model, step.index), canvas, videoTurn(model, step), undefined, videoMoment(model, step));

// ---------- THE MOVING VIDEO (owner, 2026-10-30: "finish the replays … find a smart way to do it
// super nice") ----------
//
// The fast export encodes frames itself, so it is not limited to one still per beat: inside each
// beat the tiles it changed POP in, one after another in the beat's own reveal order (a Bloom grows
// outward from the hex it grows from), and the tiles it cut FADE out — the same motion the replay
// screen plays. A frame that nothing moves in is one long still, so a quiet stretch costs one
// picture, not thirty a second. Pure: a test can read every frame's board and motion.

/** The video's motion rate. Holds are single long frames; only motion is sampled this fast. */
export const VIDEO_FPS = 30;
/** One tile's pop (a little longer than the screen's 210 ms crossfade: a video has no second look). */
export const VIDEO_POP_MS = 300;
/** The longest wait between two tiles of one beat. */
const VIDEO_STAGGER_MS = 240;
/** How long a cut tile takes to go. */
const VIDEO_FADE_MS = 320;

export type MotionFrame = {
  /** The plan step this picture belongs to (for the end line and the score). */
  step: VideoStep;
  at: number;
  duration: number;
  /** The board to paint: tiles not yet arrived still show what was there before. */
  board: Record<string, Tile | null>;
  motion: Record<string, TileMotion>;
  /** A moving picture: the cells that change during its beat (the rest of the beat holds still). */
  keys?: string[];
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Arrival: a quick fade and a small overshoot that settles (0.86 → 1.04 → 1). */
const popAt = (p: number): TileMotion => ({
  alpha: clamp01(p / 0.55),
  scale: p < 0.7 ? 0.86 + (1.04 - 0.86) * (p / 0.7) : 1.04 - 0.04 * ((p - 0.7) / 0.3),
});

/** When each changed tile starts, inside its beat. */
const arrivals = (count: number, duration: number) => {
  const stagger = count > 1 ? Math.min(VIDEO_STAGGER_MS, (duration * 0.55) / (count - 1)) : 0;
  return { stagger, motionMs: Math.min(duration, (count - 1) * stagger + VIDEO_POP_MS) };
};

/** Every picture the fast export encodes, in order, covering exactly `0 … totalMs`. */
export const motionFrames = (model: ReplayModel, fps = VIDEO_FPS): MotionFrame[] => {
  const plan = videoPlan(model);
  const tick = 1000 / fps;
  const out: MotionFrame[] = [];
  for (const step of plan.steps) {
    const frame = step.index >= 0 && !step.end ? model.frames[step.index] : undefined;
    const after = videoFrameData(model, step.index).board;
    const still = (at: number, duration: number) => out.push({ step, at, duration, board: after, motion: {} });
    if (!frame || (!frame.changed.length && !frame.removed.length)) {
      still(step.at, step.duration);
      continue;
    }
    const before = step.index > 0 ? model.frames[step.index - 1]!.board : model.from.board;
    const { stagger, motionMs } = arrivals(frame.changed.length, step.duration);
    const fadeMs = Math.min(VIDEO_FADE_MS, step.duration * 0.6);
    const moving = Math.min(step.duration, Math.max(motionMs, frame.removed.length ? fadeMs : 0));
    const count = Math.max(1, Math.ceil(moving / tick));
    const moverKeys = [...new Set([...frame.changed, ...frame.removed])];
    for (let i = 0; i < count; i++) {
      const t = i * tick;
      const board: Record<string, Tile | null> = { ...after };
      const motion: Record<string, TileMotion> = {};
      frame.changed.forEach((key, order) => {
        const p = clamp01((t - order * stagger) / VIDEO_POP_MS);
        if (p <= 0) board[key] = before[key] ?? null;
        else if (p < 1) motion[key] = popAt(p);
      });
      const gone = clamp01(t / fadeMs);
      for (const key of frame.removed) {
        if (gone >= 1) continue;
        board[key] = before[key] ?? null;
        motion[key] = { alpha: 1 - gone, scale: 1 - 0.08 * gone };
      }
      const at = step.at + Math.round(t);
      const next = i + 1 < count ? step.at + Math.round((i + 1) * tick) : step.at + Math.round(moving);
      out.push({ step, at, duration: next - at, board, motion, keys: moverKeys });
    }
    if (step.duration - moving > 0) still(step.at + Math.round(moving), step.duration - Math.round(moving));
  }
  return onGrid(out, tick, plan.totalMs);
};

/**
 * Every picture starts on a whole 30 fps slot, so no two pictures ever share one and every player
 * and chat app sees a steady stream. Two pictures that land on the same slot keep the later one (the
 * further-along moment); the last picture still ends exactly at the replay's own length.
 */
const onGrid = (frames: MotionFrame[], tick: number, totalMs: number): MotionFrame[] => {
  const snapped: MotionFrame[] = [];
  for (const f of frames) {
    const at = Math.min(Math.round(Math.round(f.at / tick) * tick), totalMs);
    const prev = snapped.at(-1);
    if (prev && prev.at === at) snapped[snapped.length - 1] = { ...f, at };
    else snapped.push({ ...f, at });
  }
  snapped.forEach((f, i) => (f.duration = (snapped[i + 1]?.at ?? totalMs) - f.at));
  return snapped.filter((f) => f.duration > 0);
};

/**
 * Paint one moving frame fast: the beat's still picture (every moving cell bare) is painted once
 * into `cache`, then each frame is that picture plus only the cells in motion. The result is the
 * same picture `paintMotionFrame` paints, for a fraction of the work.
 */
export const paintMotionFrameCached = (
  canvas: HTMLCanvasElement,
  model: ReplayModel,
  f: MotionFrame,
  cache: { canvas: HTMLCanvasElement; index: number | null },
): HTMLCanvasElement => {
  if (!f.keys?.length) return paintMotionFrame(canvas, model, f);
  const data = { ...videoFrameData(model, f.step.index), board: f.board };
  if (cache.index !== f.step.index) {
    const bare = { ...f.board };
    for (const key of f.keys) bare[key] = null;
    drawReplayPoster({ ...data, board: bare }, cache.canvas, videoTurn(model, f.step), undefined, videoMoment(model, f.step));
    cache.index = f.step.index;
  }
  if (canvas.width !== cache.canvas.width) canvas.width = cache.canvas.width;
  if (canvas.height !== cache.canvas.height) canvas.height = cache.canvas.height;
  const g = canvas.getContext('2d')!;
  g.drawImage(cache.canvas, 0, 0);
  paintPosterCells(data, canvas, new Set(f.keys), f.motion);
  return canvas;
};

/** Paint one moving frame (the same painter as every other picture of the match). */
export const paintMotionFrame = (canvas: HTMLCanvasElement, model: ReplayModel, f: MotionFrame): HTMLCanvasElement =>
  drawReplayPoster({ ...videoFrameData(model, f.step.index), board: f.board }, canvas, videoTurn(model, f.step), f.motion, videoMoment(model, f.step));
