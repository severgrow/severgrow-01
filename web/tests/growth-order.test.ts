// BLOOM GROWTH ORDER (owner, 2026-10-30): "make the bloom tiles appear always in order coming from the
// tile that it's growing from". A Bloom's tiles are revealed as one walk outward from the hex that
// touches the player's network, never in card order.
import { describe, expect, it } from 'vitest';
import { growthOrder } from '../src/logic/growth-order.js';

const tile = (key: string, strength = 3) => ({ key, strength, replaced: false });
const keys = (list: { key: string }[]) => list.map((t) => t.key);

describe('growthOrder', () => {
  it('a straight run starts at the hex touching the network and walks away from it', () => {
    // Network: home at 0,0 and a tile at 1,0. The Bloom is the line 2,0 → 3,0 → 4,0, given back to front.
    const network = new Set(['0,0', '1,0']);
    const order = growthOrder([tile('4,0'), tile('2,0'), tile('3,0')], network, '0,0');
    expect(keys(order)).toEqual(['2,0', '3,0', '4,0']);
  });

  it('every next tile touches a tile already shown (one connected wave)', () => {
    const network = new Set(['0,0']);
    // A small cluster next to the home, given in a scrambled order.
    const bloom = ['2,-1', '1,0', '2,0', '1,1', '3,-1'];
    const order = keys(growthOrder(bloom.map((k) => tile(k)), network, '0,0'));
    expect(order[0]).toBe('1,0');
    const near = (a: string, b: string) => {
      const [aq, ar] = a.split(',').map(Number) as [number, number];
      const [bq, br] = b.split(',').map(Number) as [number, number];
      return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2 === 1;
    };
    order.forEach((key, i) => {
      if (i === 0) return;
      expect(order.slice(0, i).some((shown) => near(shown, key))).toBe(true);
    });
    expect([...order].sort()).toEqual([...bloom].sort());
  });

  it('when several hexes touch the network, it starts from the one nearest home', () => {
    // Network: home 0,0 plus a branch out to 0,3. The Bloom touches both 0,1 (by home) and 0,3.
    const network = new Set(['0,0', '0,1', '0,2', '0,3']);
    const order = keys(growthOrder([tile('1,3'), tile('1,2'), tile('1,1'), tile('1,0')], network, '0,0'));
    expect(order[0]).toBe('1,0');
    expect(order).toEqual(['1,0', '1,1', '1,2', '1,3']);
  });

  it('keeps every tile and its strength, and is stable for a single tile', () => {
    const network = new Set(['0,0']);
    expect(growthOrder([tile('1,0', 7)], network, '0,0')).toEqual([tile('1,0', 7)]);
    const order = growthOrder([tile('2,0', 5), tile('1,0', 2)], network, '0,0');
    expect(order).toEqual([tile('1,0', 2), tile('2,0', 5)]);
  });

  it('never drops a tile that is cut off from the rest (defensive: an old or odd record)', () => {
    const network = new Set(['0,0']);
    const order = keys(growthOrder([tile('5,5'), tile('1,0')], network, '0,0'));
    expect(order).toEqual(['1,0', '5,5']);
  });
});

describe('the replay pops a Grow in the same order', () => {
  it('revealOrder puts the step tiles first, in the step order, and keeps the rest after', async () => {
    const { revealOrder } = await import('../src/replay/timeline.js');
    expect(revealOrder(['9,9', '3,0', '1,0', '2,0'], ['1,0', '2,0', '3,0'])).toEqual(['1,0', '2,0', '3,0', '9,9']);
  });
});
