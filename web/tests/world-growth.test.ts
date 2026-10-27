// THE GROWING TERRITORY's page logic (owner, 2026-10-27): the fog beyond the coast, the ranking, the
// recent-activity strip, "find my land", and which cells are new since the last look.
import { describe, expect, it } from 'vitest';
import { seenCellIds } from '../../server/src/world.js';
import { agoLabel, fogRings, newCellIds, ownCentre, ranking, recentActivity } from '../src/online/world-growth.js';

type Claim = { cellId: string; ownerId: string; ownerName: string | null; ownerTag: string; colour: string; claimedAt: number };
const claim = (cellId: string, ownerId: string, claimedAt: number, ownerName: string | null = ownerId.toUpperCase()): Claim =>
  ({ cellId, ownerId, ownerName, ownerTag: `T${ownerId}`, colour: `hsl(${ownerId.length * 40} 34% 49%)`, claimedAt });

describe('the fog beyond the coast', () => {
  it('is the two rings of hidden land around the seen map, nearest ring first', () => {
    const seen = seenCellIds(['8,0']);
    const fog = fogRings(seen);
    expect(fog.get('11,0')).toBe(1);
    expect(fog.get('12,0')).toBe(2);
    for (const id of seen) expect(fog.has(id)).toBe(false);
    expect([...fog.values()].every((v) => v === 1 || v === 2)).toBe(true);
  });
});

describe('the ranking', () => {
  const claims = [claim('0,0', 'a', 5), claim('1,0', 'b', 1), claim('2,0', 'b', 2), claim('3,0', 'c', 3), claim('4,0', 'a', 6)];
  it('orders players by tiles held, the first to reach a count ahead on a tie', () => {
    const r = ranking(claims, 'c');
    expect(r.map((x) => [x.ownerId, x.tiles, x.rank])).toEqual([['b', 2, 1], ['a', 2, 2], ['c', 1, 3]]);
    expect(r.find((x) => x.ownerId === 'c')!.mine).toBe(true);
    expect(r.find((x) => x.ownerId === 'a')!.mine).toBe(false);
  });
  it('names a player without a nickname by their tag', () => {
    expect(ranking([claim('0,0', 'z', 1, null)], null)[0]!.name).toBe('Player');
  });
});

describe('the recent activity strip', () => {
  it('shows the newest placements first, at most five', () => {
    const claims = Array.from({ length: 8 }, (_, i) => claim(`${i},0`, `p${i}`, i * 1000));
    const recent = recentActivity(claims, 8000);
    expect(recent.map((x) => x.cellId)).toEqual(['7,0', '6,0', '5,0', '4,0', '3,0']);
  });
  it('says how long ago in a few characters', () => {
    expect(agoLabel(10_000)).toBe('NOW');
    expect(agoLabel(2 * 60_000)).toBe('2M');
    expect(agoLabel(3 * 3_600_000)).toBe('3H');
    expect(agoLabel(2 * 86_400_000)).toBe('2D');
  });
});

describe('find my land', () => {
  it('is the middle of my tiles, or nothing when I hold none', () => {
    const cells = [{ id: '0,0', q: 0, r: 0 }, { id: '2,0', q: 2, r: 0 }];
    const c = ownCentre(cells, [claim('0,0', 'me', 1), claim('2,0', 'me', 2)], 'me');
    expect(c).not.toBeNull();
    expect(c!.x).toBeCloseTo(Math.sqrt(3) * 10, 5);
    expect(ownCentre(cells, [claim('0,0', 'x', 1)], 'me')).toBeNull();
  });
});

describe('new land since the last look', () => {
  it('names the cells that were not there before (nothing on the first look)', () => {
    expect(newCellIds(null, ['a', 'b'])).toEqual([]);
    expect(newCellIds(new Set(['a']), ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });
});
