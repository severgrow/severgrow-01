// Adversarial tests (self-audit, Part 2b): written to break steps 7-10.
import { describe, expect, it } from 'vitest';
import {
  applyPlacement,
  isStrangled,
  planBloom,
  sever,
  strangleOutcome,
} from '../../src/engine/index.js';
import type { Card, Placement, Player } from '../../src/engine/index.js';
import { chain, card, clone, codeOf, fixture, tilesOf } from '../helpers.js';

const ids = (cs: Card[]) => cs.map((c) => c.id);
const P1_RING = ['-1,2', '-1,1', '-2,1', '-3,2', '-3,3', '-2,3'];
const owned = (keys: string[], owner: Player): Record<string, [Player, number]> =>
  Object.fromEntries(keys.map((k) => [k, [owner, 1]]));

describe('adversarial', () => {
  it('A1: a run bloom (a straight chain) that overgrows enemies then crosses its own tile (or own root) fails whole', () => {
    // Line (-1,1) e1, (0,0) e2, (1,-1) OWN. The first two claims are legal overgrows.
    const f = fixture({ tiles: { '-1,1': [1, 1], '0,0': [1, 2], '1,-1': [0, 1] } });
    const hand = [card(1, 0, 3), card(2, 0, 4), card(3, 0, 5)];
    const before = clone({ f, hand });
    expect(codeOf(() => planBloom(f, 0, hand, ids(hand), chain({ q: -1, r: 1 }, 1, hand.length)))).toBe('OWN_TILE');
    expect({ f, hand }).toEqual(before);
    // A chain aimed back through its own root: (-1,2) -> (-2,2) is P1's root.
    expect(codeOf(() => planBloom(fixture(), 0, hand, ids(hand), chain({ q: -1, r: 2 }, 3, hand.length)))).toBe('OWN_TILE');
  });

  it('A2: a bloom whose only network contact would come from its own hexes or overgrows is rejected', () => {
    const set = [card(1, 0, 6), card(2, 1, 6), card(3, 2, 6)];
    // (0,0),(1,-1),(1,0): each touches another new hex but none touches P1's network.
    expect(
      codeOf(() => planBloom(fixture(), 0, set, ids(set), [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: 1, r: 0 }])),
    ).toBe('NOT_ADJACENT');
    // Overgrowing an enemy tile at (0,0) does not count as "existing" own tile for the
    // other hexes, and (0,0) itself is not adjacent to P1's network before the meld.
    const f = fixture({ tiles: { '0,0': [1, 2], '-1,0': [1, 2] } });
    expect(
      codeOf(() => planBloom(f, 0, set, ids(set), [{ q: 0, r: 0 }, { q: -1, r: 0 }, { q: 1, r: 0 }])),
    ).toBe('NOT_ADJACENT');
    // A chain from a legal contact still works: only one hex needs pre-meld contact.
    expect(
      planBloom(fixture(), 0, set, ids(set), [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: 1, r: -1 }]).tiles,
    ).toHaveLength(3);
  });

  it('A3: sever after overgrow respects loops and removes the whole downstream tree only', () => {
    // P1 loop: root(-2,2) - (-1,1) - (0,0) - (0,1) - (-1,2) - root.
    // P1 arm hanging only off the hub (0,0): (1,-1) - (2,-1) - (3,-1).
    // P2 chain from its root (2,-2): (1,-2) - (0,-1) - (-1,0), so each P2 overgrow
    // below is genuinely connected to P2's root.
    const f = fixture({
      tiles: {
        '-1,1': [0, 1],
        '0,0': [0, 1],
        '0,1': [0, 1],
        '-1,2': [0, 1],
        '1,-1': [0, 1],
        '2,-1': [0, 1],
        '3,-1': [0, 1],
        '1,-2': [1, 4],
        '0,-1': [1, 4],
        '-1,0': [1, 4],
      },
    });
    const overgrow = (key: string): typeof f.board => {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const p: Placement = { player: 1, cards: [], tiles: [{ coord: { q, r }, strength: 5 }] };
      return applyPlacement(f.board, p).board;
    };
    // Cutting one link of the loop severs nothing, for either player.
    const a = sever(overgrow('-1,1'), f.config, 1);
    expect(a.severed).toEqual([]);
    expect(a.board['-1,1']).toEqual({ owner: 1, strength: 5 });
    expect(tilesOf(a.board, 0)).toHaveLength(7); // root + 6 remaining

    // Cutting the hub severs the whole arm, keeps the rest of the loop.
    const b = sever(overgrow('0,0'), f.config, 1);
    expect(b.severed).toEqual([{ player: 0, coords: [{ q: 1, r: -1 }, { q: 2, r: -1 }, { q: 3, r: -1 }] }]);
    expect(tilesOf(b.board, 0)).toEqual(['-1,1', '-1,2', '-2,2', '0,1']);
    // P2 loses nothing, including (0,-1) which touched the severed arm.
    expect(tilesOf(b.board, 1)).toEqual(['-1,0', '0,-1', '0,0', '1,-2', '2,-2']);
    // Second pass is a no-op.
    expect(sever(b.board, f.config, 1)).toEqual({ board: b.board, severed: [] });
  });

  it('A4: rock among the six neighbours blocks, but never replaces the enemy requirement', () => {
    const fiveEnemyOneRock = fixture({ rock: ['-1,2'], tiles: owned(P1_RING.slice(1), 1) });
    expect(isStrangled(fiveEnemyOneRock, 0)).toBe(true);
    const oneEnemyFiveRock = fixture({ rock: P1_RING.slice(1), tiles: owned(['-1,2'], 1) });
    expect(isStrangled(oneEnemyFiveRock, 0)).toBe(true);
    const rockEnemyEmpty = fixture({ rock: ['-1,2'], tiles: owned(P1_RING.slice(2), 1) });
    expect(isStrangled(rockEnemyEmpty, 0)).toBe(false);
    const rockEnemyOwn = fixture({ rock: ['-1,2'], tiles: { ...owned(P1_RING.slice(2), 1), '-1,1': [0, 9] } });
    expect(isStrangled(rockEnemyOwn, 0)).toBe(false);
    // Rich terrain is not a blocker.
    const richGap = fixture({ rich: ['-1,2'], tiles: owned(P1_RING.slice(1), 1) });
    expect(strangleOutcome(richGap)).toBeNull();
  });

  it('A5: melds that fail on their last tile, after legal overgrows, change nothing', () => {
    // 4-card bloom: three legal overgrows then rock.
    const f = fixture({ tiles: { '-1,1': [1, 2], '0,0': [1, 3], '0,1': [1, 5] }, rock: ['1,0'] });
    const set = [card(1, 0, 6), card(2, 1, 6), card(3, 2, 6), card(4, 3, 6)];
    const hexes = [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }];
    const before = clone({ f, set, hexes });
    expect(codeOf(() => planBloom(f, 0, set, ids(set), hexes))).toBe('ROCK');
    expect({ f, set, hexes }).toEqual(before);

    // 4-card run bloom (a straight chain): three legal overgrows, then off the edge.
    const g = fixture({ tiles: { '-1,2': [1, 1], '0,2': [1, 2], '1,2': [1, 3] } });
    const run = [card(1, 3, 3), card(2, 3, 4), card(3, 3, 5), card(4, 3, 6)];
    const gBefore = clone({ g, run });
    expect(codeOf(() => planBloom(g, 0, run, ids(run), chain({ q: -1, r: 2 }, 0, run.length)))).toBe('OFF_BOARD');
    expect({ g, run }).toEqual(gBefore);
  });

  it('A6: -0 coordinates in input never leak into placements or the board', () => {
    const set = [card(1, 0, 6), card(2, 1, 6), card(3, 2, 6)];
    const f = fixture();
    const p = planBloom(f, 0, set, ids(set), [{ q: -1, r: 1 }, { q: -1, r: 2 }, { q: -0, r: 1 }]);
    const out = applyPlacement(f.board, p);
    for (const c of [...p.tiles.map((t) => t.coord), ...out.placed]) {
      expect(Object.is(c.q, -0) || Object.is(c.r, -0)).toBe(false);
    }
    expect(out.board['0,1']).toEqual({ owner: 0, strength: 6 });
    // A JSON round-trip must reproduce the result exactly (spec 2.3).
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);

    const g = fixture({ tiles: { '0,0': [0, 1] } });
    const run = [card(1, 0, 3), card(2, 0, 4), card(3, 0, 5)];
    const r = planBloom(g, 0, run, ids(run), chain({ q: -0, r: 1 }, 0, run.length));
    expect(Object.is(r.tiles[0]!.coord.q, -0)).toBe(false);
  });
});
