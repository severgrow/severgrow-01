import { describe, expect, it } from 'vitest';
import { applyPlacement, connectedKeys, coordKey, planBloom, sever } from '../../src/engine/index.js';
import type { Card } from '../../src/engine/index.js';
import { card, clone, fixture, tilesOf } from '../helpers.js';

const sortedKeys = (cs: { q: number; r: number }[]) => cs.map(coordKey).sort();

describe('connectedKeys', () => {
  it('flood-fills from the root through own tiles only', () => {
    const f = fixture({
      tiles: { '-1,1': [0, 3], '0,0': [1, 2], '1,0': [0, 2], '-1,2': [0, 1] },
    });
    expect([...connectedKeys(f.board, f.config, 0)].sort()).toEqual(['-1,1', '-1,2', '-2,2']);
  });

  it('always contains the root', () => {
    const f = fixture();
    expect([...connectedKeys(f.board, f.config, 1)]).toEqual(['2,-2']);
  });
});

describe('sever', () => {
  it('a chokepoint cut by overgrowth removes the detached arm', () => {
    // P1 arm: root(-2,2) - (-1,1) - (0,0) - (1,0) - (2,0). (0,0) is the chokepoint.
    const f = fixture({ tiles: { '-1,1': [0, 3], '0,0': [0, 1], '1,0': [0, 2], '2,0': [0, 2] } });
    const set5: Card[] = [card(1, 0, 5), card(2, 1, 5), card(3, 2, 5)];
    const p = planBloom(f, 1, set5, [1, 2, 3], [{ q: 0, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -2 }]);
    const placed = applyPlacement(f.board, p);
    const out = sever(placed.board, f.config, 1);
    expect(out.severed).toEqual([{ player: 0, coords: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }]);
    expect(out.board['1,0']).toBeNull();
    expect(out.board['2,0']).toBeNull();
    expect(out.board['-1,1']).toEqual({ owner: 0, strength: 3 });
    expect(out.board['0,0']).toEqual({ owner: 1, strength: 5 });
    expect(tilesOf(out.board, 1)).toEqual(['0,-1', '0,0', '1,-2', '2,-2']);
  });

  it('only own connectivity matters: enemy tiles never bridge', () => {
    // P1 (0,0) touches P2's (1,-1), which touches P2's root, but not P1's network.
    const f = fixture({ tiles: { '0,0': [0, 4], '1,-1': [1, 2] } });
    const out = sever(f.board, f.config, 1);
    expect(out.severed).toEqual([{ player: 0, coords: [{ q: 0, r: 0 }] }]);
    expect(out.board['1,-1']).toEqual({ owner: 1, strength: 2 });
  });

  it('an own cluster disconnected from the root is removed entirely', () => {
    const f = fixture({ tiles: { '1,0': [0, 9], '2,0': [0, 9], '1,1': [0, 9] } });
    const out = sever(f.board, f.config, 0);
    expect(sortedKeys(out.severed[0]!.coords)).toEqual(['1,0', '1,1', '2,0']);
    expect(tilesOf(out.board, 0)).toEqual(['-2,2']);
  });

  it('severed tiles become empty: not captured, not owned by anyone', () => {
    const f = fixture({ tiles: { '0,0': [0, 4] } });
    const out = sever(f.board, f.config, 1);
    expect(out.board['0,0']).toBeNull();
    expect(tilesOf(out.board, 1)).toEqual(['2,-2']);
  });

  it('lists the opponent of the mover first', () => {
    const f = fixture({ tiles: { '0,0': [0, 4], '0,1': [1, 4] } });
    expect(sever(f.board, f.config, 0).severed.map((s) => s.player)).toEqual([1, 0]);
    expect(sever(f.board, f.config, 1).severed.map((s) => s.player)).toEqual([0, 1]);
  });

  it('reports nothing and keeps every tile when all are connected', () => {
    const f = fixture({ tiles: { '-1,1': [0, 3], '0,0': [0, 4], '1,-1': [1, 2] } });
    const out = sever(f.board, f.config, 0);
    expect(out.severed).toEqual([]);
    expect(out.board).toEqual(f.board);
  });

  it('never removes roots', () => {
    const f = fixture({ tiles: { '0,0': [0, 4], '0,1': [1, 4] } });
    const out = sever(f.board, f.config, 0);
    expect(out.board['-2,2']).toEqual({ owner: 0, strength: 0, root: true });
    expect(out.board['2,-2']).toEqual({ owner: 1, strength: 0, root: true });
  });

  it('is idempotent', () => {
    const f = fixture({
      tiles: { '-1,1': [0, 3], '1,0': [0, 2], '2,0': [0, 2], '0,1': [1, 4], '1,-1': [1, 1] },
    });
    const once = sever(f.board, f.config, 0);
    const twice = sever(once.board, f.config, 0);
    expect(twice.board).toEqual(once.board);
    expect(twice.severed).toEqual([]);
  });

  it('does not mutate its input', () => {
    const f = fixture({ tiles: { '0,0': [0, 4] } });
    const before = clone(f.board);
    sever(f.board, f.config, 0);
    expect(f.board).toEqual(before);
  });

  it('works with corner roots', () => {
    const f = fixture({ config: { rootStyle: 'corner' }, tiles: { '-2,2': [0, 1], '-1,1': [0, 1], '0,0': [0, 1] } });
    expect(sever(f.board, f.config, 0).severed).toEqual([]);
    const g = fixture({ config: { rootStyle: 'corner' }, tiles: { '-1,1': [0, 1] } });
    expect(sever(g.board, g.config, 0).severed).toEqual([{ player: 0, coords: [{ q: -1, r: 1 }] }]);
  });
});
