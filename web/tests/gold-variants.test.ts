// BOTH GOLD FRAME DESIGNS, ONE PER BONUS HEX (owner, 2026-11-14: "make sure we use both gold tile
// frames - both design randonly assign, when possible not 2 the same next to each other"). The design
// is a property of the BOARD, not of a key: the live board, the replay canvas and the poster all
// build this one map from the board's own gold keys, so a replay cannot show a different frame from
// the game it replays. These pin the resolver's four promises: deterministic, both designs used,
// no avoidable neighbour clash, and a fixed fallback where two designs cannot cover the board.
import { describe, expect, it } from 'vitest';
import { allNeighbors, coordKey, parseKey } from '../../src/engine/index.js';
import { FA_GOLD_BOXES, faGoldVariants } from '../src/ui/forestAsh.js';
import { GOLD_FRAME_VARIANTS, goldFrameBox, goldFrameCrop } from '../src/ui/goldframes.js';

const adjacent = (a: string, b: string): boolean =>
  allNeighbors(parseKey(a)).some((n) => coordKey(n) === b);

const clashes = (looks: ReadonlyMap<string, number>, keys: readonly string[]): number => {
  let n = 0;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      if (adjacent(keys[i]!, keys[j]!) && looks.get(keys[i]!) === looks.get(keys[j]!)) n++;
  return n;
};

describe('the gold frames\' per-board designs', () => {
  it('picks from the atlas\'s two designs and is deterministic, whatever order the keys arrive in', () => {
    expect(GOLD_FRAME_VARIANTS).toBe(2);
    expect(FA_GOLD_BOXES.length).toBe(2);
    const keys = ['0,0', '1,0', '2,-1', '0,1', '-1,1', '3,-1'];
    const a = faGoldVariants(keys);
    const b = faGoldVariants([...keys].reverse());
    expect([...a.entries()]).toEqual([...b.entries()]);
    for (const v of a.values()) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(2); }
  });

  it('never puts the same design on two touching hexes, and uses both designs', () => {
    // Two separate chains: a bipartite gold set, so a clash here would be avoidable.
    const keys = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,2', '1,2', '2,2'];
    const looks = faGoldVariants(keys);
    expect(clashes(looks, keys)).toBe(0);
    expect(new Set(looks.values()).size).toBe(2);
  });

  it('uses both designs even when no two gold hexes touch', () => {
    // The greedy pass alone could leave two scattered hexes on the same design; the second one is
    // moved to the other, and because nothing touches it that cannot clash with anything.
    const keys = ['0,0', '4,0'];
    expect(adjacent(keys[0]!, keys[1]!)).toBe(false);
    const looks = faGoldVariants(keys);
    expect(new Set(looks.values()).size).toBe(2);
    expect(clashes(looks, keys)).toBe(0);
  });

  it('accepts one clash only where two designs cannot cover the gold set (a triangle)', () => {
    // Three mutually touching hexes need three designs; with two the third repeats one of them.
    const keys = ['0,0', '1,0', '1,-1'];
    expect(clashes(faGoldVariants(keys), keys)).toBe(1);
    // The fallback is fixed, not random.
    expect([...faGoldVariants(keys).entries()]).toEqual([...faGoldVariants(keys).entries()]);
  });

  it('is the same map whether the caller lists the board\'s gold keys or a subset in another order', () => {
    // The live board and the replay build their list from their own cell order; the assignment
    // follows the cells' own coordinates, so both must agree key for key.
    const keys = ['-1,0', '0,0', '1,0', '0,1', '1,-1'];
    const live = faGoldVariants(keys);
    const replay = faGoldVariants([...keys].sort());
    for (const key of keys) expect(replay.get(key)).toBe(live.get(key));
  });

  it('crops a frame from the board map, and refuses a key the board does not have', () => {
    const looks = faGoldVariants(['0,0', '1,0']);
    for (const [key, variant] of looks) {
      const crop = goldFrameCrop(looks, key);
      expect(crop.variant).toBe(variant);
      expect([crop.x, crop.y, crop.w, crop.h]).toEqual(FA_GOLD_BOXES[variant]);
    }
    // No silent key-only fallback: a caller holding a board must have built the map from it.
    expect(() => goldFrameCrop(looks, '9,9')).toThrow(/not on this board/);
    // The explicit no-board path (the Art Lab exports both designs) never needs a key.
    expect(goldFrameBox(0).variant).toBe(0);
    expect(goldFrameBox(1).variant).toBe(1);
    expect(goldFrameBox(0)).not.toEqual(goldFrameBox(1));
  });
});
