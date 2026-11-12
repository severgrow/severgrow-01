// THE DOUBLE HARVEST (surprise brief, 2026-10-29): the finish card's stamp of the final position.
// These tests pin the two facts the picture rests on: each seat's JOINED MASS (root-joined tiles,
// the engine's own definition) and the sides where the two networks touch. The figure must describe
// the real final board of a real match — never a generic shape — and must read the board only.
import { describe, expect, it } from 'vitest';
import { allCoords, applyAs, connectedKeys, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Coord, Player, State, Tile } from '../../src/engine/index.js';
import {
  cellPath,
  harvestFigure,
  harvestSvg,
  joinedMass,
  orientationFor,
  orientCoord,
  orientPoint,
  rotateCoord,
  rotatePoint,
} from '../src/logic/harvest.js';
import type { HarvestFigure } from '../src/logic/harvest.js';

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

// THE OWNER'S TURN (2026-11-01): "player directly under opp". The stamp is turned by one of the
// lattice's own rigid symmetries so the reader's home is as close as the lattice allows to directly
// below the opponent's. These tests pin the helper itself, the honesty of its limit, and the fact
// that a turn is a view — never a recount.
const S = 10;
const SQ3 = Math.sqrt(3);
/** The lattice, written here independently of the module: centre of one axial coord. */
const pt = (c: Coord): { x: number; y: number } => ({
  x: SQ3 * S * c.q + (SQ3 / 2) * S * c.r,
  y: 1.5 * S * c.r,
});
const TURNS = Array.from({ length: 12 }, (_, i) => ({ rotation: i % 6, mirrored: i >= 6 }));

describe('orientation: the reader is put under the opponent', () => {
  it('rotates a coord and a point by exactly the same rigid turn', () => {
    for (const c of [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: -2, r: 2 }, { q: 3, r: -1 }, { q: -1, r: -2 }]) {
      for (const o of TURNS) {
        const byCoord = pt(orientCoord(c, o));
        const byPoint = orientPoint(pt(c), o);
        expect(byCoord.x).toBeCloseTo(byPoint.x, 9);
        expect(byCoord.y).toBeCloseTo(byPoint.y, 9);
        // The plain rotation helper agrees too, so `rotateCoord` can never drift from the points.
        const raw = rotateCoord(c, o.rotation);
        expect(rotatePoint(pt(c), o.rotation).x).toBeCloseTo(pt(raw).x, 9);
        expect(rotatePoint(pt(c), o.rotation).y).toBeCloseTo(pt(raw).y, 9);
      }
    }
  });

  it('keeps the lattice rigid: every pairwise distance survives the chosen turn', () => {
    const cluster: Coord[] = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 2 },
      { q: 2, r: -1 },
      { q: -2, r: 2 },
      { q: 3, r: -3 },
    ];
    const o = orientationFor({ q: -2, r: 2 }, { q: 2, r: -2 });
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = pt(cluster[i]!);
        const b = pt(cluster[j]!);
        const A = orientPoint(a, o);
        const B = orientPoint(b, o);
        expect(Math.hypot(B.x - A.x, B.y - A.y)).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y), 9);
      }
    }
  });

  it('for every plausible home pair: the opponent is above, |ΔX| is the lattice minimum, deterministically', () => {
    const homes = allCoords(3);
    for (const reader of homes) {
      for (const opponent of homes) {
        if (reader.q === opponent.q && reader.r === opponent.r) continue;
        const chosen = orientationFor(reader, opponent);
        // (d) deterministic, and a legal lattice turn.
        expect(orientationFor(reader, opponent)).toEqual(chosen);
        expect(Number.isInteger(chosen.rotation)).toBe(true);
        expect(chosen.rotation).toBeGreaterThanOrEqual(0);
        expect(chosen.rotation).toBeLessThan(6);
        expect(typeof chosen.mirrored).toBe('boolean');
        const rp = orientPoint(pt(reader), chosen);
        const op = orientPoint(pt(opponent), chosen);
        // (a) the reader is the lower home.
        expect(op.y).toBeLessThan(rp.y);
        // (b) |ΔX| is the smallest any legal transform can produce. A 180° turn is in the group,
        // so whichever transform is flattest can always be flipped to put the opponent above.
        let flattest = Infinity;
        for (const o of TURNS) {
          const a = orientPoint(pt(reader), o);
          const b = orientPoint(pt(opponent), o);
          flattest = Math.min(flattest, Math.abs(b.x - a.x));
        }
        expect(Math.abs(op.x - rp.x)).toBeCloseTo(flattest, 6);
        // Reflecting is part of the search but can never beat the six turns on this lattice; the
        // plain turn wins the tie so a board always reads the same way.
        expect(chosen.mirrored).toBe(false);
      }
    }
  });

  it("the product's ring-2 homes cannot share X on the lattice — and the card's 30° tilt makes them", () => {
    // (-2,2) and (2,-2) are exactly one hex-row apart: (34.64, -60) drawing units, 60° below the
    // horizontal. Every 60° turn keeps their separation on that six-direction star, so no LATTICE
    // turn can make their X equal. That is why the card adds a rigid 30° tilt on top (owner,
    // 2026-11-01: "rotate it 30° so you sit exactly under them").
    const reader: Coord = { q: -2, r: 2 };
    const opponent: Coord = { q: 2, r: -2 };
    for (const o of TURNS) {
      const a = orientPoint(pt(reader), o);
      const b = orientPoint(pt(opponent), o);
      expect(Math.abs(b.x - a.x)).toBeGreaterThan(1);
    }
    const chosen = orientationFor(reader, opponent);
    // The two closest turns are equal (34.64 either side of the vertical), so the plain, lowest
    // index one wins: the reader is already below the opponent, no turn is needed.
    expect(chosen).toEqual({ rotation: 0, mirrored: false });

    const fig = harvestFigure(newGame(11).board, newGame(11).config, 0)!;
    const mine = fig.cells.find((c) => c.home && c.owner === 0)!;
    const theirs = fig.cells.find((c) => c.home && c.owner === 1)!;
    // Opponent above, reader below, and now EXACTLY the same column.
    expect(theirs.y).toBeLessThan(mine.y);
    expect(Math.abs(theirs.x - mine.x)).toBeLessThan(0.05);
    expect(fig.orientation).toEqual(chosen);
    // The tilt is the remaining 30° (to drawing precision), not an arbitrary spin.
    expect(Math.abs(fig.tilt)).toBeCloseTo(Math.PI / 6, 6);
  });

  it('both seats read the same canonical orientation: the reader is at the bottom', () => {
    const st = newGame(11);
    const board = boardWith(st, [
      [{ q: -1, r: 2 }, 0],
      [{ q: 2, r: -1 }, 1],
    ]);
    const mine = harvestFigure(board, st.config, 0)!;
    const theirs = harvestFigure(board, st.config, 1)!;
    const myHome = mine.cells.find((c) => c.home && c.owner === 0)!;
    const theirHome = theirs.cells.find((c) => c.home && c.owner === 0)!;
    const myOpponent = mine.cells.find((c) => c.home && c.owner === 1)!;
    const theirOpponent = theirs.cells.find((c) => c.home && c.owner === 1)!;
    // The same game, read from opposite seats: each reader's home lands on the same pixel, under
    // the opponent's, with the same chosen turn.
    expect({ x: theirHome.x, y: theirHome.y }).toEqual({ x: myHome.x, y: myHome.y });
    expect({ x: theirOpponent.x, y: theirOpponent.y }).toEqual({ x: myOpponent.x, y: myOpponent.y });
    expect(myOpponent.y).toBeLessThan(myHome.y);
    expect(theirOpponent.y).toBeLessThan(theirHome.y);
    expect(theirs.orientation).toEqual(mine.orientation);
  });

  it('a turn never changes who owns what: counts and the cut line are board facts', () => {
    const st = playOut(96001);
    const occupied = Object.keys(st.board).filter((k) => !!st.board[k]);
    const ownerOf = (k: string) => st.board[k]!.owner;
    const counts: [number, number] = [
      occupied.filter((k) => ownerOf(k) === 0).length,
      occupied.filter((k) => ownerOf(k) === 1).length,
    ];
    const keys = new Set(occupied);
    let cut = 0;
    for (const k of occupied) {
      const [q, r] = k.split(',').map(Number) as [number, number];
      // One direction from each undirected pair, so every shared side is counted exactly once.
      for (const [dq, dr] of [[1, 0], [1, -1], [0, -1]] as const) {
        const nk = `${q + dq},${r + dr}`;
        if (keys.has(nk) && ownerOf(nk) !== ownerOf(k)) cut += 1;
      }
    }
    const figures: [HarvestFigure, HarvestFigure] = [
      harvestFigure(st.board, st.config, 0, st.terrain)!,
      harvestFigure(st.board, st.config, 1, st.terrain)!,
    ];
    for (const fig of figures) {
      expect(fig.cells).toHaveLength(occupied.length);
      expect(fig.cells.map((c) => c.key).sort()).toEqual([...occupied].sort());
      expect(fig.frontier).toHaveLength(cut);
    }
    // Counts stay by seat as the reader sees them; the turn moves nothing between owners.
    expect(figures[0].tiles).toEqual(counts);
    expect(figures[1].tiles).toEqual([counts[1], counts[0]]);
    expect(figures[1].masses).toEqual([figures[0].masses[1], figures[0].masses[0]]);
  });
});

// The owner's other half of the request: "with flat edges on sides". The −30° vertex start already
// gives flat left/right sides (points top/bottom). These tests pin it so a later refactor cannot
// silently turn every tile 30° into the pointy-left/right family.
// The MAP's hexes are flat-sided (flat left/right edges); `cellPath`'s default is that family.
// The finish CARD deliberately draws its plate a further 30° round, because that is what puts the
// reader exactly under the opponent (owner, 2026-11-01) — so the card's tiles show a flat edge on
// top and bottom. Both facts are pinned below.
describe('hex geometry: the map family, and the card\u2019s own tilt', () => {
  const pointsOf = (d: string): { x: number; y: number }[] =>
    [...d.matchAll(/(-?\d+\.\d),(-?\d+\.\d)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  const angleOf = (p: { x: number; y: number }, c: { x: number; y: number }): number =>
    ((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 360) % 360;
  const FLAT = [30, 90, 150, 210, 270, 330];

  it('cellPath is the flat-sided hex: vertical left and right edges, points top and bottom', () => {
    const pts = pointsOf(cellPath(0, 0));
    expect(pts).toHaveLength(6);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(S, 1);
    const angles = pts.map((p) => angleOf(p, { x: 0, y: 0 })).sort((a, b) => a - b);
    FLAT.forEach((want, i) => expect(Math.abs(angles[i]! - want)).toBeLessThan(0.6));
    // The leftmost and rightmost features are EDGES: exactly two vertices share each extreme X.
    const maxX = Math.max(...pts.map((p) => p.x));
    const minX = Math.min(...pts.map((p) => p.x));
    const right = pts.filter((p) => Math.abs(p.x - maxX) < 0.05);
    const left = pts.filter((p) => Math.abs(p.x - minX) < 0.05);
    expect(right).toHaveLength(2);
    expect(left).toHaveLength(2);
    expect(Math.abs(right[0]!.y - right[1]!.y)).toBeGreaterThan(1);
    expect(Math.abs(left[0]!.y - left[1]!.y)).toBeGreaterThan(1);
    // No vertex at 0°/180° (that would be the pointy-left/right family, a 30° drift).
    expect(pts.some((p) => Math.abs(p.x) > 9.9 && Math.abs(p.y) < 0.05)).toBe(false);
    // Taller than wide is this family's signature (across points vs across flats).
    const height = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    expect(height).toBeGreaterThan(maxX - minX);
  });

  it('every tile the stamp draws carries the figure’s own tilt (one family, no mixed angles)', () => {
    const st = newGame(11);
    const figure = harvestFigure(st.board, st.config, 0)!;
    const svg = harvestSvg(figure);
    // The stamp's hexes are drawn at the card's tilt, so the default (untilted) path must NOT match.
    for (const c of figure.cells.slice(0, 4)) expect(svg).toContain(cellPath(c.x, c.y, S, figure.tilt));
    const paths = [...svg.matchAll(/<path d="(M[^"]+)"/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(4);
    // Owner, 2026-11-01: the 30° tilt is what puts the reader exactly under the opponent, so the
    // plate's hexes show a flat edge on TOP and BOTTOM. Every tile must agree on that — a mixed set
    // would mean the ground and the homes had drifted apart.
    const tiltDeg = (figure.tilt * 180) / Math.PI;
    for (const d of paths) {
      const pts = pointsOf(d);
      expect(pts).toHaveLength(6);
      const c = {
        x: pts.reduce((s, p) => s + p.x, 0) / 6,
        y: pts.reduce((s, p) => s + p.y, 0) / 6,
      };
      const angles = pts.map((p) => ((angleOf(p, c) % 360) + 360) % 360);
      // The six expected angles, turned by the card's tilt.
      const expected = FLAT.map((w) => ((w + tiltDeg) % 360 + 360) % 360);
      // Match as a SET (each expected angle has a nearby observed one), because a value sitting on
      // the 0°/360° seam would otherwise line up with the wrong partner.
      const unmatched = [...angles];
      for (const want of expected) {
        const i = unmatched.findIndex((a) => Math.min(Math.abs(a - want), 360 - Math.abs(a - want)) < 0.8);
        expect(i, `no tile corner near ${want}°`).toBeGreaterThanOrEqual(0);
        unmatched.splice(i, 1);
      }
    }
    // This board's tilt is the 30° the lattice could not supply (its sign says which way the
    // homes lean before the turn).
    expect(Math.abs(tiltDeg)).toBeCloseTo(30, 6);
  });
});

