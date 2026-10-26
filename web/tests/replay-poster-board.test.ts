// THE POSTER DRAWS THE MATCH'S BOARD (owner, 2026-10-26: "the board should look just like in the
// game"). The share image used to lay its hexes out with its own pointy-top trigonometry, so it was
// a second, rotated convention: on the product channel — where the board is FLAT and turned so the
// homes sit on the centre line — every cell landed somewhere the match never puts it. It now takes
// its centres from the board's own mapping (`centerOf`), and this pins that: the poster's cells sit
// exactly where the live board puts them, in the live board's orientation.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { setOrient, setRotation } from '../src/logic/orient.js';
import { S, centerOf } from '../src/ui/geom.js';
import { buildReplay } from '../src/replay/timeline.js';
import type { ReplayInput } from '../src/replay/timeline.js';
import { posterFor, posterLayout } from '../src/replay/poster.js';

const CONFIG = rulesConfig(CURRENT_RULES_VERSION)!;
const ACTIONS: Action[] = [
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 69, coord: { q: -1, r: 1 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 18 },
  { t: 'Draw', from: 'deck' },
  { t: 'Sprout', card: 7, coord: { q: 1, r: -2 } },
  { t: 'EndAct' },
  { t: 'Discard', card: 1 },
];

const input: ReplayInput = {
  seed: 234_649_283,
  rulesVersion: CURRENT_RULES_VERSION,
  config: CONFIG,
  startingPlayer: 0,
  actions: ACTIONS,
  names: ['RYK', 'JadeBadger'],
};

/** The product channel's board: flat, turned so the two homes sit on the screen's centre line. */
const FLAT_ROTATION = 1;

describe('the replay poster board', () => {
  const restore = () => {
    setOrient('pointy');
    setRotation(0);
  };

  it('places every cell exactly where the live board does, in its orientation', () => {
    setOrient('flat');
    setRotation(FLAT_ROTATION);
    try {
      const layout = posterLayout(posterFor(buildReplay(input)));
      expect(layout.board.cells.length).toBeGreaterThan(0);
      // The poster keeps the board's shape up to one uniform scale and one translation: compare the
      // cells' offsets from their own middle, in board units, with `centerOf`'s.
      const centres = layout.board.cells.map((cell) => centerOf(cell.key));
      const mx = (Math.min(...centres.map((c) => c.x)) + Math.max(...centres.map((c) => c.x))) / 2;
      const my = (Math.min(...centres.map((c) => c.y)) + Math.max(...centres.map((c) => c.y))) / 2;
      const px = (Math.min(...layout.board.cells.map((c) => c.x)) + Math.max(...layout.board.cells.map((c) => c.x))) / 2;
      const py = (Math.min(...layout.board.cells.map((c) => c.y)) + Math.max(...layout.board.cells.map((c) => c.y))) / 2;
      const scale = layout.board.hex / S;
      layout.board.cells.forEach((cell, i) => {
        const want = centres[i]!;
        expect(cell.x - px).toBeCloseTo((want.x - mx) * scale, 0);
        expect(cell.y - py).toBeCloseTo((want.y - my) * scale, 0);
      });
    } finally {
      restore();
    }
  });

  it('keeps each cell terrain, so a bonus hex can carry its metal frame', () => {
    const layout = posterLayout(posterFor(buildReplay(input)));
    const rich = layout.board.cells.filter((cell) => cell.terrain === 'rich');
    // Futasaku's board always holds bonus hexes, and the frame is the only thing that marks one.
    expect(rich.length).toBeGreaterThan(0);
    // A cell is described by the match's board: its terrain never depends on who owns it.
    const final = buildReplay(input).frames.at(-1)!.board;
    for (const cell of layout.board.cells) {
      const tile = final[cell.key] ?? null;
      expect(cell.owner).toBe(tile ? tile.owner : null);
    }
  });
});
