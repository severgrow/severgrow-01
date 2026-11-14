// THE GOLD FRAMES' LOOKS, ONE PER BONUS HEX (owner, 2026-11-14: "make sure we use both gold tile
// frames - both design randonly assign, when possible not 2 the same next to each other", then
// "cheaply use rotation for the gold tiles - so they can be mirrored or upside down - for variety").
// A look is (design, rotation, mirror) = 2 x 6 x 2 = 24, all the same hex-shaped crop turned or
// mirrored, so no art is added and no geometry moves. The look is a property of the BOARD, not of a
// key: the live board, the replay canvas and the poster all build this one map from the board's own
// gold keys, so a replay cannot show a different frame from the game it replays. These pin the
// resolver's promises: deterministic, neighbour-aware across the WHOLE look, both designs used, and
// an explicit no-board path instead of a silent key-only fallback.
import { describe, expect, it } from 'vitest';
import { allNeighbors, coordKey, parseKey } from '../../src/engine/index.js';
import { FA_GOLD_BOXES, faGoldLooks, goldLookId, goldLookOfId, GOLD_LOOK_COUNT, GOLD_LOOKS_PER_DESIGN } from '../src/ui/forestAsh.js';
import type { GoldLook } from '../src/ui/forestAsh.js';
import { goldFrameBox, goldFrameCrop, goldLookTransform } from '../src/ui/goldframes.js';

const adjacent = (a: string, b: string): boolean =>
  allNeighbors(parseKey(a)).some((n) => coordKey(n) === b);

/** Pairs of touching gold hexes that wear the same look (the whole tuple, not just the design). */
const clashes = (looks: ReadonlyMap<string, GoldLook>, keys: readonly string[]): number => {
  let n = 0;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      if (adjacent(keys[i]!, keys[j]!) && goldLookId(looks.get(keys[i]!)!) === goldLookId(looks.get(keys[j]!)!)) n++;
  return n;
};

describe('the gold frames\' looks', () => {
  it('has 24 looks: two designs, six turns, plain or mirrored', () => {
    expect(GOLD_LOOK_COUNT).toBe(24);
    expect(GOLD_LOOKS_PER_DESIGN).toBe(12);
    expect(FA_GOLD_BOXES.length * 6 * 2).toBe(GOLD_LOOK_COUNT);
    // The id round-trips, and every id is a different look.
    const seen = new Set<string>();
    for (let id = 0; id < GOLD_LOOK_COUNT; id++) {
      const look = goldLookOfId(id);
      expect(goldLookId(look)).toBe(id);
      expect(look.design).toBeGreaterThanOrEqual(0);
      expect(look.design).toBeLessThan(FA_GOLD_BOXES.length);
      expect(look.rotation).toBeGreaterThanOrEqual(0);
      expect(look.rotation).toBeLessThan(6);
      seen.add(`${look.design}/${look.rotation}/${look.mirror}`);
    }
    expect(seen.size).toBe(GOLD_LOOK_COUNT);
  });

  it('is deterministic, and follows the hexes rather than the order the caller lists them in', () => {
    const keys = ['0,0', '1,0', '2,-1', '0,1', '-1,1', '3,-1'];
    const a = faGoldLooks(keys);
    const b = faGoldLooks([...keys].reverse());
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('never puts the same look on two touching hexes, and uses both designs', () => {
    const keys = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,2', '1,2', '2,2'];
    const looks = faGoldLooks(keys);
    expect(clashes(looks, keys)).toBe(0);
    expect(new Set([...looks.values()].map((l) => l.design)).size).toBe(2);
  });

  it('solves a triangle: the case two designs could not cover', () => {
    // Three mutually touching hexes force a repeat with two designs; with 24 looks none is forced.
    const keys = ['0,0', '1,0', '1,-1'];
    const looks = faGoldLooks(keys);
    expect(clashes(looks, keys)).toBe(0);
    expect(new Set([...looks.values()].map(goldLookId)).size).toBe(3);
  });

  it('uses both designs even when every hex would otherwise wear design 1', () => {
    // Found by scanning key sets: with the greedy pass alone these four came out all design 1
    // (ids 13, 19, 19, 23). The resolver moves one hex to the other design, and because it takes a
    // look no neighbour wears, the move cannot introduce a clash either.
    const keys = ['-1,-2', '-2,-1', '1,-1', '-3,0'];
    const looks = faGoldLooks(keys);
    expect(new Set([...looks.values()].map((l) => l.design)).size).toBe(2);
    expect(clashes(looks, keys)).toBe(0);
  });

  it('spreads the turns and mirrors, so the board does not read as one frame repeated', () => {
    const keys = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,2', '1,2', '2,2'];
    const looks = [...faGoldLooks(keys).values()];
    expect(new Set(looks.map((l) => l.rotation)).size).toBeGreaterThan(1);
    expect(new Set(looks.map((l) => `${l.rotation}/${l.mirror}`)).size).toBeGreaterThan(3);
  });

  it('turns the same crop without changing the frame\'s geometry', () => {
    // The look is a matrix about the hex centre, and only the orientation differs: one crop per
    // design, so width, height and the box never move.
    const looks = faGoldLooks(['0,0', '1,0', '2,0', '3,0']);
    for (const [key, look] of looks) {
      const crop = goldFrameCrop(looks, key);
      expect([crop.x, crop.y, crop.w, crop.h]).toEqual(FA_GOLD_BOXES[look.design]);
      expect([crop.design, crop.rotation, crop.mirror]).toEqual([look.design, look.rotation, look.mirror]);
      // A look is a hexagon symmetry: its matrix has a determinant of +-1, no scale, and it holds
      // the cell's centre still (a turn must never move the frame off its hex).
      const m = /^matrix\(([^)]+)\)$/.exec(goldLookTransform(look, 10, 20, false));
      if (m) {
        const [a, b, third, d, e, f] = m[1]!.split(' ').map(Number) as [number, number, number, number, number, number];
        expect(Math.abs(a * d - b * third)).toBeCloseTo(1, 5);
        expect(Math.hypot(a, b)).toBeCloseTo(1, 4);
        expect(a * 10 + third * 20 + e).toBeCloseTo(10, 4);
        expect(b * 10 + d * 20 + f).toBeCloseTo(20, 4);
      }
    }
    // The plain upright frame on a flat board needs no transform at all.
    expect(goldLookTransform({ design: 0, rotation: 0, mirror: 0 }, 10, 20, false)).toBe('');
    // Pointy boards still get their -30 degree alignment, as before.
    expect(goldLookTransform({ design: 0, rotation: 0, mirror: 0 }, 10, 20, true)).toMatch(/^matrix\(/);
  });

  it('crops a frame from the board map, and refuses a key the board does not have', () => {
    const looks = faGoldLooks(['0,0', '1,0']);
    for (const key of looks.keys()) expect(goldFrameCrop(looks, key).design).toBe(looks.get(key)!.design);
    // No silent key-only fallback: a caller holding a board must have built the map from it.
    expect(() => goldFrameCrop(looks, '9,9')).toThrow(/not on this board/);
    // The explicit no-board path (the Art Lab exports both designs) never needs a key.
    expect(goldFrameBox(0).design).toBe(0);
    expect(goldFrameBox(1).design).toBe(1);
    expect([goldFrameBox(0).x, goldFrameBox(0).y]).not.toEqual([goldFrameBox(1).x, goldFrameBox(1).y]);
    expect(goldFrameBox(0).rotation).toBe(0);
    expect(goldFrameBox(0).mirror).toBe(0);
  });
});
