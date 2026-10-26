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
import { drawReplayPoster, posterFor, posterLayout } from './poster.js';
import type { PosterData, PosterLayout, PosterTurn } from './poster.js';
import type { ReplayModel } from './timeline.js';

/** The video keeps the poster's own 4:5 portrait frame, at the size a phone screen wants. */
export const VIDEO_W = 1080;
export const VIDEO_H = 1350;

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

/** A pure, testable description of one video frame (identical geometry to the still poster). */
export const videoLayoutAt = (model: ReplayModel, step: VideoStep): PosterLayout => posterLayout(videoFrameData(model, step.index));

/** Paint one video frame onto a canvas. The same painter the still poster uses, by construction. */
export const paintVideoFrame = (
  canvas: HTMLCanvasElement,
  model: ReplayModel,
  step: VideoStep,
): HTMLCanvasElement => drawReplayPoster(videoFrameData(model, step.index), canvas, videoTurn(model, step));
