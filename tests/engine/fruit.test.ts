import { describe, expect, it } from 'vitest';
import { SEVERGROW_SPECIES, applyFruit, coordKey, planFruit, sever } from '../../src/engine/index.js';
import type { Coord } from '../../src/engine/index.js';
import { clone, codeOf, fixture, tilesOf } from '../helpers.js';

// P1 sacrifice trio: (-1,1), (0,1), (0,0), linked to P1's root at (-2,2).
// P2 target (1,0), strength 9, on the P2 arm (1,0) - (1,-1) - root (2,-2).
// P2 branch (2,0) hangs only off (1,0).
const base = () =>
  fixture({
    tiles: {
      '-1,1': [0, 3],
      '0,1': [0, 3],
      '0,0': [0, 3],
      '1,0': [1, 9],
      '1,-1': [1, 9],
      '2,0': [1, 4],
    },
  });
const trio: Coord[] = [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: 0, r: 0 }];
const target: Coord = { q: 1, r: 0 };

describe('Fruit (spec 10)', () => {
  it('ships exactly one species power implementing canFruit/resolveFruit', () => {
    expect(SEVERGROW_SPECIES.id).toBe('severgrow');
    const f = base();
    expect(SEVERGROW_SPECIES.canFruit(f, 0, 0, trio, target)).toBeNull();
    expect(SEVERGROW_SPECIES.canFruit(f, 0, 1, trio, target)).toBe('FRUIT_EXHAUSTED');
  });

  it('removes the 3 sacrificed tiles and the target, ignoring target strength (removes a 9)', () => {
    const f = base();
    const plan = planFruit(f, 0, 0, trio, target);
    const board = applyFruit(f.board, plan);
    for (const c of [...trio, target]) expect(board[coordKey(c)]).toBeNull();
  });

  it('Sever follows: the enemy branch behind the target is severed', () => {
    const f = base();
    const out = sever(applyFruit(f.board, planFruit(f, 0, 0, trio, target)), f.config, 0);
    expect(out.severed).toEqual([{ player: 1, coords: [{ q: 2, r: 0 }] }]);
    expect(tilesOf(out.board, 1)).toEqual(['1,-1', '2,-2']);
  });

  it('own-arm self-sever is intended and reported', () => {
    // P1's (0,-1) hangs only off the sacrificed (0,0); P2 target (1,0) via (2,-1).
    const f = fixture({
      tiles: {
        '-1,1': [0, 3],
        '0,1': [0, 3],
        '0,0': [0, 3],
        '0,-1': [0, 5],
        '1,0': [1, 2],
        '2,-1': [1, 2],
      },
    });
    const out = sever(applyFruit(f.board, planFruit(f, 0, 0, trio, target)), f.config, 0);
    expect(out.severed).toEqual([{ player: 0, coords: [{ q: 0, r: -1 }] }]);
  });

  it('once per player by default; fruitPerPlayer controls it', () => {
    const f = base();
    expect(codeOf(() => planFruit(f, 0, 1, trio, target))).toBe('FRUIT_EXHAUSTED');
    const two = { ...f, config: { ...f.config, fruitPerPlayer: 2 } };
    expect(planFruit(two, 0, 1, trio, target).target).toEqual(target);
    expect(codeOf(() => planFruit(two, 0, 2, trio, target))).toBe('FRUIT_EXHAUSTED');
    const none = fixture({ config: { fruitPerPlayer: 0 } });
    expect(codeOf(() => planFruit(none, 0, 0, trio, target))).toBe('FRUIT_EXHAUSTED');
  });

  it('requires exactly 3 sacrifice tiles', () => {
    const f = base();
    expect(codeOf(() => planFruit(f, 0, 0, trio.slice(0, 2), target))).toBe('FRUIT_SACRIFICE_COUNT');
    expect(codeOf(() => planFruit(f, 0, 0, [...trio, { q: -1, r: 2 }], target))).toBe('FRUIT_SACRIFICE_COUNT');
  });

  it('rejects duplicate sacrifice hexes', () => {
    const f = base();
    expect(codeOf(() => planFruit(f, 0, 0, [trio[0]!, trio[0]!, trio[1]!], target))).toBe('DUPLICATE_HEX');
  });

  it('sacrifice must be connected', () => {
    const g = fixture({ tiles: { '-1,1': [0, 3], '0,0': [0, 3], '-3,3': [0, 1], '1,0': [1, 1] } });
    expect(
      codeOf(() => planFruit(g, 0, 0, [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: -3, r: 3 }], target)),
    ).toBe('FRUIT_SACRIFICE_NOT_CONNECTED');
  });

  it('sacrifice must be own tiles that exist now', () => {
    const f = base();
    expect(
      codeOf(() => planFruit(f, 0, 0, [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: -1, r: 2 }], target)),
    ).toBe('FRUIT_SACRIFICE_NOT_OWN'); // (-1,2) is empty
    expect(
      codeOf(() => planFruit(f, 0, 0, [{ q: 0, r: 1 }, { q: 0, r: 0 }, { q: 1, r: 0 }], { q: 2, r: 0 })),
    ).toBe('FRUIT_SACRIFICE_NOT_OWN'); // (1,0) is enemy
  });

  it('cannot sacrifice the root', () => {
    const f = base();
    expect(
      codeOf(() => planFruit(f, 0, 0, [{ q: -2, r: 2 }, { q: -1, r: 1 }, { q: 0, r: 1 }], target)),
    ).toBe('FRUIT_SACRIFICE_ROOT');
  });

  it('target must be an enemy non-root tile', () => {
    const f = base();
    expect(codeOf(() => planFruit(f, 0, 0, trio, { q: 1, r: 1 }))).toBe('FRUIT_TARGET_NOT_ENEMY'); // empty
    expect(codeOf(() => planFruit(f, 0, 0, trio, { q: -1, r: 2 }))).toBe('FRUIT_TARGET_NOT_ENEMY');
    // Enemy root adjacent to a sacrifice tile.
    const g = fixture({ tiles: { '1,-1': [0, 2], '0,0': [0, 2], '-1,1': [0, 2] } });
    expect(
      codeOf(() => planFruit(g, 0, 0, [{ q: 1, r: -1 }, { q: 0, r: 0 }, { q: -1, r: 1 }], { q: 2, r: -2 })),
    ).toBe('FRUIT_TARGET_ROOT');
  });

  it('target must be adjacent to a sacrificed tile', () => {
    const f = base();
    expect(codeOf(() => planFruit(f, 0, 0, trio, { q: 2, r: 0 }))).toBe('FRUIT_TARGET_NOT_ADJACENT');
  });

  it('rejects malformed input', () => {
    const f = base();
    expect(codeOf(() => planFruit(f, 0, 0, 'x' as never, target))).toBe('MALFORMED_ACTION');
    expect(codeOf(() => planFruit(f, 0, 0, trio, { q: 'a' } as never))).toBe('INVALID_COORD');
    expect(codeOf(() => planFruit(f, 0, 0, [trio[0]!, trio[1]!, { q: 0.5, r: 0 }], target))).toBe('INVALID_COORD');
  });

  it('an illegal Fruit does not mutate anything; a legal one neither', () => {
    const f = base();
    const before = clone({ f, trio, target });
    codeOf(() => planFruit(f, 0, 0, trio, { q: 2, r: 0 }));
    applyFruit(f.board, planFruit(f, 0, 0, trio, target));
    expect({ f, trio, target }).toEqual(before);
  });
});
