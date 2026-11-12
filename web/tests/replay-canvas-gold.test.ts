// THE SHARE IMAGE AND VIDEO CARRY THE BONUS HEXES' GOLD FRAMES (owner, 2026-10-26). The replay screen
// draws a metal frame on every bonus ("rich") hex — the only thing that marks one in Futasaku — but
// the canvas painter behind the poster and the video drew none, so a shared picture showed a
// different board from the game. These pin the canvas frames to the live board's own geometry.
import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { S, SQ3 } from '../src/ui/geom.js';
import { goldFrameCrop } from '../src/ui/goldframes.js';
import { goldFramePlacements, GOLD_FRAME_PAD, loadBoardArtUrls, screenCoordsOf } from '../src/replay/board-canvas.js';
import type { BoardLayout } from '../src/replay/board-canvas.js';
import { buildReplay } from '../src/replay/timeline.js';
import { posterFor, posterLayout } from '../src/replay/poster.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;

describe('the canvas board\'s gold frames', () => {
  const model = buildReplay({
    seed: 234_649_283,
    rulesVersion: CURRENT_RULES_VERSION,
    config: CONFIG,
    startingPlayer: 0,
    actions: [{ t: 'Draw', from: 'deck' }],
    names: ['RYK', 'KAT-WHAT'],
  });
  const layout: BoardLayout = posterLayout(posterFor(model)).board;
  const rich = layout.cells.filter((c) => c.terrain === 'rich');

  it('places one frame on every bonus hex, and on nothing else', () => {
    expect(screenCoordsOf(model).length).toBe(layout.cells.length);
    expect(rich.length).toBeGreaterThan(0);
    const frames = goldFramePlacements(layout);
    expect(frames.map((f) => f.key).sort()).toEqual(rich.map((c) => c.key).sort());
  });

  it('is the live board\'s frame: same size around the hex, same atlas crop for that hex', () => {
    const k = layout.hex / S;
    for (const frame of goldFramePlacements(layout)) {
      const cell = rich.find((c) => c.key === frame.key)!;
      expect(frame.x).toBeCloseTo(cell.x, 6);
      expect(frame.y).toBeCloseTo(cell.y, 6);
      expect(frame.w).toBeCloseTo(S * 2.02 * k, 6);
      expect(frame.h).toBeCloseTo(S * SQ3 * 1.01 * k, 6);
      const crop = goldFrameCrop(frame.key);
      expect(frame.crop).toEqual({
        x: crop.x - GOLD_FRAME_PAD,
        y: crop.y - GOLD_FRAME_PAD,
        w: crop.w + GOLD_FRAME_PAD * 2,
        h: crop.h + GOLD_FRAME_PAD * 2,
      });
      expect(frame.occupied).toBe(cell.owner !== null);
    }
  });

  it('is handed the frame atlas with the rest of the board art', async () => {
    const art = await loadBoardArtUrls();
    expect(art?.gold).toBeTruthy();
  });
});
