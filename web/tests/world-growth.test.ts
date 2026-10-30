// THE GROWING TERRITORY's page logic (owner, 2026-10-27): the fog beyond the coast, the ranking, the
// recent-activity strip, "find my land", and which cells are new since the last look.
import { describe, expect, it } from 'vitest';
import { seenCellIds } from '../../server/src/world.js';
import { agoLabel, borderSegments, fogAtLastLook, fogRings, fogShift, loopPhase, newCellIds, ownCentre, ownPatches, ranking, recentActivity, ringPhase, standing } from '../src/online/world-growth.js';

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

// Owner, 2026-10-28: "the way the empty tiles around the 'discovered' is changing colors, shading
// ... make it smooth more transition like rather than sudden changes". The mist's own before/after:
// the map is REBUILT on every paint, so only a remembered diff can carry the hand-off across it.
describe('the mist changing between two looks', () => {
  const fog = (entries: [string, 1 | 2][]) => new Map(entries);
  const empty = { lift: [], deepen: [], arrive: [] };

  it('splits the diff: mist that lifts off new land, mist that deepens, mist that arrives', () => {
    const before = fog([['a', 1], ['b', 1], ['c', 2]]);
    const after = fog([['b', 2], ['c', 2], ['d', 1]]);
    expect(fogShift(before, after)).toEqual({
      lift: [{ id: 'a', ring: 1 }],
      deepen: [{ id: 'b', from: 1, to: 2 }],
      arrive: [{ id: 'd', ring: 1 }],
    });
  });

  it('leaves an unchanged look completely alone (and the first look has nothing to transition from)', () => {
    const look = fog([['a', 1], ['b', 2]]);
    expect(fogShift(look, fog([['a', 1], ['b', 2]]))).toEqual(empty);
    expect(fogShift(null, look)).toEqual(empty);
  });

  it('never animates a cell the map cannot see, and only marks what actually changed', () => {
    const before = fog([['a', 1]]);
    const after = fog([['a', 1], ['b', 1], ['c', 2]]);
    const shift = fogShift(before, after);
    expect(shift.lift).toEqual([]);
    expect(shift.deepen).toEqual([]);
    expect(shift.arrive).toEqual([{ id: 'b', ring: 1 }, { id: 'c', ring: 2 }]);
  });

  it('is skipped entirely under Reduce motion, so the land simply appears', () => {
    const before = fog([['a', 1], ['b', 2]]);
    const after = fog([['b', 1], ['c', 2]]);
    expect(fogShift(before, after, false)).toEqual(empty);
  });

  // The map is rebuilt wholesale, so a second paint inside the hand-off must be able to re-derive
  // the SAME transition from data alone — otherwise the mist jumps back to full or snaps settled.
  it('a repaint mid-hand-off re-derives exactly the same lift, deepen and arrive', () => {
    const first = fogShift(fog([['a', 1], ['b', 1]]), fog([['b', 2], ['c', 1]]));
    expect(first).toEqual({
      lift: [{ id: 'a', ring: 1 }],
      deepen: [{ id: 'b', from: 1, to: 2 }],
      arrive: [{ id: 'c', ring: 1 }],
    });
    const settled = fog([['b', 2], ['c', 1]]);          // what the next paint calls `fogCells`
    const again = fogShift(fogAtLastLook(settled, first), settled);
    expect(again, 'the same three cells are still in flight').toEqual(first);
  });

  it('with no hand-off in flight, the last look is just the settled fog', () => {
    const settled = fog([['b', 2]]);
    expect(fogAtLastLook(settled, null)).toEqual(settled);
    expect(fogAtLastLook(null, null)).toBeNull();
  });
});

// A rebuilt map must not restart the fog's slow breath at full strength: that reset was itself a
// sudden shading change every time anyone grew a tile.
describe('keeping a loop where it was across a rebuild', () => {
  it('turns elapsed time into a negative delay, wrapped to the loop', () => {
    expect(loopPhase(0, 9000)).toBe('-0.000s');
    expect(loopPhase(4500, 9000)).toBe('-4.500s');
    expect(loopPhase(9000, 9000)).toBe('-0.000s');
    expect(loopPhase(10_250, 9000)).toBe('-1.250s');
  });
  it('never returns a positive delay (a loop is only ever moved forward)', () => {
    expect(loopPhase(-500, 9000)).toBe('-8.500s');
    expect(loopPhase(Number.NaN, 9000)).toBe('-0.000s');
  });

  // THE BREATH IS READ FROM THE LOOP THAT IS ALREADY ON SCREEN, not from a clock the page keeps.
  // The old form fed `Date.now() - firstPaint` back in, but a CSS animation does not start when the
  // node is created: on this branch it started ~800 ms later (the map screen was still hidden), so
  // the first repaint jumped the breath forward by that gap - the stutter the owner still saw.
  // `ringPhase` takes the animation's OWN clock, so a rebuild continues exactly where the eye was.
  it('reads the phase out of the running animation’s own clock', () => {
    // currentTime counts from the animation's start; the delay is the negative offset it was born
    // with, so the phase the eye is seeing is currentTime - delay (wrapped to one period).
    expect(ringPhase(0, 0, 9000), 'a fresh loop starts at zero').toBe(0);
    expect(ringPhase(0, -1740, 9000), 'a loop born 1.74 s in shows 1.74 s').toBe(1740);
    expect(ringPhase(1250, -40, 9000), 'both halves of the clock add up').toBe(1290);
    // Not started yet (the screen was hidden): nothing is animating, so the eye is on the 0 % frame.
    expect(ringPhase(null, -500, 9000)).toBe(0);
    expect(ringPhase(Number.NaN, -500, 9000)).toBe(0);
    expect(ringPhase(100, Number.NaN, 9000)).toBe(100);
    // It wraps, and it never goes negative.
    expect(ringPhase(9000, 0, 9000)).toBe(0);
    expect(ringPhase(10_250, 0, 9000)).toBe(1250);
    expect(ringPhase(0, -500, 9000)).toBe(500);
    expect(ringPhase(0, 500, 9000)).toBe(8500);
  });

  it('a phase fed a growing clock never makes the opacity jump, across several wraps', () => {
    // The keyframes: 0 % and 100 % at the resting shade, 50 % at the trough (ease-in-out).
    const shade = (phase: number, period: number, rest: number, low: number) => {
      const p = phase / period;
      const half = p <= 0.5 ? p / 0.5 : (1 - p) / 0.5;
      // ease-in-out(cubic-bezier(.42,0,.58,1)) is symmetric: a smoothstep is enough for a bound.
      const eased = half * half * (3 - 2 * half);
      return rest + (low - rest) * eased;
    };
    const period = 9000;
    let worst = 0;
    let previous = shade(ringPhase(0, 0, period), period, 0.42, 0.26);
    for (let t = 16; t <= period * 3; t += 16) {
      const now = shade(ringPhase(t, 0, period), period, 0.42, 0.26);
      worst = Math.max(worst, Math.abs(now - previous));
      previous = now;
    }
    // One frame of a 9 s breath is ~0.0004 of opacity; the wrap must be no worse than any other
    // frame. (The old clock-fed form stepped ~0.030 in one frame after a rebuild.)
    expect(worst).toBeLessThan(0.002);
  });

  it('a rebuild at any moment gives the SAME phase the eye was already watching', () => {
    // A repaint happens at t; the new node is given ringPhase(t, delay) as its negative delay, so
    // its own clock restarts at that phase. The value the eye sees is therefore continuous.
    for (const t of [0, 1, 999, 4500, 8999, 9001, 27_333]) {
      const phase = ringPhase(t, 0, 9000);
      // The rebuilt node's phase at its own time 0 is the delay it was given.
      expect(ringPhase(0, -phase, 9000), `rebuild at ${t} ms`).toBeCloseTo(phase, 6);
    }
  });
});

// v3.2 (owner, 2026-10-28: "addictive, satisfying"): where you stand, and who is next to pass.
describe('your standing', () => {
  const claims = [claim('0,0', 'a', 1), claim('1,0', 'a', 2), claim('2,0', 'a', 3), claim('3,0', 'b', 4), claim('4,0', 'c', 5), claim('5,0', 'c', 6)];
  it('names your rank, tiles, and how many more tiles pass the player above you', () => {
    expect(standing(ranking(claims, 'b'))).toEqual({ rank: 3, tiles: 1, players: 3, next: { name: 'C', tiles: 2, gap: 2 } });
    expect(standing(ranking(claims, 'c'))).toEqual({ rank: 2, tiles: 2, players: 3, next: { name: 'A', tiles: 3, gap: 2 } });
  });
  it('a tie is passed by one more tile (the earlier player keeps the place)', () => {
    const tied = [claim('0,0', 'a', 1), claim('1,0', 'b', 2)];
    expect(standing(ranking(tied, 'b'))!.next).toEqual({ name: 'A', tiles: 1, gap: 1 });
  });
  it('the leader has nobody to pass; a player with no land has no standing', () => {
    expect(standing(ranking(claims, 'a'))).toEqual({ rank: 1, tiles: 3, players: 3, next: null });
    expect(standing(ranking(claims, 'zz'))).toBeNull();
  });
});

describe('the outline of your land', () => {
  it('a lone tile is outlined on all six sides', () => {
    expect(borderSegments([{ q: 0, r: 0 }])).toHaveLength(6);
  });
  it('two touching tiles share no edge: ten sides, none of them between the two', () => {
    const segs = borderSegments([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    expect(segs).toHaveLength(10);
    // the shared side is x = √3/2·R, between y = ±R/2 — it must not be drawn
    const half = Math.sqrt(3) * 5;
    expect(segs.some(([x1, , x2]) => Math.abs(x1 - half) < 1e-6 && Math.abs(x2 - half) < 1e-6)).toBe(false);
  });
  it('a ring of six around a hole is outlined inside and out', () => {
    const ring = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([q, r]) => ({ q: q!, r: r! }));
    expect(borderSegments(ring)).toHaveLength(6 * 6 - 12);
  });
});

// Owner, 2026-10-28: "when having tiles in multiple locations, it should show different ones after
// clicking it again". Find-my-land walks the separate patches of your land, biggest first.
describe('the patches of your land', () => {
  const cells = ['0,0', '1,0', '2,0', '9,0', '9,1', '-6,3'].map((id) => { const [q, r] = id.split(',').map(Number); return { id, q: q!, r: r! }; });
  const claims = [claim('0,0', 'me', 1), claim('1,0', 'me', 2), claim('2,0', 'me', 3), claim('9,0', 'me', 4), claim('9,1', 'me', 5), claim('-6,3', 'me', 6), claim('5,5', 'other', 7)];
  it('groups touching tiles into patches, the biggest first, each with its own centre', () => {
    const patches = ownPatches(cells, claims, 'me');
    expect(patches.map((p) => p.tiles)).toEqual([3, 2, 1]);
    expect(patches[0]!.centre).toEqual(ownCentre(cells.slice(0, 3), claims, 'me'));
    expect(patches[2]!.cellIds).toEqual(['-6,3']);
  });
  it('a tie keeps the patch grown first ahead; no land, no patches', () => {
    const tie = [claim('0,0', 'me', 9), claim('9,0', 'me', 1)];
    expect(ownPatches(cells, tie, 'me').map((p) => p.cellIds[0])).toEqual(['9,0', '0,0']);
    expect(ownPatches(cells, claims, 'nobody')).toEqual([]);
    expect(ownPatches(cells, claims, null)).toEqual([]);
  });
});
