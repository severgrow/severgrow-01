// v0.7 homes (tree and volcano): how many of a home's six sides are blocked, and when it is in
// danger, from public information only (the board and the terrain).
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/index.js';
import type { Player, State } from '../../src/engine/index.js';
import { homeSides } from '../src/logic/home.js';
import { fixture } from '../../tests/helpers.js';

const at = (tiles: Record<string, [Player, number]>, rock: string[] = []): State => {
  const f = fixture({ tiles, rock });
  return { ...newGame(1), board: f.board, terrain: f.terrain };
};
// my home (-2,2): sides (-1,2) (-1,1) (-2,1) (-3,2) (-3,3) (-2,3), all on the board
describe('blocked sides and danger', () => {
  it('an open home: 0 of 6, no danger', () => {
    expect(homeSides(at({}), 0)).toEqual({ blocked: 0, byEnemy: 0, danger: false, key: '-2,2', sides: [false, false, false, false, false, false] });
  });
  it('my own tiles never block; enemy tiles and rock do', () => {
    const s = at({ '-1,2': [0, 3], '-1,1': [1, 2], '-2,1': [1, 2] }, ['-3,2']);
    expect(homeSides(s, 0)).toMatchObject({ blocked: 3, byEnemy: 2, danger: false });
    // directions (1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1): (-1,2) mine, (-1,1) theirs, (-2,1) theirs, (-3,2) rock
    expect(homeSides(s, 0).sides).toEqual([false, true, true, true, false, false]);
  });
  it('danger: 4 or more sides blocked, at least one by an enemy tile', () => {
    expect(homeSides(at({ '-1,1': [1, 2] }, ['-1,2', '-2,1', '-3,2']), 0)).toMatchObject({ blocked: 4, danger: true });
    // 4 blocked by rock alone is not danger (no enemy tile)
    expect(homeSides(at({}, ['-1,2', '-2,1', '-3,2', '-3,3']), 0)).toMatchObject({ blocked: 4, danger: false });
  });
  it('the opponent home, the same way; 6 of 6 is a Strangle', () => {
    const ring = ['3,-2', '3,-3', '2,-3', '1,-2', '1,-1', '2,-1'];
    const tiles = Object.fromEntries(ring.map((k) => [k, [0, 2] as [Player, number]]));
    expect(homeSides(at(tiles), 1)).toEqual({ blocked: 6, byEnemy: 6, danger: true, key: '2,-2', sides: [true, true, true, true, true, true] });
  });
  it('off-board sides count as blocked (corner homes)', () => {
    const s = { ...newGame(1, { rootStyle: 'corner' }) };
    const b = homeSides(s, 0);
    expect(b.blocked).toBe(3);
    expect(b.danger).toBe(false);
  });
});
