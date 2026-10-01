import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  addCoord,
  allCoords,
  allNeighbors,
  coordKey,
  coordsEqual,
  hexDistance,
  isAdjacent,
  isConnected,
  isOnBoard,
  mirror,
  neighbors,
  parseKey,
  rootCoord,
  scaleCoord,
} from '../../src/engine/index.js';

describe('DIRECTIONS', () => {
  it('is exactly the spec list, indexed 0-5', () => {
    expect(DIRECTIONS).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
  });

  it('opposite directions are 3 apart', () => {
    for (let d = 0; d < 3; d++) {
      const a = DIRECTIONS[d]!;
      const b = DIRECTIONS[d + 3]!;
      expect(a.q + b.q).toBe(0);
      expect(a.r + b.r).toBe(0);
    }
  });
});

describe('coordinate keys', () => {
  it('uses the canonical `${q},${r}` form', () => {
    expect(coordKey({ q: -2, r: 2 })).toBe('-2,2');
    expect(coordKey({ q: 0, r: 0 })).toBe('0,0');
  });

  it('round-trips through parseKey', () => {
    for (const c of allCoords(3)) expect(parseKey(coordKey(c))).toEqual(c);
  });

  it('never produces -0', () => {
    const m = mirror({ q: 0, r: 0 });
    expect(Object.is(m.q, -0)).toBe(false);
    expect(Object.is(m.r, -0)).toBe(false);
    expect(coordKey(m)).toBe('0,0');
    expect(Object.is(parseKey('-0,0').q, -0)).toBe(false);
  });

  it('parseKey rejects malformed keys', () => {
    expect(() => parseKey('1')).toThrow();
    expect(() => parseKey('a,b')).toThrow();
    expect(() => parseKey('1.5,0')).toThrow();
  });
});

describe('isOnBoard / allCoords', () => {
  it('radius 3 board has 37 hexes', () => {
    expect(allCoords(3)).toHaveLength(37);
  });

  it('radius n board has 3n(n+1)+1 hexes', () => {
    for (const n of [0, 1, 2, 4, 5]) expect(allCoords(n)).toHaveLength(3 * n * (n + 1) + 1);
  });

  it('applies |q|,|r|,|q+r| <= radius', () => {
    expect(isOnBoard({ q: 3, r: -3 }, 3)).toBe(true);
    expect(isOnBoard({ q: 3, r: 0 }, 3)).toBe(true);
    expect(isOnBoard({ q: 3, r: 1 }, 3)).toBe(false);
    expect(isOnBoard({ q: -4, r: 0 }, 3)).toBe(false);
    expect(isOnBoard({ q: 2, r: 2 }, 3)).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    expect(isOnBoard({ q: 0.5, r: 0 }, 3)).toBe(false);
    expect(isOnBoard({ q: Number.NaN, r: 0 }, 3)).toBe(false);
  });

  it('enumerates in a deterministic order with unique keys', () => {
    const keys = allCoords(3).map(coordKey);
    expect(new Set(keys).size).toBe(37);
    expect(allCoords(3).map(coordKey)).toEqual(keys);
  });
});

describe('coordinate arithmetic', () => {
  it('adds and scales', () => {
    expect(addCoord({ q: 1, r: -1 }, { q: -2, r: 3 })).toEqual({ q: -1, r: 2 });
    expect(scaleCoord({ q: 1, r: -1 }, 3)).toEqual({ q: 3, r: -3 });
  });

  it('mirror is point reflection through the centre', () => {
    expect(mirror({ q: 2, r: -1 })).toEqual({ q: -2, r: 1 });
    for (const c of allCoords(3)) expect(mirror(mirror(c))).toEqual(c);
  });

  it('hexDistance', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
    expect(hexDistance({ q: -2, r: 2 }, { q: 2, r: -2 })).toBe(4);
    expect(hexDistance({ q: 1, r: 1 }, { q: 1, r: 1 })).toBe(0);
  });

  it('coordsEqual', () => {
    expect(coordsEqual({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    expect(coordsEqual({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
  });
});

describe('neighbours and adjacency', () => {
  it('allNeighbors returns all six in DIRECTIONS order, including off-board', () => {
    expect(allNeighbors({ q: 3, r: 0 })).toEqual(
      DIRECTIONS.map((d) => ({ q: 3 + d.q, r: d.r })),
    );
  });

  it('neighbors filters off-board hexes', () => {
    expect(neighbors({ q: 0, r: 0 }, 3)).toHaveLength(6);
    expect(neighbors({ q: 3, r: -3 }, 3)).toHaveLength(3); // corner
    expect(neighbors({ q: 3, r: -1 }, 3)).toHaveLength(4); // edge
  });

  it('isAdjacent is symmetric and excludes self', () => {
    expect(isAdjacent({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(true);
    expect(isAdjacent({ q: 1, r: -1 }, { q: 0, r: 0 })).toBe(true);
    expect(isAdjacent({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(false);
    expect(isAdjacent({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(false);
  });

  it('isConnected checks a single hex-adjacency cluster', () => {
    expect(isConnected([])).toBe(false);
    expect(isConnected([{ q: 0, r: 0 }])).toBe(true);
    expect(isConnected([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: -1 }])).toBe(true);
    expect(isConnected([{ q: 0, r: 0 }, { q: 2, r: 0 }])).toBe(false);
    // triangle
    expect(isConnected([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }])).toBe(true);
    // two pairs not touching
    expect(
      isConnected([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: -3, r: 3 }, { q: -3, r: 2 }]),
    ).toBe(false);
  });
});

describe('rootCoord', () => {
  it('ring2 roots are (-2,2) and (2,-2) with six on-board neighbours', () => {
    expect(rootCoord(0, 'ring2', 3)).toEqual({ q: -2, r: 2 });
    expect(rootCoord(1, 'ring2', 3)).toEqual({ q: 2, r: -2 });
    expect(neighbors(rootCoord(0, 'ring2', 3), 3)).toHaveLength(6);
    expect(neighbors(rootCoord(1, 'ring2', 3), 3)).toHaveLength(6);
  });

  it('corner roots are (-R,R) and (R,-R)', () => {
    expect(rootCoord(0, 'corner', 3)).toEqual({ q: -3, r: 3 });
    expect(rootCoord(1, 'corner', 3)).toEqual({ q: 3, r: -3 });
    expect(rootCoord(1, 'corner', 4)).toEqual({ q: 4, r: -4 });
  });

  it('roots mirror each other', () => {
    for (const style of ['ring2', 'corner'] as const) {
      expect(mirror(rootCoord(0, style, 3))).toEqual(rootCoord(1, style, 3));
    }
  });
});
