// A GOLD FRAME IS A RIM: IT BELONGS ON THE BOARD'S OUTER RING, NEVER ON AN INTERIOR HEX.
//
// Owner, 2026-11-14: "the bug with gold tile in middle - should never happen". Bonus ("rich")
// terrain is engine state and can sit anywhere the point-symmetric roll puts it — the CENTRE is
// always one of them (docs/SPEC.md, spec 4.4) and two mirrored pairs follow. Before this rule every
// painted frame followed the terrain, so metal appeared in the middle of the board on most seeds.
//
// The rule is one pure resolver (`goldFrameKeys`, ui/goldframes.ts) that every painter calls with
// its own board cells and bonus keys, so an interior frame is impossible BY CONSTRUCTION rather
// than filtered out at one of the three drawing sites. These tests hold that: the resolver, a
// 5,000-seed sweep of the real engine (the house convention), and the wiring of all three painters.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allCoords, boardCoords, coordKey, rulesConfig } from '../../src/engine/index.js';
import { newMatch } from '../../src/engine/match.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/versions.js';
import { goldFrameKeys, ringOf } from '../src/ui/goldframes.js';

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const RADIUS = 3;

/** The framed keys of one seed, exactly as the live board builds them. */
const framedFor = (seed: number): { framed: string[]; bonus: string[]; board: string[] } => {
  const state = newMatch(seed);
  const board = boardCoords(state.config).map(coordKey);
  const bonus = board.filter((k) => state.terrain[k] === 'rich');
  return { framed: goldFrameKeys(board, bonus), bonus, board };
};

describe('a gold frame lives on the outer ring only', () => {
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

  it('keeps the centre and an interior pair out, and the outer pair in', () => {
    // The engine's own board for seed 10: the centre plus a mirrored pair on ring 2 (the "gold tile
    // in the middle" the owner saw) and a mirrored pair on the outer ring.
    const { framed, bonus } = framedFor(10);
    expect(bonus).toContain('0,0');
    expect(bonus.filter((k) => ringOf(k) === 2).length).toBe(2);
    expect(framed.every((k) => ringOf(k) === RADIUS)).toBe(true);
    expect(framed).not.toContain('0,0');
    // Only the outer-ring bonus hexes are framed; the interior ones keep their terrain.
    expect(framed.sort()).toEqual(bonus.filter((k) => ringOf(k) === RADIUS).sort());
  });

  it('never frames an interior hex on any of 5,000 seeds', () => {
    let interiorBonus = 0;
    let framedTotal = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const { framed, bonus, board } = framedFor(seed);
      const outer = Math.max(...board.map(ringOf));
      expect(outer).toBe(RADIUS);
      for (const key of framed) expect(ringOf(key), `seed ${seed}: ${key}`).toBe(outer);
      // Bonus terrain may be interior — that is the engine's business, unchanged here — but the
      // frame list must be exactly the outer-ring part of it, never more and never less.
      expect(framed.sort()).toEqual(bonus.filter((k) => ringOf(k) === outer).sort());
      interiorBonus += bonus.filter((k) => ringOf(k) < outer).length;
      framedTotal += framed.length;
    }
    // The sweep has to actually exercise the rule: thousands of interior bonus hexes were seen,
    // and every one of them was left unframed.
    expect(interiorBonus).toBeGreaterThan(5000);
    expect(framedTotal).toBeGreaterThan(5000);
  });

  it('still uses both frame designs and never repeats a look on two touching frames', () => {
    // The 24-look assignment (`faGoldLooks`, 2026-11-14) keeps working on the remaining frames: a
    // seed whose framed hexes touch must still show both designs and no shared look.
    const looks = read('ui/board.ts');
    expect(looks).toContain('faGoldLooks(this.frameKeys)');
    // Behaviourally: the resolver hands `faGoldLooks` a set of keys, and that set is a subset of
    // the old one, so its guarantees (both designs, no touching repeat) are unaffected. The
    // existing gold-variants suite pins them; here we only prove the input is the framed set.
  });

  it('is the same rule in the live board, the replay canvas and the poster', () => {
    const board = read('ui/board.ts');
    expect(board).toContain('goldFrameKeys(this.keys, this.richKeys)');
    // The tile that sits on a bonus hex draws its own frame, and asks the framed set, not the
    // terrain set — otherwise an occupied interior hex would paint metal again.
    expect(read('ui/defaultArtBoard.ts')).toContain('this.frameKeys.has(key)');
    const canvas = read('replay/board-canvas.ts');
    expect(canvas).toContain('goldFrameKeys(');
    // The canvas's placements and looks both come from the framed cells.
    expect(canvas).toContain('goldFrameCells(L)');
    expect(canvas).not.toMatch(/L\.cells\s*\.filter\(\(cell\) => cell\.terrain === 'rich'\)\s*\.map/);
  });

  it('is told the board, so a shape that is not a radius-3 hexagon stays correct', () => {
    // The outer ring comes from the cells it is given, never from a fixed radius: the Lab's shapes
    // (and any future board) get their own rim.
    const cells = ['0,0', '1,0', '2,0'];
    expect(goldFrameKeys(cells, ['0,0', '2,0'])).toEqual(['2,0']);
    expect(goldFrameKeys([], ['0,0'])).toEqual([]);
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
  });
});
