// THE VIDEO EXPORT (owner brief, 2026-10-26): what the file is and when each picture goes on it.
// The recording itself needs a browser; everything this suite pins is pure, so it can be proved
// without one: the frames are the replay's own frames, the timeline adds up to `totalMs`, the file
// is named after the winner and the score, and the container is chosen in a fixed order.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { buildReplay } from '../src/replay/timeline.js';
import type { ReplayInput } from '../src/replay/timeline.js';
import { posterFor, posterLayout } from '../src/replay/poster.js';
import { videoFrameData, videoLayoutAt, videoPlan, videoTurn } from '../src/replay/frames.js';
import { durationLabel, pickVideoMime, shareOrSaveVideo, videoExtension, videoFile, videoFileName } from '../src/replay/video.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;
const REAL_ACTIONS: Action[] = [
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 69, coord: { q: -1, r: 1 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 18 },
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 7, coord: { q: 1, r: -2 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 1 },
  { t: 'Draw', from: 'deck' },
  { t: 'Bloom', cards: [13, 49, 66], hexes: [{ q: 0, r: 0 }, { q: 1, r: -2 }, { q: 1, r: -1 }] },
  { t: 'Bloom', cards: [39, 41, 42], hexes: [{ q: 2, r: -3 }, { q: 3, r: -3 }, { q: 3, r: -2 }] },
  { t: 'Sprout', card: 9, coord: { q: 2, r: -1 } },
];
const input = (over: Partial<ReplayInput> = {}): ReplayInput => ({
  seed: 234_649_283,
  rulesVersion: CURRENT_RULES_VERSION,
  config: CONFIG,
  startingPlayer: 0,
  actions: REAL_ACTIONS,
  names: ['RYK', 'JadeBadger'],
  ...over,
});

describe('the replay video', () => {
  it('is the replay, to the millisecond: every beat, then the end hold', () => {
    const model = buildReplay(input());
    const plan = videoPlan(model);
    expect(plan.totalMs).toBe(model.totalMs);
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1350);
    // One painted position per beat, plus the result resting at the end.
    expect(plan.steps).toHaveLength(model.frames.length + 1);
    // The beats keep the timeline's own start times and durations: nothing is re-timed.
    model.frames.forEach((frame, i) => {
      expect(plan.steps[i]).toEqual({ index: i, at: frame.at, duration: frame.duration, end: false });
    });
    // The last picture starts when the board stops moving and lasts exactly the replay's end hold,
    // so the painted timeline adds up to the replay's own length.
    const last = plan.steps.at(-1)!;
    expect(last.end).toBe(true);
    expect(last.at).toBe(model.frames.at(-1)!.at + model.frames.at(-1)!.duration);
    expect(last.duration).toBe(model.endHold);
    expect(last.at + last.duration).toBe(model.totalMs);
    // And the gaps between pictures are exactly the beats' own holds: no sampling, no duplicates.
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i]!.at).toBe(plan.steps[i - 1]!.at + plan.steps[i - 1]!.duration);
    }
  });

  it('paints frame N: that beat’s own board, score and turn', () => {
    const model = buildReplay(input());
    const plan = videoPlan(model);
    for (const step of plan.steps) {
      const data = videoFrameData(model, step.index);
      const frame = model.frames[step.index];
      expect(data.board).toBe(frame ? frame.board : model.from.board);
      expect(data.score).toEqual(frame ? frame.scores : model.from.scores);
      // The board the frame paints is the beat's board, tile for tile: owner, strength and root.
      const cells = new Map(videoLayoutAt(model, step).board.cells.map((cell) => [cell.key, cell]));
      const board = frame ? frame.board : model.from.board;
      for (const [key, tile] of Object.entries(board)) {
        const cell = cells.get(key);
        expect(cell, `cell ${key} at step ${step.index}`).toBeDefined();
        expect([cell!.owner, cell!.strength, cell!.root]).toEqual([tile ? tile.owner : null, tile ? tile.strength : 0, !!tile?.root]);
      }
      // Every cell of the shape is laid out, so the board never loses its empty hexes.
      expect(cells.size).toBe(data.coords.length);
    }
  });

  it('uses the poster’s own geometry, so the still and the video cannot drift apart', () => {
    const model = buildReplay(input());
    const plan = videoPlan(model);
    const still = posterLayout(posterFor(model));
    const final = videoLayoutAt(model, plan.steps.at(-1)!);
    expect(final.board.hex).toBe(still.board.hex);
    expect(final.board.cells).toEqual(still.board.cells);
    // The frame's board is the same board the poster carries, in the same screen coordinates.
    expect(videoFrameData(model, plan.steps.at(-1)!.index).board).toEqual(posterFor(model).board);
  });

  it('says whose turn each frame is, and the result on the final hold', () => {
    const model = buildReplay(input());
    const plan = videoPlan(model);
    plan.steps.slice(0, -1).forEach((step) => {
      const frame = model.frames[step.index]!;
      expect(videoTurn(model, step)).toEqual({ text: `${model.names[frame.turn]} to move`, seat: frame.turn });
    });
    const end = videoTurn(model, plan.steps.at(-1)!);
    expect(end.seat).toBeNull();
    expect(end.text).toBe(model.result?.title ?? `${model.names[model.from.turn]} to move`);
  });

  it('names the file after the winner and the score, with the container it actually got', () => {
    const model = buildReplay(input());
    const data = posterFor(model);
    expect(videoFileName(data, 'video/webm;codecs=vp9')).toBe('futasaku-ryk-9-0.webm');
    expect(videoFileName(data, 'video/webm')).toBe('futasaku-ryk-9-0.webm');
    expect(videoFileName(data, 'video/mp4')).toBe('futasaku-ryk-9-0.mp4');
    expect(videoExtension('video/mp4;codecs=avc1')).toBe('mp4');
    const draw = buildReplay(input({ actions: REAL_ACTIONS.slice(0, 5), result: { winner: null, scores: [4, 4] } }));
    expect(videoFileName(posterFor(draw), 'video/webm')).toBe('futasaku-draw-4-4.webm');
    const decorated = buildReplay(input({ names: ['  RYK ✦ #12  ', 'Jade/Badger'] }));
    expect(videoFileName(posterFor(decorated), 'video/webm')).toMatch(/^futasaku-[a-z0-9-]+-9-0\.webm$/);
  });

  it('takes the best container the browser admits to', () => {
    const all = () => true;
    expect(pickVideoMime(all)).toBe('video/webm;codecs=vp9');
    expect(pickVideoMime((t) => t !== 'video/webm;codecs=vp9')).toBe('video/webm;codecs=vp8');
    expect(pickVideoMime((t) => t === 'video/mp4')).toBe('video/mp4');
    expect(pickVideoMime(() => false)).toBeNull();
    // Asked in a fixed order, once each: no browser sniffing, no guessing at codec support.
    const asked: string[] = [];
    pickVideoMime((t) => (asked.push(t), false));
    expect(asked).toEqual(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']);
  });

  it('speaks the recording’s progress in seconds, not milliseconds', () => {
    expect(durationLabel(0)).toBe('0s');
    expect(durationLabel(12_400)).toBe('12s');
    expect(durationLabel(59_600)).toBe('1m 00s');
    expect(durationLabel(65_000)).toBe('1m 05s');
    expect(durationLabel(-5)).toBe('0s');
  });

  it('records a replay with no beats at all as one held picture', () => {
    const model = buildReplay(input({ actions: [] }));
    const plan = videoPlan(model);
    expect(model.frames).toHaveLength(0);
    expect(plan.steps).toEqual([{ index: -1, at: 0, duration: model.totalMs, end: true }]);
    expect(plan.steps[0]!.at + plan.steps[0]!.duration).toBe(model.totalMs);
    const data = videoFrameData(model, -1);
    expect(data.board).toEqual(model.from.board);
  });

  it('hands the phone one File, named and typed like the file it is', () => {
    const model = buildReplay(input());
    const file = videoFile(
      { blob: new Blob([new Uint8Array(1024)], { type: 'video/webm;codecs=vp9' }), mime: 'video/webm;codecs=vp9', ms: 1, width: 1080, height: 1350, painted: 2 },
      posterFor(model),
    );
    expect(file.name).toBe('futasaku-ryk-9-0.webm');
    expect(file.type).toBe('video/webm;codecs=vp9');
    expect(file.size).toBe(1024);
  });

  it('uses the share sheet when the phone takes a file, and never calls a dismissed sheet saved', async () => {
    const model = buildReplay(input());
    const video = { blob: new Blob([new Uint8Array(64)], { type: 'video/webm' }), mime: 'video/webm', ms: 1, width: 1080, height: 1350, painted: 2 };
    const shared: { files?: File[]; title?: string }[] = [];
    const nav = {
      canShare: (x: { files: File[] }) => x.files.length === 1 && x.files[0]!.name.endsWith('.webm'),
      share: async (x: { files?: File[]; title?: string }) => {
        shared.push(x);
      },
    };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
    try {
      expect(await shareOrSaveVideo(video, posterFor(model), 'FUTASAKU')).toBe('shared');
      expect(shared).toHaveLength(1);
      expect(shared[0]!.files![0]!.name).toBe('futasaku-ryk-9-0.webm');
      expect(shared[0]!.files![0]!.type).toBe('video/webm');
      expect(shared[0]!.title).toBe('FUTASAKU');
      // A dismissed sheet is not a saved file: the caller must not tell the player it was.
      nav.share = async () => {
        throw new Error('AbortError');
      };
      expect(await shareOrSaveVideo(video, posterFor(model), 'FUTASAKU')).toBe('cancelled');
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
    }
  });
});
