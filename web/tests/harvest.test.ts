// THE DOUBLE HARVEST (surprise brief, 2026-10-29): the finish card's stamp of the final position.
// These tests pin the two facts the picture rests on: each seat's JOINED MASS (root-joined tiles,
// the engine's own definition) and the sides where the two networks touch. The figure must describe
// the real final board of a real match — never a generic shape — and must read the board only.
import { describe, expect, it } from 'vitest';
import { applyAs, connectedKeys, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Coord, Player, State, Tile } from '../../src/engine/index.js';
import { harvestFigure, harvestSvg, joinedMass } from '../src/logic/harvest.js';

const boardOf = (st: State): Record<string, Tile | null> => ({ ...st.board });

/** A board with tiles placed by hand (everything else as dealt: empty ground and two roots). */
const boardWith = (st: State, tiles: [Coord, Player][]): Record<string, Tile | null> => {
  const board = boardOf(st);
  for (const [c, owner] of tiles) board[`${c.q},${c.r}`] = { owner, strength: 4 };
  return board;
};

/** Play a whole seeded match with real legal moves for both seats. */
const playOut = (seed: number): State => {
  let s = newGame(seed);
  for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) {
    const legal: Action[] = legalActions(viewFor(s, s.actor));
    if (!legal.length) break;
    const order: Action['t'][] = s.phase === 'DRAW' ? ['Draw'] : ['Bloom', 'Sprout', 'PlayFruit', 'MegaBomb', 'EndAct', 'Discard'];
    const pick = order.map((t) => legal.find((a) => a.t === t)).find((a): a is Action => !!a) ?? legal[0]!;
    s = applyAs(s, s.actor as Player, pick);
  }
  return s;
};

describe('joined mass: the tiles reachable from a home', () => {
  it('the opening board is one tile each, and nothing touches', () => {
    const st = newGame(11);
    const fig = harvestFigure(st.board, st.config, 0)!;
    expect(fig.masses).toEqual([1, 1]);
    expect(fig.tiles).toEqual([1, 1]);
    expect(fig.frontier).toHaveLength(0);
    expect(fig.sealed).toEqual([]);
    expect(fig.label).toBe('Your network, 1 tile. Theirs, 1. No sides touch.');
  });

  it('a whole board held by one seat is ALL joined, and the other home is sealed', () => {
    const st = newGame(11);
    const everything: [Coord, Player][] = [];
    for (const [key, tile] of Object.entries(st.board)) {
      if (tile) continue;
      const [q, r] = key.split(',').map(Number);
      everything.push([{ q: q!, r: r! }, 0]);
    }
    const fig = harvestFigure(boardWith(st, everything), st.config, 0)!;
    expect(fig.tiles).toEqual([36, 1]);
    expect(fig.masses).toEqual([36, 1]);
    expect(fig.sealed).toEqual([1]);
    // All six sides around the surrounded home are a shared edge.
    expect(fig.frontier).toHaveLength(6);
    expect(fig.label).toBe('Your network, 36 tiles. Theirs, 1. 6 sides touch. Their home is sealed.');
  });

  it('two separate islands: only the half joined to the home counts as a mass', () => {
    const st = newGame(11);
    const fig = harvestFigure(
      boardWith(st, [
        [{ q: -1, r: 2 }, 0],
        [{ q: 0, r: 2 }, 0],
        [{ q: 2, r: 2 }, 0],
        [{ q: 2, r: 1 }, 0],
        [{ q: 2, r: 0 }, 1],
      ]),
      st.config,
      0,
    )!;
    // Root 0 is at (-2,2): (-1,2) and (0,2) are joined; (2,1) is an island.
    expect(fig.masses[0]).toBe(3);
    expect(fig.tiles[0]).toBe(4);
    // The island (1 tile) plus the one tile of the other seat that does not reach its own home.
    expect(fig.label).toContain('2 tiles cut off.');
  });

  it('a cut through the middle leaves the far side out of the mass', () => {
    const st = newGame(11);
    const fig = harvestFigure(
      boardWith(st, [
        [{ q: -1, r: 2 }, 0],
        [{ q: -1, r: 1 }, 0],
        // Three tiles on the far side of the board, none of them reachable from the home.
        [{ q: 3, r: -3 }, 0],
        [{ q: 3, r: -2 }, 0],
        [{ q: 3, r: -1 }, 0],
      ]),
      st.config,
      0,
    )!;
    expect(fig.tiles[0]).toBe(6);
    expect(fig.masses[0]).toBe(3); // the root plus the two near tiles
  });

  it("matches the engine's own connectivity on a real final board", () => {
    const st = playOut(219682080);
    for (const seat of [0, 1] as const) {
      const mine = joinedMass(st.board, st.config, seat);
      const engine = connectedKeys(st.board, st.config, seat);
      expect([...mine].sort()).toEqual([...engine].sort());
    }
  });

  it('a board without a root answers nothing joined instead of throwing', () => {
    const st = newGame(11);
    const board = boardOf(st);
    delete board['-2,2'];
    expect(joinedMass(board, st.config, 0).size).toBe(0);
  });
});

describe('the figure is the position this game ended on', () => {
  it('counts the real final board of a played-out match', () => {
    const st = playOut(96001);
    const fig = harvestFigure(st.board, st.config, 0, st.terrain)!;
    const onBoard = Object.values(st.board).filter((t) => !!t);
    const byOwner = [0, 1].map((p) => onBoard.filter((t) => t!.owner === p).length) as [number, number];
    expect(fig.tiles).toEqual(byOwner);
    expect(fig.cells).toHaveLength(onBoard.length);
    // A normal finish severs every stranded tile, so the joined mass IS every tile.
    expect(fig.masses).toEqual(byOwner);
    expect(fig.hexes).toHaveLength(37);
    expect(fig.label).toContain(`${byOwner[0]} tile`);
    expect(fig.label).toContain(`${byOwner[1]}`);
  });

  it('gives the two seats different weight and a pattern, not colour alone', () => {
    const st = playOut(42);
    const svg = harvestSvg(harvestFigure(st.board, st.config, 0, st.terrain)!);
    expect(svg).toContain('hv-you');
    expect(svg).toContain('hv-hatch');
    expect(svg).toContain('pattern id="go-harvest-hatch"');
    // One sentence, on the image itself.
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Your network,');
    // Static: no animation elements at all.
    expect(svg).not.toContain('<animate');
    expect(svg).not.toContain('<script');
  });

  it('shows each reader their own network from their own side', () => {
    const st = newGame(11);
    const board = boardWith(st, [
      [{ q: -1, r: 2 }, 0],
      [{ q: 2, r: -1 }, 1],
    ]);
    const mine = harvestFigure(board, st.config, 0)!;
    const theirs = harvestFigure(board, st.config, 1)!;
    expect(mine.masses).toEqual([2, 2]);
    expect(theirs.masses).toEqual([2, 2]);
    // Seat 1's board is mirrored, so each reader's OWN home lands in the same place on the stamp.
    const myHome = mine.cells.find((c) => c.home && c.owner === 0)!;
    const theirHome = theirs.cells.find((c) => c.home && c.owner === 0)!;
    expect({ q: theirHome.q, r: theirHome.r }).toEqual({ q: myHome.q, r: myHome.r });
    expect(mine.frontier).toHaveLength(theirs.frontier.length);
  });

  it('shows a single shared side where the networks only touch once', () => {
    const st = newGame(11);
    // (-1,1) is adjacent to (0,1): one side, counted once.
    const fig = harvestFigure(
      boardWith(st, [
        [{ q: -1, r: 1 }, 0],
        [{ q: 0, r: 1 }, 1],
      ]),
      st.config,
      0,
    )!;
    expect(fig.frontier).toHaveLength(1);
  });

  it('no board means no figure (a pruned or missing payload)', () => {
    const st = newGame(11);
    expect(harvestFigure(null, st.config, 0)).toBeNull();
    expect(harvestFigure(undefined, st.config, 0)).toBeNull();
  });
});

describe('the figure cannot leak a hidden hand', () => {
  it('is a function of the final board alone', () => {
    const st = playOut(7);
    const figure = harvestFigure(st.board, st.config, 0, st.terrain);
    // The same board with a completely different hand and deck order is the same picture.
    const scrambled: State = {
      ...st,
      hands: [[...st.hands[1]], [...st.hands[0]]],
      deck: [...st.deck].reverse(),
      discard: [...st.discard].reverse(),
    };
    expect(harvestFigure(scrambled.board, scrambled.config, 0, scrambled.terrain)).toEqual(figure);
  });
});
