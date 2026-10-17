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
    expect(homeSides(at({}), 0)).toEqual({ blocked: 0, byEnemy: 0, danger: false, key: '-2,2', sides: [false, false, false, false, false, false], enemy: [false, false, false, false, false, false], openSides: 6, taken: 0 });
  });
  it('counts the sides that can actually be taken, which is what the tile card says', () => {
    // Three of the six sides are closed and two of those by enemy tiles; one is rock, which can
    // never be taken. So the home has 5 sides that can be taken, and 2 are already taken.
    const s = at({ '-1,2': [0, 3], '-1,1': [1, 2], '-2,1': [1, 2] }, ['-3,2']);
    expect(homeSides(s, 0)).toMatchObject({ openSides: 5, taken: 2 });
  });
  it('my own tiles never block; enemy tiles and rock do', () => {
    const s = at({ '-1,2': [0, 3], '-1,1': [1, 2], '-2,1': [1, 2] }, ['-3,2']);
    // three sides closed, two of them enemy tiles: danger now begins at three
    expect(homeSides(s, 0)).toMatchObject({ blocked: 3, byEnemy: 2, danger: true });
    // directions (1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1): (-1,2) mine, (-1,1) theirs, (-2,1) theirs, (-3,2) rock
    expect(homeSides(s, 0).sides).toEqual([false, true, true, true, false, false]);
    expect(homeSides(s, 0).enemy).toEqual([false, true, true, false, false, false]);
  });
  it('danger: 3 or more sides blocked, at least one by an enemy tile', () => {
    // three sides closed, one by an enemy tile: the earlier warning
    expect(homeSides(at({ '-1,1': [1, 2] }, ['-1,2', '-2,1']), 0)).toMatchObject({ blocked: 3, byEnemy: 1, danger: true });
    // three sides closed by rock alone is not danger (no enemy tile)
    expect(homeSides(at({}, ['-1,2', '-2,1', '-3,2']), 0)).toMatchObject({ blocked: 3, danger: false });
    expect(homeSides(at({ '-1,1': [1, 2] }, ['-1,2', '-2,1', '-3,2']), 0)).toMatchObject({ blocked: 4, danger: true });
    // 4 blocked by rock alone is not danger (no enemy tile)
    expect(homeSides(at({}, ['-1,2', '-2,1', '-3,2', '-3,3']), 0)).toMatchObject({ blocked: 4, danger: false });
  });
  it('the opponent home, the same way; 6 of 6 is a Strangle', () => {
    const ring = ['3,-2', '3,-3', '2,-3', '1,-2', '1,-1', '2,-1'];
    const tiles = Object.fromEntries(ring.map((k) => [k, [0, 2] as [Player, number]]));
    expect(homeSides(at(tiles), 1)).toMatchObject({ blocked: 6, byEnemy: 6, danger: true, key: '2,-2', openSides: 6, taken: 6 });
  });
  it('off-board sides count as blocked (corner homes)', () => {
    const s = { ...newGame(1, { rootStyle: 'corner' }) };
    const b = homeSides(s, 0);
    expect(b.blocked).toBe(3);
    expect(b.danger).toBe(false);
    // The three off-board sides can never be taken, so the home really has three sides to defend —
    // this is why "surround all 6 sides" was wrong on the campaign's corner homes.
    expect(b.openSides).toBe(3);
    expect(b.taken).toBe(0);
  });
});
