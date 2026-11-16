// EVERY BONUS HEX WEARS A GOLD FRAME — the centre included. (This file used to be
// `gold-outer-ring.test.ts`, and it asserted the opposite; see the note at the bottom of this
// header for why it was wrong.)
//
// Owner, 2026-11-16: "i don't get what the issue is. every 'gold tile' is getting one of the gold
// tile frames we prepared and that's it". A bonus ("rich") hex is engine terrain — the centre plus
// two mirrored pairs, `richCount: 5` in the rules config — and every one of them scores 2
// (src/engine/scoring.ts). A bonus hex wearing no frame is therefore a double-scoring tile with no
// mark, which is the defect he reported. The frame is the ONLY thing on the board that says "2".
//
// WHAT THIS FILE USED TO ASSERT (and must never assert again): that the resolver returned only the
// bonus hexes on the board's OUTERMOST ring, and that 5,000 seeds produced ZERO interior frames.
// That encoded a misreading of his 2026-11-14 note "the bug with gold tile in middle - should never
// happen", which was about metal painted at the WRONG PLACE (loose frames in the middle), not about
// interior bonus hexes. Inverting the assertion — every bonus key is framed, at every seed — keeps
// the same 5,000-seed coverage and now proves the corrected rule.
//
// The rule stays one pure resolver (`goldFrameKeys`, ui/goldframes.ts) that every painter calls with
// its own board cells and bonus keys, so the live board, the replay canvas and the poster cannot
// disagree, and the engine's terrain is untouched by this drawing rule.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allCoords, boardCoords, coordKey, rulesConfig } from '../../src/engine/index.js';
import { newMatch } from '../../src/engine/match.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/versions.js';
import { generateTerrain } from '../../src/engine/terrain.js';
import { goldFrameKeys, ringOf } from '../src/ui/goldframes.js';
import { goldFrameSize, goldFrameFit, goldPaintedReach } from '../src/ui/goldframe-geometry.js';
import { cornerPts, setBoardBulge } from '../src/ui/geom.js';
import { setOrient, setRotation } from '../src/logic/orient.js';
import { GOLD_LOOK_COUNT, goldLookOfId } from '../src/ui/forestAsh.js';

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const RADIUS = 3;

/** The framed keys of one seed, exactly as the live board builds them. */
const framedFor = (seed: number): { framed: string[]; bonus: string[]; board: string[] } => {
  const state = newMatch(seed);
  const board = boardCoords(state.config).map(coordKey);
  const bonus = board.filter((k) => state.terrain[k] === 'rich');
  return { framed: goldFrameKeys(board, bonus), bonus, board };
};

describe('every bonus hex wears a gold frame', () => {
  it('measures the ring of a key: the board\'s centre is 0, its outer ring is the radius', () => {
    expect(ringOf('0,0')).toBe(0);
    expect(ringOf('1,0')).toBe(1);
    expect(ringOf('0,-2')).toBe(2);
    expect(ringOf('3,0')).toBe(RADIUS);
    expect(ringOf('-3,1')).toBe(RADIUS);
    expect(ringOf('2,-3')).toBe(RADIUS);
    // Every cell of a radius-3 board is 3 rings or less, and the outer ring has 18 cells.
    const board = allCoords(RADIUS).map(coordKey);
    expect(Math.max(...board.map(ringOf))).toBe(RADIUS);
    expect(board.filter((k) => ringOf(k) === RADIUS).length).toBe(18);
  });

  it('frames the centre and an interior pair as well as the outer pair', () => {
    // The engine's own board for seed 10: the centre plus a mirrored pair on ring 2 and a mirrored
    // pair on the outer ring. ALL FIVE wear a frame now — the interior two are the ones the old
    // rule left bare while they still scored 2.
    const { framed, bonus } = framedFor(10);
    expect(bonus).toHaveLength(5);
    expect(bonus).toContain('0,0');
    expect(bonus.filter((k) => ringOf(k) === 2)).toHaveLength(2);
    expect(framed.sort()).toEqual([...bonus].sort());
    expect(framed).toContain('0,0');
    expect(framed.filter((k) => ringOf(k) === 2)).toHaveLength(2);
  });

  it('never leaves a bonus hex unframed on any of 5,000 seeds', () => {
    let interiorBonus = 0;
    let framedTotal = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const { framed, bonus, board } = framedFor(seed);
      const outer = Math.max(...board.map(ringOf));
      expect(outer).toBe(RADIUS);
      // THE RULE, INVERTED FROM THIS FILE'S OLD ASSERTION: the framed set is the WHOLE bonus set,
      // at every seed — no ring filter, nothing left out, nothing invented.
      expect(framed.sort(), `seed ${seed}`).toEqual([...bonus].sort());
      interiorBonus += bonus.filter((k) => ringOf(k) < outer).length;
      framedTotal += framed.length;
    }
    // The sweep has to actually exercise the rule: thousands of INTERIOR bonus hexes were framed.
    // (Under the old assertion this same counter proved they were all left bare.)
    expect(interiorBonus).toBeGreaterThan(5000);
    expect(framedTotal).toBeGreaterThan(interiorBonus);
  });

  it('puts every frame inside its own hex, interior and rim alike (all 24 looks)', () => {
    // The containment rule came with the 2026-11-15 fix and is unchanged: a frame is sized to the
    // smallest boundary of its own hexagon (`goldFrameFit`) and clipped to `hexPath(key, S)`. An
    // interior frame must be contained exactly as an edge frame is — being surrounded by land is no
    // licence to paint over a seam either. The board orientation is pinned first: `cornerPts` reads
    // it (and the module's initial state, before the page has set one, is deliberately not a
    // geometry any board draws).
    setBoardBulge(null);
    setOrient('flat');
    setRotation(0);
    const pad = 6;
    for (const seed of [1, 10, 11, 99, 234_649_283]) {
      const { framed } = framedFor(seed);
      expect(framed.length).toBeGreaterThanOrEqual(5);
      for (const key of framed) {
        const cell = cornerPts(key, 30);
        const cx = cell.reduce((a, p) => a + p[0], 0) / cell.length;
        const cy = cell.reduce((a, p) => a + p[1], 0) / cell.length;
        const size = goldFrameSize();
        const painted = (size.width / 2) * (600 / (600 + pad * 2));
        // Flat product board: the fit trims nothing, so the art keeps its built-in 5% inset.
        expect(goldFrameFit(cell, cx, cy, painted), `${key}`).toBe(1);
        // …and every point of the art's painted outline (its own hexagon, plus the measured
        // overhang of the hand-painted edge) still lands inside the hex the board draws. Same ruler
        // as `web/tests/gold-frame-containment.test.ts`, run over the interior keys too.
        const radius = painted;
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const r = radius * goldPaintedReach(a);
          // inside a regular hexagon of circumradius 30: the boundary at this angle is
          // apothem / cos(angle to the nearest side's normal)
          const off = Math.abs((((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3)) - Math.PI / 6);
          const limit = (30 * Math.cos(Math.PI / 6)) / Math.cos(off);
          expect(r, `${key} at ${(a * 180 / Math.PI).toFixed(0)}deg`).toBeLessThanOrEqual(limit + 1e-9);
        }
        expect(GOLD_LOOK_COUNT).toBe(24);
        expect(goldLookOfId(23).rotation).toBe(5);
      }
    }
  });

  it('still uses both frame designs and never repeats a look on two touching frames', () => {
    // The 24-look assignment (`faGoldLooks`, 2026-11-14) now sees MORE keys than it used to (all
    // five bonus hexes), which can only give it more freedom; its guarantees are pinned by
    // `gold-variants.test.ts`. Here we prove the board hands it the framed set, not the terrain set.
    const board = read('ui/board.ts');
    expect(board).toContain('faGoldLooks(this.frameKeys)');
  });

  it('is the same rule in the live board, the replay canvas and the poster', () => {
    const board = read('ui/board.ts');
    expect(board).toContain('goldFrameKeys(this.keys, this.richKeys)');
    // ONE frame per bonus hex: the single `l-rich-frames` layer draws every one of them, empty or
    // occupied (`render`), so an occupied gold tile cannot wear a second, dimmer copy in `l-tiles`.
    expect(read('ui/defaultArtBoard.ts')).not.toContain('drawGoldFrame(');
    expect(board).toContain('drawGoldFrame(rich');
    // …and that layer is placed ABOVE every ground treatment and below the homes.
    const fa = read('ui/defaultArtBoard.ts');
    expect(fa).toContain('this.svg.insertBefore(this.layers.rich, turnRim ?? this.layers.homes)');
    const canvas = read('replay/board-canvas.ts');
    expect(canvas).toContain('goldFrameKeys(');
    // The canvas's placements and looks both come from the framed cells.
    expect(canvas).toContain('goldFrameCells(L)');
    expect(canvas).not.toMatch(/L\.cells\s*\.filter\(\(cell\) => cell\.terrain === 'rich'\)\s*\.map/);
    // The canvas paints them after the rocks and before the homes, like the live board.
    const rockPass = canvas.indexOf("cell.terrain === 'rock'");
    const framePass = canvas.indexOf('frame(cell.key)', rockPass);
    const homePass = canvas.indexOf('cell.owner === null || !cell.root', rockPass);
    expect(rockPass).toBeGreaterThan(0);
    expect(framePass).toBeGreaterThan(rockPass);
    expect(homePass).toBeGreaterThan(framePass);
  });

  it('is told the board, so a shape that is not a radius-3 hexagon stays correct', () => {
    // The cells come from the board it is given, never from a fixed radius or a hard-coded ring: the
    // Lab's shapes (and any future board) frame their own bonus hexes, wherever they sit.
    const cells = ['0,0', '1,0', '2,0'];
    expect(goldFrameKeys(cells, ['0,0', '2,0'])).toEqual(['0,0', '2,0']);
    expect(goldFrameKeys(cells, ['0,0', '9,9'])).toEqual(['0,0']); // not on this board: not framed
    expect(goldFrameKeys([], ['0,0'])).toEqual([]);
    expect(goldFrameKeys(cells, [])).toEqual([]);
  });
});

describe('the bonus terrain itself is untouched', () => {
  it('still rolls the centre plus two mirrored pairs, on the same seeds as the spec', () => {
    // This rule is a drawing rule. Changing it must never change the game: the rich terrain that
    // scores 2 stays exactly where the engine put it (spec 4.4, point-symmetric).
    const config = rulesConfig(CURRENT_RULES_VERSION)!;
    expect(config.richCount).toBe(5);
    const { bonus } = framedFor(10);
    expect(bonus).toHaveLength(5);
    expect(bonus).toContain('0,0');
    // And the engine's terrain for a seed is byte-identical to the frame's own terrain roll.
    const terrain = generateTerrain(10, config);
    expect(Object.entries(terrain).filter(([, t]) => t === 'rich').map(([k]) => k).sort())
      .toEqual([...bonus].sort());
  });
});
