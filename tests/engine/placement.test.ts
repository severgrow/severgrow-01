import { describe, expect, it } from 'vitest';
import { DIRECTIONS, applyPlacement, coordKey, planBloom, scaleCoord } from '../../src/engine/index.js';
import type { Card, Coord } from '../../src/engine/index.js';
import { card, chain, clone, codeOf, fixture } from '../helpers.js';

const MOSS = 0;
const ASH = 1;
const DEW = 2;
const EMBER = 3;

const run345: Card[] = [card(1, MOSS, 3), card(2, MOSS, 4), card(3, MOSS, 5)];
const ids = (cards: Card[]) => cards.map((c) => c.id);
const keys = (cs: Coord[]) => cs.map(coordKey);

describe('Bloom from a run (straight chains are one shape among many)', () => {
  it('worked example: Moss 3-4-5 from (-1,1) dir 1', () => {
    const f = fixture({ rich: ['0,0'] });
    const p = planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3));
    expect(p.tiles).toEqual([
      { coord: { q: -1, r: 1 }, strength: 3 },
      { coord: { q: 0, r: 0 }, strength: 4 },
      { coord: { q: 1, r: -1 }, strength: 5 },
    ]);
    const out = applyPlacement(f.board, p);
    expect(out.board['-1,1']).toEqual({ owner: 0, strength: 3 });
    expect(out.board['0,0']).toEqual({ owner: 0, strength: 4 });
    expect(out.board['1,-1']).toEqual({ owner: 0, strength: 5 });
    expect(keys(out.placed)).toEqual(['-1,1', '0,0', '1,-1']);
    expect(out.overgrown).toEqual([]);
  });

  it('places a straight line in all 6 directions', () => {
    // Own anchor at the centre of a radius-4 board, corner roots out of the way.
    const f = fixture({ config: { boardRadius: 4, rootStyle: 'corner' }, tiles: { '0,0': [0, 1] } });
    DIRECTIONS.forEach((d, dir) => {
      const p = planBloom(f, 0, run345, ids(run345), chain(d, dir, 3));
      expect(p.tiles.map((t) => t.coord)).toEqual([1, 2, 3].map((k) => scaleCoord(d, k)));
    });
  });

  it('hexes[i] receives cards[i] (any one-to-one assignment); the plan lists cards in ascending order', () => {
    const f = fixture();
    const shuffled = [run345[2]!, run345[0]!, run345[1]!];
    const p = planBloom(f, 0, shuffled, ids(shuffled), chain({ q: -1, r: 1 }, 1, 3));
    // the 5 on (-1,1), the 3 on (0,0), the 4 on (1,-1)
    expect(p.cards.map((c) => c.rank)).toEqual([3, 4, 5]);
    expect(p.tiles).toEqual([
      { coord: { q: 0, r: 0 }, strength: 3 },
      { coord: { q: 1, r: -1 }, strength: 4 },
      { coord: { q: -1, r: 1 }, strength: 5 },
    ]);
  });

  it('start may be adjacent to an own non-root tile', () => {
    const f = fixture({ tiles: { '-1,1': [0, 2] } });
    const p = planBloom(f, 0, run345, ids(run345), chain({ q: 0, r: 1 }, 0, 3));
    expect(keys(p.tiles.map((t) => t.coord))).toEqual(['0,1', '1,1', '2,1']);
  });

  it('start must be adjacent to the network', () => {
    const f = fixture();
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: 0, r: 0 }, 1, 3)))).toBe('NOT_ADJACENT');
  });

  it('adjacency is to the mover’s own network, not the enemy’s', () => {
    const f = fixture();
    // (1,-1) touches P2's root only.
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: 1, r: -1 }, 2, 3)))).toBe('NOT_ADJACENT');
  });

  it('is blocked by an own tile on the line', () => {
    const f = fixture({ tiles: { '0,0': [0, 1] } });
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)))).toBe('OWN_TILE');
  });

  it('cannot start on an own tile', () => {
    const f = fixture({ tiles: { '-1,1': [0, 1] } });
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)))).toBe('OWN_TILE');
  });

  it('is blocked by rock', () => {
    const f = fixture({ rock: ['0,0'] });
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)))).toBe('ROCK');
  });

  it('is blocked by the board edge', () => {
    const f = fixture();
    // (-2,1) dir 3 -> (-3,1), (-4,1) off board
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -2, r: 1 }, 3, 3)))).toBe('OFF_BOARD');
  });

  it('overgrows strictly lower enemy tiles', () => {
    const f = fixture({ tiles: { '0,0': [1, 3], '1,-1': [1, 4] } });
    const p = planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3));
    const out = applyPlacement(f.board, p);
    expect(out.board['0,0']).toEqual({ owner: 0, strength: 4 });
    expect(out.board['1,-1']).toEqual({ owner: 0, strength: 5 });
    expect(out.overgrown).toEqual([
      { coord: { q: 0, r: 0 }, oldOwner: 1, oldStrength: 3, newStrength: 4 },
      { coord: { q: 1, r: -1 }, oldOwner: 1, oldStrength: 4, newStrength: 5 },
    ]);
  });

  it('cannot overgrow an equal-strength enemy tile', () => {
    const f = fixture({ tiles: { '0,0': [1, 4] } });
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)))).toBe('NOT_STRONGER');
  });

  it('cannot overgrow a stronger enemy tile', () => {
    const f = fixture({ tiles: { '1,-1': [1, 9] } });
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)))).toBe('NOT_STRONGER');
  });

  it('cannot overgrow a root', () => {
    // Anchor at (0,-1); line (0,-2), (1,-2), (2,-2) ends on P2's root.
    const f = fixture({ tiles: { '0,-1': [0, 1] } });
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: 0, r: -2 }, 0, 3)))).toBe('ROOT_IMMUNE');
  });

  it('rejects malformed coordinates', () => {
    const f = fixture();
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: 0.5, r: 1 }, 1, 3)))).toBe('INVALID_COORD');
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), [null as never, null as never, null as never]))).toBe('INVALID_COORD');
  });

  it('rejects invalid cards before touching the board', () => {
    const f = fixture();
    const bad = [card(1, MOSS, 3), card(2, MOSS, 4), card(3, ASH, 5)];
    expect(codeOf(() => planBloom(f, 0, bad, ids(bad), chain({ q: -1, r: 1 }, 1, 3)))).toBe('RUN_MIXED_SUITS');
    expect(codeOf(() => planBloom(f, 0, run345, [1, 2, 99], chain({ q: -1, r: 1 }, 1, 3)))).toBe('CARD_NOT_IN_HAND');
  });

  it('is atomic: a failure on the last hex changes nothing', () => {
    const f = fixture({ tiles: { '1,-1': [1, 5] } }); // tip blocked (equal)
    const before = clone(f);
    expect(codeOf(() => planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)))).toBe('NOT_STRONGER');
    expect(f).toEqual(before);
  });

  it('applyPlacement does not mutate its input board', () => {
    const f = fixture({ tiles: { '0,0': [1, 3] } });
    const before = clone(f.board);
    applyPlacement(f.board, planBloom(f, 0, run345, ids(run345), chain({ q: -1, r: 1 }, 1, 3)));
    expect(f.board).toEqual(before);
  });

  it('works for P2 from its own root', () => {
    const f = fixture();
    const p = planBloom(f, 1, run345, ids(run345), chain({ q: 1, r: -1 }, 4, 3));
    expect(keys(p.tiles.map((t) => t.coord))).toEqual(['1,-1', '0,0', '-1,1']);
    expect(applyPlacement(f.board, p).board['-1,1']).toEqual({ owner: 1, strength: 5 });
  });
});

describe('Bloom from a set', () => {
  const set3: Card[] = [card(1, MOSS, 6), card(2, ASH, 6), card(3, DEW, 6)];
  const set4: Card[] = [...set3, card(4, EMBER, 6)];
  const cluster3 = [
    { q: -1, r: 1 },
    { q: -1, r: 2 },
    { q: 0, r: 1 },
  ];

  it('places 3 tiles of uniform strength', () => {
    const f = fixture();
    const p = planBloom(f, 0, set3, ids(set3), cluster3);
    expect(p.tiles).toEqual(cluster3.map((coord) => ({ coord, strength: 6 })));
    const out = applyPlacement(f.board, p);
    for (const c of cluster3) expect(out.board[coordKey(c)]).toEqual({ owner: 0, strength: 6 });
  });

  it('places 4 tiles', () => {
    const f = fixture();
    const hexes = [...cluster3, { q: 0, r: 0 }];
    const p = planBloom(f, 0, set4, ids(set4), hexes);
    expect(p.tiles).toHaveLength(4);
    expect(p.tiles.every((t) => t.strength === 6)).toBe(true);
  });

  it('only one hex needs to touch the network', () => {
    const f = fixture();
    // (-1,1) touches root; (0,0) and (1,0) do not.
    const p = planBloom(f, 0, set3, ids(set3), [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: 1, r: 0 }]);
    expect(p.tiles).toHaveLength(3);
  });

  it('requires as many hexes as cards', () => {
    const f = fixture();
    expect(codeOf(() => planBloom(f, 0, set3, ids(set3), cluster3.slice(0, 2)))).toBe('HEX_COUNT_MISMATCH');
    expect(codeOf(() => planBloom(f, 0, set3, ids(set3), [...cluster3, { q: 0, r: 0 }]))).toBe(
      'HEX_COUNT_MISMATCH',
    );
  });

  it('rejects duplicate hexes', () => {
    const f = fixture();
    expect(
      codeOf(() => planBloom(f, 0, set3, ids(set3), [{ q: -1, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }])),
    ).toBe('DUPLICATE_HEX');
  });

  it('requires a connected cluster', () => {
    const f = fixture();
    expect(
      codeOf(() => planBloom(f, 0, set3, ids(set3), [{ q: -1, r: 1 }, { q: -1, r: 2 }, { q: 1, r: 0 }])),
    ).toBe('HEXES_NOT_CONNECTED');
  });

  it('must touch the network', () => {
    const f = fixture();
    expect(
      codeOf(() => planBloom(f, 0, set3, ids(set3), [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }])),
    ).toBe('NOT_ADJACENT');
  });

  it('rejects own tiles, rock, off-board and roots', () => {
    expect(codeOf(() => planBloom(fixture({ tiles: { '0,1': [0, 1] } }), 0, set3, ids(set3), cluster3))).toBe(
      'OWN_TILE',
    );
    expect(codeOf(() => planBloom(fixture({ rock: ['0,1'] }), 0, set3, ids(set3), cluster3))).toBe('ROCK');
    expect(
      codeOf(() =>
        planBloom(fixture(), 0, set3, ids(set3), [{ q: -3, r: 3 }, { q: -3, r: 4 }, { q: -2, r: 3 }]),
      ),
    ).toBe('OFF_BOARD');
    const f = fixture({ tiles: { '1,-1': [0, 1] } });
    expect(
      codeOf(() => planBloom(f, 0, set3, ids(set3), [{ q: 2, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -1 }])),
    ).toBe('ROOT_IMMUNE');
  });

  it('overgrows lower enemy tiles but not equal ones', () => {
    const f = fixture({ tiles: { '0,1': [1, 5] } });
    const out = applyPlacement(f.board, planBloom(f, 0, set3, ids(set3), cluster3));
    expect(out.board['0,1']).toEqual({ owner: 0, strength: 6 });
    expect(out.overgrown).toEqual([{ coord: { q: 0, r: 1 }, oldOwner: 1, oldStrength: 5, newStrength: 6 }]);
    const g = fixture({ tiles: { '0,1': [1, 6] } });
    expect(codeOf(() => planBloom(g, 0, set3, ids(set3), cluster3))).toBe('NOT_STRONGER');
  });

  it('enforces set card rules (same rank, different suits)', () => {
    const f = fixture({config:{expandedBloom:false}});
    const dup = [card(1, MOSS, 6), card(2, MOSS, 6), card(3, DEW, 6)];
    expect(codeOf(() => planBloom(f, 0, dup, ids(dup), cluster3))).toBe('SET_DUPLICATE_SUIT');
    const mixed = [card(1, MOSS, 6), card(2, ASH, 7), card(3, DEW, 6)];
    // v0.7: two numbers and three suits is neither a set nor a run
    expect(codeOf(() => planBloom(f, 0, mixed, ids(mixed), cluster3))).toBe('RUN_MIXED_SUITS');
  });

  it('rejects malformed hex lists', () => {
    const f = fixture();
    expect(codeOf(() => planBloom(f, 0, set3, ids(set3), 'nope' as never))).toBe('MALFORMED_ACTION');
    expect(codeOf(() => planBloom(f, 0, set3, ids(set3), [{ q: -1, r: 1 }, { q: 'a' } as never, { q: 0, r: 1 }]))).toBe(
      'INVALID_COORD',
    );
  });

  it('is atomic', () => {
    const f = fixture({ rock: ['0,1'] });
    const before = clone(f);
    expect(codeOf(() => planBloom(f, 0, set3, ids(set3), cluster3))).toBe('ROCK');
    expect(f).toEqual(before);
  });

  it('adjacency is judged on the board before the meld', () => {
    // Hex (0,0) alone is not adjacent; being next to another new hex does not count.
    const f = fixture();
    expect(
      codeOf(() => planBloom(f, 0, set3, ids(set3), [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: 1, r: 0 }])),
    ).toBe('NOT_ADJACENT');
  });
});
