import { describe, expect, it } from 'vitest';
import { borderTiles, coordKey, planRot, removeTiles, resolveConfig, rotCount, sever } from '../../src/engine/index.js';
import type { Player } from '../../src/engine/index.js';
import { clone, fixture, tilesOf } from '../helpers.js';

const keys = (cs: { q: number; r: number }[]) => cs.map(coordKey).sort();

describe('rotCount (spec 9.2, defaults T=20 step=8)', () => {
  const c = resolveConfig();
  it.each([
    [0, 0],
    [20, 0],
    [21, 1],
    [28, 1],
    [29, 2],
    [36, 2],
    [37, 3],
    [44, 3],
    [45, 4],
  ])('deadwood %i -> rot %i', (dw, n) => {
    expect(rotCount(dw, c)).toBe(n);
  });

  it('follows the config', () => {
    const c2 = resolveConfig({ rotThreshold: 10, rotStep: 5 });
    expect(rotCount(10, c2)).toBe(0);
    expect(rotCount(11, c2)).toBe(1);
    expect(rotCount(15, c2)).toBe(1);
    expect(rotCount(16, c2)).toBe(2);
  });
});

describe('borderTiles (spec 9.3)', () => {
  it('excludes the root and interior tiles; includes tiles touching empty, rock, enemy or edge', () => {
    // (-1,1) is fully surrounded by own tiles: interior.
    const ring: Record<string, [Player, number]> = {
      '-1,1': [0, 1],
      '0,1': [0, 2],
      '0,0': [0, 2],
      '-1,0': [0, 2],
      '-2,1': [0, 2],
      '-1,2': [0, 2],
    };
    const f = fixture({ tiles: ring });
    const b = keys(borderTiles(f, 0));
    expect(b).not.toContain('-1,1');
    expect(b).not.toContain('-2,2');
    expect(b).toEqual(['-1,0', '-1,2', '-2,1', '0,0', '0,1']);
  });

  it('rock and enemy neighbours make a tile a border tile', () => {
    // Surround (-1,1) with own tiles except one rock / one enemy.
    const base: Record<string, [Player, number]> = {
      '-1,1': [0, 1],
      '0,1': [0, 2],
      '-1,0': [0, 2],
      '-2,1': [0, 2],
      '-1,2': [0, 2],
    };
    expect(keys(borderTiles(fixture({ tiles: base, rock: ['0,0'] }), 0))).toContain('-1,1');
    expect(keys(borderTiles(fixture({ tiles: { ...base, '0,0': [1, 9] } }), 0))).toContain('-1,1');
  });

  it('a lone tile at the board edge is a border tile', () => {
    const f = fixture({ tiles: { '-3,3': [0, 4] } });
    expect(keys(borderTiles(f, 0))).toEqual(['-3,3']);
  });
});

describe('planRot', () => {
  it('rotCount 0 does nothing', () => {
    const f = fixture({ tiles: { '-1,1': [0, 1] } });
    expect(planRot(f, 0, 0)).toEqual({ auto: [], pick: null });
  });

  it('removes the weakest border tiles automatically when there is no tie at the boundary', () => {
    const f = fixture({ tiles: { '-1,1': [0, 1], '-1,2': [0, 3], '-2,1': [0, 5] } });
    const p = planRot(f, 0, 2);
    expect(keys(p.auto)).toEqual(['-1,1', '-1,2']);
    expect(p.pick).toBeNull();
  });

  it('a tied group that exactly fills the slots is rotted automatically', () => {
    const f = fixture({ tiles: { '-1,1': [0, 1], '-1,2': [0, 3], '-2,1': [0, 3], '-3,2': [0, 5] } });
    const p = planRot(f, 0, 3);
    expect(keys(p.auto)).toEqual(['-1,1', '-1,2', '-2,1']);
    expect(p.pick).toBeNull();
  });

  it('worked example: border [2,2,2,5], rot 2 -> opponent picks 2 of the three 2s', () => {
    const f = fixture({ tiles: { '-1,1': [0, 2], '-1,2': [0, 2], '-2,1': [0, 2], '-3,2': [0, 5] } });
    const p = planRot(f, 0, 2);
    expect(p.auto).toEqual([]);
    expect(p.pick).not.toBeNull();
    expect(p.pick!.remaining).toBe(2);
    expect(keys(p.pick!.candidates)).toEqual(['-1,1', '-1,2', '-2,1']);
  });

  it('lower tiles are rotted automatically before the tied boundary group', () => {
    const f = fixture({ tiles: { '-1,1': [0, 1], '-1,2': [0, 4], '-2,1': [0, 4], '-3,2': [0, 4] } });
    const p = planRot(f, 0, 2);
    expect(keys(p.auto)).toEqual(['-1,1']);
    expect(p.pick!.remaining).toBe(1);
    expect(keys(p.pick!.candidates)).toEqual(['-1,2', '-2,1', '-3,2']);
  });

  it('candidates never include a higher-strength tile', () => {
    const f = fixture({ tiles: { '-1,1': [0, 2], '-1,2': [0, 2], '-2,1': [0, 2], '-3,2': [0, 3] } });
    const p = planRot(f, 0, 1);
    expect(keys(p.pick!.candidates)).not.toContain('-3,2');
  });

  it('fewer eligible tiles than the rot count: all eligible tiles rot', () => {
    const f = fixture({ tiles: { '-1,1': [0, 6], '-1,2': [0, 9] } });
    const p = planRot(f, 0, 4);
    expect(keys(p.auto)).toEqual(['-1,1', '-1,2']);
    expect(p.pick).toBeNull();
  });

  it('no non-root tiles: nothing to rot, and the root is exempt', () => {
    expect(planRot(fixture(), 0, 3)).toEqual({ auto: [], pick: null });
  });

  it('interior tiles are never eligible, even if they are the weakest', () => {
    const f = fixture({
      tiles: {
        '-1,1': [0, 1],
        '0,1': [0, 5],
        '0,0': [0, 5],
        '-1,0': [0, 5],
        '-2,1': [0, 5],
        '-1,2': [0, 5],
      },
    });
    const p = planRot(f, 0, 1);
    expect(p.auto).toEqual([]);
    expect(keys(p.pick!.candidates)).not.toContain('-1,1');
  });

  it('only the given player is affected', () => {
    const f = fixture({ tiles: { '-1,1': [0, 4], '1,-1': [1, 1] } });
    expect(keys(planRot(f, 0, 1).auto)).toEqual(['-1,1']);
    expect(keys(planRot(f, 1, 1).auto)).toEqual(['1,-1']);
  });

  it('does not mutate its input', () => {
    const f = fixture({ tiles: { '-1,1': [0, 2], '-1,2': [0, 2], '-2,1': [0, 2] } });
    const before = clone(f);
    planRot(f, 0, 2);
    expect(f).toEqual(before);
  });
});

describe('Rot cascades into Sever', () => {
  it('rotting a chokepoint severs the arm behind it', () => {
    // root - (-1,1) s1 - (0,0) s7 - (1,0) s8. Only (-1,1)... all border; weakest is (-1,1).
    const f = fixture({ tiles: { '-1,1': [0, 1], '0,0': [0, 7], '1,0': [0, 8] } });
    const p = planRot(f, 0, 1);
    expect(keys(p.auto)).toEqual(['-1,1']);
    const removed = removeTiles(f.board, p.auto);
    const out = sever(removed, f.config, 0);
    expect(out.severed).toEqual([{ player: 0, coords: [{ q: 0, r: 0 }, { q: 1, r: 0 }] }]);
    expect(tilesOf(out.board, 0)).toEqual(['-2,2']);
  });

  it('removeTiles empties the given hexes and does not mutate', () => {
    const f = fixture({ tiles: { '-1,1': [0, 1] } });
    const before = clone(f.board);
    const out = removeTiles(f.board, [{ q: -1, r: 1 }]);
    expect(out['-1,1']).toBeNull();
    expect(f.board).toEqual(before);
  });
});
