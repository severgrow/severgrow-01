import { describe, expect, it } from 'vitest';
import {
  buildSphere, pickCell, latticeMap, homeQuat, neighbourIds, planetTileCount, PLANET_FLAT_RADIUS, dot, cross, sub, scale, unit, PLANET_FREQUENCY, type Sphere, type V3,
} from '../src/sphere/geometry.js';
import { arcQuat, rotate, multiply, slerp, type Quat } from '../src/sphere/rotation.js';
import { WORLD_CELLS, worldAround, hexDistance } from '../../server/src/world.js';
import { groundOf, KIND, cellForTile, tileForCell } from '../src/sphere/ground.js';

// THE PLANET (owner, 2026-11-04: "geometry of hexes is wrong, analyse why and fix. If we need 12
// pentagons to make geometric right, that's fine, but hexes should all look the same").
//
// Why they were wrong: the old mesh split each icosahedron face into a FLAT grid and pushed it out
// onto the sphere, so cells near a face centre came out ~1.5x larger than cells near the twelve
// corners, and each hex corner was the circumcentre of three unequal neighbours, which turned the
// unevenness into skewed hexagons. These tests pin the cure: an even, relaxed mesh whose dual
// corners are the centroids of their three cells.

const sphere = buildSphere();
const n = PLANET_FREQUENCY;
const polygon = (s: Sphere, index: number): V3[] => s.cells[index]!.corners.map((id) => s.corners[id]!);
const edgeLengths = (points: V3[]) => points.map((p, i) => Math.acos(Math.min(1, dot(p, points[(i + 1) % points.length]!))));
const area = (s: Sphere, index: number) => {
  const c = s.cells[index]!.centre, points = polygon(s, index);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!;
    sum += 2 * Math.atan2(dot(c, cross(p, q)), 1 + dot(c, p) + dot(p, q) + dot(q, c));
  }
  return sum;
};

describe('the planet is a closed Goldberg sphere with exactly twelve pentagons', () => {
  it('has 10n^2+2 cells: twelve pentagons, every other cell a hexagon', () => {
    expect(sphere.cells).toHaveLength(10 * n * n + 2);
    expect(sphere.cells.filter((c) => c.pentagon)).toHaveLength(12);
    expect(sphere.cells.filter((c) => c.corners.length === 5)).toHaveLength(12);
    expect(sphere.cells.filter((c) => c.corners.length === 6)).toHaveLength(10 * n * n - 10);
    expect(new Set(sphere.cells.map((c) => c.id)).size).toBe(sphere.cells.length);
    expect(sphere.corners.length - sphere.edges.length + sphere.cells.length).toBe(2);
  });

  it('is watertight: every edge has two cells, faces wind outward, the areas cover the sphere', () => {
    const edges = new Map<string, number>();
    let total = 0;
    for (const c of sphere.cells) {
      expect(c.neighbours).toHaveLength(c.corners.length);
      for (const nb of c.neighbours) expect(sphere.cells[nb]!.neighbours).toContain(c.index);
      for (let i = 0; i < c.corners.length; i++) {
        const a = c.corners[i]!, b = c.corners[(i + 1) % c.corners.length]!;
        const key = [a, b].sort((x, y) => x - y).join(':');
        edges.set(key, (edges.get(key) ?? 0) + 1);
        expect(dot(cross(sphere.corners[a]!, sphere.corners[b]!), c.centre)).toBeGreaterThan(0);
      }
      total += area(sphere, c.index);
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(total).toBeCloseTo(4 * Math.PI, 6);
  });

  it('orders neighbours so neighbour i lies across edge i (corner i to corner i+1)', () => {
    for (const c of sphere.cells) {
      c.neighbours.forEach((nb, i) => {
        const shared = [c.corners[i]!, c.corners[(i + 1) % c.corners.length]!];
        for (const corner of shared) expect(sphere.cells[nb]!.corners).toContain(corner);
      });
    }
  });
});

describe('every hexagon looks the same', () => {
  // Measured 2026-11-04. Old mesh (n=10, flat grid + circumcentre corners): median hex side ratio
  // 1.124, worst 1.634, hex areas spread 1.60x, corner angles 111.1-126.0 degrees. This mesh (n=24):
  // median 1.054, worst 1.175 (right beside a pentagon; 1.119 three or more tiles away), hex areas
  // spread 1.48x across the whole planet but never more than 1.090x between two neighbours, corner
  // angles 114.4-129.2 degrees.
  const hexes = sphere.cells.filter((c) => !c.pentagon);
  const poles = sphere.cells.filter((c) => c.pentagon).map((c) => c.centre);
  const steps = (c: V3) => Math.min(...poles.map((p) => Math.acos(Math.min(1, dot(p, c))))) / (Math.atan(2) / n);
  const sides = (index: number) => { const l = edgeLengths(polygon(sphere, index)); return Math.max(...l) / Math.min(...l); };
  it('each hexagon has near-equal sides', () => {
    const ratios = hexes.map((c) => sides(c.index)).sort((a, b) => a - b);
    expect(ratios[Math.floor(ratios.length / 2)]!).toBeLessThan(1.06);
    expect(ratios.at(-1)!).toBeLessThan(1.18);
    for (const c of hexes) if (steps(c.centre) > 3) expect(sides(c.index)).toBeLessThan(1.125);
  });
  it('sizes change so gently that two neighbours always look the same size', () => {
    const areas = new Map(hexes.map((c) => [c.index, area(sphere, c.index)]));
    let neighbours = 1;
    for (const c of hexes) for (const nb of c.neighbours) {
      const other = areas.get(nb);
      if (other !== undefined) neighbours = Math.max(neighbours, areas.get(c.index)! / other);
    }
    expect(neighbours).toBeLessThan(1.1);
    const all = [...areas.values()];
    expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.5);
  });
  it('no hexagon has a pinched or flattened corner', () => {
    for (const c of hexes) {
      const points = polygon(sphere, c.index);
      for (let i = 0; i < 6; i++) {
        const prev = points[(i + 5) % 6]!, p = points[i]!, next = points[(i + 1) % 6]!;
        const a = unit(sub(prev, scale(p, dot(prev, p)))), b = unit(sub(next, scale(p, dot(next, p))));
        const degrees = Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI;
        expect(degrees).toBeGreaterThan(113);
        expect(degrees).toBeLessThan(130);
      }
    }
  });
  it('the pentagons sit evenly, as the twelve corners of an icosahedron', () => {
    for (const p of poles) {
      const nearest = poles.filter((q) => q !== p).map((q) => Math.acos(Math.min(1, dot(p, q))));
      expect(Math.min(...nearest)).toBeCloseTo(Math.atan(2), 6);
    }
  });
});

describe('the flat Territory map lies on the planet tile for tile', () => {
  const map = latticeMap(sphere);
  it('anchors on a hexagon and maps 0,0 to it', () => {
    expect(sphere.cells[map.anchor]!.pentagon).toBe(false);
    expect(map.cellOf.get('0,0')).toBe(map.anchor);
  });
  it('every flat neighbour pair is a planet neighbour pair, and the mapping is one-to-one', () => {
    const seen = new Set<number>();
    for (const [id, index] of map.cellOf) {
      expect(seen.has(index)).toBe(false);
      seen.add(index);
      expect(sphere.cells[index]!.pentagon).toBe(false);
      for (const other of worldAround(id, 1)) {
        const nb = map.cellOf.get(other);
        if (nb !== undefined && other !== id) expect(sphere.cells[index]!.neighbours).toContain(nb);
      }
      expect(map.flatOf.get(index)).toBe(id);
    }
  });
  it('covers the whole flat disc a pentagon cannot reach (2n/3 - 1 rings)', () => {
    expect(map.radius).toBe(2 * n / 3 - 1);
    for (let q = -map.radius; q <= map.radius; q++) {
      for (let r = -map.radius; r <= map.radius; r++) {
        if (hexDistance(q, r) <= map.radius) expect(map.cellOf.has(`${q},${r}`)).toBe(true);
      }
    }
  });
  // GROW ANYWHERE ON THE PLANET (owner, 2026-11-04). The walk reaches every hexagon, so every tile
  // the player can see and tap has an id the server understands.
  it('PLANET_FLAT_RADIUS is the disc no pentagon reaches, with no geometry built', () => {
    expect(PLANET_FLAT_RADIUS).toBe(latticeMap(sphere).radius);
  });
  it('the ranking\'s total is exactly the planet\'s growable tiles (5,750)', () => {
    expect(planetTileCount()).toBe(sphere.cells.filter((c) => !c.pentagon).length);
    expect(planetTileCount()).toBe(5750);
  });
  it('gives every hexagon on the planet its own id, and no pentagon one', () => {
    const hexes = sphere.cells.filter((c) => !c.pentagon);
    expect(map.flatOf.size).toBe(hexes.length);
    expect(new Set(map.flatOf.values()).size).toBe(hexes.length);
    for (const c of sphere.cells.filter((cell) => cell.pentagon)) expect(map.flatOf.has(c.index)).toBe(false);
  });
  it('neighbourIds is the planet\'s own adjacency: symmetric, and the flat one inside the disc', () => {
    for (const [id] of map.cellOf) for (const other of neighbourIds(sphere, map, id)) expect(neighbourIds(sphere, map, other)).toContain(id);
    for (const [id] of map.cellOf) {
      const [q, r] = id.split(',').map(Number);
      if (hexDistance(q!, r!) >= map.radius) continue;
      expect(neighbourIds(sphere, map, id).sort()).toEqual(worldAround(id, 1).filter((x) => x !== id).sort());
    }
  });
  it('holds the whole current world with its two rings of reach', () => {
    for (const cell of WORLD_CELLS) {
      for (const id of worldAround(cell.id, 2)) expect(map.cellOf.has(id)).toBe(true);
    }
  });
  it('is not mirrored: the flat map reads the same way round on the planet', () => {
    const a = sphere.cells[map.cellOf.get('0,0')!]!.centre;
    const east = sphere.cells[map.cellOf.get('1,0')!]!.centre;
    const northEast = sphere.cells[map.cellOf.get('1,-1')!]!.centre;
    // East then north-east turns counter-clockwise on screen (y down) and must turn
    // counter-clockwise about the outward normal on the planet.
    expect(dot(cross(sub(east, a), sub(northEast, a)), a)).toBeGreaterThan(0);
  });
  it('the home view puts flat east to the right and flat north up', () => {
    const q = homeQuat(sphere, map, '0,0');
    const a = rotate(q, sphere.cells[map.anchor]!.centre);
    expect(a[2]).toBeCloseTo(1, 6);
    const east = rotate(q, sphere.cells[map.cellOf.get('1,0')!]!.centre);
    expect(east[0]).toBeGreaterThan(0);
    expect(Math.abs(east[1])).toBeLessThan(1e-6);
    const north = rotate(q, sphere.cells[map.cellOf.get('1,-2')!]!.centre);
    expect(north[1]).toBeGreaterThan(0);
  });
});

describe('picking and rotation', () => {
  it('picks the closest real tile, every pentagon included, and ignores space and the far side', () => {
    for (const cell of sphere.cells.filter((c) => c.pentagon)) {
      expect(pickCell(sphere, scale(cell.centre, 4), scale(cell.centre, -1))).toBe(cell.index);
    }
    expect(pickCell(sphere, [0, 0, 4], unit([3, 0, -1]))).toBeNull();
    const front = pickCell(sphere, [0, 0, 4], [0, 0, -1]);
    expect(front).not.toBeNull();
    expect(sphere.cells[front!]!.centre[2]).toBeGreaterThan(0);
    for (const cell of sphere.cells.filter((_, i) => i % 97 === 0)) {
      const target = unit(sub(scale(cell.centre, 3), sphere.corners[cell.corners[0]!]!));
      expect(pickCell(sphere, scale(target, 4), unit(sub(cell.centre, scale(target, 4))))).toBe(cell.index);
    }
  });
  it('trackball quaternions stay stable through poles, antipodes and shortest-path returns', () => {
    let q: Quat = [0, 0, 0, 1];
    expect(rotate(arcQuat([0, 0, 1], [0, 0, -1]), [0, 0, 1])[2]).toBeCloseTo(-1);
    for (let i = 0; i < 360; i++) q = multiply(arcQuat([0, 0, 1], unit([.04, .015, 1])), q);
    expect(Math.hypot(...q)).toBeCloseTo(1, 10);
    const home = arcQuat([0, 1, 0], [0, 0, 1]);
    expect(rotate(slerp([0, 0, 0, 1], home, .5), [0, 1, 0])[2]).toBeGreaterThan(0);
  });
});

describe('the planet shows the real Territory', () => {
  const map = latticeMap(sphere);
  const claims = [
    { cellId: '0,0', ownerId: 'me', colour: 'hsl(150 30% 50%)' },
    { cellId: '1,0', ownerId: 'me', colour: 'hsl(150 30% 50%)' },
    { cellId: '2,0', ownerId: 'rival', colour: '#cc8844' },
  ];
  const ground = groundOf(sphere, map, {
    cells: WORLD_CELLS, claims, fog: ['20,20', '11,0'], disputes: ['2,0'], me: 'me',
  });
  const at = (id: string) => map.cellOf.get(id)!;
  it('tells mine, a rival\'s, free, undiscovered, unreached and pentagon ground apart', () => {
    expect(ground.kind[at('0,0')]).toBe(KIND.mine);
    expect(ground.kind[at('2,0')]).toBe(KIND.owned);
    expect(ground.kind[at('-3,0')]).toBe(KIND.land);
    expect(ground.kind[at('11,0')]).toBe(KIND.fog);
    expect(ground.kind[at('14,0')]).toBe(KIND.void);
    expect([...ground.kind].filter((k) => k === KIND.pentagon)).toHaveLength(12);
    // Every known world tile is on the planet and free unless claimed.
    expect([...ground.kind].filter((k) => k >= KIND.land && k <= KIND.mine)).toHaveLength(WORLD_CELLS.length);
  });
  it('wears each owner\'s own colour and marks the disputed tile', () => {
    const rgb = (id: string) => [...ground.colour.slice(at(id) * 3, at(id) * 3 + 3)];
    expect(rgb('2,0')[0]).toBeCloseTo(0xcc / 255, 5);
    expect(rgb('0,0')).toEqual(rgb('1,0'));
    expect(ground.disputed[at('2,0')]).toBe(1);
    expect(ground.disputed[at('1,0')]).toBe(0);
  });
  it('draws a border only where the ground changes', () => {
    const edgeTo = (from: string, to: string) => sphere.cells[at(from)]!.neighbours.indexOf(at(to));
    expect(ground.border[at('0,0')]! & (1 << edgeTo('0,0', '1,0'))).toBe(0);
    expect(ground.border[at('1,0')]! & (1 << edgeTo('1,0', '2,0'))).not.toBe(0);
    expect(ground.border[at('-3,0')]! & (1 << edgeTo('-3,0', '-4,0'))).toBe(0);
  });
  it('maps planet taps back to flat tile ids, never for a pentagon', () => {
    expect(tileForCell(map, at('5,-3'))).toBe('5,-3');
    for (const c of sphere.cells.filter((cell) => cell.pentagon)) expect(tileForCell(map, c.index)).toBeNull();
    expect(cellForTile(map, '99,99')).toBeNull();
  });
});

describe('grow anywhere: plain planet, a lit ring only around placed tiles', () => {
  const map = latticeMap(sphere);
  const at = (id: string) => map.cellOf.get(id)!;
  const ground = groundOf(sphere, map, {
    cells: WORLD_CELLS, fog: ['11,0'], me: 'me', growAnywhere: true,
    claims: [{ cellId: '0,0', ownerId: 'me', colour: 'hsl(150 30% 50%)' }, { cellId: '30,-10', ownerId: 'r', colour: '#cc8844' }],
  });
  it('lights only the tiles beside a placed tile; the old coast and fog are plain ground', () => {
    for (const id of ['1,0', '0,1', '-1,0']) expect(ground.kind[at(id)]).toBe(KIND.land);
    for (const id of neighbourIds(sphere, map, '30,-10')) expect(ground.kind[at(id)]).toBe(KIND.land);
    expect(ground.kind[at('-5,0')]).toBe(KIND.void);
    expect(ground.kind[at('11,0')]).toBe(KIND.void);
    expect(ground.kind[at('30,-10')]).toBe(KIND.owned);
    expect([...ground.kind].filter((k) => k === KIND.pentagon)).toHaveLength(12);
  });
});
