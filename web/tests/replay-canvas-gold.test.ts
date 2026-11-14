// THE SHARE IMAGE AND VIDEO CARRY THE BONUS HEXES' GOLD FRAMES (owner, 2026-10-26). The replay screen
// draws a metal frame on the bonus ("rich") hexes — the only thing that marks one in Futasaku — but
// the canvas painter behind the poster and the video drew none, so a shared picture showed a
// different board from the game. These pin the canvas frames to the live board's own geometry.
//
// Since 2026-11-14 a frame is a RIM, so only the OUTER RING wears one ("the bug with gold tile in
// middle - should never happen"); interior bonus hexes keep their terrain and lose the metal. Both
// painters ask the same resolver (`goldFrameKeys`, ui/goldframes.ts), which is what these pin.
import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { boardCoords, coordKey } from '../../src/engine/index.js';
import { newMatch } from '../../src/engine/match.js';
import { S } from '../src/ui/geom.js';
import { faGoldLooks, goldLookId } from '../src/ui/forestAsh.js';
import { goldFrameSize } from '../src/ui/goldframe-geometry.js';
import { goldFrameCrop } from '../src/ui/goldframes.js';
import { goldFrameKeys } from '../src/ui/goldframes.js';
import { goldFramePlacements, GOLD_FRAME_PAD, goldVariantsOf, loadBoardArtUrls, screenCoordsOf } from '../src/replay/board-canvas.js';
import type { BoardLayout } from '../src/replay/board-canvas.js';
import { buildReplay } from '../src/replay/timeline.js';
import { posterFor, posterLayout } from '../src/replay/poster.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;
const SEED = 234_649_283;

describe('the canvas board\'s gold frames', () => {
  const model = buildReplay({
    seed: SEED,
    rulesVersion: CURRENT_RULES_VERSION,
    config: CONFIG,
    startingPlayer: 0,
    actions: [{ t: 'Draw', from: 'deck' }],
    names: ['RYK', 'KAT-WHAT'],
  });
  const layout: BoardLayout = posterLayout(posterFor(model)).board;
  const rich = layout.cells.filter((c) => c.terrain === 'rich');
  /** The cells the live board draws a frame on: the bonus hexes on the board's OUTER ring. */
  const framed = goldFrameKeys(layout.cells.map((c) => c.key), rich.map((c) => c.key));

  it('places one frame on every OUTER-RING bonus hex, and on nothing else', () => {
    expect(screenCoordsOf(model).length).toBe(layout.cells.length);
    expect(rich.length).toBeGreaterThan(0);
    expect(framed.length).toBeGreaterThan(0);
    const frames = goldFramePlacements(layout);
    expect(frames.map((f) => f.key).sort()).toEqual([...framed].sort());
    // And the point of the rule: no interior hex is ever among them (the centre is bonus terrain
    // on every board and must never wear metal).
    const frameset = new Set(framed);
    for (const cell of rich) {
      const ring = (() => { const [q, r] = cell.key.split(',').map(Number) as [number, number]; return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2; })();
      if (ring < 3) expect(frameset.has(cell.key), cell.key).toBe(false);
    }
  });

  it('is the live board\'s frame: same size around the hex, same atlas crop for that hex', () => {
    const k = layout.hex / S;
    const size = goldFrameSize();
    // The crop comes from the board's own look map (the same `faGoldLooks` the live board builds),
    // not from the key alone; a key-only crop is what these tests used to pin.
    const looks = goldVariantsOf(layout);
    for (const frame of goldFramePlacements(layout)) {
      const cell = rich.find((c) => c.key === frame.key)!;
      expect(frame.x).toBeCloseTo(cell.x, 6);
      expect(frame.y).toBeCloseTo(cell.y, 6);
      expect(frame.w).toBeCloseTo(size.width * k, 6);
      expect(frame.h).toBeCloseTo(size.height * k, 6);
      const crop = goldFrameCrop(looks, frame.key);
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

  it('wears the same look as the live board, key for key, and turns it the same way', () => {
    // The live board builds `faGoldLooks` from `boardCoords(config)` filtered to the framed cells —
    // the bonus hexes on the outer ring (ui/board.ts `setup`); the poster builds `goldVariantsOf`
    // from the layout's own cells. If these ever disagree, a replay would show a different frame
    // from the game it replays.
    const liveBoard = newMatch(SEED);
    const liveBoardKeys = boardCoords(liveBoard.config).map(coordKey);
    const liveKeys = goldFrameKeys(liveBoardKeys, liveBoardKeys.filter((k) => liveBoard.terrain[k] === 'rich'));
    const live = faGoldLooks(liveKeys);
    const replay = goldVariantsOf(layout);
    expect(replay.size).toBe(live.size);
    for (const [key, look] of live) expect(replay.get(key), key).toEqual(look);
    // The canvas placement carries that look: the id, the turn in radians and the mirror.
    for (const frame of goldFramePlacements(layout)) {
      const look = live.get(frame.key)!;
      expect(frame.variant).toBe(goldLookId(look));
      expect(frame.turn).toBeCloseTo((look.rotation * Math.PI) / 3, 12);
      expect(frame.mirror).toBe(look.mirror === 1);
      expect(frame.crop.w).toBeGreaterThan(0);
    }
  });
});
