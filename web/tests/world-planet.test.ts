// WHERE THE PLANET OPENS. Owner, 2026-11-04: "always smoothly takes you to your biggest territory";
// owner, 2026-11-12 (the finish card): "right now its not ALWAYS showing my cluster innit" — the
// selection itself must always name the player's biggest cluster, and a player with no land must
// open on free ground where the grow invitation makes sense. `focusCell` is the whole rule, pure, so
// every case (including an empty map) is decided here instead of being guessed from a screenshot.
import { describe, expect, it } from 'vitest';
import { hexDistance, isPlanetCell } from '../../server/src/world.js';
import { focusCell, homeTile } from '../src/online/world-planet.js';

const held = (ownerId: string, claimedAt: number, ...ids: string[]) =>
  ids.map((cellId) => ({ cellId, ownerId, colour: 'hsl(0 0% 50%)', claimedAt }));
/** The same tiles, each carrying its own strength (the tie-break the owner asked for). */
const strong = (ownerId: string, ...pairs: readonly [string, number][]) =>
  pairs.map(([cellId, strength], i) => ({ cellId, ownerId, colour: 'hsl(0 0% 50%)', claimedAt: 10 + i, strength }));

describe('the planet opens on the biggest cluster of your land', () => {
  it('flies to the middle of the largest connected holding, not of all your tiles', () => {
    // A long connected row far right and a small cluster near the centre: the row wins.
    const claims = [...held('me', 5, '-1,0', '0,0'), ...held('me', 9, '6,0', '7,0', '8,0', '9,0', '10,0')];
    expect(homeTile(claims, 'me')).toBe('8,0');
    expect(focusCell(claims, 'me')).toBe('8,0');
  });

  it('ignores other players', () => {
    expect(focusCell(held('rival', 1, '3,3', '3,4'), 'me')).not.toBeNull();
  });

  it('a tie on SIZE goes to the cluster with the higher total strength', () => {
    // Two clusters of two. The second one is stronger in sum (9 + 1 vs 2 + 3).
    const claims = [
      ...strong('me', ['5,0', 2], ['6,0', 3]),
      ...strong('me', ['-5,0', 9], ['-6,0', 1]),
    ];
    const cell = focusCell(claims, 'me');
    expect(['-5,0', '-6,0']).toContain(cell);
    // …and the answer does not depend on the order the server listed them in.
    expect(focusCell([...claims].reverse(), 'me')).toBe(cell);
  });

  it('equal size AND equal strength still never flips between reads', () => {
    const claims = [...held('me', 20, '5,0', '6,0'), ...held('me', 2, '-5,0', '-6,0')];
    const first = focusCell(claims, 'me');
    expect(['-5,0', '-6,0', '5,0', '6,0']).toContain(first);
    expect(focusCell([...claims].reverse(), 'me')).toBe(first);
  });

  it('a one-tile hold opens on that tile', () => {
    expect(focusCell(held('me', 3, '2,2'), 'me')).toBe('2,2');
  });
});

describe('a player with no land opens on free ground worth growing', () => {
  it('picks a free tile roughly 10–12 steps from the busiest area', () => {
    // A rival's dense blob around the centre: that is where the most owned tiles are.
    const claims = [
      ...held('rival', 1, '0,0', '1,0', '0,1', '-1,1', '-1,0', '1,-1', '2,-1', '0,-1', '-2,1'),
      ...held('rival', 1, '8,8'),
    ];
    const cell = focusCell(claims, 'me');
    expect(cell).not.toBeNull();
    // Free (never a claimed tile) and real planet ground (the renderer can fly to it).
    expect(claims.some((c) => c.cellId === cell)).toBe(false);
    expect(isPlanetCell(cell!)).toBe(true);
    // Roughly the distance the owner asked for, measured from the busiest cell (0,0 here).
    const [q, r] = cell!.split(',').map(Number) as [number, number];
    const away = hexDistance(q, r);
    expect(away).toBeGreaterThanOrEqual(10);
    expect(away).toBeLessThanOrEqual(12);
  });

  it('is deterministic: the same world read twice picks the same tile', () => {
    const claims = held('rival', 1, '0,0', '1,0', '0,1', '5,5');
    expect(focusCell(claims, 'me')).toBe(focusCell([...claims].reverse(), 'me'));
  });

  it('an empty map has no answer (so the caller falls back to the centre, never a throw)', () => {
    expect(focusCell([], null)).toBeNull();
    expect(focusCell([], 'me')).toBeNull();
    expect(homeTile([], null)).toBe('0,0');
  });
});
