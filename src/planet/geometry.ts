// THE PLANET'S GROUND: an even Goldberg sphere (a geodesic dual) and the flat Territory lattice laid
// over it. No game state, storage or network: pure geometry, built once.
//
// WHY THE FIRST VERSION'S HEXES LOOKED WRONG (owner, 2026-11-04, screenshots of /test/ "SPHERE
// TEST"): it split each icosahedron face into a FLAT triangular grid and pushed the points out onto
// the sphere. That projection stretches the middle of every face and squeezes its corners, so cells
// differed ~1.6x in area, and each hex corner was the CIRCUMCENTRE of three unequal neighbours, which
// turned that unevenness into skewed, lopsided hexagons. The cure, both done once at build time:
//   1. RELAX the points (40 rounds of equal-length springs between neighbouring centres, kept on the
//      sphere) so tile sizes even out, most of all around the pentagons;
//   2. put each corner at the CENTROID of its three cells, not their circumcentre.
// Twelve pentagons remain where the icosahedron's corners were: a closed hex sphere needs exactly
// twelve. The game makes them uninhabitable black ground (owner, 2026-11-04).
export type V3 = readonly [number, number, number];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, n: number): V3 => [a[0] * n, a[1] * n, a[2] * n];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (p: V3): V3 => scale(p, 1 / (Math.hypot(...p) || 1));

/**
 * Tiles along one icosahedron edge. 10n^2+2 cells: 24 gives 5,762. Chosen so the flat disc that no
 * pentagon can reach (2n/3 - 1 = 15 rings) holds today's whole world (10 rings) plus the two rings
 * of reach a tile at its coast uncovers, with room to spare. Divisible by 3 so a face has a centre cell.
 */
export const PLANET_FREQUENCY = 24;
const RELAX_ROUNDS = 40;
/**
 * The flat disc around 0,0 that no pentagon reaches (the same number as `latticeMap(...).radius`, with
 * no geometry built): inside it a tile's planet neighbours ARE its six flat ones, so a rule may answer
 * with plain arithmetic and never pay for building the planet (pinned by sphere.test).
 */
export const PLANET_FLAT_RADIUS = Math.floor((2 * PLANET_FREQUENCY) / 3) - 1;
/** Every tile the planet has to grow on: all its hexagons (its twelve pentagons are never land). */
export const planetTileCount = (n = PLANET_FREQUENCY) => 10 * n * n - 10;

/**
 * `corners[i]` and `corners[i+1]` bound the edge shared with `neighbours[i]`, counter-clockwise
 * seen from outside the planet.
 */
export type SphereCell = { index: number; id: string; centre: V3; corners: number[]; neighbours: number[]; pentagon: boolean };
export type Sphere = { frequency: number; cells: SphereCell[]; corners: V3[]; edges: readonly [number, number, number, number][] };

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: V3[] = ([[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
  [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[]).map(unit);
const FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
  [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]] as const;
/** The face the world sits on (owner: "a random spot of the sphere"). Fixed, so it never moves. */
const HOME_FACE = 13;

const built = new Map<number, Sphere>();
export const buildSphere = (n = PLANET_FREQUENCY): Sphere => {
  const cached = built.get(n);
  if (cached) return cached;
  const points: V3[] = [], keys: string[] = [], ids = new Map<string, number>(), triangles: number[][] = [];
  const vertex = (p: V3, key: string) => {
    let id = ids.get(key);
    if (id !== undefined) return id;
    id = points.length; ids.set(key, id); points.push(unit(p)); keys.push(key);
    return id;
  };
  for (const f of FACES) {
    const a = ICO[f[0]]!, b = ICO[f[1]]!, c = ICO[f[2]]!;
    const grid = new Map<string, number>();
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const weights = [n - i - j, i, j];
      // Exact integer barycentric identity, shared by both faces along an icosahedron edge, so ids
      // never depend on traversal order or floating-point rounding.
      const key = f.map((id, k) => ({ id, w: weights[k]! })).filter((v) => v.w > 0).sort((x, y) => x.id - y.id)
        .map((v) => `${v.id}:${v.w}`).join('|');
      grid.set(`${i},${j}`, vertex(add(add(scale(a, n - i - j), scale(b, i)), scale(c, j)), key));
    }
    const at = (i: number, j: number) => grid.get(`${i},${j}`)!;
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      triangles.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
      if (i + j < n - 1) triangles.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
  }
  // Wind every triangle outward once, so corner order and edge sides are consistent everywhere.
  for (const t of triangles) {
    const [p, q, r] = [points[t[0]!]!, points[t[1]!]!, points[t[2]!]!];
    if (dot(cross(sub(q, p), sub(r, p)), p) < 0) { const swap = t[1]!; t[1] = t[2]!; t[2] = swap; }
  }
  const adjacent = points.map(() => new Set<number>());
  const incident = points.map(() => [] as number[]);
  triangles.forEach((t, id) => {
    for (let i = 0; i < 3; i++) {
      incident[t[i]!]!.push(id);
      adjacent[t[i]!]!.add(t[(i + 1) % 3]!); adjacent[t[i]!]!.add(t[(i + 2) % 3]!);
    }
  });
  // 1. RELAX: every edge between two neighbouring centres is a spring of the same rest length, so
  // the springs pull the mesh toward equal spacing everywhere. (Moving each point to its
  // neighbours' average instead shrinks the rings around every pentagon.) The twelve icosahedron
  // corners stay put: they anchor the symmetry.
  const fixed = new Set(ICO.map((_, i) => ids.get(`${i}:${n}`)!));
  const springs: [number, number][] = [];
  adjacent.forEach((set, i) => { for (const j of set) if (i < j) springs.push([i, j]); });
  // Rest length: the chord between neighbours if every one of the n steps along an edge were equal.
  const rest = 2 * Math.sin(Math.atan(2) / (2 * n));
  const px = new Float64Array(points.length * 3);
  points.forEach((p, i) => { px[i * 3] = p[0]; px[i * 3 + 1] = p[1]; px[i * 3 + 2] = p[2]; });
  const push = new Float64Array(px.length);
  for (let round = 0; round < RELAX_ROUNDS; round++) {
    push.fill(0);
    for (const [i, j] of springs) {
      const dx = px[j * 3]! - px[i * 3]!, dy = px[j * 3 + 1]! - px[i * 3 + 1]!, dz = px[j * 3 + 2]! - px[i * 3 + 2]!;
      const d = Math.hypot(dx, dy, dz), f = (.25 * (d - rest)) / d;
      push[i * 3]! += dx * f; push[i * 3 + 1]! += dy * f; push[i * 3 + 2]! += dz * f;
      push[j * 3]! -= dx * f; push[j * 3 + 1]! -= dy * f; push[j * 3 + 2]! -= dz * f;
    }
    for (let i = 0; i < points.length; i++) {
      if (fixed.has(i)) continue;
      const x = px[i * 3]! + push[i * 3]!, y = px[i * 3 + 1]! + push[i * 3 + 1]!, z = px[i * 3 + 2]! + push[i * 3 + 2]!;
      const k = 1 / Math.hypot(x, y, z);
      px[i * 3] = x * k; px[i * 3 + 1] = y * k; px[i * 3 + 2] = z * k;
    }
  }
  for (let i = 0; i < points.length; i++) points[i] = [px[i * 3]!, px[i * 3 + 1]!, px[i * 3 + 2]!];
  // 2. CORNERS at the centroid of their three cells.
  const corners: V3[] = triangles.map((t) => unit(add(add(points[t[0]!]!, points[t[1]!]!), points[t[2]!]!)));
  const cells = points.map((centre, index): SphereCell => {
    const tangent = unit(cross(Math.abs(centre[1]) < .9 ? [0, 1, 0] : [1, 0, 0], centre)), bitangent = cross(centre, tangent);
    const angle = (id: number) => Math.atan2(dot(corners[id]!, bitangent), dot(corners[id]!, tangent));
    const ring = incident[index]!.slice().sort((a, b) => angle(a) - angle(b));
    // Neighbour i is the other cell on the edge from corner i to corner i+1: the vertex that the
    // two consecutive triangles share besides this one.
    const neighbours = ring.map((t, i) => {
      const u = triangles[t]!, v = triangles[ring[(i + 1) % ring.length]!]!;
      return u.find((x) => x !== index && v.includes(x))!;
    });
    return { index, id: `s${n}-${keys[index]!}`, centre, corners: ring, neighbours, pentagon: ring.length === 5 };
  });
  const shared = new Map<string, [number, number, number, number]>();
  for (const cell of cells) for (let i = 0; i < cell.corners.length; i++) {
    const a = cell.corners[i]!, b = cell.corners[(i + 1) % cell.corners.length]!, key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const edge = shared.get(key);
    if (edge) edge[3] = cell.index; else shared.set(key, [a, b, cell.index, -1]);
  }
  const sphere = { frequency: n, cells, corners, edges: [...shared.values()] };
  built.set(n, sphere);
  return sphere;
};

// ---- THE FLAT MAP ON THE PLANET -------------------------------------------------------------------
//
// Away from the pentagons a Goldberg sphere IS a hex lattice, so the Territory's flat axial ids are
// laid on it tile for tile. The lattice is carried outward from the anchor cell by a breadth-first
// walk that hands each cell a "frame" (which of its six edges points flat-east), and steps around
// the twelve pentagons. Measured: the walk gives every one of the 10n^2-10 hexagons its own id with
// no collision, out to 64 rings at n=24, so the whole planet speaks the server's own id format and
// every existing claim keeps its id.
//
// Inside the disc no pentagon reaches (`radius`, 2n/3-1 rings) every flat neighbour is a planet
// neighbour. Beyond it the walk has passed a pentagon, so a flat neighbour may lie elsewhere on the
// planet: rules that ask "is this beside that" must use `neighbourIds`, never flat arithmetic.

/** Flat axial directions, counter-clockwise on screen (E, NE, NW, W, SW, SE) like `server/src/world.ts`. */
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;
export type LatticeMap = {
  anchor: number;
  /** The flat disc around 0,0 that no pentagon reaches: flat and planet neighbours agree inside it. */
  radius: number;
  cellOf: ReadonlyMap<string, number>;
  flatOf: ReadonlyMap<number, string>;
  /** Per planet cell: the index (0-5) of its neighbour that lies flat-east, or -1 (pentagons). */
  east: Int8Array;
};
const maps = new WeakMap<Sphere, LatticeMap>();
export const latticeMap = (sphere: Sphere): LatticeMap => {
  const cached = maps.get(sphere);
  if (cached) return cached;
  const n = sphere.frequency, face = FACES[HOME_FACE];
  const middle = unit(add(add(ICO[face[0]]!, ICO[face[1]]!), ICO[face[2]]!));
  const anchor = sphere.cells.reduce((best, c) => (dot(c.centre, middle) > dot(sphere.cells[best]!.centre, middle) ? c.index : best), 0);
  const radius = Math.floor((2 * n) / 3) - 1;
  const cellOf = new Map<string, number>(), flatOf = new Map<number, string>();
  const east = new Int8Array(sphere.cells.length).fill(-1);
  // The anchor's frame is chosen, not derived: its neighbour 0 is flat-east.
  const queue: { cell: number; q: number; r: number; frame: number }[] = [{ cell: anchor, q: 0, r: 0, frame: 0 }];
  cellOf.set('0,0', anchor); flatOf.set(anchor, '0,0'); east[anchor] = 0;
  for (let head = 0; head < queue.length; head++) {
    const { cell, q, r, frame } = queue[head]!;
    const here = sphere.cells[cell]!;
    for (let k = 0; k < 6; k++) {
      const next = here.neighbours[k]!, there = sphere.cells[next]!;
      if (there.pentagon || flatOf.has(next)) continue;
      const direction = (k + 6 - frame) % 6;
      const [dq, dr] = DIRECTIONS[direction]!;
      const nq = q + dq, nr = r + dr, id = `${nq},${nr}`;
      if (cellOf.has(id)) continue;
      // Across the shared edge the direction flips: there, the edge back to `cell` is flat-opposite.
      const back = there.neighbours.indexOf(cell);
      const theirs = ((back - direction - 3) % 6 + 12) % 6;
      cellOf.set(id, next); flatOf.set(next, id); east[next] = theirs;
      queue.push({ cell: next, q: nq, r: nr, frame: theirs });
    }
  }
  const map = { anchor, radius, cellOf, flatOf, east };
  maps.set(sphere, map);
  return map;
};

/** The ids of the planet tiles beside tile `id` (pentagons have no id and are never listed). */
export const neighbourIds = (sphere: Sphere, map: LatticeMap, id: string): string[] => {
  const index = map.cellOf.get(id);
  if (index === undefined) return [];
  const out: string[] = [];
  for (const nb of sphere.cells[index]!.neighbours) { const other = map.flatOf.get(nb); if (other) out.push(other); }
  return out;
};

/**
 * The camera rotation that looks straight down on flat tile `id` with flat east to the right and
 * flat north up, so the planet opens reading exactly like the flat map it replaces.
 */
export const homeQuat = (sphere: Sphere, map: LatticeMap, id: string): readonly [number, number, number, number] => {
  const index = map.cellOf.get(id) ?? map.anchor;
  const cell = sphere.cells[index]!, z = cell.centre;
  const e = map.east[index]! >= 0 ? sphere.cells[cell.neighbours[map.east[index]!]!]!.centre : cross([0, 1, 0], z);
  const x = unit(sub(e, scale(z, dot(e, z)))), y = cross(z, x);
  // Rows x, y, z map the planet into camera space; convert that matrix to a quaternion.
  const m = [x, y, z] as const;
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q: [number, number, number, number];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
  }
  const norm = Math.hypot(...q) || 1;
  return [q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm];
};

/** Closest real fan triangle, not a nearest centre on an ideal sphere. The mesh is closed and
 * opaque, so the closest hit hides every back-facing cell and stays exact at the horizon. */
export const pickCell = (sphere: Sphere, origin: V3, direction: V3): number | null => {
  const b = dot(origin, direction), c = dot(origin, origin) - 1;
  if (b * b - c < 0 || b > 0) return null;
  // The ray meets the unit sphere first at this point; only cells near it can be hit.
  const t0 = -b - Math.sqrt(Math.max(0, b * b - c));
  const hit = add(origin, scale(direction, t0));
  const reach = Math.cos(Math.min(Math.PI, 6 / sphere.frequency));
  let distance = Infinity, selected: number | null = null;
  for (const cell of sphere.cells) {
    if (dot(cell.centre, hit) < reach) continue;
    for (let i = 0; i < cell.corners.length; i++) {
      const a = cell.centre, p = sphere.corners[cell.corners[i]!]!, q = sphere.corners[cell.corners[(i + 1) % cell.corners.length]!]!;
      const e1 = sub(p, a), e2 = sub(q, a), h = cross(direction, e2), det = dot(e1, h);
      if (det < 1e-12) continue; // outward winding, front hits only
      const s = sub(origin, a), u = dot(s, h) / det;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const crossS = cross(s, e1), v = dot(direction, crossS) / det;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const t = dot(e2, crossS) / det;
      if (t > 0 && t < distance) { distance = t; selected = cell.index; }
    }
  }
  return selected;
};
